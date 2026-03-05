"""Feature extraction orchestrator.

Combines Rust-accelerated text features, spaCy NLP features, LIWC analysis,
and sentence embeddings into a unified FeatureVector.  Every dependency is
optional: the extractor degrades gracefully when Rust extensions, spaCy
models, or sentence-transformers are unavailable.
"""

from __future__ import annotations

import asyncio
import logging
import math
import re
import string
import time
import unicodedata
from collections import Counter
from threading import Lock
from typing import Callable

from text.features.cache import FeatureCache
from text.features.embeddings import EmbeddingEngine
from text.features.liwc import LiwcAnalyzer
from text.ingest.schema import (
    FeatureVector,
    NlpFeatures,
    RustFeatures,
    TextEntry,
)

logger = logging.getLogger(__name__)

# Maximum text length (chars) before chunking for spaCy processing.
SPACY_CHUNK_SIZE = 50_000

# ---------------------------------------------------------------------------
# Optional Rust extension
# ---------------------------------------------------------------------------
try:
    from text._tf_features import batch_extract as rust_batch_extract

    HAS_RUST = True
except ImportError:
    HAS_RUST = False
    logger.debug("Rust feature module not available; using pure-Python fallback.")

# ---------------------------------------------------------------------------
# Optional spaCy
# ---------------------------------------------------------------------------
try:
    import spacy

    _SPACY_AVAILABLE = True
except ImportError:
    _SPACY_AVAILABLE = False
    spacy = None  # type: ignore[assignment]
    logger.debug("spaCy not installed; NLP features will be limited.")

_NLP_MODELS: dict[str, object | None] = {}
_SPACY_PIPE_LOCK = Lock()


def _get_spacy_model(name: str = "en_core_web_sm") -> object | None:
    """Load and cache a spaCy model, returning None on failure."""
    if not _SPACY_AVAILABLE:
        return None
    if name not in _NLP_MODELS:
        try:
            _NLP_MODELS[name] = spacy.load(name)  # type: ignore[union-attr]
            logger.info("Loaded spaCy model: %s", name)
        except OSError:
            logger.warning(
                "spaCy model '%s' not found. Run: python -m spacy download %s", name, name
            )
            _NLP_MODELS[name] = None
    return _NLP_MODELS[name]


# ---------------------------------------------------------------------------
# Regex helpers
# ---------------------------------------------------------------------------
_SENTENCE_RE = re.compile(r"[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$")
_WORD_RE = re.compile(r"\b\w+\b", re.UNICODE)
_CJK_RE = re.compile(
    r"[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff"
    r"\U00020000-\U0002a6df\U0002a700-\U0002b73f"
    r"\U0002b740-\U0002b81f\U0002b820-\U0002ceaf]"
)
_EMOJI_RE = re.compile(
    "["
    "\U0001f600-\U0001f64f"  # emoticons
    "\U0001f300-\U0001f5ff"  # symbols & pictographs
    "\U0001f680-\U0001f6ff"  # transport & map
    "\U0001f1e0-\U0001f1ff"  # flags
    "\U00002702-\U000027b0"
    "\U000024c2-\U0001f251"
    "]+",
    flags=re.UNICODE,
)

# Common English function words
_FUNCTION_WORDS = frozenset(
    {
        "the",
        "a",
        "an",
        "in",
        "on",
        "at",
        "to",
        "for",
        "of",
        "with",
        "by",
        "from",
        "as",
        "is",
        "was",
        "are",
        "were",
        "be",
        "been",
        "being",
        "have",
        "has",
        "had",
        "do",
        "does",
        "did",
        "will",
        "would",
        "could",
        "should",
        "may",
        "might",
        "shall",
        "can",
        "this",
        "that",
        "these",
        "those",
        "it",
        "its",
        "he",
        "she",
        "they",
        "them",
        "his",
        "her",
        "their",
        "my",
        "your",
        "our",
        "who",
        "which",
        "what",
        "where",
        "when",
        "how",
        "if",
        "but",
        "and",
        "or",
        "not",
        "no",
        "so",
        "than",
        "too",
        "very",
    }
)
_PY_FALLBACK_MAX_NGRAMS = 200


# ---------------------------------------------------------------------------
# Pure-Python fallback for Rust features
# ---------------------------------------------------------------------------


