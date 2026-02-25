"""Stylometry Agent -- writing style fingerprint analysis."""

from __future__ import annotations

import json
import logging
from typing import Any

import litellm

from text.ingest.schema import AgentFinding, AgentReport, FeatureVector

logger = logging.getLogger(__name__)


class StylometryAgent:
    """Analyzes writing style features to build an author fingerprint."""

    SYSTEM_PROMPT = """\
You are an expert forensic linguist specializing in stylometry -- the statistical \
analysis of writing style for authorship attribution and verification. You have \
decades of experience in computational stylistics, having contributed to landmark \
authorship disputes in both literary and legal contexts.

Your analytical framework covers the following dimensions:

1. **Vocabulary Richness & Lexical Diversity**
   - Type-Token Ratio (TTR): measures vocabulary range relative to text length. \
Values above 0.7 suggest rich, varied vocabulary; below 0.4 indicate repetitive usage.
   - Hapax Legomena Ratio: the proportion of words used exactly once. Higher ratios \
(> 0.5) indicate a preference for unique word choices; lower ratios suggest formulaic \
or constrained vocabulary.
   - Yule's K: a text-length-independent measure of vocabulary richness. Values below \
100 indicate very rich vocabulary; above 200 suggest limited range. This metric is \
particularly robust for cross-sample comparison.

2. **Sentence Structure & Syntactic Preferences**
   - Average sentence length (in tokens) reveals cognitive load and stylistic register. \
Academic writers tend toward 20-30 tokens; informal writers often stay below 15.
   - Sentence length variance captures rhythmic patterns -- low variance indicates \
monotonous structure while high variance may signal deliberate rhetorical variation or \
inconsistent editing.
   - POS tag distributions reveal syntactic fingerprints: noun-heavy writing suggests \
an information-dense style; verb-heavy writing is more action-oriented; adjective and \
adverb density correlates with descriptive or evaluative registers.
   - Clause depth indicates syntactic complexity and embedding preferences.

3. **Punctuation & Symbol Habits**
   - Punctuation profiles are among the most stable authorial markers. Pay special \
attention to: comma frequency (correlates with clause complexity), semicolon usage \
(marks formal or academic style), dash patterns (em-dash vs en-dash vs hyphen), \
exclamation and question mark density, and ellipsis usage.
   - These features are particularly resistant to deliberate disguise.

4. **N-gram Fingerprints**
   - Character n-grams (especially 2-4 grams) capture subword patterns including \
morphological preferences, spelling habits, and even keyboard patterns.
   - Word n-grams reveal phrasal templates and collocational preferences that are \
deeply ingrained and difficult to consciously alter.
   - Unusual or distinctive n-gram patterns are strong discriminators.

5. **Function Word Distribution**
   - Function words (articles, prepositions, conjunctions, pronouns, auxiliary verbs) \
are used largely unconsciously and are therefore among the most reliable authorship \
indicators.
   - Pay attention to: pronoun system preferences (I vs we, this vs that), article \
usage patterns, preposition selection, conjunction density, and modal verb choices.

6. **Cross-Sample Consistency**
   - When multiple samples are provided, consistency of stylometric features across \
samples is itself a powerful signal. An author's genuine writing shows stable patterns \
within a predictable variance band.
   - Sudden deviations may indicate: different authorship, deliberate disguise, \
genre/register shift, or temporal changes in writing habits.

**Output Requirements:**
Provide your analysis as a JSON array of finding objects. Each finding must have:
- "category": one of "vocabulary_richness", "sentence_structure", "punctuation_habits", \
"ngram_fingerprint", "function_words", "cross_sample_consistency"
- "description": a clear, specific analytical statement (2-4 sentences)
- "confidence": a float between 0.0 and 1.0
- "evidence": a list of specific data points supporting this finding

Return ONLY the JSON array, no other text. Example:
[
  {
    "category": "vocabulary_richness",
    "description": "The author demonstrates...",
    "confidence": 0.85,
    "evidence": ["TTR of 0.72 indicates...", "Hapax ratio of 0.55 suggests..."]
  }
]

**IMPORTANT: Language Requirement**
You MUST write ALL text content (description, evidence, and any other free-text fields) \
in Simplified Chinese (简体中文). Keep JSON keys and category identifiers in English. \
Numerical values remain as numbers. Only the human-readable text should be in Chinese.
"""

    def __init__(
        self,
        model: str | None = None,
        api_base: str | None = None,
        api_key: str | None = None,
    ) -> None:
        self.model = model
        self.api_base = api_base
        self.api_key = api_key

    async def analyze(
        self,
        features: list[FeatureVector],
        task_context: str,
    ) -> AgentReport:
        """Analyze writing style features and return findings."""
        model = self.model
        if not model:
            return AgentReport(
                agent_name="stylometry",
                discipline="stylometry",
                summary="未配置 LLM 模型，已跳过文体学分析。",
            )

        user_prompt = self._build_prompt(features, task_context)

        try:
            raw_response = await _call_llm(
                self.SYSTEM_PROMPT,
                user_prompt,
                model,
                api_base=self.api_base,
                api_key=self.api_key,
            )
        except Exception as exc:
            logger.exception("StylometryAgent LLM call failed")
            return AgentReport(
                agent_name="stylometry",
                discipline="stylometry",
                summary=f"由于 LLM 调用失败，分析未完成。原因：{type(exc).__name__}: {exc}",
            )

        findings = _parse_findings(raw_response, discipline="stylometry")
        summary = self._build_summary(findings)

        return AgentReport(
            agent_name="stylometry",
            discipline="stylometry",
            findings=findings,
            summary=summary,
            raw_llm_response=raw_response,
        )

    # ------------------------------------------------------------------
    # Prompt construction
    # ------------------------------------------------------------------

    def _build_prompt(
        self,
        features: list[FeatureVector],
        task_context: str,
    ) -> str:
        sections: list[str] = [
            f"## Task Context\n{task_context}",
            f"## Number of Text Samples: {len(features)}",
        ]

        for i, fv in enumerate(features, 1):
            rust = fv.rust_features
            nlp = fv.nlp_features

            block = (
                f"### Sample {i} (id={fv.text_id})\n"
                f"**Vocabulary Metrics:**\n"
                f"- Token count: {rust.token_count}\n"
                f"- Type-Token Ratio: {rust.type_token_ratio:.4f}\n"
                f"- Hapax Legomena Ratio: {rust.hapax_legomena_ratio:.4f}\n"
                f"- Yule's K: {rust.yules_k:.2f}\n"
                f"- Avg word length: {rust.avg_word_length:.2f}\n\n"
                f"**Sentence Structure:**\n"
                f"- Avg sentence length: {rust.avg_sentence_length:.2f}\n"
                f"- Sentence length variance: {rust.sentence_length_variance:.2f}\n"
                f"- Clause depth avg: {nlp.clause_depth_avg:.2f}\n"
                f"- POS tag distribution: {_fmt_dict(nlp.pos_tag_distribution, top_n=15)}\n\n"
                f"**Punctuation Profile:**\n"
                f"{_fmt_dict(rust.punctuation_profile, top_n=20)}\n\n"
                f"**Top Character N-grams:**\n"
                f"{_fmt_dict(rust.char_ngrams, top_n=20)}\n\n"
                f"**Top Word N-grams:**\n"
                f"{_fmt_dict(rust.word_ngrams, top_n=20)}\n\n"
                f"**Function Word Frequencies:**\n"
                f"{_fmt_dict(rust.function_word_freq, top_n=25)}\n"
            )
            sections.append(block)

        sections.append(
            "Analyze these stylometric features thoroughly. "
            "Identify distinctive authorial markers, cross-sample patterns, "
            "and any anomalies. Return your findings as a JSON array."
        )
        return "\n\n".join(sections)

    def _build_summary(self, findings: list[AgentFinding]) -> str:
        if not findings:
            return "文体学分析未产生任何发现。"
        high = [f for f in findings if f.confidence >= 0.7]
        return (
            f"文体学分析产出 {len(findings)} 项发现"
            f"（{len(high)} 项高置信度）。"
            f"涵盖类别：{', '.join(sorted({f.category for f in findings}))}。"
        )


