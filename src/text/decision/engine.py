"""Deterministic forensic decision engine."""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
import hashlib
import json
import logging
import re
from statistics import mean
from typing import Any
import uuid

import numpy as np

from text.ingest.schema import (
    ActivityEvent,
    AnalysisRequest,
    AnomalySample,
    AppendixItem,
    AuthorAliasRecord,
    ClusterView,
    ClusterViewCluster,
    ArtifactRecord,
    ConclusionGrade,
    EntityAliases,
    EvidenceItem,
    FeatureVector,
    ForensicReport,
    MethodRecord,
    NarrativeBundle,
    NarrativeSection,
    ProvenanceRecord,
    ReportConclusion,
    ReportMaterial,
    ReproducibilityInfo,
    ResultRecord,
    TaskType,
    TextAliasRecord,
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
            entity_aliases=self._build_entity_aliases(request),
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
        self.ensure_story_surfaces(report)
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
            finding=(
                f"目标文本与 {reference.label} 在字符模式、函数词和标点层面出现同步收敛，"
                f"但结论仍需结合反向信号与样本充分性一起解释。"
            ),
            why_it_matters="这是作者验证的主证据，直接承接 verification 结论的支持或不支持方向。",
            counter_readings=metrics["counter_evidence"] + limitations,
            strength="core",
            linked_conclusion_keys=["verification"],
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
                finding=(
                    f"与候选作者 {item['author']} 的比对显示风格距离位于当前候选集前列，"
                    "可作为排名依据，但仍需与其他候选的差距一起看。"
                ),
                why_it_matters="这条证据用于解释候选集排序和领先差距，而不是单独宣布开放世界身份。",
                counter_readings=item["metrics"]["counter_evidence"] + item["limitations"],
                strength="supporting",
                linked_conclusion_keys=["open_set_id" if open_set else "closed_set_id"],
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
            report.cluster_view = self._build_cluster_view(
                report=report,
                clusters={},
                excluded_ids=dropped_ids or text_ids,
                text_map={text.id: text.content for text in request.texts},
            )
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

        report.cluster_view = self._build_cluster_view(
            report=report,
            clusters=clusters,
            excluded_ids=dropped_ids,
            text_map={text.id: text.content for text in request.texts},
        )

        text_alias_map = self._text_alias_map(report.entity_aliases)
        cluster_lines = []
        for label, members in sorted(clusters.items(), key=lambda item: (item[0], len(item[1]))):
            member_aliases = [text_alias_map.get(text_id, text_id) for text_id in members]
            cluster_lines.append(f"cluster {label}: {', '.join(member_aliases)}")
        if dropped_ids:
            excluded_aliases = [text_alias_map.get(text_id, text_id) for text_id in dropped_ids]
            cluster_lines.append(f"excluded_for_length: {', '.join(excluded_aliases)}")

        evidence_id = self._add_evidence(
            report,
            label="clustering_matrix",
            summary="文本聚类的组内/组间距离结果",
            finding=f"当前样本被分成 {len(clusters)} 个可解释的风格簇，显示这批文本内部并非单一稳定写法。",
            why_it_matters="聚类结果用于先理解样本内部结构，再判断哪些文本可以一起解释，哪些文本应拆开复核。",
            counter_readings=[
                "聚类只能说明分组关系，不能单独替代作者归因。",
                *([f"{len(dropped_ids)} 条文本因长度不足未参与聚类。"] if dropped_ids else []),
            ][:3],
            strength="supporting",
            linked_conclusion_keys=["clustering"],
            source_text_ids=eligible_ids,
            excerpts=cluster_lines[:10],
            metrics={"cluster_count": float(len(clusters))},
        )
        for cluster in report.cluster_view.clusters:
            cluster.representative_evidence_ids = [evidence_id]
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
                body=self._clustering_result_body(report.cluster_view, dropped_ids),
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
        evidence_ids: list[str] = []
        for subject in subjects:
            subject_texts = [text for text in request.texts if text.author == subject]
            profile = self._profile_for_text_ids(
                request,
                feature_map,
                [text.id for text in subject_texts],
                subject,
            )
            writing_profile = self._writing_profile_from_profile(profile, texts=subject_texts)
            report.writing_profiles.append(writing_profile)
            evidence_ids.append(
                self._add_evidence(
                    report,
                    label=f"profile_{subject}",
                    summary=f"{subject} 的写作画像概览",
                    finding=writing_profile.observable_summary,
                    why_it_matters=(
                        "这组画像概括了该主体最稳定的风格习惯、可能的过程线索与需要单独审看的异常点。"
                    ),
                    counter_readings=writing_profile.anomalies[:3],
                    strength="supporting",
                    linked_conclusion_keys=["profiling_scope"],
                    source_text_ids=list(writing_profile.representative_text_ids),
                    excerpts=[
                        *writing_profile.stable_habits[:2],
                        *writing_profile.process_clues[:1],
                    ],
                    metrics={
                        "text_count": float(profile.text_count),
                        "token_count": float(profile.token_count),
                        "formality_score": profile.formality_score,
                        "code_switching_ratio": profile.code_switching_ratio,
                    },
                )
            )

        report.conclusions.append(
            ReportConclusion(
                key="profiling_scope",
                task=TaskType.PROFILING,
                statement=(
                    f"已为 {len(report.writing_profiles)} 个主体整理出可直接观察的写作画像，"
                    "能解释稳定习惯、过程线索与异常点；其中过程线索仅作辅助解读，不单独构成归因证据。"
                ),
                grade=ConclusionGrade.INCONCLUSIVE,
                limitations=[],
                evidence_ids=evidence_ids,
            )
        )
        report.results.append(
            ResultRecord(
                key="profiling_summary",
                title="写作习惯画像",
                body=self._profiling_result_body(report.writing_profiles),
                evidence_ids=evidence_ids,
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
                    finding=(
                        f"{a} 与 {b} 在文本视角上的同步程度为 {metrics['text']:.2f}，"
                        "并结合时序与网络信号形成共同控制强弱判断。"
                    ),
                    why_it_matters="这条证据用于解释账号对之间是否只是题材接近，还是已经出现跨模态的一致性。",
                    counter_readings=list(missing_modalities),
                    strength="core" if tier in {"强证据", "中等证据"} else "supporting",
                    linked_conclusion_keys=["sockpuppet"],
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

    def ensure_story_surfaces(
        self,
        report: ForensicReport,
        *,
        refresh_hash: bool = False,
    ) -> bool:
        changed = False

        if report.entity_aliases is None:
            report.entity_aliases = self._build_entity_aliases(report.request)
            changed = True

        if self._writing_profiles_need_enrichment(report):
            self._enrich_writing_profiles(report)
            changed = True

        if self._evidence_items_need_enrichment(report):
            self._enrich_evidence_items(report)
            changed = True

        if self._cluster_view_needs_enrichment(report):
            clusters, excluded_ids = self._extract_clusters_from_report(report)
            if not clusters and report.cluster_view is not None:
                clusters = {
                    cluster.cluster_id: list(cluster.member_text_ids)
                    for cluster in report.cluster_view.clusters
                }
                excluded_ids = list(report.cluster_view.excluded_text_ids)
            if clusters or excluded_ids:
                text_map = {text.id: text.content for text in report.request.texts}
                report.cluster_view = self._build_cluster_view(
                    report=report,
                    clusters=clusters,
                    excluded_ids=excluded_ids,
                    text_map=text_map,
                )
                changed = True

        if report.narrative is None or self._narrative_needs_refresh(report.narrative):
            report.narrative = self._build_deterministic_narrative(report)
            changed = True

        if changed and refresh_hash:
            self._finalize_reproducibility(report)
        return changed

    def _writing_profiles_need_enrichment(self, report: ForensicReport) -> bool:
        return any(
            not profile.headline
            or not profile.observable_summary
            or not profile.stable_habits
            or not profile.confidence_note
            or not profile.representative_text_ids
            for profile in report.writing_profiles
        )

    def _evidence_items_need_enrichment(self, report: ForensicReport) -> bool:
        return any(
            not item.finding
            or not item.why_it_matters
            or not item.linked_conclusion_keys
            for item in report.evidence_items
        )

    def _cluster_view_needs_enrichment(self, report: ForensicReport) -> bool:
        if report.cluster_view is None:
            return True
        return any(
            not cluster.theme_summary
            or not cluster.top_markers
            or not cluster.confidence_note
            for cluster in report.cluster_view.clusters
        )

    def _narrative_needs_refresh(self, narrative: NarrativeBundle) -> bool:
        if len(narrative.lead.strip()) < 80:
            return True
        required_keys = [
            "bottom_line",
            "evidence_chain",
            "conflicts",
            "limitations",
            "next_actions",
        ]
        keys = [section.key for section in narrative.sections]
        if keys != required_keys:
            return True
        return any(len(section.detail.strip()) < 120 for section in narrative.sections)

    def _enrich_writing_profiles(self, report: ForensicReport) -> None:
        text_lookup = {text.id: text for text in report.request.texts}
        enriched: list[WritingProfile] = []
        for profile in report.writing_profiles:
            if profile.headline and profile.observable_summary and profile.stable_habits:
                enriched.append(profile)
                continue
            source_ids = profile.representative_text_ids or [
                text.id for text in report.request.texts if text.author == profile.subject
            ]
            rebuilt = self._writing_profile_from_texts(
                subject=profile.subject,
                texts=[text_lookup[text_id] for text_id in source_ids if text_id in text_lookup],
                existing=profile,
            )
            enriched.append(rebuilt)
        report.writing_profiles = enriched

    def _enrich_evidence_items(self, report: ForensicReport) -> None:
        evidence_to_conclusions: dict[str, list[str]] = defaultdict(list)
        conclusion_counter: dict[str, list[str]] = defaultdict(list)
        for conclusion in report.conclusions:
            for evidence_id in conclusion.evidence_ids:
                evidence_to_conclusions[evidence_id].append(conclusion.key)
                conclusion_counter[evidence_id].extend(conclusion.counter_evidence)

        for item in report.evidence_items:
            linked = evidence_to_conclusions.get(item.evidence_id, [])
            if not item.linked_conclusion_keys:
                item.linked_conclusion_keys = list(dict.fromkeys(linked))
            if not item.finding:
                item.finding = self._infer_evidence_finding(item)
            if not item.why_it_matters:
                item.why_it_matters = self._infer_evidence_importance(item)
            if not item.counter_readings:
                item.counter_readings = list(
                    dict.fromkeys(conclusion_counter.get(item.evidence_id, []))
                )[:3]
            if item.strength == "supporting":
                item.strength = self._infer_evidence_strength(item)


    def _build_entity_aliases(self, request: AnalysisRequest) -> EntityAliases:
        author_aliases: list[AuthorAliasRecord] = []
        author_alias_map: dict[str, str] = {}
        for text in request.texts:
            if text.author in author_alias_map:
                continue
            alias = f"P{len(author_alias_map) + 1:02d}"
            author_alias_map[text.author] = alias
            author_aliases.append(AuthorAliasRecord(author_id=text.author, alias=alias))

        text_aliases: list[TextAliasRecord] = []
        for index, text in enumerate(request.texts, start=1):
            text_aliases.append(
                TextAliasRecord(
                    text_id=text.id,
                    alias=f"T{index:02d}",
                    author=text.author,
                    preview=self._preview_text(text.content),
                )
            )
        return EntityAliases(text_aliases=text_aliases, author_aliases=author_aliases)

    def _text_alias_map(self, aliases: EntityAliases | None) -> dict[str, str]:
        if aliases is None:
            return {}
        return {item.text_id: item.alias for item in aliases.text_aliases}

    def _build_cluster_view(
        self,
        *,
        report: ForensicReport,
        clusters: dict[int, list[str]],
        excluded_ids: list[str],
        text_map: dict[str, str],
    ) -> ClusterView:
        known_ids = {text.id for text in report.request.texts}
        alias_map = self._text_alias_map(report.entity_aliases)
        normalized_clusters: list[ClusterViewCluster] = []

        for cluster_id, members in sorted(clusters.items(), key=lambda item: item[0]):
            deduped_members = [member for member in dict.fromkeys(members) if member in known_ids]
            member_aliases = [alias_map.get(member, member) for member in deduped_members]
            representative_text_id = deduped_members[0] if deduped_members else None
            representative_excerpt = (
                self._preview_text(text_map.get(representative_text_id, ""))
                if representative_text_id
                else ""
            )
            profile = self._profile_summary_for_cluster(report, deduped_members, text_map)
            normalized_clusters.append(
                ClusterViewCluster(
                    cluster_id=int(cluster_id),
                    label=profile["label"],
                    theme_summary=profile["theme_summary"],
                    separation_summary=profile["separation_summary"],
                    top_markers=profile["top_markers"],
                    confidence_note=profile["confidence_note"],
                    member_text_ids=deduped_members,
                    member_aliases=member_aliases,
                    representative_text_id=representative_text_id,
                    representative_excerpt=representative_excerpt,
                )
            )

        normalized_excluded = [item for item in dict.fromkeys(excluded_ids) if item in known_ids]
        return ClusterView(clusters=normalized_clusters, excluded_text_ids=normalized_excluded)

    def _extract_clusters_from_report(self, report: ForensicReport) -> tuple[dict[int, list[str]], list[str]]:
        cluster_result = next((item for item in report.results if item.key == "clustering_summary"), None)
        if cluster_result is None:
            return {}, []

        alias_to_text = {}
        if report.entity_aliases is not None:
            alias_to_text = {item.alias: item.text_id for item in report.entity_aliases.text_aliases}
        known_ids = {text.id for text in report.request.texts}

        clusters: dict[int, list[str]] = {}
        excluded_ids: list[str] = []
        for line in cluster_result.body.splitlines():
            stripped = line.strip()
            if not stripped:
                continue

            cluster_match = re.match(r"^cluster\s+(-?\d+)\s*:\s*(.+)$", stripped, flags=re.IGNORECASE)
            if cluster_match:
                cluster_id = int(cluster_match.group(1))
                raw_members = [item.strip() for item in cluster_match.group(2).split(",") if item.strip()]
                members = [
                    resolved
                    for token in raw_members
                    if (resolved := self._resolve_text_id(token, known_ids, alias_to_text)) is not None
                ]
                if members:
                    clusters[cluster_id] = members
                continue

            excluded_match = re.match(r"^excluded_for_length\s*:\s*(.+)$", stripped, flags=re.IGNORECASE)
            if excluded_match:
                raw_excluded = [
                    item.strip()
                    for item in excluded_match.group(1).split(",")
                    if item.strip()
                ]
                excluded_ids.extend(
                    resolved
                    for token in raw_excluded
                    if (resolved := self._resolve_text_id(token, known_ids, alias_to_text)) is not None
                )
        return clusters, excluded_ids

    def _resolve_text_id(
        self,
        token: str,
        known_ids: set[str],
        alias_to_text: dict[str, str],
    ) -> str | None:
        clean = token.strip()
        if clean in known_ids:
            return clean
        if clean in alias_to_text:
            return alias_to_text[clean]
        head = clean.split(maxsplit=1)[0]
        if head in known_ids:
            return head
        if head in alias_to_text:
            return alias_to_text[head]
        return None

    def _build_deterministic_narrative(self, report: ForensicReport) -> NarrativeBundle:
        lead_conclusion = report.conclusions[0] if report.conclusions else None
        lead = self._deterministic_lead(report, lead_conclusion)
        evidence_summary = self._narrative_evidence_summary(report)
        contradictions = self._collect_contradictions(report)
        unique_limitations = list(
            dict.fromkeys([item.strip() for item in report.limitations if item.strip()])
        )
        action_items = self._default_action_items(report, contradictions, unique_limitations)
        deterministic_result_keys = [item.key for item in report.results if not item.interpretive_opinion]
        lead_evidence_ids = lead_conclusion.evidence_ids if lead_conclusion else []

        sections = [
            NarrativeSection(
                key="bottom_line",
                title="结论先看",
                summary=lead,
                detail=self._ensure_min_length(
                    self._bottom_line_detail(report, lead_conclusion),
                    minimum=120,
                    additions=[
                        "阅读时应把它理解为一条已经过结构化整理的判断，而不是孤立数字的自动宣告。",
                        "如果后续证据与这里的主线不一致，应优先回到证据锚点和原文上下文复核。 ",
                    ],
                ),
                evidence_ids=lead_evidence_ids[:5],
                result_keys=deterministic_result_keys[:2],
                default_expanded=True,
            ),
            NarrativeSection(
                key="evidence_chain",
                title="证据链",
                summary=evidence_summary,
                detail=self._ensure_min_length(
                    self._evidence_chain_detail(report),
                    minimum=120,
                    additions=[
                        "如果你只想先抓重点，应优先看最前面的核心证据和与它相连的结论键。",
                        "其余支持性证据主要用来说明这一判断是否稳定、是否存在题材或流程上的干扰。 ",
                    ],
                ),
                evidence_ids=[item.evidence_id for item in report.evidence_items[:8]],
                result_keys=deterministic_result_keys[:4],
                default_expanded=True,
            ),
            NarrativeSection(
                key="conflicts",
                title="矛盾信号",
                summary="存在需要重点复核的冲突信号。" if contradictions else "当前未发现显著冲突信号。",
                detail=self._ensure_min_length(
                    self._conflict_detail(report, contradictions),
                    minimum=120,
                    additions=[
                        "冲突并不自动推翻主结论，但会降低结论可直接外推的范围。",
                        "因此最稳妥的做法是把这些冲突文本单独拆出来，再做一次对照阅读。 ",
                    ],
                ),
                evidence_ids=[],
                result_keys=[],
                default_expanded=False,
            ),
            NarrativeSection(
                key="limitations",
                title="限制与风险",
                summary="存在需要谨慎解读的限制项。" if unique_limitations else "当前未记录额外限制项。",
                detail=self._ensure_min_length(
                    self._limitations_detail(report, unique_limitations),
                    minimum=120,
                    additions=[
                        "这些限制不会让报告失效，但会影响哪些判断可以说得更稳，哪些判断只能当作线索。",
                        "因此页面中的分级和颜色只代表当前证据状态，不等于统计学意义上的绝对概率。 ",
                    ],
                ),
                evidence_ids=[],
                result_keys=[],
                default_expanded=False,
            ),
            NarrativeSection(
                key="next_actions",
                title="下一步建议",
                summary="建议按优先级执行以下复核动作。",
                detail=self._ensure_min_length(
                    self._next_actions_detail(action_items),
                    minimum=120,
                    additions=[
                        "如果时间有限，优先处理与主结论直接相关的那一两条证据，而不是平均浏览所有卡片。",
                        "只有在核心证据被确认稳定后，再去看画像、聚类和异常样本会更有效。 ",
                    ],
                ),
                evidence_ids=lead_evidence_ids[:3],
                result_keys=deterministic_result_keys[:2],
                default_expanded=False,
            ),
        ]

        return NarrativeBundle(
            version="v1",
            lead=lead,
            sections=sections,
            action_items=action_items,
            contradictions=contradictions,
        )

    def _collect_contradictions(self, report: ForensicReport) -> list[str]:
        contradictions: list[str] = []
        has_support = any(
            conclusion.grade in {ConclusionGrade.STRONG_SUPPORT, ConclusionGrade.MODERATE_SUPPORT}
            for conclusion in report.conclusions
        )
        has_against = any(
            conclusion.grade in {ConclusionGrade.STRONG_AGAINST, ConclusionGrade.MODERATE_AGAINST}
            for conclusion in report.conclusions
        )
        if has_support and has_against:
            contradictions.append("不同任务子结论方向不一致，需按任务边界分别解释。")

        for conclusion in report.conclusions:
            contradictions.extend(
                item.strip()
                for item in conclusion.counter_evidence
                if item.strip()
            )
        deduped = list(dict.fromkeys(contradictions))
        return deduped[:8]

    def _default_action_items(
        self,
        report: ForensicReport,
        contradictions: list[str],
        limitations: list[str],
    ) -> list[str]:
        items: list[str] = []
        if report.evidence_items:
            items.append(f"先复核 {report.evidence_items[0].evidence_id} 对应原文上下文与来源链路。")
        if report.cluster_view and report.cluster_view.excluded_text_ids:
            items.append("为长度不足样本补充上下文后，重新执行聚类并复核簇边界。")
        if contradictions:
            items.append("对矛盾信号涉及的文本对做逐条人工复审，避免只看聚合分数。")
        if limitations:
            items.append("按限制项补充跨题材与跨时段样本，再做二次比对。")
        if report.request.task == TaskType.SOCKPUPPET:
            items.append("将文本结论与时序行为、互动网络联合复核，避免单模态误判。")
        if not items:
            items.append("当前证据较少，建议补充样本后再执行全量分析。")
        return list(dict.fromkeys(items))

    def _deterministic_lead(
        self,
        report: ForensicReport,
        lead_conclusion: ReportConclusion | None,
    ) -> str:
        task_label = report.request.task.value
        if lead_conclusion is None:
            return self._ensure_min_length(
                f"当前这份 {task_label} 报告尚未形成稳定主结论，但页面仍会保留已抽取到的画像、聚类和异常线索，供人工先做方向性筛查。",
                minimum=80,
                additions=[
                    "这通常意味着样本量、任务边界或证据强度还不够，暂时不宜把结果当成明确归因判断。",
                ],
            )
        return self._ensure_min_length(
            " ".join(
                [
                    lead_conclusion.statement,
                    f"当前任务是 {task_label}，共纳入 {len(report.request.texts)} 条文本样本。",
                    self._lead_supporting_clause(report),
                    self._lead_caveat_clause(report),
                ]
            ),
            minimum=80,
            additions=[
                "因此页面首屏会优先展示主结论、核心证据和需要谨慎处理的边界条件。",
            ],
        )

    def _lead_supporting_clause(self, report: ForensicReport) -> str:
        if report.evidence_items:
            core = next(
                (item for item in report.evidence_items if item.strength == "core"),
                report.evidence_items[0],
            )
            return f"当前最强的支撑线索来自 {core.evidence_id}，它主要说明：{core.finding or core.summary}"
        if report.writing_profiles:
            return f"目前最稳定的可读信号来自写作画像：{report.writing_profiles[0].headline}"
        return "当前最可靠的线索来自结构化结论本身。"

    def _lead_caveat_clause(self, report: ForensicReport) -> str:
        if report.limitations:
            return f"需要注意的是，{report.limitations[0]}"
        if report.conclusions and report.conclusions[0].counter_evidence:
            return f"反向信号主要集中在：{report.conclusions[0].counter_evidence[0]}"
        return "当前没有额外限制项主导解释，但仍应结合题材与样本边界理解。"

    def _bottom_line_detail(
        self,
        report: ForensicReport,
        lead_conclusion: ReportConclusion | None,
    ) -> str:
        if lead_conclusion is None:
            return "当前没有可直接引用的主结论，因此这份报告更适合当作线索索引使用。你可以先看画像、聚类和异常样本，判断接下来应该补哪些样本、拆哪些文本、优先复核哪些证据。"
        score_label = (
            f"{lead_conclusion.score_type or 'score'}={lead_conclusion.score:.2f}"
            if lead_conclusion.score is not None
            else "当前未输出可读分数"
        )
        return (
            f"主结论对应任务 {lead_conclusion.task.value}，分级为 {lead_conclusion.grade.value}，"
            f"当前记录的主分数为 {score_label}。"
            f" 这一判断不是来自单一指标，而是把证据条目、画像与冲突信息合并后得到的稳定主线。"
            f" 如果你要向非专业读者复述，最安全的说法就是：{lead_conclusion.statement}"
        )

    def _narrative_evidence_summary(self, report: ForensicReport) -> str:
        if not report.evidence_items:
            return "当前没有可展示的证据条目，建议先补足样本或重新运行分析。"
        core_count = sum(1 for item in report.evidence_items if item.strength == "core")
        conflict_count = sum(1 for item in report.evidence_items if item.strength == "conflicting")
        return (
            f"当前共整理出 {len(report.evidence_items)} 条证据，其中 {core_count} 条为核心证据，"
            f"{conflict_count} 条偏向冲突或反证，剩余条目主要用于补充画像和分组解释。"
        )

    def _evidence_chain_detail(self, report: ForensicReport) -> str:
        if not report.evidence_items:
            return "报告中还没有可展开的证据链，因此现阶段不宜对作者、分组或过程线索作更多推断。"
        lines = []
        for item in report.evidence_items[:4]:
            lines.append(
                f"{item.evidence_id} 主要说明 {item.finding or item.summary}，"
                f"之所以重要，是因为 {item.why_it_matters or item.summary}"
            )
            if item.counter_readings:
                lines.append(f"需要同步留意的反向解释是：{item.counter_readings[0]}")
        return " ".join(lines)

    def _conflict_detail(self, report: ForensicReport, contradictions: list[str]) -> str:
        if contradictions:
            return "；".join(contradictions[:6])
        if report.anomaly_samples:
            sample = report.anomaly_samples[0]
            return (
                f"当前未发现显著的结构化结论冲突，但样本 {sample.text_id} 在 "
                f"{', '.join(list(sample.outlier_dimensions)[:3])} 上表现出离群波动，"
                "这类异常文本可能会拉大局部指标差异，值得从原文层面单独复核。"
            )
        return "当前没有发现会直接扭转主结论方向的冲突信号，说明主要证据之间至少不存在明显对冲。"

    def _limitations_detail(
        self,
        report: ForensicReport,
        unique_limitations: list[str],
    ) -> str:
        if unique_limitations:
            return "；".join(unique_limitations[:6])
        return (
            f"当前报告未单独记录新的限制项，但这并不意味着结果可以脱离任务边界外推。"
            f" 像 {report.request.task.value} 这类结论仍然依赖当前样本覆盖范围、题材一致性和文本长度门槛。"
        )

    def _next_actions_detail(self, action_items: list[str]) -> str:
        if not action_items:
            return "当前没有自动生成的后续动作，通常意味着应先补样本，再重新运行全量分析。"
        return "\n".join(f"- {item}" for item in action_items[:6])

    def _preview_text(self, content: str, limit: int = 84) -> str:
        normalized = " ".join(content.split())
        if len(normalized) <= limit:
            return normalized
        return f"{normalized[:limit].rstrip()}..."

    def _profiling_result_body(self, profiles: list[WritingProfile]) -> str:
        if not profiles:
            return "当前没有生成可展示的主体画像。"
        chunks: list[str] = []
        for profile in profiles:
            habits = "；".join(profile.stable_habits[:2]) if profile.stable_habits else "暂无稳定习惯"
            clues = "；".join(profile.process_clues[:2]) if profile.process_clues else "暂无足够过程线索"
            chunks.append(
                "\n".join(
                    [
                        f"{profile.subject}｜{profile.headline or '写作画像'}",
                        profile.observable_summary or profile.summary,
                        f"稳定习惯：{habits}",
                        f"过程线索：{clues}",
                    ]
                )
            )
        return "\n\n".join(chunks)

    def _clustering_result_body(
        self,
        cluster_view: ClusterView | None,
        dropped_ids: list[str],
    ) -> str:
        if cluster_view is None or not cluster_view.clusters:
            return "当前没有形成可解释的聚类结构。"
        lines: list[str] = []
        for cluster in cluster_view.clusters:
            lines.append(
                "\n".join(
                    [
                        f"{cluster.label}：{', '.join(cluster.member_aliases)}",
                        cluster.theme_summary,
                        f"区分点：{cluster.separation_summary}",
                    ]
                )
            )
        if dropped_ids:
            lines.append(f"排除样本：{', '.join(dropped_ids)}")
        return "\n\n".join(lines)

    def _clustering_finding(self, cluster_view: ClusterView | None) -> str:
        if cluster_view is None or not cluster_view.clusters:
            return "当前样本不足以形成可解释的聚类结果。"
        if len(cluster_view.clusters) == 1:
            cluster = cluster_view.clusters[0]
            return (
                f"当前样本主要落在同一类写法中，主导簇是 {cluster.label}。"
            )
        labels = "、".join(cluster.label for cluster in cluster_view.clusters[:3])
        return (
            f"当前样本被拆成 {len(cluster_view.clusters)} 个候选风格簇，前排分组包括 {labels}。"
        )

    def _profile_headline(self, profile: _Profile, texts: list[str]) -> str:
        if profile.code_switching_ratio > 0.1:
            return "中英混写、术语密集的分析写法"
        if profile.formality_score > 0.62 and profile.avg_sentence_length > 22:
            return "正式度较高、句子展开充分的长篇分析写法"
        if profile.avg_sentence_length < 14:
            return "短句快评式写法"
        if texts and any(sum(ch.isdigit() for ch in text) > 10 for text in texts):
            return "数据与产品信息密集的说明式写法"
        return "风格稳定、节律清晰的评论分析写法"

    def _profile_observable_sentence(self, profile: _Profile) -> str:
        sentence_style = (
            "句子通常较长，倾向连续展开背景、判断和补充说明。"
            if profile.avg_sentence_length >= 22
            else "句子长度相对克制，更偏向直接下判断或快速补充事实。"
        )
        register = (
            "整体语体偏正式，较少出现随意口语化跳转。"
            if profile.formality_score >= 0.58
            else "整体语体较灵活，在说明和评论之间切换更频繁。"
        )
        switch = (
            "同时能观察到较明显的中英术语或技术词切换。"
            if profile.code_switching_ratio >= 0.08
            else "语言切换不算突出，主要还是稳定在单一书写通道内。"
        )
        return f"{sentence_style}{register}{switch}"

    def _profile_stable_habits(self, profile: _Profile) -> list[str]:
        habits: list[str] = []
        if profile.avg_sentence_length >= 22:
            habits.append("偏好用较长句把背景、判断和补充说明串联在一起。")
        else:
            habits.append("更常使用短到中等长度的句子，判断点落得比较直接。")
        if profile.formality_score >= 0.58:
            habits.append("正式度较高，措辞更像说明、分析或复盘文档。")
        else:
            habits.append("语体更灵活，说明和评论会在同一段内来回切换。")
        if profile.code_switching_ratio >= 0.08:
            habits.append("中英技术词或产品名切换较频繁，容易形成行业内部写法。")
        else:
            habits.append("语言切换较少，整体更像单通道中文表述。")
        return habits[:3]

    def _profile_process_clues(self, profile: _Profile) -> list[str]:
        clues: list[str] = [
            "这些线索只用于帮助理解写作过程或编辑习惯，不单独参与归因判断。"
        ]
        if profile.code_switching_ratio >= 0.1:
            clues.append("术语切换较多，可能存在资料整合、产品资料引用或面向行业读者写作的痕迹。")
        if profile.sentence_variance >= 20:
            clues.append("句长波动偏大，可能经历过段落级重写、拼接或不同写作目标之间的切换。")
        if profile.formality_score <= 0.42:
            clues.append("正式度偏低，说明其写作过程中更可能先压缩信息，再追加观点判断。")
        return clues[:3]

    def _profile_anomalies(self, profile: _Profile) -> list[str]:
        anomalies: list[str] = []
        if profile.text_count < 2:
            anomalies.append("当前主体样本数偏少，局部题材差异可能会被放大。")
        if profile.token_count < 160:
            anomalies.append("累计文本长度有限，稳定习惯和偶发波动尚未完全拉开。")
        if profile.code_switching_ratio >= 0.15:
            anomalies.append("中英切换比例偏高，可能混入引用、译写或机器润色影响。")
        if profile.sentence_variance >= 24:
            anomalies.append("句长波动明显偏大，个别文本可能与主体主风格存在偏离。")
        return anomalies[:3]

    def _profile_confidence_note(self, profile: _Profile) -> str:
        confidence = "较稳" if profile.text_count >= 3 and profile.token_count >= 300 else "中等"
        return (
            f"这份画像目前属于{confidence}层级，依据是 {profile.text_count} 条样本、约 "
            f"{profile.token_count} 个词元，以及句长、语体和语言切换信号已经出现重复。"
        )

    def _profile_summary_for_cluster(
        self,
        report: ForensicReport,
        member_ids: list[str],
        text_map: dict[str, str],
    ) -> dict[str, Any]:
        contents = [text_map.get(text_id, "") for text_id in member_ids]
        avg_len = mean([len(content) for content in contents]) if contents else 0.0
        avg_ascii = mean([_ascii_ratio(content) for content in contents]) if contents else 0.0
        avg_digits = mean([_digit_ratio(content) for content in contents]) if contents else 0.0
        label = "评论分析组"
        if avg_digits >= 0.05 and avg_len >= 180:
            label = "数据密集分析组"
        elif avg_ascii >= 0.1:
            label = "中英混写技术组"
        elif avg_len < 90:
            label = "短评快讯组"
        elif avg_len >= 180:
            label = "长篇说明组"
        markers = [
            "篇幅较长" if avg_len >= 160 else "篇幅偏短",
            "数字/产品信息密集" if avg_digits >= 0.05 else "数字信息占比有限",
            "中英术语切换明显" if avg_ascii >= 0.1 else "语言切换较少",
        ]
        theme_summary = self._ensure_min_length(
            f"这一簇当前包含 {len(member_ids)} 条文本，整体更像 {label}："
            f"{'；'.join(markers[:2])}，代表片段在叙述方式和信息组织上保持相近节律。",
            minimum=80,
            additions=[
                "把它理解成同一批写法或同一种表达任务会更稳，而不是直接理解成同一作者。",
            ],
        )
        separation_summary = (
            f"与其他簇相比，这一组最显著的差异在于 {markers[0]}，并且 {markers[1]}。"
        )
        confidence_note = (
            "这组解释主要基于成员数、篇幅和内容表面风格得出；若后续补入更多样本，簇边界仍可能移动。"
        )
        return {
            "label": label,
            "theme_summary": theme_summary,
            "separation_summary": separation_summary,
            "top_markers": markers,
            "confidence_note": confidence_note,
        }

    def _infer_evidence_finding(self, item: EvidenceItem) -> str:
        if item.summary:
            return item.summary
        return f"{item.evidence_id} 提供了一条需要结合上下文解释的结构化证据。"

    def _infer_evidence_importance(self, item: EvidenceItem) -> str:
        if item.linked_conclusion_keys:
            return f"它直接支撑结论键 {', '.join(item.linked_conclusion_keys)} 的解释。"
        return "它主要用于补足当前报告中的证据链和人工复核入口。"

    def _infer_evidence_strength(self, item: EvidenceItem) -> str:
        if any("counter" in reading or "差异" in reading for reading in item.counter_readings):
            return "conflicting"
        if any(key in {"verification", "sockpuppet"} for key in item.linked_conclusion_keys):
            return "core"
        return "supporting"

    def _ensure_min_length(
        self,
        text: str,
        *,
        minimum: int,
        additions: list[str],
    ) -> str:
        normalized = " ".join(text.split()).strip()
        for extra in additions:
            if len(normalized) >= minimum:
                break
            normalized = f"{normalized} {extra}".strip()
        return normalized

    def _deterministic_summary(self, report: ForensicReport) -> str:
        if not report.conclusions:
            return (
                f"本次 {report.request.task.value} 分析尚未形成稳定主结论，"
                "但页面仍保留了画像、聚类和异常线索，供人工先做方向性复核。"
            )
        top = report.conclusions[0]
        return (
            f"本次分析共生成 {len(report.conclusions)} 条结构化结论。"
            f" 当前优先级最高的判断是：{top.statement}"
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

    def refresh_report_hash(self, report: ForensicReport) -> None:
        self._finalize_reproducibility(report)

    def _add_evidence(
        self,
        report: ForensicReport,
        *,
        label: str,
        summary: str,
        finding: str = "",
        why_it_matters: str = "",
        counter_readings: list[str] | None = None,
        strength: str = "supporting",
        linked_conclusion_keys: list[str] | None = None,
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
                finding=finding.strip(),
                why_it_matters=why_it_matters.strip(),
                counter_readings=[
                    item.strip()
                    for item in (counter_readings or [])
                    if item and item.strip()
                ][:3],
                strength=strength if strength in {"core", "supporting", "conflicting"} else "supporting",
                linked_conclusion_keys=[
                    item.strip()
                    for item in (linked_conclusion_keys or [])
                    if item and item.strip()
                ],
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

    def _writing_profile_from_profile(
        self,
        profile: _Profile,
        *,
        texts: list[Any] | None = None,
        existing: WritingProfile | None = None,
    ) -> WritingProfile:
        text_ids = [text.id for text in texts or []] or list(profile.text_ids)
        preview_texts = [text.content for text in texts or []]
        headline = self._profile_headline(profile, preview_texts)
        stable_habits = self._profile_stable_habits(profile)
        process_clues = self._profile_process_clues(profile)
        anomalies = self._profile_anomalies(profile)
        confidence_note = self._profile_confidence_note(profile)
        observable_summary = self._ensure_min_length(
            " ".join(
                [
                    f"{profile.label} 共有 {profile.text_count} 条样本，累计约 {profile.token_count} 个词元，"
                    f"整体呈现 {headline} 的主导风格。",
                    self._profile_observable_sentence(profile),
                    "这些信号说明其写法并不是随机波动，而是有一套相对稳定的句长节律、语体选择和标点收束方式。",
                ]
            ),
            minimum=120,
            additions=[
                "从可直接观察的层面看，最稳定的线索集中在用词密度、句子展开方式和语言切换习惯。",
                "因此这份画像更适合拿来解释写法特征、识别异常段落和辅助人工复核，而不是独立下作者归因结论。",
            ],
        )
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
            summary=(
                existing.summary
                if existing and existing.summary.strip()
                else f"{profile.label} 的画像以可观察风格习惯为主，并将过程线索单独标注为辅助解读信息。"
            ),
            headline=existing.headline if existing and existing.headline.strip() else headline,
            observable_summary=(
                existing.observable_summary
                if existing and existing.observable_summary.strip()
                else observable_summary
            ),
            stable_habits=existing.stable_habits if existing and existing.stable_habits else stable_habits,
            process_clues=(
                existing.process_clues if existing and existing.process_clues else process_clues
            ),
            anomalies=existing.anomalies if existing and existing.anomalies else anomalies,
            confidence_note=(
                existing.confidence_note
                if existing and existing.confidence_note.strip()
                else confidence_note
            ),
            representative_text_ids=(
                existing.representative_text_ids
                if existing and existing.representative_text_ids
                else text_ids[:4]
            ),
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

    def _writing_profile_from_texts(
        self,
        *,
        subject: str,
        texts: list[Any],
        existing: WritingProfile | None = None,
    ) -> WritingProfile:
        profile = _Profile(
            label=subject,
            text_ids=[text.id for text in texts],
            text_count=len(texts),
            token_count=sum(len(text.content.split()) for text in texts),
            cjk_chars=sum(_count_cjk_chars(text.content) for text in texts),
            content="\n".join(text.content for text in texts),
            char_ngrams={},
            function_words={},
            punctuation={},
            pos={},
            embedding=None,
            avg_sentence_length=mean(
                [_avg_sentence_length(text.content) for text in texts]
            ) if texts else 0.0,
            sentence_variance=mean(
                [_sentence_variance(text.content) for text in texts]
            ) if texts else 0.0,
            formality_score=mean(
                [_heuristic_formality(text.content) for text in texts]
            ) if texts else 0.0,
            code_switching_ratio=mean(
                [_ascii_ratio(text.content) for text in texts]
            ) if texts else 0.0,
        )
        return self._writing_profile_from_profile(profile, texts=texts, existing=existing)

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


def _sentence_lengths(text: str) -> list[int]:
    parts = [part.strip() for part in re.split(r"[。！？!?；;]+", text) if part.strip()]
    if not parts:
        return [len(text.strip())] if text.strip() else []
    return [len(part) for part in parts]


def _avg_sentence_length(text: str) -> float:
    lengths = _sentence_lengths(text)
    return mean(lengths) if lengths else 0.0


def _sentence_variance(text: str) -> float:
    lengths = _sentence_lengths(text)
    if len(lengths) <= 1:
        return 0.0
    avg = mean(lengths)
    return mean([(length - avg) ** 2 for length in lengths])


def _ascii_ratio(text: str) -> float:
    normalized = [char for char in text if not char.isspace()]
    if not normalized:
        return 0.0
    return sum(1 for char in normalized if char.isascii() and char.isalpha()) / len(normalized)


def _digit_ratio(text: str) -> float:
    normalized = [char for char in text if not char.isspace()]
    if not normalized:
        return 0.0
    return sum(1 for char in normalized if char.isdigit()) / len(normalized)


def _heuristic_formality(text: str) -> float:
    normalized = " ".join(text.split())
    if not normalized:
        return 0.0
    formal_markers = ["因此", "此外", "需要", "建议", "分析", "结构", "策略"]
    informal_markers = ["感觉", "真的", "就是", "有点", "哈哈", "吧"]
    score = 0.45
    score += 0.04 * sum(marker in normalized for marker in formal_markers)
    score -= 0.05 * sum(marker in normalized for marker in informal_markers)
    score += min(0.12, _avg_sentence_length(normalized) / 240)
    score -= min(0.1, normalized.count("!") * 0.03)
    return max(0.0, min(1.0, score))