def _tokenize_simple(text: str) -> list[str]:
    """Simple word tokenization via regex."""
    return _WORD_RE.findall(text)


def _sentences_simple(text: str) -> list[str]:
    """Simple sentence splitting."""
    sents = _SENTENCE_RE.findall(text)
    return [s.strip() for s in sents if s.strip()]


def _python_fallback_features(text: str) -> RustFeatures:
    """Compute basic text features in pure Python.

    This covers the most important stylometric signals when the Rust
    extension is not compiled.
    """
    tokens = _tokenize_simple(text)
    token_count = len(tokens)

    if token_count == 0:
        return RustFeatures(token_count=0)

    lower_tokens = [t.lower() for t in tokens]
    freq = Counter(lower_tokens)
    unique_count = len(freq)

    # Type-token ratio
    ttr = unique_count / token_count if token_count > 0 else 0.0

    # Hapax legomena ratio
    hapax = sum(1 for c in freq.values() if c == 1)
    hapax_ratio = hapax / token_count if token_count > 0 else 0.0

    # Yule's K
    yules_k = _compute_yules_k(freq, token_count)

    # Average word length
    avg_word_len = sum(len(t) for t in tokens) / token_count

    # Sentence statistics
    sentences = _sentences_simple(text)
    sent_count = max(len(sentences), 1)
    sent_lengths = [len(_tokenize_simple(s)) for s in sentences]
    avg_sent_len = sum(sent_lengths) / sent_count if sent_lengths else 0.0
    sent_len_var = (
        sum((sl - avg_sent_len) ** 2 for sl in sent_lengths) / sent_count if sent_count > 1 else 0.0
    )

    # Punctuation profile
    punct_counts: dict[str, int] = {}
    for ch in text:
        if ch in string.punctuation or unicodedata.category(ch).startswith("P"):
            punct_counts[ch] = punct_counts.get(ch, 0) + 1
    total_punct = sum(punct_counts.values()) or 1
    punct_profile = {ch: cnt / total_punct for ch, cnt in punct_counts.items()}

    # Function word frequencies
    func_freq: dict[str, float] = {}
    for fw in _FUNCTION_WORDS:
        cnt = freq.get(fw, 0)
        if cnt > 0:
            func_freq[fw] = cnt / token_count

    # CJK ratio
    cjk_chars = len(_CJK_RE.findall(text))
    total_chars = len(text.replace(" ", "").replace("\n", "")) or 1
    cjk_ratio = cjk_chars / total_chars

    # Emoji density
    emoji_matches = _EMOJI_RE.findall(text)
    emoji_count = sum(len(m) for m in emoji_matches)
    emoji_density = emoji_count / token_count if token_count > 0 else 0.0

    # Simple formality score heuristic:
    # Higher ratio of nouns/prepositions/articles vs pronouns/verbs/adverbs/interjections
    # Simplified: function_word_ratio as a rough inverse-formality proxy
    func_word_count = sum(1 for t in lower_tokens if t in _FUNCTION_WORDS)
    formality_score = 1.0 - (func_word_count / token_count) if token_count > 0 else 0.5

    # Code-switching ratio: proportion of tokens that switch script from
    # the dominant script
    is_cjk = [bool(_CJK_RE.search(t)) for t in tokens]
    cjk_token_count = sum(is_cjk)
    dominant_is_cjk = cjk_token_count > token_count / 2
    minority_count = token_count - cjk_token_count if dominant_is_cjk else cjk_token_count
    code_switching_ratio = minority_count / token_count if token_count > 0 else 0.0

    # --- Vocabulary richness metrics ---

    # Brunet's W: N^(V^-0.172)
    brunets_w = token_count ** (unique_count**-0.172) if unique_count > 0 else 0.0

    # Honore's R: 100 * ln(N) / (1 - V1/V), V1 = hapax count
    if unique_count > 0 and hapax != unique_count:
        honores_r = 100.0 * math.log(token_count) / (1.0 - hapax / unique_count)
    else:
        honores_r = 0.0

    # Simpson's D: sum(n_i*(n_i-1)) / (N*(N-1))
    if token_count > 1:
        numerator = sum(n_i * (n_i - 1) for n_i in freq.values())
        simpsons_d = numerator / (token_count * (token_count - 1))
    else:
        simpsons_d = 0.0

    # MTLD (Mean Textual Lexical Diversity): forward + backward pass, TTR threshold 0.72
    mtld = _compute_mtld(lower_tokens, threshold=0.72)

    # HD-D (Hypergeometric Distribution D) with sample size 42
    hd_d = _compute_hd_d(freq, token_count, sample_size=42)

    # Coleman-Liau Index: 0.0588*L - 0.296*S - 15.8
    # L = avg letters per 100 words, S = avg sentences per 100 words
    letter_count = sum(1 for ch in text if ch.isalpha())
    letters_per_100 = (letter_count / token_count) * 100.0 if token_count > 0 else 0.0
    sents_per_100 = (sent_count / token_count) * 100.0 if token_count > 0 else 0.0
    coleman_liau_index = 0.0588 * letters_per_100 - 0.296 * sents_per_100 - 15.8

    # Character and word n-grams for cross-entropy and stylometric overlap.
    char_ngrams, word_ngrams = _extract_fallback_ngrams(
        text,
        max_ngrams=_PY_FALLBACK_MAX_NGRAMS,
    )

    return RustFeatures(
        token_count=token_count,
        type_token_ratio=ttr,
        hapax_legomena_ratio=hapax_ratio,
        yules_k=yules_k,
        avg_word_length=avg_word_len,
        avg_sentence_length=avg_sent_len,
        sentence_length_variance=sent_len_var,
        char_ngrams=char_ngrams,
        word_ngrams=word_ngrams,
        punctuation_profile=punct_profile,
        function_word_freq=func_freq,
        cjk_ratio=cjk_ratio,
        emoji_density=emoji_density,
        formality_score=formality_score,
        code_switching_ratio=code_switching_ratio,
        brunets_w=brunets_w,
        honores_r=honores_r,
        simpsons_d=simpsons_d,
        mtld=mtld,
        hd_d=hd_d,
        coleman_liau_index=coleman_liau_index,
    )


