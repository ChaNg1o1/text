"""Feature extraction orchestrator.

Combines Rust-accelerated text features, spaCy NLP features, LIWC analysis,
and sentence embeddings into a unified FeatureVector.  Every dependency is
optional: the extractor degrades gracefully when Rust extensions, spaCy
models, or sentence-transformers are unavailable.
"""

from __future__ import annotations

import asyncio
import logging
import re
import string
import unicodedata
from collections import Counter

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


def _get_spacy_model(name: str = "en_core_web_sm") -> object | None:
    """Load and cache a spaCy model, returning None on failure."""
    if not _SPACY_AVAILABLE:
        return None
    if name not in _NLP_MODELS:
        try:
            _NLP_MODELS[name] = spacy.load(name)  # type: ignore[union-attr]
            logger.info("Loaded spaCy model: %s", name)
        except OSError:
            logger.warning("spaCy model '%s' not found. Run: python -m spacy download %s", name, name)
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
_FUNCTION_WORDS = frozenset({
    "the", "a", "an", "in", "on", "at", "to", "for", "of", "with",
    "by", "from", "as", "is", "was", "are", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "shall", "can",
    "this", "that", "these", "those", "it", "its", "he", "she",
    "they", "them", "his", "her", "their", "my", "your", "our",
    "who", "which", "what", "where", "when", "how", "if", "but",
    "and", "or", "not", "no", "so", "than", "too", "very",
})


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
        sum((sl - avg_sent_len) ** 2 for sl in sent_lengths) / sent_count
        if sent_count > 1
        else 0.0
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

    return RustFeatures(
        token_count=token_count,
        type_token_ratio=ttr,
        hapax_legomena_ratio=hapax_ratio,
        yules_k=yules_k,
        avg_word_length=avg_word_len,
        avg_sentence_length=avg_sent_len,
        sentence_length_variance=sent_len_var,
        punctuation_profile=punct_profile,
        function_word_freq=func_freq,
        cjk_ratio=cjk_ratio,
        emoji_density=emoji_density,
        formality_score=formality_score,
        code_switching_ratio=code_switching_ratio,
    )


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

    def _get_nlp(self):
        """Lazily load spaCy model."""
        if self._nlp is None:
            self._nlp = _get_spacy_model("en_core_web_sm")
        return self._nlp

    async def extract(self, text: str, text_id: str) -> FeatureVector:
        """Extract all features for a single text."""
        content_hash = FeatureCache.content_hash(text)

        rust_feats = self._extract_rust_features(text)
        nlp_feats = self._extract_nlp_features(text)

        return FeatureVector(
            text_id=text_id,
            content_hash=content_hash,
            rust_features=rust_feats,
            nlp_features=nlp_feats,
        )

    async def extract_batch(self, entries: list[TextEntry]) -> list[FeatureVector]:
        """Extract features for multiple texts, leveraging cache when available."""
        if not entries:
            return []

        if self._cache is not None:
            # Use cache-aware path
            async def _compute(tid: str, content: str) -> FeatureVector:
                return await self.extract(content, tid)

            tasks = [
                self._cache.get_or_compute(entry.id, entry.content, _compute)
                for entry in entries
            ]
            return await asyncio.gather(*tasks)
        else:
            # No cache — compute all directly
            tasks = [self.extract(entry.content, entry.id) for entry in entries]
            return await asyncio.gather(*tasks)

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

    def _extract_nlp_features(self, text: str) -> NlpFeatures:
        """Run spaCy pipeline + LIWC + embeddings to produce NLP features."""
        tokens = _tokenize_simple(text)

        # LIWC analysis
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
        embedding = self._embedder.embed(text)

        # spaCy-based features
        pos_dist: dict[str, float] = {}
        clause_depth_avg = 0.0
        sentiment_valence = 0.0
        emotional_tone = 0.0

        nlp = self._get_nlp()
        if nlp is not None:
            try:
                doc = nlp(text)  # type: ignore[operator]

                # POS tag distribution
                pos_counts: dict[str, int] = {}
                for token in doc:
                    pos_counts[token.pos_] = pos_counts.get(token.pos_, 0) + 1
                total_tokens = len(doc) or 1
                pos_dist = {pos: cnt / total_tokens for pos, cnt in pos_counts.items()}

                # Clause depth approximation via dependency tree depth
                depths: list[int] = []
                for sent in doc.sents:
                    root = sent.root
                    max_depth = _tree_depth(root)
                    depths.append(max_depth)
                clause_depth_avg = sum(depths) / len(depths) if depths else 0.0

                # Sentiment approximation: use positive/negative adjective ratio
                # (Very rough — a proper sentiment model would be better)
                positive_adj = {"good", "great", "excellent", "wonderful", "amazing",
                                "fantastic", "positive", "happy", "best", "beautiful"}
                negative_adj = {"bad", "terrible", "awful", "horrible", "worst",
                                "ugly", "negative", "sad", "poor", "disgusting"}
                pos_count = sum(1 for t in doc if t.text.lower() in positive_adj)
                neg_count = sum(1 for t in doc if t.text.lower() in negative_adj)
                total_sent = pos_count + neg_count
                if total_sent > 0:
                    sentiment_valence = (pos_count - neg_count) / total_sent
                else:
                    sentiment_valence = 0.0

                # Emotional tone: proportion of affective LIWC tokens
                emotional_tone = liwc_scores.get("affective", 0.0)

            except Exception as exc:
                logger.warning("spaCy processing failed: %s", exc)
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


def _tree_depth(token) -> int:
    """Recursively compute the depth of a dependency parse subtree."""
    children = list(token.children)
    if not children:
        return 1
    return 1 + max(_tree_depth(child) for child in children)
