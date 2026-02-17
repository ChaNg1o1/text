"""Psycholinguistics Agent -- psychological profiling from text."""

from __future__ import annotations

import logging

from text.ingest.schema import AgentFinding, AgentReport, FeatureVector

from .stylometry import _call_llm, _fmt_dict, _parse_findings

logger = logging.getLogger(__name__)

_DEFAULT_MODEL = "claude-sonnet-4-20250514"


class PsycholinguisticsAgent:
    """Infers psychological and cognitive traits from linguistic features."""

    SYSTEM_PROMPT = """\
You are a senior psycholinguist and forensic psychologist with expertise in \
inferring psychological profiles from written text. Your work draws on validated \
frameworks including LIWC (Linguistic Inquiry and Word Count), the Big Five \
personality model, and contemporary computational psycholinguistics research.

Your analytical framework covers the following dimensions:

1. **LIWC Dimension Interpretation**
   - Cognitive processes: causal reasoning (because, hence), insight words (realize, \
understand), certainty vs tentative language. High causal word usage suggests \
analytical thinking; high tentative language suggests openness or uncertainty.
   - Affective processes: positive emotion words, negative emotion words, anxiety, \
anger, and sadness markers. The ratio of positive to negative emotion words reveals \
emotional baseline and current state.
   - Social processes: family, friends, social references. High social word usage \
correlates with extraversion and relational orientation.
   - Perceptual processes: see, hear, feel words indicating sensory processing style.
   - Biological processes: body, health, ingestion words.
   - Drives and motivations: achievement, power, affiliation, reward, risk.

2. **Big Five Personality Inference**
   - Openness: correlates with diverse vocabulary, abstract language, use of \
articles (lower), and creative/unconventional word choices.
   - Conscientiousness: correlates with organized, planful language, achievement \
words, and lower use of negation and swear words.
   - Extraversion: correlates with social words, positive emotion words, shorter \
sentences, and inclusive language ("we", "us").
   - Agreeableness: correlates with positive emotion words, social references, \
fewer swear words, and tentative language.
   - Neuroticism: correlates with negative emotion words, first-person singular \
pronouns ("I"), anxiety words, and hedging language.
   Provide estimated trait levels (low/moderate/high) with supporting evidence.

3. **Emotional Tone & Sentiment Patterns**
   - Overall sentiment valence and its stability across samples.
   - Emotional tone: the balance between analytical/confident/tentative/emotional \
registers. Values above 50 on the emotional tone scale suggest positive framing; \
below 50 suggests anxiety, sadness, or hostility.
   - Emotional volatility: consistency of sentiment across samples.

4. **Cognitive Complexity & Thinking Style**
   - Cognitive complexity score reflects the sophistication of thought patterns: \
use of conjunctions, exclusive words (but, except), causal reasoning markers.
   - Analytical thinking: high article + preposition usage; low pronoun usage.
   - Narrative thinking: high past-tense verbs, social references, personal pronouns.
   - Categorical thinking: high articles, nouns; organized, taxonomic language.

5. **Temporal Orientation**
   - Past focus: nostalgia, rumination, experience-based reasoning.
   - Present focus: immediacy, current concerns, situational awareness.
   - Future focus: planning, anticipation, goal-directed thinking.
   - The balance reveals psychological grounding and motivational orientation.

6. **Deception & Authenticity Cues**
   - Deceptive writing tends to show: fewer self-references, fewer exclusive words, \
more motion verbs, less cognitive complexity, more negative emotion words.
   - Authentic writing shows: appropriate self-reference, specific details, \
sensory language, and temporal grounding.
   - Note: these are probabilistic indicators, not definitive proof.

**Output Requirements:**
Provide your analysis as a JSON array of finding objects. Each finding must have:
- "category": one of "liwc_dimensions", "personality_traits", "emotional_tone", \
"cognitive_complexity", "temporal_orientation", "deception_cues"
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
        model: str = _DEFAULT_MODEL,
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
        """Analyze psycholinguistic features and return findings."""
        user_prompt = self._build_prompt(features, task_context)

        try:
            raw_response = await _call_llm(
                self.SYSTEM_PROMPT, user_prompt, self.model,
                api_base=self.api_base, api_key=self.api_key,
            )
        except Exception:
            logger.exception("PsycholinguisticsAgent LLM call failed")
            return AgentReport(
                agent_name="psycholinguistics",
                discipline="psycholinguistics",
                summary="由于 LLM 调用失败，分析未完成。",
            )

        findings = _parse_findings(raw_response, discipline="psycholinguistics")
        summary = self._build_summary(findings)

        return AgentReport(
            agent_name="psycholinguistics",
            discipline="psycholinguistics",
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
            nlp = fv.nlp_features
            rust = fv.rust_features

            block = (
                f"### Sample {i} (id={fv.text_id})\n"
                f"**LIWC Dimensions:**\n"
                f"{_fmt_dict(nlp.liwc_dimensions)}\n\n"
                f"**Sentiment & Tone:**\n"
                f"- Sentiment valence: {nlp.sentiment_valence:.4f}\n"
                f"- Emotional tone: {nlp.emotional_tone:.4f}\n"
                f"- Cognitive complexity: {nlp.cognitive_complexity:.4f}\n\n"
                f"**Temporal Orientation:**\n"
                f"{_fmt_dict(nlp.temporal_orientation)}\n\n"
                f"**Supporting Stylistic Features:**\n"
                f"- Token count: {rust.token_count}\n"
                f"- Avg sentence length: {rust.avg_sentence_length:.2f}\n"
                f"- Function word frequencies (top 15):\n"
                f"{_fmt_dict(rust.function_word_freq, top_n=15)}\n\n"
                f"**POS Tag Distribution:**\n"
                f"{_fmt_dict(nlp.pos_tag_distribution, top_n=15)}\n"
            )
            sections.append(block)

        sections.append(
            "Analyze the psychological profile revealed by these linguistic features. "
            "Consider LIWC dimensions, personality indicators, emotional patterns, "
            "cognitive style, and temporal orientation. "
            "Return your findings as a JSON array."
        )
        return "\n\n".join(sections)

    def _build_summary(self, findings: list[AgentFinding]) -> str:
        if not findings:
            return "心理语言学分析未产生任何发现。"
        high = [f for f in findings if f.confidence >= 0.7]
        return (
            f"心理语言学分析产出 {len(findings)} 项发现"
            f"（{len(high)} 项高置信度）。"
            f"涵盖类别：{', '.join(sorted({f.category for f in findings}))}。"
        )
