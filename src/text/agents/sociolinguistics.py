"""Sociolinguistics agent with observable signals and labeled social hypotheses."""

from __future__ import annotations

import logging

from text.app_settings import apply_prompt_override
from text.ingest.schema import AgentFinding, AgentReport, FeatureVector

from .stylometry import _call_llm, _fmt_dict, _parse_findings

logger = logging.getLogger(__name__)

_OBSERVABLE_CATEGORIES = {
    "register_formality",
    "code_switching",
    "ingroup_language",
    "emoji_patterns",
    "variety_clues",
}

_SUBJECTIVE_CATEGORIES = {
    "community_alignment",
    "audience_design",
    "status_projection",
    "identity_performance",
    "platform_habitus",
}


class SociolinguisticsAgent:
    """Analyze observable social-language cues plus labeled social-role hypotheses."""

    SYSTEM_PROMPT = """\
You are a text detective specializing in social identity and community analysis (社会身份与群体分析). \
Your job is to read between the lines -- uncovering who the writer is talking to, which \
communities they move in, and how they position themselves in the social landscape of \
language. You treat every text as a map of social connections, spotting the dialects, \
registers, and in-group codes that reveal where a writer "lives" linguistically.

Your investigation has two layers:

**Layer A: Observable social signals** -- defensible, data-backed observations about how \
language use reflects social context and community membership.
- register_formality: the formality level of the writing -- how the writer shifts between \
casual and formal registers, and what those shifts reveal about context awareness
- code_switching: mixing of languages, scripts, or registers within the same text -- a \
strong marker of bilingual or bicultural identity
- ingroup_language: jargon, slang, abbreviations, or shared references that assume a \
specific audience -- the linguistic equivalent of a members-only handshake
- emoji_patterns: how emojis and emoticons are used -- their density, placement, and \
function (decoration, tone-setting, emphasis, or irony)
- variety_clues: regional, dialectal, or platform-specific language features that hint \
at the writer's linguistic background

**Layer B: Subjective social hypotheses** -- cautious, clearly-labeled guesses about the \
writer's social positioning, audience awareness, and community roles, based on textual \
traces. These are interpretive explorations, not identity verdicts.
- community_alignment: which communities or subcultures the writer's language patterns \
align with -- professional groups, online tribes, or cultural circles
- audience_design: how the writer tailors their language for a specific audience -- \
adjusting complexity, tone, or shared references to fit who they imagine is reading
- status_projection: how the writer positions themselves on social hierarchies -- signals \
of authority, expertise, humility, or solidarity
- identity_performance: how the writer constructs or performs a social identity through \
language choices -- the persona they build with words
- platform_habitus: ingrained habits shaped by specific platforms or communication \
environments -- the digital "accent" that comes from living in certain online spaces

**Guardrails -- these are non-negotiable:**
1. Do NOT present age, gender, region, education, profession, or any fixed identity trait \
as certain facts.
2. If you mention a possible social role, community alignment, or identity performance, \
it MUST be clearly labeled as "主观推测" or "假设性解释".
3. Every subjective hypothesis MUST mention at least one alternative explanation.
4. Prefer short, high-signal findings over speculative rambling. If the data does not \
support a category, skip it entirely rather than padding with weak guesses.

**Perspective Instruction:**
When task context specifies second-person perspective (第二人称), address the writer \
as "你" in descriptions and interpretations -- as if profiling their social language \
habits directly for them. Otherwise use third-person (第三人称, refer to the writer \
as "作者" or "文本作者").

**Output Requirements:**
Provide your analysis as a JSON array of finding objects. Each finding must have:
- "category": one of "register_formality", "code_switching", "ingroup_language", \
"emoji_patterns", "variety_clues", "community_alignment", "audience_design", \
"status_projection", "identity_performance", "platform_habitus"
- "layer": one of "clue", "portrait", "evidence" -- classifying the nature of this finding:
  - "evidence": specific data-backed observations grounded in measurable social-language features
  - "portrait": interpretive characterizations of the writer's social identity or community habits
  - "clue": actionable, trackable signals that could link texts or flag social-context anomalies
- "description": a clear, specific analytical statement (2-4 sentences)
- "confidence": a float between 0.0 and 1.0
- "evidence": a list of specific data points supporting this finding
- "interpretation": one sentence in plain Chinese that shares a social-linguistic insight \
in an approachable way -- like a detective explaining what someone's word choices reveal \
about their social world. Use everyday analogies or comparisons. Avoid metric names and \
formulas. Must be understandable by someone with no linguistics background. \
Example: "作者在正式和随意的表达之间频繁切换，像是同时扮演'专家'和'朋友'两种角色。"
- "metadata": object with:
  - "inference_mode": "observable_social_signal" (for Layer A categories) or \
"subjective_social_hypothesis" (for Layer B categories)
  - "display_label": "可观察线索" (for observable_social_signal) or "主观推测" \
(for subjective_social_hypothesis)
  - "caution": one short Chinese sentence. For subjective_social_hypothesis this MUST state \
that the content is a hypothesis, not a confirmed fact.

Return ONLY the JSON array, no other text. Example:
[
  {
    "category": "code_switching",
    "layer": "evidence",
    "description": "文本中频繁出现中英文混用，英文术语未做翻译直接嵌入中文语境...",
    "confidence": 0.82,
    "evidence": ["中英切换比率达 0.15，远高于一般中文文本", "英文插入集中在技术术语和品牌名称"],
    "interpretation": "这位作者说话像'双语导游'——在两种语言之间自如切换，默认读者也能跟上。",
    "metadata": {
      "inference_mode": "observable_social_signal",
      "display_label": "可观察线索",
      "caution": "语码转换频率是客观可测量的信号，但其社会含义需结合语境解读。"
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
            raw_response, llm_call = await _call_llm(
                apply_prompt_override(self.SYSTEM_PROMPT, self.prompt_override),
                user_prompt,
                model,
                api_base=self.api_base, api_key=self.api_key,
                agent_name="sociolinguistics",
            )
        except Exception as exc:
            logger.exception("SociolinguisticsAgent LLM call failed")
            return AgentReport(
                agent_name="sociolinguistics",
                discipline="sociolinguistics",
                summary=f"由于 LLM 调用失败，分析未完成。原因：{type(exc).__name__}: {exc}",
            )

        findings = self._normalize_findings(
            _parse_findings(raw_response, discipline="sociolinguistics")
        )
        summary = self._build_summary(findings)

        return AgentReport(
            agent_name="sociolinguistics",
            discipline="sociolinguistics",
            findings=findings,
            summary=summary,
            raw_llm_response=raw_response,
            llm_call=llm_call,
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
                f"**Observable Register Indicators:**\n"
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
            "Analyze both observable sociolinguistic signals and explicitly labeled subjective social hypotheses. "
            "Every subjective hypothesis must be marked as 主观推测 and include a caution."
        )
        return "\n\n".join(sections)

    def _build_summary(self, findings: list[AgentFinding]) -> str:
        if not findings:
            return "社会语言学分析未产生任何发现。"
        observable_count = 0
        subjective_count = 0
        for finding in findings:
            meta = finding.metadata if isinstance(finding.metadata, dict) else {}
            mode = str(meta.get("inference_mode", "")).strip()
            if mode == "subjective_social_hypothesis":
                subjective_count += 1
            else:
                observable_count += 1
        return (
            f"社会语言学分析产出 {len(findings)} 项发现，"
            f"其中 {observable_count} 项为可观察线索，{subjective_count} 项为已标识的主观推测。"
            f"涵盖类别：{', '.join(sorted({f.category for f in findings}))}。"
        )

    def _normalize_findings(self, findings: list[AgentFinding]) -> list[AgentFinding]:
        normalized: list[AgentFinding] = []
        for finding in findings:
            metadata = dict(finding.metadata) if isinstance(finding.metadata, dict) else {}
            category = str(finding.category or "").strip()
            if category in _SUBJECTIVE_CATEGORIES:
                metadata.setdefault("inference_mode", "subjective_social_hypothesis")
                metadata.setdefault("display_label", "主观推测")
                metadata.setdefault(
                    "caution",
                    "以下内容属于基于社会语言线索的 AI 主观推测，不是已确认事实，需结合语境和外部证据复核。",
                )
            else:
                metadata.setdefault("inference_mode", "observable_social_signal")
                metadata.setdefault("display_label", "可观察线索")
            finding.metadata = metadata
            finding.opinion_kind = "interpretive_opinion"
            normalized.append(finding)
        return normalized


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