# ======================================================================
# Shared helpers (module-level so other agents can reuse the pattern)
# ======================================================================


async def _call_llm(
    system_prompt: str,
    user_prompt: str,
    model: str,
    api_base: str | None = None,
    api_key: str | None = None,
    max_retries: int = 3,
    max_tokens: int = 8192,
) -> str:
    """Call an LLM via litellm and return the text response.

    Retries on transient errors with exponential backoff.
    """
    import asyncio as _asyncio

    kwargs: dict = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.3,
        "max_tokens": max_tokens,
    }
    if api_base:
        kwargs["api_base"] = api_base
    if api_key:
        kwargs["api_key"] = api_key

    last_exc: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            response = await litellm.acompletion(**kwargs)
            return response.choices[0].message.content
        except (
            litellm.RateLimitError,
            litellm.ServiceUnavailableError,
            litellm.Timeout,
            litellm.InternalServerError,
            litellm.APIConnectionError,
        ) as exc:
            last_exc = exc
            if attempt < max_retries:
                delay = 2.0 * (2 ** (attempt - 1))
                logger.warning(
                    "LLM call failed (attempt %d/%d): %s. Retrying in %.1fs...",
                    attempt,
                    max_retries,
                    type(exc).__name__,
                    delay,
                )
                await _asyncio.sleep(delay)
            else:
                logger.error("LLM call failed after %d attempts: %s", max_retries, exc)

    raise last_exc  # type: ignore[misc]