def _extract_fallback_ngrams(
    text: str,
    *,
    max_ngrams: int,
) -> tuple[dict[str, float], dict[str, float]]:
    """Extract normalized char/word bigram+trigram maps for Python fallback."""
    char_map: dict[str, float] = {}
    word_map: dict[str, float] = {}

    chars = [c for c in text if not c.isspace()]
    words = _tokenize_for_word_ngrams(text)

    for n in (2, 3):
        char_map.update(_char_ngram_freq(chars, n=n, max_ngrams=max_ngrams))
        word_map.update(_word_ngram_freq(words, n=n, max_ngrams=max_ngrams))

    return char_map, word_map


def _tokenize_for_word_ngrams(text: str) -> list[str]:
    """Tokenization strategy that keeps CJK chars as independent tokens."""
    tokens: list[str] = []
    for word in _WORD_RE.findall(text):
        current_latin: list[str] = []
        for ch in word:
            if _CJK_RE.fullmatch(ch):
                if current_latin:
                    tokens.append("".join(current_latin).lower())
                    current_latin = []
                tokens.append(ch)
            else:
                current_latin.append(ch)
        if current_latin:
            tokens.append("".join(current_latin).lower())
    return tokens


def _char_ngram_freq(
    chars: list[str],
    *,
    n: int,
    max_ngrams: int,
) -> dict[str, float]:
    """Build normalized char n-gram frequencies with prefixed keys."""
    if len(chars) < n:
        return {}
    grams = ("".join(chars[i : i + n]) for i in range(len(chars) - n + 1))
    counts = Counter(grams)
    total = sum(counts.values())
    if total <= 0:
        return {}
    return {f"c{n}:{gram}": cnt / total for gram, cnt in counts.most_common(max_ngrams)}


def _word_ngram_freq(
    tokens: list[str],
    *,
    n: int,
    max_ngrams: int,
) -> dict[str, float]:
    """Build normalized word n-gram frequencies with prefixed keys."""
    if len(tokens) < n:
        return {}
    grams = (" ".join(tokens[i : i + n]) for i in range(len(tokens) - n + 1))
    counts = Counter(grams)
    total = sum(counts.values())
    if total <= 0:
        return {}
    return {f"w{n}:{gram}": cnt / total for gram, cnt in counts.most_common(max_ngrams)}


