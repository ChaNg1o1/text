"""Writing process agent focused on translationese and machine influence."""

from __future__ import annotations

import logging

from text.app_settings import apply_prompt_override
from text.ingest.schema import AgentFinding, AgentReport, FeatureVector

from .stylometry import _call_llm, _fmt_dict, _parse_findings

logger = logging.getLogger(__name__)


class WritingProcessAgent:
    """Infers writing-process clues that remain defensible in forensic reporting."""

    SYSTEM_PROMPT = """\
You are a forensic writing-process analyst. Your scope is strictly limited to \
observable and defensible clues about how a text may have been produced or edited. \
Do NOT infer personality, education level, gender, age, or mental state.

Focus only on the following dimensions:

1. **Machine Influence**
   - Uniform sentence rhythm, low variance, repeated generic templates, and \
over-smoothed discourse can indicate machine polishing or template-heavy drafting.
   - High semantic coherence paired with unstable function words or punctuation \
can indicate paraphrase or automated rewrite.

2. **Translationese / Translation-Like Signals**
   - Unusual code-switching, literal connective patterns, interference in \
function-word choices, or awkward clause ordering can indicate translated text.
   - These are clues, not proof of translation.

3. **Template / Boilerplate Usage**
   - Repeated phrasal frames, stock openings/closings, or stable structural shells \
may indicate templating or copied drafting workflows.

4. **Style Disguise / Stitching**
   - Abrupt changes in sentence rhythm, register, punctuation, or lexical profile \
within the same corpus may suggest editing by multiple hands, stitched text, or \
attempted style disguise.

5. **Process-Level Limits**
   - Distinguish between a clue and a conclusion. Use cautious wording and state \
alternative explanations whenever appropriate.

**Output Requirements:**
Provide your analysis as a JSON array of finding objects. Each finding must have:
- "category": one of "machine_influence", "translationese", "template_usage", \
"style_disguise", "process_limit"
- "description": a clear, specific analytical statement (2-4 sentences)
- "confidence": a float between 0.0 and 1.0
- "evidence": a list of specific data points supporting this finding

Return ONLY the JSON array, no other text.

**IMPORTANT: Language Requirement**
You MUST write ALL text content in Simplified Chinese (简体中文). Keep JSON keys and \
category identifiers in English.
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
        model = self.model
        if not model:
            return AgentReport(
                agent_name="writing_process",
                discipline="writing_process",
                summary="未配置 LLM 模型，已跳过写作过程线索分析。",
            )

        user_prompt = self._build_prompt(features, task_context)
        try:
            raw_response, llm_call = await _call_llm(
                apply_prompt_override(self.SYSTEM_PROMPT, self.prompt_override),
                user_prompt,
                model,
                api_base=self.api_base,
                api_key=self.api_key,
                agent_name="writing_process",
            )
        except Exception as exc:
            logger.exception("WritingProcessAgent LLM call failed")
            return AgentReport(
                agent_name="writing_process",
                discipline="writing_process",
                summary=f"由于 LLM 调用失败，分析未完成。原因：{type(exc).__name__}: {exc}",
            )

        findings = _parse_findings(raw_response, discipline="writing_process")
        return AgentReport(
            agent_name="writing_process",
            discipline="writing_process",
            findings=findings,
            summary=self._build_summary(findings),
            raw_llm_response=raw_response,
            llm_call=llm_call,
        )

    def _build_prompt(self, features: list[FeatureVector], task_context: str) -> str:
        sections = [f"## Task Context\n{task_context}", f"## Number of Text Samples: {len(features)}"]
        for i, fv in enumerate(features, start=1):
            rust = fv.rust_features
            nlp = fv.nlp_features
            sections.append(
                (
                    f"### Sample {i} (id={fv.text_id})\n"
                    f"- token_count: {rust.token_count}\n"
                    f"- avg_sentence_length: {rust.avg_sentence_length:.2f}\n"
                    f"- sentence_length_variance: {rust.sentence_length_variance:.2f}\n"
                    f"- code_switching_ratio: {rust.code_switching_ratio:.4f}\n"
                    f"- formality_score: {rust.formality_score:.4f}\n"
                    f"- cognitive_complexity: {nlp.cognitive_complexity:.4f}\n"
                    f"- punctuation_profile: {_fmt_dict(rust.punctuation_profile, top_n=12)}\n"
                    f"- function_words: {_fmt_dict(rust.function_word_freq, top_n=15)}\n"
                    f"- pos_distribution: {_fmt_dict(nlp.pos_tag_distribution, top_n=12)}\n"
                    f"- char_ngrams: {_fmt_dict(rust.char_ngrams, top_n=15)}\n"
                )
            )
        sections.append(
            "Focus on translationese, machine polishing, template usage, and style disguise clues. "
            "Do not infer personality or demographics."
        )
        return "\n\n".join(sections)

    def _build_summary(self, findings: list[AgentFinding]) -> str:
        if not findings:
            return "写作过程线索分析未产生任何发现。"
        return (
            f"写作过程线索分析产出 {len(findings)} 项发现。"
            f"涵盖类别：{', '.join(sorted({item.category for item in findings}))}。"
        )


PsycholinguisticsAgent = WritingProcessAgent
