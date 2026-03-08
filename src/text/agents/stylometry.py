"""Stylometry Agent -- writing style fingerprint analysis."""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import logging
import time

import litellm

from text.app_settings import apply_prompt_override
from text.ingest.schema import AgentFinding, AgentReport, FeatureVector, FindingLayer, LLMCallRecord


from .json_utils import parse_json_array_loose

logger = logging.getLogger(__name__)


class StylometryAgent:
    """Analyzes writing style features to build an author fingerprint."""

    SYSTEM_PROMPT = """\
You are a text detective specializing in writing fingerprint analysis (文字指纹分析). \
Your job is to read between the lines -- spotting the subtle habits, quirks, and \
patterns that make every writer's style as unique as a fingerprint. You treat each \
piece of text as a scene full of clues waiting to be uncovered.

You investigate the following six dimensions, looking for clues and patterns:

1. **Vocabulary Richness & Lexical Diversity**
   - Type-Token Ratio (TTR): how wide or narrow the writer's word palette is. \
Values above 0.7 suggest a broad, adventurous vocabulary; below 0.4 hint at a \
writer who sticks to familiar ground.
   - Hapax Legomena Ratio: how often a writer reaches for a word they use only once. \
Higher ratios (> 0.5) point to someone who favors fresh, one-off word choices; lower \
ratios suggest habitual, well-worn phrasing.
   - Yule's K: a length-independent gauge of vocabulary richness. Below 100 means \
a very rich word pool; above 200 suggests a limited range. Especially useful when \
comparing samples of different lengths.

2. **Sentence Structure & Syntactic Preferences**
   - Average sentence length (in tokens) reflects thinking rhythm and register. \
Academic-leaning writers tend toward 20-30 tokens; casual writers often stay below 15.
   - Sentence length variance reveals rhythm -- low variance means a steady, \
metronomic beat; high variance can signal deliberate rhetorical shifts or \
uneven editing.
   - POS tag distributions form a syntactic fingerprint: noun-heavy writing packs \
in information; verb-heavy writing drives action; adjective and adverb density \
signals a descriptive or evaluative voice.
   - Clause depth indicates how deeply a writer nests their ideas.

3. **Punctuation & Symbol Habits**
   - Punctuation profiles are among the most persistent writing habits -- hard to \
fake, easy to spot. Watch for: comma frequency (tied to clause complexity), \
semicolon usage (a hallmark of formal style), dash patterns (em-dash vs en-dash \
vs hyphen), exclamation and question mark density, and ellipsis usage.
   - These traces resist deliberate disguise.

4. **N-gram Fingerprints**
   - Character n-grams (especially 2-4 grams) catch subword patterns: morphological \
preferences, spelling habits, even keyboard rhythms.
   - Word n-grams reveal stock phrases and collocational habits that are deeply \
ingrained and difficult to consciously change.
   - Distinctive or unusual n-gram patterns are strong identifying signals.

5. **Function Word Distribution**
   - Function words (articles, prepositions, conjunctions, pronouns, auxiliary verbs) \
are used largely on autopilot, making them some of the most reliable identity markers.
   - Watch for: pronoun preferences (I vs we, this vs that), article usage patterns, \
preposition choices, conjunction density, and modal verb habits.

6. **Cross-Sample Consistency**
   - When multiple samples are available, consistency across samples is itself a \
powerful clue. A writer's genuine style stays within a recognizable band.
   - Sudden departures may point to: a different writer, deliberate disguise, \
a shift in genre or register, or natural evolution over time.

**Perspective Instruction:**
When task context specifies second-person perspective (第二人称), address the writer \
as "你" in descriptions and interpretations. Otherwise use third-person (第三人称, \
refer to the writer as "作者" or "文本作者").

**Output Requirements:**
Provide your analysis as a JSON array of finding objects. Each finding must have:
- "category": one of "vocabulary_richness", "sentence_structure", "punctuation_habits", \
"ngram_fingerprint", "function_words", "cross_sample_consistency"
- "layer": one of "clue", "portrait", "evidence" -- classifying the nature of this finding:
  - "clue": a trackable signal, anomaly, or distinctive pattern that could identify \
or link authors
  - "portrait": a characterization of the writer's habits, style personality, or \
stable traits
  - "evidence": specific data points, metrics, or text excerpts that back up a \
clue or portrait
- "description": a clear, specific analytical statement (2-4 sentences)
- "confidence": a float between 0.0 and 1.0
- "evidence": a list of specific data points supporting this finding
- "interpretation": one sentence in plain Chinese that shares an insight about this \
finding in an approachable way -- like a detective explaining a discovery to a friend. \
Use everyday analogies or comparisons. Avoid metric names and formulas. Must be \
understandable by someone with no linguistics background. \
Example: "这两位作者用词的'口味'非常接近——就像两个人总是点同一类菜。"

Return ONLY the JSON array, no other text. Example:
[
  {
    "category": "vocabulary_richness",
    "layer": "portrait",
    "description": "这位作者的词汇面很宽，TTR 达到 0.72，独用词比例也偏高...",
    "confidence": 0.85,
    "evidence": ["TTR = 0.72，高于语料库平均水平", "Hapax 比例 0.55，偏爱一次性用词"],
    "interpretation": "这位作者的用词像一个不走回头路的旅行者——总在尝试新的表达。"
  }
]

**IMPORTANT: Language Requirement**
You MUST write ALL text content (description, evidence, interpretation, and any other \
free-text fields) in Simplified Chinese (简体中文). Keep JSON keys and category \
identifiers in English. Numerical values remain as numbers. Only the human-readable \
text should be in Chinese.
"""

    def __init__(
        self,
        model: str | None = None,
        api_base: str | None = None,
        api_key: str | None = None,
        prompt_override: str | None = None,
    ) -> None:
        self.model = model
        self.api_base = api_base
        self.api_key = api_key
        self.prompt_override = prompt_override

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
            raw_response, llm_call = await _call_llm(
                apply_prompt_override(self.SYSTEM_PROMPT, self.prompt_override),
                user_prompt,
                model,
                api_base=self.api_base,
                api_key=self.api_key,
                agent_name="stylometry",
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
            llm_call=llm_call,
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
    agent_name: str | None = None,
) -> tuple[str, LLMCallRecord]:
    """Call an LLM via litellm and return the text response.

    Retries on transient errors with exponential backoff.
    """
    import asyncio as _asyncio

    temperature = 0.0
    prompt_hash = hashlib.sha256(
        f"{system_prompt}\n\n{user_prompt}".encode("utf-8")
    ).hexdigest()

    kwargs: dict = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
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
            text = response.choices[0].message.content or ""
            usage = getattr(response, "usage", None)
            prompt_tokens = int(getattr(usage, "prompt_tokens", 0) or 0) or None
            completion_tokens = int(getattr(usage, "completion_tokens", 0) or 0) or None
            response_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
            return text, LLMCallRecord(
                agent=agent_name or "unknown",
                model_id=model,
                timestamp=datetime.now(tz=timezone.utc),
                prompt_hash=prompt_hash,
                response_hash=response_hash,
                token_count_in=prompt_tokens,
                token_count_out=completion_tokens,
                temperature=temperature,
                cache_hit=False,
            )
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


