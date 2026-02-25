"""Sentence embedding computation via sentence-transformers.

Gracefully degrades to empty vectors when the library or model is unavailable.
"""

from __future__ import annotations

import logging
import threading
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

try:
    from sentence_transformers import SentenceTransformer

    _HAS_SBERT = True
except ImportError:
    _HAS_SBERT = False
    logger.warning(
        "sentence-transformers not installed; embeddings will be empty. "
        "Install with: pip install sentence-transformers"
    )

_DEFAULT_MODEL = "paraphrase-multilingual-MiniLM-L12-v2"
_MODEL_CACHE: dict[str, Any] = {}
_MODEL_CACHE_LOCK = threading.Lock()


class EmbeddingEngine:
    """Sentence embedding engine backed by sentence-transformers.

    Falls back to zero-length vectors when the library is missing.
    """

    def __init__(self, model_name: str = _DEFAULT_MODEL) -> None:
        self._model_name = model_name
        self._model: Any | None = None  # Lazy-loaded SentenceTransformer

    def _ensure_model(self) -> Any | None:
        """Lazily load the sentence-transformers model."""
        if self._model is not None:
            return self._model

        if not _HAS_SBERT:
            return None

        with _MODEL_CACHE_LOCK:
            cached = _MODEL_CACHE.get(self._model_name)
            if cached is not None:
                self._model = cached
                return cached

            try:
                model = SentenceTransformer(self._model_name)
                _MODEL_CACHE[self._model_name] = model
                self._model = model
                logger.info("Loaded sentence-transformers model: %s", self._model_name)
                return model
            except Exception as exc:
                logger.warning(
                    "Failed to load sentence-transformers model '%s': %s",
                    self._model_name,
                    exc,
                )
                return None

    def embed(self, text: str) -> list[float]:
        """Compute the embedding vector for a single text.

        Returns an empty list if the model is unavailable.
        """
        model = self._ensure_model()
        if model is None:
            return []

        try:
            vec = model.encode(text, convert_to_numpy=True)
            return vec.tolist()
        except Exception as exc:
            logger.warning("Embedding failed for text (len=%d): %s", len(text), exc)
            return []

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Compute embeddings for a batch of texts.

        Returns a list of empty lists if the model is unavailable.
        """
        model = self._ensure_model()
        if model is None:
            return [[] for _ in texts]

        if not texts:
            return []

        try:
            vecs = model.encode(texts, convert_to_numpy=True, show_progress_bar=False)
            return [v.tolist() for v in vecs]
        except Exception as exc:
            logger.warning("Batch embedding failed for %d texts: %s", len(texts), exc)
            return [[] for _ in texts]

    def similarity(self, text_a: str, text_b: str) -> float:
        """Cosine similarity between the embeddings of two texts.

        Returns 0.0 if the model is unavailable or either embedding is empty.
        """
        vec_a = self.embed(text_a)
        vec_b = self.embed(text_b)

        if not vec_a or not vec_b:
            return 0.0

        a = np.array(vec_a, dtype=np.float64)
        b = np.array(vec_b, dtype=np.float64)

        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        if norm_a == 0.0 or norm_b == 0.0:
            return 0.0

        return float(np.dot(a, b) / (norm_a * norm_b))


def preload_embedding_model(model_name: str = _DEFAULT_MODEL) -> bool:
    """Eagerly load and cache the embedding model for startup warmup."""
    engine = EmbeddingEngine(model_name=model_name)
    return engine._ensure_model() is not None
