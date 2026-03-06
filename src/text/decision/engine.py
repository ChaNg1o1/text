"""Deterministic forensic decision engine."""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
import hashlib
import json
import logging
from statistics import mean
from typing import Any
import uuid

import numpy as np

from text.ingest.schema import (
    ActivityEvent,
    AnalysisRequest,
    AnomalySample,
    AppendixItem,
    ArtifactRecord,
    ConclusionGrade,
    EvidenceItem,
    FeatureVector,
    ForensicReport,
    MethodRecord,
    ProvenanceRecord,
    ReportConclusion,
    ReportMaterial,
    ReproducibilityInfo,
    ResultRecord,
    TaskType,
    WritingProfile,
    request_fingerprint,
)

from .thresholds import ThresholdProfile, default_threshold_profile

logger = logging.getLogger(__name__)

try:
    from sklearn.cluster import AgglomerativeClustering
    from sklearn.metrics import brier_score_loss, roc_auc_score, roc_curve

    _HAS_SKLEARN = True
except ImportError:  # pragma: no cover
    _HAS_SKLEARN = False

try:
    import networkx as nx  # type: ignore[import-not-found]

    _HAS_NETWORKX = True
except ImportError:  # pragma: no cover
    _HAS_NETWORKX = False


_OBSERVABLE_PROFILE_DIMENSIONS = {
    "lexical_richness": "词汇丰富度",
    "sentence_complexity": "句子复杂度",
    "punctuation_habits": "标点习惯",
    "formality_register": "语体正式程度",
    "rhetorical_patterns": "修辞偏好",
    "error_patterns": "错误模式",
    "structural_preferences": "结构偏好",
    "machine_influence": "机器影响迹象",
}


@dataclass(slots=True)
class _Profile:
    label: str
    text_ids: list[str]
    text_count: int
    token_count: int
    cjk_chars: int
    content: str
    char_ngrams: dict[str, float]
    function_words: dict[str, float]
    punctuation: dict[str, float]
    pos: dict[str, float]
    embedding: np.ndarray | None
    avg_sentence_length: float
    sentence_variance: float
    formality_score: float
    code_switching_ratio: float