def _repair_truncated_json_array(text: str) -> list[dict[str, Any]] | None:
    """Attempt to recover complete items from a truncated JSON array.

    When an LLM response is cut off mid-JSON (e.g., due to max_tokens),
    this function tries to find the last complete ``}`` boundary, close
    the array, and parse the salvageable portion.
    """
    stripped = text.rstrip()
    if not stripped.lstrip().startswith("["):
        return None

    # Walk backwards to find the last complete object boundary.
    last_brace = stripped.rfind("}")
    if last_brace < 0:
        return None

    candidate = stripped[: last_brace + 1].rstrip().rstrip(",") + "]"
    try:
        result = json.loads(candidate)
        if isinstance(result, list) and len(result) > 0:
            return result
    except json.JSONDecodeError:
        pass
    return None


def _parse_findings(
    raw: str,
    discipline: str,
) -> list[AgentFinding]:
    """Best-effort parse of LLM JSON response into AgentFinding objects."""
    # Strip markdown fences if present.
    text = raw.strip()
    if text.startswith("```"):
        first_newline = text.index("\n")
        last_fence = text.rfind("```")
        text = text[first_newline + 1 : last_fence].strip()

    items: list[dict[str, Any]] | None = None
    truncated = False

    try:
        items = json.loads(text)
    except json.JSONDecodeError:
        # Attempt to recover complete objects from a truncated JSON array.
        items = _repair_truncated_json_array(text)
        if items is not None:
            truncated = True
            logger.info(
                "Recovered %d complete findings from truncated JSON for %s agent",
                len(items),
                discipline,
            )
        else:
            logger.warning(
                "Failed to parse LLM response as JSON for %s agent",
                discipline,
            )
            return [
                AgentFinding(
                    discipline=discipline,
                    category="unparsed",
                    description=raw[:500],
                    confidence=0.3,
                    evidence=[
                        "Raw LLM response could not be parsed as structured JSON.",
                    ],
                )
            ]

    findings: list[AgentFinding] = []
    for item in items:
        try:
            findings.append(
                AgentFinding(
                    discipline=discipline,
                    category=item.get("category", "unknown"),
                    description=item.get("description", ""),
                    confidence=float(item.get("confidence", 0.5)),
                    evidence=item.get("evidence", []),
                    metadata=item.get("metadata", {}),
                )
            )
        except (ValueError, TypeError):
            logger.warning("Skipping malformed finding item in %s agent", discipline)

    if truncated and findings:
        findings.append(
            AgentFinding(
                discipline=discipline,
                category="methodology",
                description=(
                    "LLM 响应因 token 上限被截断，上述发现为已恢复的部分结果，"
                    "可能遗漏了部分分析维度。"
                ),
                confidence=0.5,
                evidence=["JSON response was truncated; partial recovery applied."],
            )
        )
    return findings


def _fmt_dict(
    d: dict[str, float],
    top_n: int | None = None,
) -> str:
    """Format a feature dict for prompt inclusion."""
    if not d:
        return "(empty)"
    items = sorted(d.items(), key=lambda kv: kv[1], reverse=True)
    if top_n is not None:
        items = items[:top_n]
    lines = [f"  {k}: {v:.4f}" for k, v in items]
    return "\n".join(lines)


# ======================================================================
# Large corpus aggregation helpers
# ======================================================================

# When the number of samples exceeds this threshold, agents receive
# aggregated statistics + a representative sample subset instead of
# all individual feature vectors, preventing LLM context overflow.
MAX_PROMPT_SAMPLES = 25

# Maximum auto-findings from computational agent's pairwise checks.
MAX_AUTO_FINDINGS = 50


def _sample_representative(
    features: list,
    max_samples: int = MAX_PROMPT_SAMPLES,
) -> list:
    """Return an evenly-spaced subset of feature vectors."""
    n = len(features)
    if n <= max_samples:
        return features
    step = n / max_samples
    return [features[int(i * step)] for i in range(max_samples)]


