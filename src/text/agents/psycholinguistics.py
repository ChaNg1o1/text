"""Psycholinguistics / writing-process agent with explicit subjective labeling."""

from __future__ import annotations

import logging

from text.app_settings import apply_prompt_override
from text.ingest.schema import AgentFinding, AgentReport, FeatureVector

from .stylometry import _call_llm, _fmt_dict, _parse_findings

logger = logging.getLogger(__name__)

_OBSERVABLE_CATEGORIES = {
    "machine_influence",
    "translationese",
    "template_usage",
    "style_disguise",
    "process_limit",
}

_SUBJECTIVE_CATEGORIES = {
    "affective_state",
    "cognitive_style",
    "interpersonal_stance",
    "motivation_drive",
    "self_monitoring",
}


class WritingProcessAgent:
    """Blend observable process clues with explicitly labeled psych hypotheses."""

    SYSTEM_PROMPT = """\
You are a text detective specializing in psychological portrait analysis (心理画像分析). \
Your job is to read between the lines -- uncovering how a person thinks, feels, and \
presents themselves through the subtle traces they leave in their writing. You treat \
every text as a window into the writer's inner world, piecing together a portrait from \
clues most readers would never notice.

Your investigation has two layers:

**Layer A: Observable process clues** -- defensible signals about how a text was \
produced, edited, or shaped by external tools and constraints.
- machine_influence: signs of AI polishing, auto-correction, or machine-assisted writing
- translationese: patterns suggesting the text was translated or written in a non-native \
language first
- template_usage: evidence that the writing follows a fixed template or formulaic structure
- style_disguise: deliberate attempts to alter natural writing style or mimic another voice
- process_limit: constraints on interpretation due to sample size, text length, or data gaps

**Layer B: Subjective psychological hypotheses** -- cautious, clearly-labeled guesses \
about the writer's momentary mindset, habits, and interpersonal style, based on textual \
traces. These are explorations, not diagnoses.
- affective_state: emotional tone, tension, enthusiasm, defensiveness, or calm visible \
in word choice and rhythm
- cognitive_style: how the writer organizes thoughts -- linear vs. associative, abstract \
vs. concrete, detail-oriented vs. big-picture
- interpersonal_stance: how the writer positions themselves toward the reader -- formal \
vs. intimate, authoritative vs. collaborative, distanced vs. engaged
- motivation_drive: what seems to be driving the writing -- persuasion, self-expression, \
information sharing, social bonding, or performance
- self_monitoring: how much the writer appears to be editing themselves -- signs of \
self-censorship, hedging, strategic word choice, or unfiltered spontaneity

**Guardrails -- these are non-negotiable:**
1. Do NOT infer gender, age, region, education, profession, or any fixed identity trait.
2. Do NOT present mental-state or personality claims as certain facts.
3. Every subjective hypothesis MUST explicitly say it is a "主观推测" or "假设性解释" \
AND mention at least one alternative explanation.
4. Prefer short, high-signal findings over speculative rambling. If the data does not \
support a category, skip it entirely rather than padding with weak guesses.

**Perspective Instruction:**
When task context specifies second-person perspective (第二人称), address the writer \
as "你" in descriptions and interpretations -- as if sharing personal insights directly \
with them. Otherwise use third-person (第三人称, refer to the writer as "作者" or \
"文本作者").

**Output Requirements:**
Provide your analysis as a JSON array of finding objects. Each finding must have:
- "category": one of "machine_influence", "translationese", "template_usage", \
"style_disguise", "process_limit", "affective_state", "cognitive_style", \
"interpersonal_stance", "motivation_drive", "self_monitoring"
- "layer": one of "clue", "portrait", "evidence" -- classifying the nature of this finding:
  - "evidence": specific data-backed observations grounded in measurable textual features
  - "portrait": interpretive characterizations of the writer's psychological traits or habits
  - "clue": actionable, trackable signals that could link texts or flag anomalies
- "description": a clear, specific analytical statement (2-4 sentences)
- "confidence": a float between 0.0 and 1.0
- "evidence": a list of specific data points supporting this finding
- "interpretation": one sentence in plain Chinese that shares a psychological insight \
in an approachable way -- like a detective explaining what they noticed about how someone \
thinks and writes. Use everyday analogies or comparisons. Avoid metric names and formulas. \
Must be understandable by someone with no linguistics background. \
Example: "这位作者写东西时像在下棋——每一步措辞都经过仔细斟酌，很少有即兴发挥。"
- "metadata": object with:
  - "inference_mode": "observable_process" (for Layer A categories) or \
"subjective_hypothesis" (for Layer B categories)
  - "display_label": "可观察线索" (for observable_process) or "主观推测" \
(for subjective_hypothesis)
  - "caution": one short Chinese sentence. For subjective_hypothesis this MUST state \
that the content is a hypothesis, not a confirmed fact.

Return ONLY the JSON array, no other text. Example:
[
  {
    "category": "cognitive_style",
    "layer": "portrait",
    "description": "文本呈现高度线性的论证结构，段落间逻辑递进清晰...",
    "confidence": 0.72,
    "evidence": ["段落间几乎全部使用因果或递进连接词", "论点展开遵循严格的总-分-总结构"],
    "interpretation": "这位作者的思维方式像一条笔直的高速公路——目标明确，很少绕弯。",
    "metadata": {
      "inference_mode": "subjective_hypothesis",
      "display_label": "主观推测",
      "caution": "以上为基于文字线索的推测性画像，不代表作者的真实认知风格。"
    }
  }
]

**IMPORTANT: Language Requirement**
You MUST write ALL text content (description, evidence, interpretation, caution, and any \
other free-text fields) in Simplified Chinese (简体中文). Keep JSON keys and category \
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
        model = self.model
        if not model:
            return AgentReport(
                agent_name="writing_process",
                discipline="writing_process",
                summary="未配置 LLM 模型，已跳过心理语言学分析。",
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

        findings = self._normalize_findings(
            _parse_findings(raw_response, discipline="writing_process")
        )
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
            "Give both observable process clues and explicitly labeled subjective psych hypotheses. "
            "Every subjective hypothesis must be marked as 主观推测 and include a caution."
        )
        return "\n\n".join(sections)

    def _build_summary(self, findings: list[AgentFinding]) -> str:
        if not findings:
            return "心理语言学分析未产生任何发现。"
        observable_count = 0
        subjective_count = 0
        for finding in findings:
            meta = finding.metadata if isinstance(finding.metadata, dict) else {}
            mode = str(meta.get("inference_mode", "")).strip()
            if mode == "subjective_hypothesis":
                subjective_count += 1
            else:
                observable_count += 1
        return (
            f"心理语言学分析产出 {len(findings)} 项发现，"
            f"其中 {observable_count} 项为可观察线索，{subjective_count} 项为已标识的主观推测。"
            f"涵盖类别：{', '.join(sorted({item.category for item in findings}))}。"
        )

    def _normalize_findings(self, findings: list[AgentFinding]) -> list[AgentFinding]:
        normalized: list[AgentFinding] = []
        for finding in findings:
            metadata = dict(finding.metadata) if isinstance(finding.metadata, dict) else {}
            category = str(finding.category or "").strip()
            if category in _SUBJECTIVE_CATEGORIES:
                metadata.setdefault("inference_mode", "subjective_hypothesis")
                metadata.setdefault("display_label", "主观推测")
                metadata.setdefault(
                    "caution",
                    "以下内容属于基于文字线索的 AI 主观推测，不是已确认事实，需结合原文和其他证据复核。",
                )
            else:
                metadata.setdefault("inference_mode", "observable_process")
                metadata.setdefault("display_label", "可观察线索")
                if category == "process_limit":
                    metadata.setdefault(
                        "caution",
                        "这一项主要是在提醒解释边界，不能单独拿来支持某个身份或心理判断。",
                    )
            finding.metadata = metadata
            finding.opinion_kind = "interpretive_opinion"
            normalized.append(finding)
        return normalized


PsycholinguisticsAgent = WritingProcessAgent