class DecisionEngine:
    """Build deterministic conclusions and reproducibility data."""

    def __init__(self, threshold_profile: ThresholdProfile | None = None) -> None:
        self.threshold_profile = threshold_profile or default_threshold_profile()

    def build_report(self, request: AnalysisRequest, features: list[FeatureVector]) -> ForensicReport:
        feature_map = {feature.text_id: feature for feature in features}
        text_map = {text.id: text for text in request.texts}

        report = ForensicReport(
            request=request,
            materials=self._build_materials(request.artifacts, request.texts),
            methods=self._build_methods(),
            limitations=[],
            reproducibility=ReproducibilityInfo(
                request_fingerprint=request_fingerprint(request),
                threshold_profile_version=self.threshold_profile.version,
                parameter_snapshot={
                    "task": request.task.value,
                    "task_params": request.task_params.model_dump(mode="json"),
                    "text_count": len(request.texts),
                    "artifact_count": len(request.artifacts),
                    "activity_event_count": len(request.activity_events),
                    "interaction_edge_count": len(request.interaction_edges),
                },
            ),
            provenance=ProvenanceRecord(
                report_id=uuid.uuid4().hex,
                input_manifest=request.artifacts,
                threshold_profile_version=self.threshold_profile.version,
                operator=request.case_metadata.analyst if request.case_metadata else None,
                feature_extractor_version={"rust": "unknown", "python_nlp": "unknown"},
            ),
        )
        report.anomaly_samples = self._detect_anomalies(request, features)
        report.appendix.extend(self._anomaly_appendix(report.anomaly_samples))

        if request.task == TaskType.VERIFICATION:
            self._build_verification(report, request, feature_map, text_map)
        elif request.task == TaskType.CLOSED_SET_ID:
            self._build_identification(report, request, feature_map, text_map, open_set=False)
        elif request.task == TaskType.OPEN_SET_ID:
            self._build_identification(report, request, feature_map, text_map, open_set=True)
        elif request.task == TaskType.CLUSTERING:
            self._build_clustering(report, request, feature_map, text_map)
        elif request.task == TaskType.PROFILING:
            self._build_profiling(report, request, feature_map, text_map)
        elif request.task == TaskType.SOCKPUPPET:
            self._build_sockpuppet(report, request, feature_map, text_map)
        else:
            self._build_full(report, request, feature_map, text_map)

        report.summary = self._deterministic_summary(report)
        self._finalize_reproducibility(report)
        return report

    def evaluate_reference_corpus(
        self,
        request: AnalysisRequest,
        features: list[FeatureVector],
    ) -> dict[str, float | int | None]:
        feature_map = {feature.text_id: feature for feature in features}
        profiles = [self._profile_for_text_ids(request, feature_map, [text.id], text.author) for text in request.texts]

        scores: list[float] = []
        labels: list[int] = []
        same_topic_scores: list[float] = []
        diff_topic_scores: list[float] = []
        for i in range(len(profiles)):
            for j in range(i + 1, len(profiles)):
                metrics = self._comparison_metrics(profiles[i], profiles[j])
                score = metrics["log10_lr"]
                same_author = int(request.texts[i].author == request.texts[j].author)
                scores.append(score)
                labels.append(same_author)
                topic_i = str(request.texts[i].metadata.get("topic", ""))
                topic_j = str(request.texts[j].metadata.get("topic", ""))
                if same_author and topic_i and topic_j and topic_i != topic_j:
                    same_topic_scores.append(score)
                if not same_author and topic_i and topic_j and topic_i == topic_j:
                    diff_topic_scores.append(score)

        if len(set(labels)) < 2 or not _HAS_SKLEARN:
            return {
                "pair_count": len(scores),
                "roc_auc": None,
                "eer": None,
                "ece": None,
                "brier": None,
                "same_author_diff_topic_mean": mean(same_topic_scores) if same_topic_scores else None,
                "diff_author_same_topic_mean": mean(diff_topic_scores) if diff_topic_scores else None,
            }

        probs = np.clip([(score + 3.0) / 6.0 for score in scores], 0.0, 1.0)
        fpr, tpr, _ = roc_curve(labels, probs)
        fnr = 1 - tpr
        eer = float(fpr[np.nanargmin(np.abs(fnr - fpr))])
        return {
            "pair_count": len(scores),
            "roc_auc": float(roc_auc_score(labels, probs)),
            "eer": eer,
            "ece": float(self._expected_calibration_error(probs, labels)),
            "brier": float(brier_score_loss(labels, probs)),
            "same_author_diff_topic_mean": mean(same_topic_scores) if same_topic_scores else None,
            "diff_author_same_topic_mean": mean(diff_topic_scores) if diff_topic_scores else None,
        }

    def _build_materials(
        self,
        artifacts: list[ArtifactRecord],
        texts: list,
    ) -> list[ReportMaterial]:
        artifact_to_texts: dict[str, list[str]] = defaultdict(list)
        for text in texts:
            if text.artifact_id:
                artifact_to_texts[text.artifact_id].append(text.id)

        materials: list[ReportMaterial] = []
        for artifact in artifacts:
            materials.append(
                ReportMaterial(
                    artifact_id=artifact.artifact_id,
                    source_name=artifact.source_name,
                    sha256=artifact.sha256,
                    byte_count=artifact.byte_count,
                    text_ids=artifact_to_texts.get(artifact.artifact_id, []),
                    note=artifact.notes,
                )
            )
        return materials

    def _build_methods(self) -> list[MethodRecord]:
        return [
            MethodRecord(
                key="robust_style_similarity",
                title="稳健风格相似度",
                description=(
                    "基于字符 n-gram、函数词、标点与句法分布的确定性融合分数；"
                    "embedding 仅作辅助，不单独决定作者结论。"
                ),
                parameters={
                    "threshold_profile_version": self.threshold_profile.version,
                    "text_view_threshold": self.threshold_profile.text_view_threshold,
                },
                threshold_profile_version=self.threshold_profile.version,
            ),
            MethodRecord(
                key="adversarial_screening",
                title="对抗改写筛查",
                description="检测语义相似但风格断裂、机器润色、翻译腔与异常风格切换。",
                parameters={},
                threshold_profile_version=self.threshold_profile.version,
            ),
        ]

    def _build_verification(
        self,
        report: ForensicReport,
        request: AnalysisRequest,
        feature_map: dict[str, FeatureVector],
        text_map: dict[str, Any],
    ) -> None:
        params = request.task_params
        questioned = self._profile_for_text_ids(
            request, feature_map, params.questioned_text_ids, "questioned"
        )
        reference_ids = [text.id for text in request.texts if text.author in params.reference_author_ids]
        reference = self._profile_for_text_ids(
            request, feature_map, reference_ids, ",".join(params.reference_author_ids)
        )

        insufficiency = self._verification_insufficiency(questioned, reference)
        metrics = self._comparison_metrics(questioned, reference)
        limitations = insufficiency + metrics["adversarial_indicators"]
        if limitations:
            metrics["grade"] = ConclusionGrade.INCONCLUSIVE

        evidence_id = self._add_evidence(
            report,
            label="verification_core",
            summary="verification 的核心确定性比较结果",
            source_text_ids=questioned.text_ids + reference.text_ids,
            excerpts=[
                f"log10(LR)={metrics['log10_lr']:.2f}",
                f"char_ngram_cosine={metrics['char_similarity']:.3f}",
                f"function_word_cosine={metrics['function_similarity']:.3f}",
                f"burrows_delta={metrics['burrows_delta']:.3f}",
                f"ncd={metrics['ncd']:.3f}",
            ],
            metrics={
                "log10_lr": metrics["log10_lr"],
                "char_similarity": metrics["char_similarity"],
                "function_similarity": metrics["function_similarity"],
                "embedding_similarity": metrics["embedding_similarity"],
                "burrows_delta": metrics["burrows_delta"],
                "ncd": metrics["ncd"],
            },
        )
        report.conclusions.append(
            ReportConclusion(
                key="verification",
                task=TaskType.VERIFICATION,
                statement=self._verification_statement(reference.label, metrics["grade"], limitations),
                grade=metrics["grade"],
                score=metrics["log10_lr"],
                score_type="log10_lr",
                subject=reference.label,
                evidence_ids=[evidence_id],
                counter_evidence=metrics["counter_evidence"],
                limitations=limitations,
                metadata={"adversarial_indicators": metrics["adversarial_indicators"]},
            )
        )
        report.results.append(
            ResultRecord(
                key="verification_deterministic",
                title="Verification 确定性结果",
                body=self._verification_result_body(reference.label, metrics, limitations),
                evidence_ids=[evidence_id],
                interpretive_opinion=False,
            )
        )
        report.limitations.extend(limitations)

    def _build_identification(
        self,
        report: ForensicReport,
        request: AnalysisRequest,
        feature_map: dict[str, FeatureVector],
        text_map: dict[str, Any],
        *,
        open_set: bool,
    ) -> None:
        params = request.task_params
        questioned = self._profile_for_text_ids(
            request, feature_map, params.questioned_text_ids, "questioned"
        )
        candidate_scores: list[dict[str, Any]] = []
        for author_id in params.candidate_author_ids:
            candidate_text_ids = [text.id for text in request.texts if text.author == author_id]
            candidate = self._profile_for_text_ids(request, feature_map, candidate_text_ids, author_id)
            metrics = self._comparison_metrics(questioned, candidate)
            insufficiency = self._verification_insufficiency(questioned, candidate)
            limitations = insufficiency + metrics["adversarial_indicators"]
            if limitations:
                metrics["grade"] = ConclusionGrade.INCONCLUSIVE
            candidate_scores.append(
                {
                    "author": author_id,
                    "profile": candidate,
                    "metrics": metrics,
                    "limitations": limitations,
                }
            )

        candidate_scores.sort(key=lambda item: item["metrics"]["log10_lr"], reverse=True)
        top_k = candidate_scores[: request.task_params.top_k]

        for item in top_k:
            evidence_id = self._add_evidence(
                report,
                label=f"candidate_{item['author']}",
                summary=f"候选作者 {item['author']} 的比较结果",
                source_text_ids=questioned.text_ids + item["profile"].text_ids,
                excerpts=[
                    f"log10(LR)={item['metrics']['log10_lr']:.2f}",
                    f"char_ngram_cosine={item['metrics']['char_similarity']:.3f}",
                    f"function_word_cosine={item['metrics']['function_similarity']:.3f}",
                ],
                metrics={
                    "log10_lr": item["metrics"]["log10_lr"],
                    "char_similarity": item["metrics"]["char_similarity"],
                    "function_similarity": item["metrics"]["function_similarity"],
                    "embedding_similarity": item["metrics"]["embedding_similarity"],
                },
            )
            item["evidence_id"] = evidence_id

        statement = self._identification_statement(top_k, open_set=open_set)
        grade = top_k[0]["metrics"]["grade"] if top_k else ConclusionGrade.INCONCLUSIVE
        if open_set and top_k:
            runner_up_gap = top_k[0]["metrics"]["log10_lr"] - (
                top_k[1]["metrics"]["log10_lr"] if len(top_k) > 1 else 0.0
            )
            if (
                grade.value != ConclusionGrade.MODERATE_SUPPORT.value
                and grade != ConclusionGrade.STRONG_SUPPORT
            ) or runner_up_gap < self.threshold_profile.open_set_margin_log10_lr:
                grade = ConclusionGrade.INCONCLUSIVE
                statement = "开放集识别未达到保留候选作者的门槛，当前应视为 none_of_the_above 或无法判断。"

        report.conclusions.append(
            ReportConclusion(
                key="open_set_id" if open_set else "closed_set_id",
                task=TaskType.OPEN_SET_ID if open_set else TaskType.CLOSED_SET_ID,
                statement=statement,
                grade=grade,
                score=top_k[0]["metrics"]["log10_lr"] if top_k else None,
                score_type="log10_lr",
                subject=top_k[0]["author"] if top_k else None,
                evidence_ids=[item["evidence_id"] for item in top_k],
                counter_evidence=top_k[0]["metrics"]["counter_evidence"] if top_k else [],
                limitations=[lim for item in top_k for lim in item["limitations"]],
                metadata={
                    "top_k": [
                        {
                            "author": item["author"],
                            "log10_lr": item["metrics"]["log10_lr"],
                            "grade": item["metrics"]["grade"].value,
                        }
                        for item in top_k
                    ]
                },
            )
        )
        table_lines = []
        for rank, item in enumerate(top_k, start=1):
            table_lines.append(
                f"{rank}. {item['author']} | log10(LR)={item['metrics']['log10_lr']:.2f} | "
                f"grade={item['metrics']['grade'].value}"
            )
        report.results.append(
            ResultRecord(
                key="candidate_ranking",
                title="候选集排名",
                body="\n".join(table_lines) if table_lines else "无可用候选结果。",
                evidence_ids=[item["evidence_id"] for item in top_k],
                interpretive_opinion=False,
            )
        )
        report.limitations.extend([lim for item in top_k for lim in item["limitations"]])

    def _build_clustering(
        self,
        report: ForensicReport,
        request: AnalysisRequest,
        feature_map: dict[str, FeatureVector],
        text_map: dict[str, Any],
    ) -> None:
        text_ids = request.task_params.cluster_text_ids or [text.id for text in request.texts]
        eligible_ids = [
            text_id
            for text_id in text_ids
            if self._text_sufficiency(text_map[text_id].content, TaskType.CLUSTERING)[0]
        ]
        dropped_ids = sorted(set(text_ids) - set(eligible_ids))
        if len(eligible_ids) < 2:
            report.conclusions.append(
                ReportConclusion(
                    key="clustering",
                    task=TaskType.CLUSTERING,
                    statement="满足最小长度门槛的文本不足，无法执行可靠聚类。",
                    grade=ConclusionGrade.INCONCLUSIVE,
                    limitations=["参与聚类的有效文本不足 2 条。"],
                )
            )
            report.limitations.append("参与聚类的有效文本不足 2 条。")
            return

        profiles = [self._profile_for_text_ids(request, feature_map, [text_id], text_id) for text_id in eligible_ids]
        distance_matrix = np.zeros((len(profiles), len(profiles)))
        for i in range(len(profiles)):
            for j in range(i + 1, len(profiles)):
                metrics = self._comparison_metrics(profiles[i], profiles[j])
                distance = max(0.0, 1.0 - metrics["robust_similarity"])
                distance_matrix[i][j] = distance
                distance_matrix[j][i] = distance

        labels = self._cluster_distance_matrix(distance_matrix)
        clusters: dict[int, list[str]] = defaultdict(list)
        for text_id, label in zip(eligible_ids, labels):
            clusters[int(label)].append(text_id)

        cluster_lines = []
        for label, members in sorted(clusters.items(), key=lambda item: (item[0], len(item[1]))):
            cluster_lines.append(f"cluster {label}: {', '.join(members)}")
        if dropped_ids:
            cluster_lines.append(f"excluded_for_length: {', '.join(dropped_ids)}")

        evidence_id = self._add_evidence(
            report,
            label="clustering_matrix",
            summary="文本聚类的组内/组间距离结果",
            source_text_ids=eligible_ids,
            excerpts=cluster_lines[:10],
            metrics={"cluster_count": float(len(clusters))},
        )
        report.conclusions.append(
            ReportConclusion(
                key="clustering",
                task=TaskType.CLUSTERING,
                statement=f"聚类结果形成 {len(clusters)} 个候选簇；该结果用于指纹分组，不直接证明同一作者。",
                grade=ConclusionGrade.INCONCLUSIVE,
                evidence_ids=[evidence_id],
                limitations=(
                    [f"{len(dropped_ids)} 条文本因长度不足被排除。"] if dropped_ids else []
                ),
            )
        )
        report.results.append(
            ResultRecord(
                key="clustering_summary",
                title="聚类结果",
                body="\n".join(cluster_lines),
                evidence_ids=[evidence_id],
                interpretive_opinion=False,
            )
        )
        report.appendix.append(
            AppendixItem(
                key="clustering_distance_matrix",
                title="聚类距离矩阵",
                content=json.dumps(distance_matrix.tolist(), ensure_ascii=False),
            )
        )

    def _build_profiling(
        self,
        report: ForensicReport,
        request: AnalysisRequest,
        feature_map: dict[str, FeatureVector],
        text_map: dict[str, Any],
    ) -> None:
        subjects = request.task_params.subject_ids or sorted({text.author for text in request.texts})
        for subject in subjects:
            subject_text_ids = [text.id for text in request.texts if text.author == subject]
            profile = self._profile_for_text_ids(request, feature_map, subject_text_ids, subject)
            writing_profile = self._writing_profile_from_profile(profile)
            report.writing_profiles.append(writing_profile)

        report.conclusions.append(
            ReportConclusion(
                key="profiling_scope",
                task=TaskType.PROFILING,
                statement="本画像仅输出可直接观察的写作习惯与过程线索；推测性观察单独分区，不作为归因证据。",
                grade=ConclusionGrade.INCONCLUSIVE,
                limitations=[],
            )
        )
        report.results.append(
            ResultRecord(
                key="profiling_summary",
                title="写作习惯画像",
                body=f"已生成 {len(report.writing_profiles)} 个主体的写作习惯画像。",
                interpretive_opinion=False,
            )
        )

    def _build_sockpuppet(
        self,
        report: ForensicReport,
        request: AnalysisRequest,
        feature_map: dict[str, FeatureVector],
        text_map: dict[str, Any],
    ) -> None:
        account_ids = request.task_params.account_ids or sorted({text.author for text in request.texts})
        profiles = {
            account_id: self._profile_for_text_ids(
                request,
                feature_map,
                [text.id for text in request.texts if text.author == account_id],
                account_id,
            )
            for account_id in account_ids
        }
        edges: list[tuple[str, str, float, str, dict[str, float], list[str]]] = []
        missing_modalities = []
        if not request.activity_events:
            missing_modalities.append("时序行为数据缺失")
        if not request.interaction_edges:
            missing_modalities.append("互动网络数据缺失")

        for i, a in enumerate(account_ids):
            for b in account_ids[i + 1 :]:
                text_views = self._text_modalities(profiles[a], profiles[b])
                time_score = self._time_similarity(request.activity_events, a, b)
                network_score = self._network_similarity(request.interaction_edges, a, b)
                available_views = {
                    "text": text_views["aggregate"],
                }
                if time_score is not None:
                    available_views["time"] = time_score
                if network_score is not None:
                    available_views["network"] = network_score
                combined = mean(available_views.values()) if available_views else 0.0
                tier = "无法判断"
                if (
                    text_views["passed_views"] >= 2
                    and time_score is not None
                    and time_score >= self.threshold_profile.time_view_threshold
                    and network_score is not None
                    and network_score >= self.threshold_profile.network_view_threshold
                ):
                    tier = "强证据"
                elif text_views["passed_views"] >= 2 and (
                    (time_score is not None and time_score >= self.threshold_profile.time_view_threshold)
                    or (
                        network_score is not None
                        and network_score >= self.threshold_profile.network_view_threshold
                    )
                ):
                    tier = "中等证据"
                elif text_views["passed_views"] >= 2:
                    tier = "弱证据"
                edges.append(
                    (
                        a,
                        b,
                        combined,
                        tier,
                        {
                            "text": text_views["aggregate"],
                            "time": time_score or 0.0,
                            "network": network_score or 0.0,
                        },
                        text_views["indicators"],
                    )
                )

        communities = self._communities_from_edges(edges)
        evidence_ids: list[str] = []
        for a, b, combined, tier, metrics, indicators in edges:
            evidence_ids.append(
                self._add_evidence(
                    report,
                    label=f"sockpuppet_{a}_{b}",
                    summary=f"{a} 与 {b} 的共同控制比较",
                    source_text_ids=profiles[a].text_ids + profiles[b].text_ids,
                    excerpts=[f"evidence_tier={tier}", *indicators[:3]],
                    metrics={"combined": combined, **metrics},
                )
            )

        statement = (
            f"发现 {len(communities)} 个候选共同控制社区。"
            if communities
            else "未发现达到强或中等证据门槛的共同控制社区。"
        )
        if missing_modalities:
            statement += " 当前仅能给出降级判断。"
        grade = ConclusionGrade.INCONCLUSIVE
        if any(tier == "强证据" for _, _, _, tier, _, _ in edges):
            grade = ConclusionGrade.STRONG_SUPPORT
        elif any(tier == "中等证据" for _, _, _, tier, _, _ in edges):
            grade = ConclusionGrade.MODERATE_SUPPORT

        report.conclusions.append(
            ReportConclusion(
                key="sockpuppet",
                task=TaskType.SOCKPUPPET,
                statement=statement,
                grade=grade,
                evidence_ids=evidence_ids,
                limitations=missing_modalities,
                metadata={
                    "communities": communities,
                    "pair_edges": [
                        {
                            "a": a,
                            "b": b,
                            "combined": combined,
                            "tier": tier,
                            "metrics": metrics,
                        }
                        for a, b, combined, tier, metrics, _ in edges
                    ]
                },
            )
        )
        body_lines = [
            f"{a} <-> {b} | combined={combined:.3f} | tier={tier}"
            for a, b, combined, tier, _, _ in sorted(edges, key=lambda item: item[2], reverse=True)
        ]
        if missing_modalities:
            body_lines.append("限制：" + "；".join(missing_modalities))
        report.results.append(
            ResultRecord(
                key="sockpuppet_graph",
                title="共同控制图谱摘要",
                body="\n".join(body_lines) if body_lines else "无可用账号对比较结果。",
                evidence_ids=evidence_ids,
                interpretive_opinion=False,
            )
        )
        report.limitations.extend(missing_modalities)

    def _build_full(
        self,
        report: ForensicReport,
        request: AnalysisRequest,
        feature_map: dict[str, FeatureVector],
        text_map: dict[str, Any],
    ) -> None:
        authors = sorted({text.author for text in request.texts})
        if len(request.texts) >= 2 and authors:
            questioned_ids = [request.texts[0].id]
            reference_author = authors[0]
            full_request = request.model_copy(
                update={
                    "task_params": request.task_params.model_copy(
                        update={
                            "questioned_text_ids": questioned_ids,
                            "reference_author_ids": [reference_author],
                        }
                    )
                }
            )
            self._build_verification(report, full_request, feature_map, text_map)
        self._build_profiling(report, request, feature_map, text_map)
        self._build_clustering(report, request, feature_map, text_map)
        if len(authors) >= 2:
            sock_request = request.model_copy(
                update={
                    "task_params": request.task_params.model_copy(update={"account_ids": authors})
                }
            )
            self._build_sockpuppet(report, sock_request, feature_map, text_map)

    def _deterministic_summary(self, report: ForensicReport) -> str:
        if not report.conclusions:
            return "本次分析未生成确定性结论。"
        top = report.conclusions[0]
        return (
            f"本次分析共生成 {len(report.conclusions)} 条结构化结论。"
            f"主结论为：{top.statement}"
        )

    def _finalize_reproducibility(self, report: ForensicReport) -> None:
        payload = report.model_dump(
            mode="json",
            exclude={
                "reproducibility": {"report_sha256"},
                "provenance": {"report_sha256"},
            },
        )
        raw = json.dumps(payload, ensure_ascii=False, sort_keys=True)
        report_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        report.reproducibility.report_sha256 = report_hash
        if report.provenance is not None:
            report.provenance.report_sha256 = report_hash

    def _add_evidence(
        self,
        report: ForensicReport,
        *,
        label: str,
        summary: str,
        source_text_ids: list[str],
        excerpts: list[str],
        metrics: dict[str, float],
        interpretive_opinion: bool = False,
    ) -> str:
        evidence_id = f"ev_{len(report.evidence_items) + 1:04d}"
        report.evidence_items.append(
            EvidenceItem(
                evidence_id=evidence_id,
                label=label,
                summary=summary,
                source_text_ids=source_text_ids,
                excerpts=excerpts,
                metrics=metrics,
                interpretive_opinion=interpretive_opinion,
            )
        )
        return evidence_id

    def _verification_statement(
        self,
        reference_label: str,
        grade: ConclusionGrade,
        limitations: list[str],
    ) -> str:
        if limitations:
            return f"针对已知作者 {reference_label} 的 verification 结果受限，当前只能给出无法判断。"
        if grade in {ConclusionGrade.STRONG_SUPPORT, ConclusionGrade.MODERATE_SUPPORT}:
            return f"当前证据支持目标文本与已知作者 {reference_label} 的写作指纹一致。"
        if grade in {ConclusionGrade.MODERATE_AGAINST, ConclusionGrade.STRONG_AGAINST}:
            return f"当前证据不支持目标文本来自已知作者 {reference_label}。"
        return f"针对已知作者 {reference_label}，当前证据不足以下结论。"

    def _verification_result_body(
        self,
        reference_label: str,
        metrics: dict[str, Any],
        limitations: list[str],
    ) -> str:
        lines = [
            f"比较对象：questioned vs {reference_label}",
            f"log10(LR)={metrics['log10_lr']:.2f}",
            f"grade={metrics['grade'].value}",
            f"char_ngram_cosine={metrics['char_similarity']:.3f}",
            f"function_word_cosine={metrics['function_similarity']:.3f}",
            f"punctuation_cosine={metrics['punctuation_similarity']:.3f}",
            f"embedding_similarity={metrics['embedding_similarity']:.3f}",
            f"burrows_delta={metrics['burrows_delta']:.3f}",
            f"ncd={metrics['ncd']:.3f}",
        ]
        if limitations:
            lines.append("限制：" + "；".join(limitations))
        return "\n".join(lines)

    def _identification_statement(self, top_k: list[dict[str, Any]], *, open_set: bool) -> str:
        if not top_k:
            return "候选集为空或缺少足够证据，无法输出排名。"
        leader = top_k[0]
        if open_set:
            return (
                f"在开放候选集中，{leader['author']} 的风格距离最近；"
                "是否保留该候选仍需满足拒识阈值与领先差距条件。"
            )
        return f"在候选集中，{leader['author']} 的风格距离最近。"

    def _verification_insufficiency(self, questioned: _Profile, reference: _Profile) -> list[str]:
        limitations: list[str] = []
        q_ok, q_msg = self._profile_sufficiency(questioned, TaskType.VERIFICATION, is_reference=False)
        r_ok, r_msg = self._profile_sufficiency(reference, TaskType.VERIFICATION, is_reference=True)
        if not q_ok and q_msg:
            limitations.append(q_msg)
        if not r_ok and r_msg:
            limitations.append(r_msg)
        return limitations

    def _profile_sufficiency(
        self,
        profile: _Profile,
        task: TaskType,
        *,
        is_reference: bool = False,
    ) -> tuple[bool, str | None]:
        if task in {TaskType.VERIFICATION, TaskType.CLOSED_SET_ID, TaskType.OPEN_SET_ID}:
            if is_reference:
                if profile.text_count < self.threshold_profile.reference_min_texts:
                    return False, "参考作者样本数不足 3 条。"
                if (
                    profile.token_count < self.threshold_profile.reference_min_tokens
                    and profile.cjk_chars < self.threshold_profile.reference_min_cjk_chars
                ):
                    return False, "参考作者累计文本长度不足。"
                return True, None
            if (
                profile.token_count < self.threshold_profile.verification_min_tokens
                and profile.cjk_chars < self.threshold_profile.verification_min_cjk_chars
            ):
                return False, "目标文本长度不足，verification/ID 结论应降级为无法判断。"
            return True, None
        if task == TaskType.SOCKPUPPET:
            if profile.text_count < self.threshold_profile.sockpuppet_min_texts:
                return False, "账号样本数不足 5 条。"
            if (
                profile.token_count < self.threshold_profile.sockpuppet_min_tokens
                and profile.cjk_chars < self.threshold_profile.sockpuppet_min_cjk_chars
            ):
                return False, "账号累计文本长度不足。"
            return True, None
        return True, None

    def _text_sufficiency(self, content: str, task: TaskType) -> tuple[bool, str | None]:
        token_count = len(content.split())
        cjk_chars = _count_cjk_chars(content)
        if task == TaskType.CLUSTERING:
            ok = (
                token_count >= self.threshold_profile.clustering_min_tokens
                or cjk_chars >= self.threshold_profile.clustering_min_cjk_chars
            )
            if not ok:
                return False, "文本长度不足聚类门槛。"
        return True, None

    def _profile_for_text_ids(
        self,
        request: AnalysisRequest,
        feature_map: dict[str, FeatureVector],
        text_ids: list[str],
        label: str,
    ) -> _Profile:
        texts = [text for text in request.texts if text.id in text_ids]
        if not texts:
            return _Profile(
                label=label,
                text_ids=[],
                text_count=0,
                token_count=0,
                cjk_chars=0,
                content="",
                char_ngrams={},
                function_words={},
                punctuation={},
                pos={},
                embedding=None,
                avg_sentence_length=0.0,
                sentence_variance=0.0,
                formality_score=0.0,
                code_switching_ratio=0.0,
            )
        feature_items = [feature_map[text.id] for text in texts if text.id in feature_map]
        text_count = len(texts)
        content = "\n".join(text.content for text in texts)

        def _avg_dict(items: list[dict[str, float]]) -> dict[str, float]:
            totals: dict[str, float] = defaultdict(float)
            for item in items:
                for key, value in item.items():
                    totals[key] += float(value)
            if not items:
                return {}
            return {key: value / len(items) for key, value in totals.items()}

        embeddings = [np.array(item.nlp_features.embedding, dtype=float) for item in feature_items if item.nlp_features.embedding]
        embedding = np.mean(np.stack(embeddings), axis=0) if embeddings else None
        rusts = [item.rust_features for item in feature_items]
        return _Profile(
            label=label,
            text_ids=[text.id for text in texts],
            text_count=text_count,
            token_count=sum(item.rust_features.token_count for item in feature_items),
            cjk_chars=sum(_count_cjk_chars(text.content) for text in texts),
            content=content,
            char_ngrams=_avg_dict([item.rust_features.char_ngrams for item in feature_items]),
            function_words=_avg_dict([item.rust_features.function_word_freq for item in feature_items]),
            punctuation=_avg_dict([item.rust_features.punctuation_profile for item in feature_items]),
            pos=_avg_dict([item.nlp_features.pos_tag_distribution for item in feature_items]),
            embedding=embedding,
            avg_sentence_length=mean([item.avg_sentence_length for item in rusts]) if rusts else 0.0,
            sentence_variance=mean([item.sentence_length_variance for item in rusts]) if rusts else 0.0,
            formality_score=mean([item.formality_score for item in rusts]) if rusts else 0.0,
            code_switching_ratio=mean([item.code_switching_ratio for item in rusts]) if rusts else 0.0,
        )

    def _comparison_metrics(self, a: _Profile, b: _Profile) -> dict[str, Any]:
        char_similarity = _cosine_dict_similarity(a.char_ngrams, b.char_ngrams)
        function_similarity = _cosine_dict_similarity(a.function_words, b.function_words)
        punctuation_similarity = _cosine_dict_similarity(a.punctuation, b.punctuation)
        pos_similarity = _cosine_dict_similarity(a.pos, b.pos)
        embedding_similarity = _cosine_vector_similarity(a.embedding, b.embedding)
        burrows_delta = self._burrows_delta(a.function_words, b.function_words)
        ncd = self._ncd(a.content, b.content)
        robust_similarity = (
            0.32 * char_similarity
            + 0.24 * function_similarity
            + 0.14 * punctuation_similarity
            + 0.12 * pos_similarity
            + 0.08 * embedding_similarity
            + 0.05 * (1.0 - min(ncd, 1.0))
            + 0.05 * (1.0 - min(burrows_delta / 3.0, 1.0))
        )
        adversarial = self._adversarial_indicators(
            char_similarity=char_similarity,
            function_similarity=function_similarity,
            punctuation_similarity=punctuation_similarity,
            embedding_similarity=embedding_similarity,
            profile_a=a,
            profile_b=b,
        )
        penalty = 0.45 * len(adversarial)
        log10_lr = (robust_similarity - 0.5) * 6.0 - penalty
        grade = self.threshold_profile.grade_for_log10_lr(log10_lr)
        counter_evidence = []
        if embedding_similarity > 0.8 and function_similarity < 0.45:
            counter_evidence.append("语义相似较高，但函数词指纹明显断裂。")
        if abs(a.formality_score - b.formality_score) > 0.25:
            counter_evidence.append("正式度差异较大，可能存在题材或编辑干预。")
        return {
            "char_similarity": char_similarity,
            "function_similarity": function_similarity,
            "punctuation_similarity": punctuation_similarity,
            "pos_similarity": pos_similarity,
            "embedding_similarity": embedding_similarity,
            "burrows_delta": burrows_delta,
            "ncd": ncd,
            "robust_similarity": robust_similarity,
            "log10_lr": log10_lr,
            "grade": grade,
            "adversarial_indicators": adversarial,
            "counter_evidence": counter_evidence,
        }

    def _burrows_delta(self, a: dict[str, float], b: dict[str, float]) -> float:
        keys = sorted(set(a) | set(b))
        if not keys:
            return 1.0
        vals_a = np.array([a.get(key, 0.0) for key in keys], dtype=float)
        vals_b = np.array([b.get(key, 0.0) for key in keys], dtype=float)
        stacked = np.vstack([vals_a, vals_b])
        std = stacked.std(axis=0)
        std[std == 0.0] = 1.0
        z_a = (vals_a - stacked.mean(axis=0)) / std
        z_b = (vals_b - stacked.mean(axis=0)) / std
        return float(np.mean(np.abs(z_a - z_b)))

    def _ncd(self, content_a: str, content_b: str) -> float:
        import zlib

        if not content_a or not content_b:
            return 1.0
        blob_a = content_a.encode("utf-8")
        blob_b = content_b.encode("utf-8")
        c_a = len(zlib.compress(blob_a, 9))
        c_b = len(zlib.compress(blob_b, 9))
        c_ab = len(zlib.compress(blob_a + blob_b, 9))
        return (c_ab - min(c_a, c_b)) / max(c_a, c_b)

    def _adversarial_indicators(
        self,
        *,
        char_similarity: float,
        function_similarity: float,
        punctuation_similarity: float,
        embedding_similarity: float,
        profile_a: _Profile,
        profile_b: _Profile,
    ) -> list[str]:
        indicators: list[str] = []
        style_similarity = mean([char_similarity, function_similarity, punctuation_similarity])
        if embedding_similarity >= 0.82 and style_similarity <= 0.45:
            indicators.append("语义高相似但风格指纹断裂，疑似改写或代写。")
        if (
            max(profile_a.code_switching_ratio, profile_b.code_switching_ratio) > 0.18
            and abs(profile_a.code_switching_ratio - profile_b.code_switching_ratio) > 0.12
        ):
            indicators.append("代码切换比例差异异常，可能存在翻译腔或机器润色影响。")
        if abs(profile_a.sentence_variance - profile_b.sentence_variance) > 20.0 and style_similarity < 0.55:
            indicators.append("句长节律差异明显，疑似拼接文本或风格切换。")
        return indicators

    def _detect_anomalies(
        self,
        request: AnalysisRequest,
        features: list[FeatureVector],
    ) -> list[AnomalySample]:
        if len(features) < 3:
            return []
        rows = np.array(
            [
                [
                    feature.rust_features.type_token_ratio,
                    feature.rust_features.yules_k,
                    feature.rust_features.avg_sentence_length,
                    feature.rust_features.formality_score,
                    feature.rust_features.code_switching_ratio,
                    feature.nlp_features.clause_depth_avg,
                    feature.nlp_features.sentiment_valence,
                ]
                for feature in features
            ],
            dtype=float,
        )
        means = rows.mean(axis=0)
        stds = rows.std(axis=0)
        stds[stds == 0.0] = 1.0
        z_scores = np.abs((rows - means) / stds)
        dims = [
            "type_token_ratio",
            "yules_k",
            "avg_sentence_length",
            "formality_score",
            "code_switching_ratio",
            "clause_depth_avg",
            "sentiment_valence",
        ]
        text_map = {text.id: text.content for text in request.texts}
        anomalies: list[AnomalySample] = []
        for idx, feature in enumerate(features):
            outliers = {
                dim: float(z_scores[idx][dim_idx])
                for dim_idx, dim in enumerate(dims)
                if z_scores[idx][dim_idx] > 2.0
            }
            if outliers:
                anomalies.append(
                    AnomalySample(
                        text_id=feature.text_id,
                        content=text_map.get(feature.text_id, ""),
                        outlier_dimensions=outliers,
                    )
                )
        anomalies.sort(key=lambda item: len(item.outlier_dimensions), reverse=True)
        return anomalies

    def _anomaly_appendix(self, anomalies: list[AnomalySample]) -> list[AppendixItem]:
        if not anomalies:
            return []
        return [
            AppendixItem(
                key="anomaly_samples",
                title="异常样本摘要",
                content=json.dumps(
                    [
                        {
                            "text_id": sample.text_id,
                            "outlier_dimensions": sample.outlier_dimensions,
                        }
                        for sample in anomalies
                    ],
                    ensure_ascii=False,
                ),
            )
        ]

    def _writing_profile_from_profile(self, profile: _Profile) -> WritingProfile:
        observable = [
            ("lexical_richness", min(100.0, max(0.0, profile.token_count / 20.0))),
            ("sentence_complexity", min(100.0, profile.avg_sentence_length * 3.0)),
            ("punctuation_habits", min(100.0, _dict_density(profile.punctuation) * 150.0)),
            ("formality_register", min(100.0, profile.formality_score * 100.0)),
            ("rhetorical_patterns", min(100.0, _dict_density(profile.char_ngrams) * 50.0)),
            ("error_patterns", min(100.0, abs(profile.code_switching_ratio) * 100.0)),
            ("structural_preferences", min(100.0, profile.sentence_variance)),
            ("machine_influence", min(100.0, profile.code_switching_ratio * 180.0)),
        ]
        speculative_score = min(100.0, (profile.code_switching_ratio + (1.0 - profile.formality_score)) * 40.0)
        return WritingProfile(
            subject=profile.label,
            summary=f"{profile.label} 的画像以可观察风格维度为主，推测性维度单独标注。",
            dimensions=[
                {
                    "key": key,
                    "label": _OBSERVABLE_PROFILE_DIMENSIONS[key],
                    "score": round(score, 1),
                    "confidence": 0.7,
                    "dimension_type": "observable",
                    "evidence_spans": [f"text_count={profile.text_count}", f"token_count={profile.token_count}"],
                    "counter_evidence": [],
                }
                for key, score in observable
            ]
            + [
                {
                    "key": "speculative_process_inference",
                    "label": "推测性观察",
                    "score": round(speculative_score, 1),
                    "confidence": 0.35,
                    "dimension_type": "speculative",
                    "evidence_spans": ["推测性观察，非归因证据。"],
                    "counter_evidence": ["该维度不参与任何自动判定或结论分级。"],
                }
            ],
        )

    def _text_modalities(self, a: _Profile, b: _Profile) -> dict[str, Any]:
        char_similarity = _cosine_dict_similarity(a.char_ngrams, b.char_ngrams)
        function_similarity = _cosine_dict_similarity(a.function_words, b.function_words)
        pos_similarity = _cosine_dict_similarity(a.pos, b.pos)
        views = {
            "char": char_similarity,
            "function": function_similarity,
            "syntax": pos_similarity,
        }
        passed_views = sum(
            1 for score in views.values() if score >= self.threshold_profile.text_view_threshold
        )
        indicators = [
            f"text_view_{name}={score:.3f}"
            for name, score in sorted(views.items(), key=lambda item: item[1], reverse=True)
        ]
        return {
            "aggregate": mean(views.values()),
            "passed_views": passed_views,
            "indicators": indicators,
        }

    def _time_similarity(self, events: list[ActivityEvent], account_a: str, account_b: str) -> float | None:
        events_a = [event for event in events if event.account_id == account_a]
        events_b = [event for event in events if event.account_id == account_b]
        if not events_a or not events_b:
            return None
        hist_a = np.zeros(24)
        hist_b = np.zeros(24)
        for event in events_a:
            hist_a[event.occurred_at.hour] += 1.0
        for event in events_b:
            hist_b[event.occurred_at.hour] += 1.0
        return _cosine_vector_similarity(hist_a, hist_b)

    def _network_similarity(self, edges: list, account_a: str, account_b: str) -> float | None:
        if not edges:
            return None
        neighbors: dict[str, Counter[str]] = defaultdict(Counter)
        for edge in edges:
            neighbors[edge.source_account_id][edge.target_account_id] += edge.weight
            neighbors[edge.target_account_id][edge.source_account_id] += edge.weight
        if account_a not in neighbors or account_b not in neighbors:
            return None
        set_a = set(neighbors[account_a])
        set_b = set(neighbors[account_b])
        if not set_a and not set_b:
            return None
        jaccard = len(set_a & set_b) / max(len(set_a | set_b), 1)
        direct = float(neighbors[account_a].get(account_b, 0.0) + neighbors[account_b].get(account_a, 0.0))
        direct = min(1.0, direct / 10.0)
        return (jaccard + direct) / 2.0

    def _communities_from_edges(
        self,
        edges: list[tuple[str, str, float, str, dict[str, float], list[str]]],
    ) -> list[list[str]]:
        qualifying = [(a, b, score) for a, b, score, tier, _, _ in edges if tier in {"强证据", "中等证据"}]
        if not qualifying:
            return []
        if _HAS_NETWORKX:
            graph = nx.Graph()
            for a, b, score in qualifying:
                graph.add_edge(a, b, weight=score)
            communities = nx.algorithms.community.greedy_modularity_communities(graph, weight="weight")
            return [sorted(list(group)) for group in communities if len(group) >= 2]

        adjacency: dict[str, set[str]] = defaultdict(set)
        for a, b, _score in qualifying:
            adjacency[a].add(b)
            adjacency[b].add(a)
        seen: set[str] = set()
        communities: list[list[str]] = []
        for node in adjacency:
            if node in seen:
                continue
            stack = [node]
            component: list[str] = []
            while stack:
                cur = stack.pop()
                if cur in seen:
                    continue
                seen.add(cur)
                component.append(cur)
                stack.extend(adjacency[cur] - seen)
            if len(component) >= 2:
                communities.append(sorted(component))
        return communities

    def _cluster_distance_matrix(self, distance_matrix: np.ndarray) -> list[int]:
        if _HAS_SKLEARN and len(distance_matrix) >= 2:
            model = AgglomerativeClustering(
                metric="precomputed",
                linkage="average",
                distance_threshold=self.threshold_profile.clustering_distance_threshold,
                n_clusters=None,
            )
            return model.fit_predict(distance_matrix).tolist()

        parent = list(range(len(distance_matrix)))

        def find(x: int) -> int:
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        def union(a: int, b: int) -> None:
            ra = find(a)
            rb = find(b)
            if ra != rb:
                parent[rb] = ra

        for i in range(len(distance_matrix)):
            for j in range(i + 1, len(distance_matrix)):
                if distance_matrix[i][j] <= self.threshold_profile.clustering_distance_threshold:
                    union(i, j)

        roots = {}
        labels = []
        for idx in range(len(distance_matrix)):
            root = find(idx)
            roots.setdefault(root, len(roots))
            labels.append(roots[root])
        return labels

    def _expected_calibration_error(self, probs: list[float], labels: list[int], bins: int = 10) -> float:
        if not probs:
            return 0.0
        arr_probs = np.asarray(probs, dtype=float)
        arr_labels = np.asarray(labels, dtype=float)
        edges = np.linspace(0.0, 1.0, bins + 1)
        total = len(arr_probs)
        ece = 0.0
        for idx in range(bins):
            lower = edges[idx]
            upper = edges[idx + 1]
            mask = (arr_probs >= lower) & (arr_probs < upper if idx < bins - 1 else arr_probs <= upper)
            if not np.any(mask):
                continue
            bin_conf = float(arr_probs[mask].mean())
            bin_acc = float(arr_labels[mask].mean())
            ece += abs(bin_conf - bin_acc) * (float(np.sum(mask)) / total)
        return ece


def _cosine_dict_similarity(a: dict[str, float], b: dict[str, float]) -> float:
    keys = sorted(set(a) | set(b))
    if not keys:
        return 0.0
    vec_a = np.array([a.get(key, 0.0) for key in keys], dtype=float)
    vec_b = np.array([b.get(key, 0.0) for key in keys], dtype=float)
    return _cosine_vector_similarity(vec_a, vec_b)


def _cosine_vector_similarity(a: np.ndarray | None, b: np.ndarray | None) -> float:
    if a is None or b is None:
        return 0.0
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denom == 0.0:
        return 0.0
    return float(np.dot(a, b) / denom)


def _count_cjk_chars(text: str) -> int:
    return sum(1 for char in text if "\u4e00" <= char <= "\u9fff")


def _dict_density(values: dict[str, float]) -> float:
    if not values:
        return 0.0
    positive = [value for value in values.values() if value > 0]
    return sum(positive) / max(len(positive), 1)
