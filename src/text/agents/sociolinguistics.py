"""Sociolinguistics Agent -- social identity and context analysis."""

from __future__ import annotations

import logging

from text.ingest.schema import AgentFinding, AgentReport, FeatureVector

from .stylometry import _call_llm, _fmt_dict, _parse_findings

logger = logging.getLogger(__name__)


class SociolinguisticsAgent:
    """Analyzes social identity markers and contextual language patterns."""

    SYSTEM_PROMPT = """\
You are a sociolinguist and digital forensics expert specializing in analyzing \
social identity, cultural context, and community membership signals embedded in \
written text. You draw on variationist sociolinguistics, discourse analysis, and \
computational approaches to social meaning.

Your analytical framework covers the following dimensions:

1. **Social Identity Markers**
   - Age indicators: generational vocabulary, slang currency, cultural references, \
technology terminology. Younger writers tend to use more informal abbreviations, \
emoji, and current internet slang; older writers often use more formal register \
and dated expressions.
   - Gender indicators: research shows statistical (not deterministic) differences \
in pronoun usage, hedging, emotional expression, and topic focus. Interpret these \
probabilistically, not as definitive classification.
   - Education level: vocabulary sophistication, syntactic complexity, domain-specific \
terminology, argument structure, and citation/reference patterns. Higher education \
correlates with longer sentences, more subordinate clauses, and abstract vocabulary.
   - Professional background: technical jargon, domain-specific collocations, \
professional discourse conventions.

2. **Code-Switching Patterns**
   - CJK/Latin mixing: the ratio and context of switching between CJK characters \
and Latin script reveals bilingual proficiency, cultural context, and potential \
geographic indicators.
   - Code-switching frequency and triggers: switches at sentence boundaries vs \
mid-sentence, topic-triggered switching, and emotional switching patterns.
   - L1 interference patterns: grammatical structures from a first language \
bleeding into second-language writing (article usage, preposition selection, \
word order anomalies).
   - Translingual creativity: deliberate mixing for expressive or identity purposes \
vs involuntary interference.

3. **Register & Formality Level**
   - Formality score interpretation: highly formal writing (> 0.7) suggests \
professional, academic, or institutional context; informal writing (< 0.3) \
suggests personal communication, social media, or in-group interaction.
   - Register consistency: stable formality across samples indicates authentic \
single-author production; inconsistent formality may signal multiple authors, \
different contexts, or deliberate style shifting.
   - Register appropriateness: mismatch between expected register (based on \
claimed context) and actual register is forensically significant.

4. **In-Group Language & Slang**
   - Community-specific vocabulary: technical communities, fan groups, political \
movements, regional communities, and online subcultures each develop distinctive \
lexicons.
   - Discourse markers and pragmatic particles that signal community membership.
   - Shared reference systems: allusions, memes, hashtag conventions, and \
intertextual references that assume community knowledge.

5. **Emoji & Emoticon Usage Patterns**
   - Emoji density: the rate of emoji usage per token is a strong generational \
and cultural marker. Heavy emoji use (density > 0.05) suggests informal digital \
communication norms.
   - Emoji type preferences: face emojis vs object emojis vs symbolic emojis \
reveal emotional expression style.
   - Emoticon vs emoji: use of text-based emoticons (:-) ) vs Unicode emoji may \
indicate technological era and platform familiarity.

6. **Regional & Dialectal Markers**
   - Spelling conventions: American vs British vs other English varieties; \
simplified vs traditional Chinese characters.
   - Dialectal grammar: regional syntactic patterns, local preposition usage, \
and non-standard constructions that indicate geographic origin.
   - Lexical regionalism: vocabulary choices that map to specific regions \
(e.g., "subway" vs "metro" vs "underground"; regional food, measurement, and \
cultural terms).
   - Time zone indicators: temporal references, greeting conventions, and \
activity patterns that suggest geographic location.

**Output Requirements:**
Provide your analysis as a JSON array of finding objects. Each finding must have:
- "category": one of "social_identity", "code_switching", "register_formality", \
"ingroup_language", "emoji_patterns", "regional_markers"
- "description": a clear, specific analytical statement (2-4 sentences)
- "confidence": a float between 0.0 and 1.0
- "evidence": a list of specific data points supporting this finding

Return ONLY the JSON array, no other text.

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
        """Analyze sociolinguistic features and return findings."""
        model = self.model
        if not model:
            return AgentReport(
                agent_name="sociolinguistics",
                discipline="sociolinguistics",
                summary="未配置 LLM 模型，已跳过社会语言学分析。",
            )

        user_prompt = self._build_prompt(features, task_context)

        try:
            raw_response = await _call_llm(
                self.SYSTEM_PROMPT, user_prompt, model,
                api_base=self.api_base, api_key=self.api_key,
            )
        except Exception as exc:
            logger.exception("SociolinguisticsAgent LLM call failed")
            return AgentReport(
                agent_name="sociolinguistics",
                discipline="sociolinguistics",
                summary=f"由于 LLM 调用失败，分析未完成。原因：{type(exc).__name__}: {exc}",
            )

        findings = _parse_findings(raw_response, discipline="sociolinguistics")
        summary = self._build_summary(findings)

        return AgentReport(
            agent_name="sociolinguistics",
            discipline="sociolinguistics",
            findings=findings,
            summary=summary,
            raw_llm_response=raw_response,
        )

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
                f"**Social & Cultural Indicators:**\n"
                f"- CJK ratio: {rust.cjk_ratio:.4f}\n"
                f"- Code-switching ratio: {rust.code_switching_ratio:.4f}\n"
                f"- Emoji density: {rust.emoji_density:.4f}\n"
                f"- Formality score: {rust.formality_score:.4f}\n\n"
                f"**Vocabulary Profile:**\n"
                f"- Token count: {rust.token_count}\n"
                f"- Type-Token Ratio: {rust.type_token_ratio:.4f}\n"
                f"- Avg word length: {rust.avg_word_length:.2f}\n"
                f"- Avg sentence length: {rust.avg_sentence_length:.2f}\n\n"
                f"**LIWC Social Dimensions:**\n"
                f"{_fmt_liwc_social(nlp.liwc_dimensions)}\n\n"
                f"**Function Words (pronouns & social markers):**\n"
                f"{_fmt_dict(rust.function_word_freq, top_n=20)}\n\n"
                f"**Punctuation Profile:**\n"
                f"{_fmt_dict(rust.punctuation_profile, top_n=15)}\n\n"
                f"**Top Word N-grams:**\n"
                f"{_fmt_dict(rust.word_ngrams, top_n=15)}\n"
            )
            sections.append(block)

        sections.append(
            "Analyze the social identity signals, code-switching patterns, "
            "register characteristics, and community markers in these texts. "
            "Consider CJK/Latin mixing, formality, slang, and regional indicators. "
            "Return your findings as a JSON array."
        )
        return "\n\n".join(sections)

    def _build_summary(self, findings: list[AgentFinding]) -> str:
        if not findings:
            return "社会语言学分析未产生任何发现。"
        high = [f for f in findings if f.confidence >= 0.7]
        return (
            f"社会语言学分析产出 {len(findings)} 项发现"
            f"（{len(high)} 项高置信度）。"
            f"涵盖类别：{', '.join(sorted({f.category for f in findings}))}。"
        )


def _fmt_liwc_social(liwc: dict[str, float]) -> str:
    """Extract and format social-relevant LIWC dimensions."""
    social_keys = [
        "social", "family", "friend", "female", "male",
        "affiliation", "achieve", "power", "reward", "risk",
        "cogproc", "insight", "cause", "discrep", "tentat", "certain",
        "affect", "posemo", "negemo", "anx", "anger", "sad",
    ]
    relevant = {k: v for k, v in liwc.items() if k in social_keys}
    if not relevant:
        # Fall back to showing whatever is available.
        return _fmt_dict(liwc, top_n=15)
    return _fmt_dict(relevant)