def _compute_yules_k(freq: Counter[str], n: int) -> float:
    """Compute Yule's K measure of vocabulary richness.

    K = 10^4 * (M2 - N) / N^2  where M2 = sum(i^2 * V_i) and V_i is the
    number of words occurring exactly i times.
    """
    if n == 0:
        return 0.0
    spectrum = Counter(freq.values())
    m2 = sum(i * i * v_i for i, v_i in spectrum.items())
    k = 10_000 * (m2 - n) / (n * n) if n > 0 else 0.0
    return max(k, 0.0)


def _compute_mtld(tokens: list[str], threshold: float = 0.72) -> float:
    """Compute Mean Textual Lexical Diversity (MTLD).

    MTLD runs a forward and backward pass over the token list.  In each
    pass the running TTR is tracked; every time it drops to or below
    *threshold*, a new "factor" is counted and the TTR resets.  The final
    partial factor is included as a proportion.  MTLD = mean of forward
    and backward factor lengths.
    """
    if len(tokens) < 2:
        return 0.0

    def _one_pass(toks: list[str]) -> float:
        factors = 0.0
        types: set[str] = set()
        start = 0
        for i, tok in enumerate(toks):
            types.add(tok)
            ttr = len(types) / (i - start + 1)
            if ttr <= threshold:
                factors += 1.0
                types = set()
                start = i + 1
        # partial factor
        if start < len(toks):
            remaining_ttr = len(types) / (len(toks) - start)
            if remaining_ttr < 1.0:
                factors += (1.0 - remaining_ttr) / (1.0 - threshold)
        return len(toks) / factors if factors > 0 else float(len(toks))

    forward = _one_pass(tokens)
    backward = _one_pass(tokens[::-1])
    return (forward + backward) / 2.0


def _compute_hd_d(freq: Counter[str], n: int, sample_size: int = 42) -> float:
    """Compute HD-D (Hypergeometric Distribution D).

    For each type, compute the probability that it appears at least once in
    a random sample of *sample_size* tokens drawn without replacement from
    the text.  HD-D is the sum of these probabilities divided by the number
    of types — a measure of lexical diversity that is less sensitive to text
    length than TTR.
    """
    if n == 0 or sample_size <= 0:
        return 0.0

    sample_size = min(sample_size, n)
    types = list(freq.items())
    total_prob = 0.0

    for _word, count in types:
        # P(word appears 0 times in sample) = C(n-count, sample) / C(n, sample)
        # We compute in log space to avoid overflow with large factorials.
        non_count = n - count
        if non_count < sample_size:
            # The word must appear at least once in any sample
            contrib = 1.0
        else:
            # log(C(non_count, sample_size)) - log(C(n, sample_size))
            log_p0 = _log_comb(non_count, sample_size) - _log_comb(n, sample_size)
            contrib = 1.0 - math.exp(log_p0)
        total_prob += contrib

    return total_prob / len(types) if types else 0.0


def _log_comb(n: int, k: int) -> float:
    """Compute log(C(n, k)) using lgamma for numerical stability."""
    if k < 0 or k > n:
        return float("-inf")
    return math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1)


# ---------------------------------------------------------------------------
# FeatureExtractor
# ---------------------------------------------------------------------------


