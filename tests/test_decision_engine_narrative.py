from __future__ import annotations

from text.decision.engine import DecisionEngine
from text.ingest.schema import (
    AnalysisRequest,
    FeatureVector,
    NlpFeatures,
    RustFeatures,
    TaskParams,
    TaskType,
    TextEntry,
)


def _long_text(seed: str) -> str:
    return (seed * 220)[:360]


def _feature(text_id: str, token_count: int, emb: list[float]) -> FeatureVector:
    return FeatureVector(
        text_id=text_id,
        content_hash=f"hash-{text_id}",
        rust_features=RustFeatures(
            token_count=token_count,
            type_token_ratio=0.4,
            yules_k=80,
            avg_sentence_length=22,
            sentence_length_variance=12,
            char_ngrams={"测试": 3.0, "文本": 2.0},
            function_word_freq={"的": 0.1, "了": 0.05},
            punctuation_profile={"，": 0.2, "。": 0.2},
            formality_score=0.52,
            code_switching_ratio=0.02,
        ),
        nlp_features=NlpFeatures(
            pos_tag_distribution={"NOUN": 0.4, "VERB": 0.2},
            clause_depth_avg=2.1,
            sentiment_valence=0.1,
            embedding=emb,
        ),
    )


def test_decision_engine_builds_alias_cluster_view_and_narrative() -> None:
    request = AnalysisRequest(
        texts=[
            TextEntry(id="txt-1", author="alice", content=_long_text("甲")),
            TextEntry(id="txt-2", author="bob", content=_long_text("乙")),
            TextEntry(id="txt-3", author="alice", content=_long_text("丙")),
        ],
        task=TaskType.CLUSTERING,
        task_params=TaskParams(cluster_text_ids=["txt-1", "txt-2", "txt-3"]),
        llm_backend="demo-backend",
    )
    features = [
        _feature("txt-1", token_count=160, emb=[0.9, 0.1]),
        _feature("txt-2", token_count=158, emb=[0.88, 0.12]),
        _feature("txt-3", token_count=162, emb=[0.1, 0.9]),
    ]

    report = DecisionEngine().build_report(request, features)

    assert report.entity_aliases is not None
    assert report.entity_aliases.text_aliases[0].alias == "T01"

    assert report.cluster_view is not None
    assert report.cluster_view.clusters
    assert all(alias.startswith("T") for alias in report.cluster_view.clusters[0].member_aliases)
    assert report.cluster_view.clusters[0].theme_summary
    assert report.cluster_view.clusters[0].top_markers
    assert report.cluster_view.clusters[0].confidence_note

    clustering_result = next((item for item in report.results if item.key == "clustering_summary"), None)
    assert clustering_result is not None
    assert "txt-1" not in clustering_result.body
    assert "txt-2" not in clustering_result.body
    assert "txt-3" not in clustering_result.body
    assert "簇" not in clustering_result.body or "区分点" in clustering_result.body

    assert report.evidence_items
    assert report.evidence_items[0].finding
    assert report.evidence_items[0].why_it_matters
    assert report.evidence_items[0].linked_conclusion_keys

    assert report.narrative is not None
    assert report.narrative.version == "v1"
    assert [section.key for section in report.narrative.sections] == [
        "bottom_line",
        "evidence_chain",
        "conflicts",
        "limitations",
        "next_actions",
    ]
    assert len(report.narrative.lead) >= 80


def test_decision_engine_profiling_summary_contains_subject_narrative() -> None:
    request = AnalysisRequest(
        texts=[
            TextEntry(id="txt-1", author="alice", content=_long_text("分析")),
            TextEntry(id="txt-2", author="alice", content=_long_text("策略")),
        ],
        task=TaskType.PROFILING,
        llm_backend="demo-backend",
    )
    features = [
        _feature("txt-1", token_count=180, emb=[0.9, 0.1]),
        _feature("txt-2", token_count=176, emb=[0.91, 0.11]),
    ]

    report = DecisionEngine().build_report(request, features)

    profiling_result = next((item for item in report.results if item.key == "profiling_summary"), None)
    assert profiling_result is not None
    assert "已生成" not in profiling_result.body
    assert "稳定习惯" in profiling_result.body
    assert report.writing_profiles[0].headline
    assert report.writing_profiles[0].observable_summary
    assert report.writing_profiles[0].stable_habits