def _build_corpus_summary(
    features: list,
    author_map: dict[str, str],
) -> str:
    """Build aggregate statistics string for large corpora.

    Groups features by author and computes per-author mean ± std for
    scalar features plus merged top-K for dict features.  This compact
    summary is injected into the task_context so that every agent has a
    high-level view of the full corpus even when only receiving a sample
    of individual feature vectors.
    """
    from collections import defaultdict

    by_author: dict[str, list] = defaultdict(list)
    for fv in features:
        author = author_map.get(fv.text_id, "unknown")
        by_author[author].append(fv)

    n_authors = len(by_author)
    sections = [
        f"## Corpus Aggregate Statistics ({len(features)} total samples, {n_authors} authors)"
    ]

    # When there are very many authors, show corpus-wide stats
    # instead of per-author breakdowns.
    max_author_detail = 10

    if n_authors > max_author_detail:
        sections.append(
            f"**Note:** {n_authors} distinct authors detected. "
            f"Showing corpus-wide aggregate statistics and "
            f"top {max_author_detail} authors by sample count. "
            f"Individual sample blocks below are a representative subset."
        )

        # Corpus-wide aggregate
        sections.append("\n### Corpus-Wide Statistics")
        _append_scalar_aggregate(sections, features)
        _append_merged_dict(
            sections,
            "Function Words (corpus top 20)",
            [fv.rust_features.function_word_freq for fv in features],
            top_n=20,
        )
        _append_merged_dict(
            sections,
            "Punctuation Profile (corpus top 15)",
            [fv.rust_features.punctuation_profile for fv in features],
            top_n=15,
        )

        # Top N authors by sample count
        top_authors = sorted(by_author.items(), key=lambda x: len(x[1]), reverse=True)
        for author, author_fvs in top_authors[:max_author_detail]:
            sections.append(f"\n### Author: {author} ({len(author_fvs)} samples)")
            _append_scalar_aggregate(sections, author_fvs)
    else:
        sections.append(
            "**Note:** Due to corpus size, only a representative subset of "
            "individual samples is shown below. Use these aggregate statistics "
            "for the overall picture."
        )

        for author, author_fvs in sorted(by_author.items()):
            sections.append(f"\n### Author: {author} ({len(author_fvs)} samples)")
            _append_scalar_aggregate(sections, author_fvs)
            _append_merged_dict(
                sections,
                "Function Words (merged top 20)",
                [fv.rust_features.function_word_freq for fv in author_fvs],
                top_n=20,
            )
            _append_merged_dict(
                sections,
                "Punctuation Profile (merged top 15)",
                [fv.rust_features.punctuation_profile for fv in author_fvs],
                top_n=15,
            )
            _append_merged_dict(
                sections,
                "Char N-grams (merged top 15)",
                [fv.rust_features.char_ngrams for fv in author_fvs],
                top_n=15,
            )
            _append_merged_dict(
                sections,
                "Word N-grams (merged top 15)",
                [fv.rust_features.word_ngrams for fv in author_fvs],
                top_n=15,
            )

    return "\n".join(sections)


def _append_scalar_aggregate(sections: list[str], fvs: list) -> None:
    """Append mean ± std statistics for scalar features."""
    import statistics as _stats

    scalar_fields = [
        ("token_count", "rust"),
        ("type_token_ratio", "rust"),
        ("hapax_legomena_ratio", "rust"),
        ("yules_k", "rust"),
        ("avg_word_length", "rust"),
        ("avg_sentence_length", "rust"),
        ("sentence_length_variance", "rust"),
        ("cjk_ratio", "rust"),
        ("emoji_density", "rust"),
        ("formality_score", "rust"),
        ("code_switching_ratio", "rust"),
        ("sentiment_valence", "nlp"),
        ("emotional_tone", "nlp"),
        ("cognitive_complexity", "nlp"),
        ("clause_depth_avg", "nlp"),
    ]

    lines = []
    for name, source in scalar_fields:
        if source == "rust":
            values = [getattr(fv.rust_features, name) for fv in fvs]
        else:
            values = [getattr(fv.nlp_features, name) for fv in fvs]
        mean = _stats.mean(values)
        std = _stats.stdev(values) if len(values) > 1 else 0.0
        lines.append(f"  {name}: {mean:.4f} ± {std:.4f}")
    sections.append("**Scalar Features (mean ± std):**\n" + "\n".join(lines))


def _append_merged_dict(
    sections: list[str],
    title: str,
    dicts: list[dict[str, float]],
    top_n: int = 15,
) -> None:
    """Merge multiple feature dicts by averaging values and append formatted output."""
    from collections import defaultdict

    totals: dict[str, float] = defaultdict(float)
    counts: dict[str, int] = defaultdict(int)
    for d in dicts:
        for k, v in d.items():
            totals[k] += v
            counts[k] += 1

    if not totals:
        return

    merged = {k: totals[k] / counts[k] for k in totals}
    sections.append(f"**{title}:**\n{_fmt_dict(merged, top_n=top_n)}")