class FeatureExtractor:
    """Orchestrates Rust + Python feature extraction into FeatureVectors."""

    def __init__(self, cache: FeatureCache | None = None) -> None:
        self._cache = cache
        self._liwc = LiwcAnalyzer()
        self._embedder = EmbeddingEngine()
        self._nlp = None  # lazy
        self._last_perf: dict[str, float] = self._empty_perf()

    @staticmethod
    def _empty_perf() -> dict[str, float]:
        return {
            "rust_ms": 0.0,
            "spacy_ms": 0.0,
            "embedding_ms": 0.0,
            "cache_get_ms": 0.0,
            "cache_put_ms": 0.0,
            "cache_hits": 0.0,
            "cache_misses": 0.0,
            "texts_total": 0.0,
        }

    @property
    def last_perf(self) -> dict[str, float]:
        """Performance counters from the latest extract/extract_batch call."""
        return dict(self._last_perf)

    def _get_nlp(self):
        """Lazily load spaCy model."""
        if self._nlp is None:
            self._nlp = _get_spacy_model("en_core_web_sm")
        return self._nlp

    async def extract(self, text: str, text_id: str) -> FeatureVector:
        """Extract all features for a single text."""
        content_hash = FeatureCache.content_hash(text)
        perf = self._empty_perf()
        perf["texts_total"] = 1.0

        rust_started = time.perf_counter()
        rust_feats = self._extract_rust_features(text)
        perf["rust_ms"] += (time.perf_counter() - rust_started) * 1000.0

        nlp_feats = self._extract_nlp_features(text, perf=perf)
        self._last_perf = perf

        return FeatureVector(
            text_id=text_id,
            content_hash=content_hash,
            rust_features=rust_feats,
            nlp_features=nlp_feats,
        )

    async def extract_batch(
        self,
        entries: list[TextEntry],
        *,
        progress_hook: Callable[[int, int, str], None] | None = None,
    ) -> list[FeatureVector]:
        """Extract features for multiple texts, leveraging cache when available."""
        if not entries:
            self._last_perf = self._empty_perf()
            return []

        perf = self._empty_perf()
        total = len(entries)
        perf["texts_total"] = float(total)

        content_hashes = [FeatureCache.content_hash(entry.content) for entry in entries]
        cached_by_hash: dict[str, FeatureVector] = {}
        if self._cache is not None:
            cache_get_started = time.perf_counter()
            cached_by_hash = await self._cache.get_many(content_hashes)
            perf["cache_get_ms"] = (time.perf_counter() - cache_get_started) * 1000.0

        vectors: list[FeatureVector | None] = [None] * total
        miss_indices: list[int] = []
        miss_entries: list[TextEntry] = []
        completed = 0

        for idx, entry in enumerate(entries):
            chash = content_hashes[idx]
            cached = cached_by_hash.get(chash)
            if cached is not None:
                vectors[idx] = (
                    cached if cached.text_id == entry.id else cached.model_copy(update={"text_id": entry.id})
                )
                perf["cache_hits"] += 1.0
                completed += 1
                if progress_hook is not None:
                    progress_hook(completed, total, entry.id)
            else:
                miss_indices.append(idx)
                miss_entries.append(entry)

        perf["cache_misses"] = float(len(miss_indices))

        computed_for_cache: list[FeatureVector] = []
        if miss_entries:
            miss_texts = [entry.content for entry in miss_entries]

            rust_started = time.perf_counter()
            rust_features: list[RustFeatures] = []
            if HAS_RUST:
                try:
                    rust_results = await asyncio.to_thread(rust_batch_extract, miss_texts)
                    if len(rust_results) != len(miss_texts):
                        raise RuntimeError(
                            f"Rust batch_extract result length mismatch: expected {len(miss_texts)}, "
                            f"got {len(rust_results)}"
                        )
                    rust_features = [RustFeatures.model_validate(item.to_dict()) for item in rust_results]
                except Exception as exc:
                    logger.warning("Rust batch extraction failed, falling back to Python: %s", exc)

            if not rust_features:
                rust_features = await asyncio.to_thread(
                    lambda: [_python_fallback_features(text) for text in miss_texts]
                )
            perf["rust_ms"] += (time.perf_counter() - rust_started) * 1000.0

            embed_started = time.perf_counter()
            embeddings = await asyncio.to_thread(self._embedder.embed_batch, miss_texts)
            if len(embeddings) != len(miss_texts):
                logger.warning(
                    "Embedding batch returned unexpected length (%d vs %d), using empty vectors",
                    len(embeddings),
                    len(miss_texts),
                )
                embeddings = [[] for _ in miss_texts]
            perf["embedding_ms"] += (time.perf_counter() - embed_started) * 1000.0

            tokens_per_text = await asyncio.to_thread(
                lambda: [_tokenize_simple(text) for text in miss_texts]
            )
            liwc_scores = await asyncio.to_thread(
                lambda: [self._liwc.analyze(tokens) for tokens in tokens_per_text]
            )

            # Defaults for texts where spaCy is unavailable or fails.
            spacy_metrics: list[tuple[dict[str, float], float, float]] = [
                ({}, 0.0, 0.0) for _ in miss_texts
            ]

            nlp = self._get_nlp()
            if nlp is not None:
                spacy_started = time.perf_counter()
                try:
                    spacy_metrics = await asyncio.to_thread(
                        self._extract_spacy_metrics_batch,
                        nlp,
                        miss_texts,
                    )
                except Exception as exc:
                    logger.warning("spaCy batch processing failed: %s", exc)
                finally:
                    perf["spacy_ms"] += (time.perf_counter() - spacy_started) * 1000.0

            for miss_pos, entry in enumerate(miss_entries):
                nlp_features = self._extract_nlp_features(
                    entry.content,
                    tokens=tokens_per_text[miss_pos],
                    liwc_scores=liwc_scores[miss_pos],
                    embedding=embeddings[miss_pos],
                    spacy_metrics=spacy_metrics[miss_pos],
                )

                feature_vector = FeatureVector(
                    text_id=entry.id,
                    content_hash=content_hashes[miss_indices[miss_pos]],
                    rust_features=rust_features[miss_pos],
                    nlp_features=nlp_features,
                )
                vectors[miss_indices[miss_pos]] = feature_vector
                computed_for_cache.append(feature_vector)
                completed += 1
                if progress_hook is not None:
                    progress_hook(completed, total, entry.id)

            if self._cache is not None and computed_for_cache:
                cache_put_started = time.perf_counter()
                await self._cache.put_many(computed_for_cache)
                perf["cache_put_ms"] += (time.perf_counter() - cache_put_started) * 1000.0

        resolved_vectors: list[FeatureVector] = []
        for idx, vec in enumerate(vectors):
            if vec is None:
                raise RuntimeError(f"Internal extraction error: missing vector at index {idx}")
            resolved_vectors.append(vec)

        await asyncio.to_thread(self._compute_topics, resolved_vectors)
        self._last_perf = perf
        return resolved_vectors

    def _extract_rust_features(self, text: str) -> RustFeatures:
        """Call Rust PyO3 module. Falls back to pure Python if unavailable."""
        if HAS_RUST:
            try:
                results = rust_batch_extract([text])
                if results and len(results) > 0:
                    return RustFeatures.model_validate(results[0].to_dict())
            except Exception as exc:
                logger.warning("Rust extraction failed, falling back to Python: %s", exc)

        return _python_fallback_features(text)

    def _compute_topics(self, vectors: list[FeatureVector]) -> None:
        """Compute topic distributions over a batch of feature vectors.

        Uses KMeans clustering on sentence embeddings.  Each vector's
        topic_distribution is set to the softmax of negative Euclidean
        distances to the cluster centroids.  Requires sklearn; silently
        skips when unavailable or when there are too few texts.
        """
        embeddings: list[tuple[int, list[float]]] = []
        for idx, vec in enumerate(vectors):
            emb = vec.nlp_features.embedding
            if emb:
                embeddings.append((idx, emb))

        if len(embeddings) < 5:
            return

        try:
            import numpy as np
            from sklearn.cluster import KMeans
        except ImportError:
            logger.debug("sklearn unavailable; skipping topic modeling.")
            return

        matrix = np.array([emb for _, emb in embeddings], dtype=np.float64)
        n_texts = matrix.shape[0]
        n_clusters = min(5, n_texts // 2)
        if n_clusters < 2:
            return

        km = KMeans(n_clusters=n_clusters, n_init=3, random_state=42)
        km.fit(matrix)
        centroids = km.cluster_centers_  # (n_clusters, dim)

        for row_idx, (vec_idx, _emb) in enumerate(embeddings):
            point = matrix[row_idx]
            # Negative squared Euclidean distances
            neg_dists = -np.sum((centroids - point) ** 2, axis=1)
            # Softmax
            shifted = neg_dists - neg_dists.max()
            exp_vals = np.exp(shifted)
            probs = exp_vals / exp_vals.sum()
            vectors[vec_idx].nlp_features.topic_distribution = probs.tolist()

    def _extract_nlp_features(
        self,
        text: str,
        *,
        tokens: list[str] | None = None,
        liwc_scores: dict[str, float] | None = None,
        embedding: list[float] | None = None,
        spacy_metrics: tuple[dict[str, float], float, float] | None = None,
        perf: dict[str, float] | None = None,
    ) -> NlpFeatures:
        """Run spaCy pipeline + LIWC + embeddings to produce NLP features."""
        if tokens is None:
            tokens = _tokenize_simple(text)

        # LIWC analysis
        if liwc_scores is None:
            liwc_scores = self._liwc.analyze(tokens)

        # Temporal orientation (aggregate from LIWC temporal dimensions)
        temporal = {
            "past": liwc_scores.get("temporal_past", 0.0),
            "present": liwc_scores.get("temporal_present", 0.0),
            "future": liwc_scores.get("temporal_future", 0.0),
        }

        # Cognitive complexity: simple proxy from cognitive LIWC dimension
        cognitive_complexity = liwc_scores.get("cognitive", 0.0)

        # Embedding
        if embedding is None:
            embed_started = time.perf_counter()
            embedding = self._embedder.embed(text)
            if perf is not None:
                perf["embedding_ms"] += (time.perf_counter() - embed_started) * 1000.0

        # spaCy-based features
        pos_dist: dict[str, float] = {}
        clause_depth_avg = 0.0
        sentiment_valence = 0.0
        emotional_tone = 0.0

        if spacy_metrics is not None:
            pos_dist, clause_depth_avg, sentiment_valence = spacy_metrics
            emotional_tone = liwc_scores.get("affective", 0.0)
            return NlpFeatures(
                pos_tag_distribution=pos_dist,
                clause_depth_avg=clause_depth_avg,
                liwc_dimensions=liwc_scores,
                sentiment_valence=sentiment_valence,
                emotional_tone=emotional_tone,
                cognitive_complexity=cognitive_complexity,
                temporal_orientation=temporal,
                embedding=embedding,
            )

        nlp = self._get_nlp()
        if nlp is not None:
            spacy_started = time.perf_counter()
            try:
                if len(text) > SPACY_CHUNK_SIZE:
                    pos_dist, clause_depth_avg, sentiment_valence = self._process_spacy_chunked(
                        nlp, text
                    )
                else:
                    pos_dist, clause_depth_avg, sentiment_valence = self._process_spacy_single(
                        nlp, text
                    )

                # Emotional tone: proportion of affective LIWC tokens
                emotional_tone = liwc_scores.get("affective", 0.0)

            except Exception as exc:
                logger.warning("spaCy processing failed: %s", exc)
            finally:
                if perf is not None:
                    perf["spacy_ms"] += (time.perf_counter() - spacy_started) * 1000.0
        else:
            # Without spaCy, still compute emotional_tone from LIWC
            emotional_tone = liwc_scores.get("affective", 0.0)

        return NlpFeatures(
            pos_tag_distribution=pos_dist,
            clause_depth_avg=clause_depth_avg,
            liwc_dimensions=liwc_scores,
            sentiment_valence=sentiment_valence,
            emotional_tone=emotional_tone,
            cognitive_complexity=cognitive_complexity,
            temporal_orientation=temporal,
            embedding=embedding,
        )

    @staticmethod
    def _spacy_metrics_from_doc(doc) -> tuple[dict[str, float], float, float]:
        """Compute spaCy-dependent metrics from an already parsed Doc."""
        # POS tag distribution
        pos_counts: dict[str, int] = {}
        for token in doc:
            pos_counts[token.pos_] = pos_counts.get(token.pos_, 0) + 1
        total_tokens = len(doc) or 1
        pos_dist = {pos: cnt / total_tokens for pos, cnt in pos_counts.items()}

        # Clause depth approximation via dependency tree depth
        depths: list[int] = []
        for sent in doc.sents:
            max_depth = _tree_depth(sent.root)
            depths.append(max_depth)
        clause_depth_avg = sum(depths) / len(depths) if depths else 0.0

        # Sentiment approximation
        positive_adj = {
            "good",
            "great",
            "excellent",
            "wonderful",
            "amazing",
            "fantastic",
            "positive",
            "happy",
            "best",
            "beautiful",
        }
        negative_adj = {
            "bad",
            "terrible",
            "awful",
            "horrible",
            "worst",
            "ugly",
            "negative",
            "sad",
            "poor",
            "disgusting",
        }
        pos_count = sum(1 for t in doc if t.text.lower() in positive_adj)
        neg_count = sum(1 for t in doc if t.text.lower() in negative_adj)
        total_sent = pos_count + neg_count
        sentiment_valence = (pos_count - neg_count) / total_sent if total_sent > 0 else 0.0

        return pos_dist, clause_depth_avg, sentiment_valence

    @staticmethod
    def _process_spacy_single(nlp, text: str):
        """Process text through spaCy in a single pass."""
        doc = nlp(text)  # type: ignore[operator]
        return FeatureExtractor._spacy_metrics_from_doc(doc)

    @staticmethod
    def _process_spacy_chunked(nlp, text: str):
        """Process long text by splitting into chunks at sentence boundaries."""
        chunks = _split_for_spacy(text, SPACY_CHUNK_SIZE)

        agg_pos: dict[str, int] = {}
        total_tokens = 0
        all_depths: list[int] = []
        total_pos = 0
        total_neg = 0

        positive_adj = {
            "good",
            "great",
            "excellent",
            "wonderful",
            "amazing",
            "fantastic",
            "positive",
            "happy",
            "best",
            "beautiful",
        }
        negative_adj = {
            "bad",
            "terrible",
            "awful",
            "horrible",
            "worst",
            "ugly",
            "negative",
            "sad",
            "poor",
            "disgusting",
        }

        for chunk in chunks:
            doc = nlp(chunk)  # type: ignore[operator]
            n_tok = len(doc)
            total_tokens += n_tok

            for token in doc:
                agg_pos[token.pos_] = agg_pos.get(token.pos_, 0) + 1

            for sent in doc.sents:
                all_depths.append(_tree_depth(sent.root))

            total_pos += sum(1 for t in doc if t.text.lower() in positive_adj)
            total_neg += sum(1 for t in doc if t.text.lower() in negative_adj)

        total_tokens = total_tokens or 1
        pos_dist = {pos: cnt / total_tokens for pos, cnt in agg_pos.items()}
        clause_depth_avg = sum(all_depths) / len(all_depths) if all_depths else 0.0
        total_sent = total_pos + total_neg
        sentiment_valence = (total_pos - total_neg) / total_sent if total_sent > 0 else 0.0

        return pos_dist, clause_depth_avg, sentiment_valence

    @staticmethod
    def _extract_spacy_metrics_batch(
        nlp,
        texts: list[str],
    ) -> list[tuple[dict[str, float], float, float]]:
        """Compute spaCy metrics for a batch of texts.

        This helper is intentionally synchronous and executed inside
        ``asyncio.to_thread`` so large corpora won't block the API loop.
        """
        metrics: list[tuple[dict[str, float], float, float]] = [({}, 0.0, 0.0) for _ in texts]
        # The same cached spaCy model can be shared across analyses.
        # Guard against concurrent access from worker threads.
        with _SPACY_PIPE_LOCK:
            short_indices = [i for i, text in enumerate(texts) if len(text) <= SPACY_CHUNK_SIZE]
            if short_indices:
                short_texts = [texts[i] for i in short_indices]
                for rel_idx, doc in enumerate(nlp.pipe(short_texts, batch_size=16)):  # type: ignore[operator]
                    metrics[short_indices[rel_idx]] = FeatureExtractor._spacy_metrics_from_doc(doc)

            long_indices = [i for i, text in enumerate(texts) if len(text) > SPACY_CHUNK_SIZE]
            for i in long_indices:
                metrics[i] = FeatureExtractor._process_spacy_chunked(nlp, texts[i])

        return metrics


def _split_for_spacy(text: str, max_chars: int) -> list[str]:
    """Split text into chunks of at most *max_chars* at sentence boundaries."""
    # Use a simple regex to find sentence boundaries.
    parts = re.split(r"(?<=[.!?。！？])\s+", text)
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0

    for part in parts:
        part = part.strip()
        if not part:
            continue
        part_len = len(part)
        if part_len > max_chars:
            if current:
                chunks.append(" ".join(current))
                current = []
                current_len = 0
            chunks.append(part)
            continue
        if current_len + part_len + 1 > max_chars and current:
            chunks.append(" ".join(current))
            current = []
            current_len = 0
        current.append(part)
        current_len += part_len + 1

    if current:
        chunks.append(" ".join(current))

    return chunks if chunks else [text]


def _tree_depth(token) -> int:
    """Recursively compute the depth of a dependency parse subtree."""
    children = list(token.children)
    if not children:
        return 1
    return 1 + max(_tree_depth(child) for child in children)
