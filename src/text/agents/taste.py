"""Taste scorer for ranking high-quality insights from agent findings.

This module provides an explainable, deterministic baseline that maps raw
agent findings into:
1) ranked structured insights, and
2) a corpus-level taste assessment.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from difflib import SequenceMatcher

from text.ingest.schema import AgentFinding, AgentReport, InsightItem, TasteAssessment

_TOKEN_RE = re.compile(r"[A-Za-z0-9_]+|[\u4e00-\u9fff]{1,4}")
_DIGIT_RE = re.compile(r"\d")

_ACTION_TOKENS = {
    "建议", "应", "应该", "需要", "需", "可以", "可", "下一步", "复核", "核查", "检查",
    "recommend", "should", "must", "action", "follow-up", "review",
}
_HEDGE_TOKENS = {
    "可能", "或许", "疑似", "推测", "大概", "不排除", "尚不确定", "猜测",
    "maybe", "possibly", "might", "unclear", "uncertain",
}
_ASSERTIVE_TOKENS = {
    "显著", "一致", "稳定", "明确", "强", "高置信", "confirmed", "significant", "robust",
}
_STOP_TOKENS = {
    "的", "了", "和", "与", "在", "是", "对", "及", "并", "且", "或", "而",
    "the", "a", "an", "to", "of", "and", "for", "with", "in", "on", "by", "is", "are",
}

_DIM_LABELS = {
    "confidence": "结论置信",
    "evidence": "证据强度",
    "cross_support": "跨视角支撑",
    "novelty": "新颖性",
    "actionability": "可行动性",
    "clarity": "表达清晰度",
    "certainty": "确定性",
}

_BASE_WEIGHTS = {
    "confidence": 0.28,
    "evidence": 0.24,
    "cross_support": 0.18,
    "novelty": 0.12,
    "actionability": 0.10,
    "clarity": 0.08,
}


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def _tokenize(text: str) -> list[str]:
    tokens = [m.group(0).lower() for m in _TOKEN_RE.finditer(text)]
    return [t for t in tokens if len(t) > 1 and t not in _STOP_TOKENS]


def _contains_any(tokens: list[str], lexicon: set[str]) -> int:
    return sum(1 for tok in tokens if tok in lexicon)


def _description_similarity(a: str, b: str, tokens_a: list[str], tokens_b: list[str]) -> float:
    set_a = set(tokens_a)
    set_b = set(tokens_b)
    jaccard = len(set_a & set_b) / len(set_a | set_b) if set_a and set_b else 0.0
    seq_ratio = SequenceMatcher(None, a[:220], b[:220]).ratio()
    return max(jaccard, seq_ratio * 0.65)


def _dedupe_indices(items: list[tuple[str, str, AgentFinding]]) -> list[int]:
    """Deduplicate near-identical finding descriptions."""
    kept: list[int] = []
    normalized_seen: set[str] = set()
    for i, (_, description, _) in enumerate(items):
        norm = _normalize_text(description)
        if not norm or norm in normalized_seen:
            continue
        duplicate = False
        for kept_idx in kept:
            other_norm = _normalize_text(items[kept_idx][1])
            if SequenceMatcher(None, norm, other_norm).ratio() >= 0.96:
                duplicate = True
                break
        if duplicate:
            continue
        normalized_seen.add(norm)
        kept.append(i)
    return kept


def build_taste_outputs(
    agent_reports: list[AgentReport],
    contradictions: list[str] | None = None,
    *,
    top_k: int = 8,
) -> tuple[TasteAssessment | None, list[InsightItem]]:
    """Build explainable taste assessment + ranked insights from agent findings."""
    rows: list[tuple[str, str, AgentFinding]] = []
    for report in agent_reports:
        if report.discipline == "synthesis":
            continue
        for finding in report.findings:
            description = finding.description.strip()
            if not description:
                continue
            rows.append((report.discipline, description, finding))

    if not rows:
        return None, []

    kept_indices = _dedupe_indices(rows)
    if not kept_indices:
        return None, []

    disciplines = [rows[i][0] for i in kept_indices]
    descriptions = [rows[i][1] for i in kept_indices]
    findings = [rows[i][2] for i in kept_indices]
    tokens_per_item = [_tokenize(desc) for desc in descriptions]

    doc_freq: Counter[str] = Counter()
    for toks in tokens_per_item:
        doc_freq.update(set(toks))
    n_items = max(1, len(tokens_per_item))
    max_idf = math.log((1.0 + n_items) / 2.0) if n_items > 1 else 1.0

    support_sets: list[set[str]] = [set() for _ in descriptions]
    for i in range(len(descriptions)):
        for j in range(i + 1, len(descriptions)):
            if disciplines[i] == disciplines[j]:
                continue
            sim = _description_similarity(
                descriptions[i],
                descriptions[j],
                tokens_per_item[i],
                tokens_per_item[j],
            )
            if sim >= 0.22:
                support_sets[i].add(disciplines[j])
                support_sets[j].add(disciplines[i])

    scored: list[tuple[float, InsightItem]] = []
    for idx, finding in enumerate(findings):
        text_blob = f"{descriptions[idx]} {' '.join(finding.evidence)}"
        blob_tokens = _tokenize(text_blob)

        evidence_count = sum(1 for ev in finding.evidence if str(ev).strip())
        evidence_len = (
            sum(min(len(str(ev).strip()), 120) for ev in finding.evidence if str(ev).strip())
            / max(1, evidence_count)
            if evidence_count
            else 0.0
        )
        numeric_evidence = (
            sum(1 for ev in finding.evidence if _DIGIT_RE.search(str(ev))) / max(1, evidence_count)
            if evidence_count
            else 0.0
        )
        evidence_score = _clamp(
            0.22
            + 0.45 * min(1.0, evidence_count / 3.0)
            + 0.20 * (evidence_len / 120.0)
            + 0.13 * numeric_evidence
        )

        support_score = _clamp(len(support_sets[idx]) / 3.0)

        uniq_tokens = set(tokens_per_item[idx])
        if uniq_tokens:
            idf_avg = sum(math.log((1.0 + n_items) / (1.0 + doc_freq[t])) for t in uniq_tokens) / len(
                uniq_tokens
            )
            novelty_score = _clamp(idf_avg / max(max_idf, 1e-6))
        else:
            novelty_score = 0.35

        action_hits = _contains_any(blob_tokens, _ACTION_TOKENS)
        actionability_score = _clamp(0.18 + 0.22 * min(action_hits, 3))

        desc_len = len(descriptions[idx])
        if desc_len <= 40:
            length_score = _clamp(desc_len / 40.0)
        elif desc_len <= 180:
            length_score = 1.0
        else:
            length_score = _clamp(1.0 - (desc_len - 180) / 220.0)
        sentence_count = len(re.findall(r"[。！？.!?]", descriptions[idx]))
        clarity_score = _clamp(0.55 * length_score + 0.45 * min(1.0, sentence_count / 2.0))

        hedge_hits = _contains_any(blob_tokens, _HEDGE_TOKENS)
        assertive_hits = _contains_any(blob_tokens, _ASSERTIVE_TOKENS)
        certainty_score = _clamp(0.72 - 0.10 * min(hedge_hits, 4) + 0.06 * min(assertive_hits, 3))

        confidence_score = _clamp(float(finding.confidence))

        base = (
            _BASE_WEIGHTS["confidence"] * confidence_score
            + _BASE_WEIGHTS["evidence"] * evidence_score
            + _BASE_WEIGHTS["cross_support"] * support_score
            + _BASE_WEIGHTS["novelty"] * novelty_score
            + _BASE_WEIGHTS["actionability"] * actionability_score
            + _BASE_WEIGHTS["clarity"] * clarity_score
        )
        total_score = _clamp(base * (0.75 + 0.25 * certainty_score))

        dimensions = {
            "confidence": round(confidence_score * 100.0, 2),
            "evidence": round(evidence_score * 100.0, 2),
            "cross_support": round(support_score * 100.0, 2),
            "novelty": round(novelty_score * 100.0, 2),
            "actionability": round(actionability_score * 100.0, 2),
            "clarity": round(clarity_score * 100.0, 2),
            "certainty": round(certainty_score * 100.0, 2),
        }

        scored.append(
            (
                total_score,
                InsightItem(
                    rank=1,  # assigned after sorting
                    discipline=disciplines[idx],
                    category=finding.category,
                    insight=descriptions[idx],
                    confidence=confidence_score,
                    taste_score=round(total_score * 100.0, 2),
                    dimension_scores=dimensions,
                    supporting_disciplines=sorted(support_sets[idx]),
                    evidence=[str(ev) for ev in finding.evidence if str(ev).strip()][:6],
                    metadata={
                        "evidence_count": evidence_count,
                    },
                ),
            )
        )

    scored.sort(key=lambda pair: (pair[0], pair[1].confidence), reverse=True)
    top_items = [item for _, item in scored[: max(1, top_k)]]
    for rank, item in enumerate(top_items, start=1):
        item.rank = rank

    contradictions_count = len(contradictions or [])
    contradiction_penalty = min(12.0, contradictions_count * 2.5)

    dim_means: dict[str, float] = {}
    for key in _DIM_LABELS:
        vals = [item.dimension_scores.get(key, 0.0) for item in top_items]
        dim_means[key] = round(sum(vals) / len(vals), 2)

    overall_raw = sum(item.taste_score for item in top_items) / len(top_items)
    overall = max(0.0, round(overall_raw - contradiction_penalty, 2))

    ordered_dims = sorted(dim_means.items(), key=lambda kv: kv[1], reverse=True)
    strengths = [
        f"{_DIM_LABELS[key]}较强（{score:.1f}）"
        for key, score in ordered_dims[:2]
    ]
    risks = [
        f"{_DIM_LABELS[key]}偏弱（{score:.1f}）"
        for key, score in ordered_dims[-2:]
    ]
    if contradiction_penalty > 0:
        risks.append(f"跨学科矛盾导致总分扣减 {contradiction_penalty:.1f}")

    assessment = TasteAssessment(
        overall_score=overall,
        dimension_scores=dim_means,
        strengths=strengths,
        risks=risks,
        methodology=(
            "基于 agent finding 的可解释多维评分：置信度、证据强度、跨视角支撑、"
            "新颖性、可行动性、清晰度与确定性；并对跨学科矛盾施加惩罚项。"
        ),
    )
    return assessment, top_items
