"""Computational Linguistics Agent -- pattern detection and similarity analysis."""

from __future__ import annotations

import json
import logging
from typing import Any

import numpy as np

from text.ingest.schema import AgentFinding, AgentReport, FeatureVector

from .stylometry import _call_llm, _fmt_dict, _parse_findings

logger = logging.getLogger(__name__)

_DEFAULT_MODEL = "claude-sonnet-4-20250514"

# sklearn is an optional heavy dependency; degrade gracefully.
try:
    from sklearn.cluster import DBSCAN
    from sklearn.metrics.pairwise import cosine_similarity

    _HAS_SKLEARN = True
except ImportError:  # pragma: no cover
    _HAS_SKLEARN = False
    logger.warning("scikit-learn not available; clustering and similarity features disabled")


class ComputationalAgent:
    """Detects statistical patterns, computes similarities, and clusters texts."""

    SYSTEM_PROMPT = """\
You are a computational linguist specializing in quantitative text analysis, \
authorship attribution, and forensic text comparison. You combine deep expertise \
in statistical NLP with an ability to interpret numerical patterns in human terms.

You will receive both raw feature data AND pre-computed statistical summaries \
(similarity matrices, clustering results, anomaly scores). Your job is to \
interpret these results and draw forensic conclusions.

Your analytical framework covers the following dimensions:

1. **Semantic Similarity Analysis**
   - Cosine similarity between text embeddings captures deep semantic relatedness \
beyond surface-level vocabulary overlap.
   - Similarity above 0.85 between texts by supposedly different authors is a strong \
indicator of same authorship or heavy copying.
   - Similarity below 0.5 between texts by the same claimed author warrants \
investigation -- it may indicate ghost-writing, collaboration, or topic shift.
   - Consider the context: same-topic texts naturally have higher similarity; \
cross-topic comparison requires adjusted thresholds.

2. **Topic Distribution Analysis**
   - Topic vectors capture thematic focus. Similar topic distributions between \
authors suggest shared interests or copied content.
   - Unusual topic concentration (one dominant topic vs. diverse spread) reveals \
writing purpose and breadth.
   - Cross-sample topic drift may indicate temporal changes or different authors.

3. **Anomaly Detection**
   - Feature vectors that deviate significantly from the group norm (measured by \
z-scores or isolation metrics) may indicate: different authorship, deliberate \
style disguise, genre mismatch, or data quality issues.
   - Statistical outliers in specific feature dimensions are more informative than \
global outlier scores.
   - Multi-dimensional anomalies (simultaneous deviations across many features) \
are stronger signals than single-dimension deviations.

4. **Clustering Analysis**
   - DBSCAN clustering on feature vectors can reveal natural author groupings \
without requiring a pre-specified number of clusters.
   - Texts that cluster together share a statistical writing fingerprint. Texts \
assigned to noise (label -1) are anomalous and merit individual investigation.
   - Cluster composition relative to claimed authorship is a powerful attribution signal.

5. **Statistical Outlier Identification**
   - For each feature dimension, identify values that fall outside 2 standard \
deviations from the group mean.
   - Particularly informative dimensions include: type-token ratio, Yule's K, \
sentence length variance, function word frequencies, and punctuation profiles.
   - Consistent outlier status across multiple dimensions is a strong indicator \
of distinct authorship.

6. **Cross-Validation of Computational Results**
   - Triangulate findings across multiple methods. A same-author conclusion is \
strongest when supported by high cosine similarity AND cluster co-membership \
AND no anomaly detection flags.
   - Conflicting signals (e.g., high similarity but different clusters) should be \
explicitly flagged and interpreted.

**Output Requirements:**
Provide your analysis as a JSON array of finding objects. Each finding must have:
- "category": one of "semantic_similarity", "topic_analysis", "anomaly_detection", \
"clustering", "statistical_outliers", "cross_validation"
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
        """Run computational analysis, then send results to LLM for interpretation."""
        # Phase 1: compute statistical summaries locally.
        comp_results = self._compute_statistics(features)

        # Phase 2: build prompt with both raw features and computed results.
        user_prompt = self._build_prompt(features, task_context, comp_results)

        try:
            raw_response = await _call_llm(
                self.SYSTEM_PROMPT, user_prompt, self.model,
                api_base=self.api_base, api_key=self.api_key,
            )
        except Exception:
            logger.exception("ComputationalAgent LLM call failed")
            return AgentReport(
                agent_name="computational",
                discipline="computational_linguistics",
                summary="由于 LLM 调用失败，分析未完成。",
            )

        findings = _parse_findings(raw_response, discipline="computational_linguistics")

        # Augment with purely computational findings that don't need LLM.
        findings.extend(comp_results.get("auto_findings", []))

        summary = self._build_summary(findings)

        return AgentReport(
            agent_name="computational",
            discipline="computational_linguistics",
            findings=findings,
            summary=summary,
            raw_llm_response=raw_response,
        )

    # ------------------------------------------------------------------
    # Local computation (no LLM needed)
    # ------------------------------------------------------------------

    def _compute_statistics(
        self,
        features: list[FeatureVector],
    ) -> dict[str, Any]:
        """Pre-compute similarity, clustering, and anomaly data."""
        results: dict[str, Any] = {
            "auto_findings": [],
            "similarity_matrix": None,
            "cluster_labels": None,
            "outlier_dims": {},
        }

        if len(features) < 2:
            return results

        # --- Embedding-based similarity ---
        embeddings = [fv.nlp_features.embedding for fv in features]
        has_embeddings = all(len(e) > 0 for e in embeddings)

        if has_embeddings and _HAS_SKLEARN:
            emb_matrix = np.array(embeddings)
            sim_matrix = cosine_similarity(emb_matrix)
            results["similarity_matrix"] = sim_matrix

            # Flag high cross-author similarity pairs.
            text_ids = [fv.text_id for fv in features]
            for i in range(len(features)):
                for j in range(i + 1, len(features)):
                    sim = float(sim_matrix[i][j])
                    if sim > 0.85:
                        results["auto_findings"].append(
                            AgentFinding(
                                discipline="computational_linguistics",
                                category="semantic_similarity",
                                description=(
                                    f"Very high semantic similarity ({sim:.3f}) detected "
                                    f"between texts '{text_ids[i]}' and '{text_ids[j]}'. "
                                    f"This exceeds the 0.85 threshold commonly used in "
                                    f"authorship attribution and warrants further investigation."
                                ),
                                confidence=min(0.9, sim),
                                evidence=[
                                    f"cosine_similarity({text_ids[i]}, {text_ids[j]}) = {sim:.4f}"
                                ],
                            )
                        )

        # --- Clustering ---
        if has_embeddings and _HAS_SKLEARN and len(features) >= 3:
            try:
                emb_matrix = np.array(embeddings)
                clustering = DBSCAN(eps=0.3, min_samples=2, metric="cosine").fit(emb_matrix)
                results["cluster_labels"] = clustering.labels_.tolist()
            except Exception:
                logger.warning("DBSCAN clustering failed", exc_info=True)

        # --- Feature-level outlier detection ---
        scalar_features = self._extract_scalar_features(features)
        if scalar_features and len(features) >= 3:
            feature_matrix = np.array(
                [[sf[k] for k in sorted(scalar_features[0])] for sf in scalar_features]
            )
            means = feature_matrix.mean(axis=0)
            stds = feature_matrix.std(axis=0)
            # Avoid division by zero for constant features.
            stds[stds == 0] = 1.0

            z_scores = np.abs((feature_matrix - means) / stds)
            dim_names = sorted(scalar_features[0])

            outlier_dims: dict[str, list[tuple[str, float]]] = {}
            for sample_idx in range(len(features)):
                for dim_idx, dim_name in enumerate(dim_names):
                    if z_scores[sample_idx][dim_idx] > 2.0:
                        outlier_dims.setdefault(features[sample_idx].text_id, []).append(
                            (dim_name, float(z_scores[sample_idx][dim_idx]))
                        )
            results["outlier_dims"] = outlier_dims

        return results

    def _extract_scalar_features(
        self,
        features: list[FeatureVector],
    ) -> list[dict[str, float]]:
        """Pull all scalar numeric features into flat dicts for matrix ops."""
        rows: list[dict[str, float]] = []
        for fv in features:
            r = fv.rust_features
            n = fv.nlp_features
            row: dict[str, float] = {
                "type_token_ratio": r.type_token_ratio,
                "hapax_legomena_ratio": r.hapax_legomena_ratio,
                "yules_k": r.yules_k,
                "avg_word_length": r.avg_word_length,
                "avg_sentence_length": r.avg_sentence_length,
                "sentence_length_variance": r.sentence_length_variance,
                "cjk_ratio": r.cjk_ratio,
                "emoji_density": r.emoji_density,
                "formality_score": r.formality_score,
                "code_switching_ratio": r.code_switching_ratio,
                "clause_depth_avg": n.clause_depth_avg,
                "sentiment_valence": n.sentiment_valence,
                "emotional_tone": n.emotional_tone,
                "cognitive_complexity": n.cognitive_complexity,
            }
            rows.append(row)
        return rows

    # ------------------------------------------------------------------
    # Prompt construction
    # ------------------------------------------------------------------

    def _build_prompt(
        self,
        features: list[FeatureVector],
        task_context: str,
        comp_results: dict[str, Any],
    ) -> str:
        sections: list[str] = [
            f"## Task Context\n{task_context}",
            f"## Number of Text Samples: {len(features)}",
        ]

        # Per-sample feature summaries.
        for i, fv in enumerate(features, 1):
            rust = fv.rust_features
            nlp = fv.nlp_features

            block = (
                f"### Sample {i} (id={fv.text_id})\n"
                f"**Core Metrics:**\n"
                f"- TTR: {rust.type_token_ratio:.4f}  |  Yule's K: {rust.yules_k:.2f}\n"
                f"- Avg sentence length: {rust.avg_sentence_length:.2f}  "
                f"|  Variance: {rust.sentence_length_variance:.2f}\n"
                f"- Formality: {rust.formality_score:.4f}  "
                f"|  CJK ratio: {rust.cjk_ratio:.4f}\n"
                f"- Sentiment: {nlp.sentiment_valence:.4f}  "
                f"|  Cognitive complexity: {nlp.cognitive_complexity:.4f}\n\n"
                f"**Topic Distribution:**\n"
                f"  {_fmt_topic_vector(nlp.topic_distribution)}\n"
            )
            sections.append(block)

        # Similarity matrix.
        sim_matrix = comp_results.get("similarity_matrix")
        if sim_matrix is not None:
            ids = [fv.text_id for fv in features]
            lines = ["## Pairwise Cosine Similarity Matrix"]
            header = "       " + "  ".join(f"{tid[:8]:>8}" for tid in ids)
            lines.append(header)
            for i, tid in enumerate(ids):
                row_vals = "  ".join(f"{sim_matrix[i][j]:8.4f}" for j in range(len(ids)))
                lines.append(f"{tid[:8]:>8}  {row_vals}")
            sections.append("\n".join(lines))

        # Cluster labels.
        cluster_labels = comp_results.get("cluster_labels")
        if cluster_labels is not None:
            ids = [fv.text_id for fv in features]
            cluster_info = ", ".join(
                f"{tid}: cluster {lbl}" for tid, lbl in zip(ids, cluster_labels)
            )
            sections.append(f"## DBSCAN Clustering Results\n{cluster_info}")

        # Outlier dimensions.
        outlier_dims = comp_results.get("outlier_dims", {})
        if outlier_dims:
            lines = ["## Feature-Level Outliers (|z| > 2.0)"]
            for tid, dims in outlier_dims.items():
                dim_str = ", ".join(f"{name} (z={z:.2f})" for name, z in dims)
                lines.append(f"- {tid}: {dim_str}")
            sections.append("\n".join(lines))

        sections.append(
            "Interpret the computational results above in forensic context. "
            "Identify authorship signals, anomalies, and pattern clusters. "
            "Return your findings as a JSON array."
        )
        return "\n\n".join(sections)

    def _build_summary(self, findings: list[AgentFinding]) -> str:
        if not findings:
            return "计算语言学分析未产生任何发现。"
        high = [f for f in findings if f.confidence >= 0.7]
        return (
            f"计算语言学分析产出 {len(findings)} 项发现"
            f"（{len(high)} 项高置信度）。"
            f"涵盖类别：{', '.join(sorted({f.category for f in findings}))}。"
        )


def _fmt_topic_vector(topics: list[float], top_n: int = 10) -> str:
    """Format topic distribution for prompt."""
    if not topics:
        return "(no topic data)"
    indexed = sorted(enumerate(topics), key=lambda x: x[1], reverse=True)[:top_n]
    return ", ".join(f"topic_{idx}: {val:.4f}" for idx, val in indexed)