def _parse_findings(
    raw: str,
    discipline: str,
) -> list[AgentFinding]:
    """Best-effort parse of LLM JSON response into AgentFinding objects."""
    parse_result = parse_json_array_loose(raw)
    if parse_result is None:
        logger.warning("Failed to parse LLM response as JSON for %s agent", discipline)
        raw_excerpt = raw.strip()[:500]
        return [
            AgentFinding(
                discipline=discipline,
                category="unparsed",
                description=(
                    "模型返回内容未能稳定解析为结构化 JSON，以下为原始响应片段：\n"
                    f"{raw_excerpt}"
                ),
                confidence=0.3,
                evidence=["结构化解析失败，已回退展示原始文本片段。"],
            )
        ]

    items = parse_result.value
    if parse_result.recovered:
        logger.info(
            "Recovered %d findings from non-standard JSON for %s agent (truncated=%s)",
            len(items),
            discipline,
            parse_result.truncated,
        )

    findings: list[AgentFinding] = []
    for item in items:
        try:
            layer_raw = item.get("layer", "clue")
            try:
                layer = FindingLayer(layer_raw)
            except ValueError:
                layer = FindingLayer.CLUE
            findings.append(
                AgentFinding(
                    discipline=discipline,
                    category=item.get("category", "unknown"),
                    description=item.get("description", ""),
                    confidence=float(item.get("confidence", 0.5)),
                    evidence=item.get("evidence", []),
                    metadata=item.get("metadata", {}),
                    interpretation=item.get("interpretation", ""),
                    layer=layer,
                )
            )
        except (ValueError, TypeError):
            logger.warning("Skipping malformed finding item in %s agent", discipline)

    if parse_result.truncated and findings:
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
