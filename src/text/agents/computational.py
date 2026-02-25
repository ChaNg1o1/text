"""Computational Linguistics Agent -- pattern detection and similarity analysis."""

from __future__ import annotations

import logging
import re
from typing import Any

import numpy as np

from text.ingest.schema import AgentFinding, AgentReport, FeatureVector

from .stylometry import (
    MAX_AUTO_FINDINGS,
    MAX_PROMPT_SAMPLES,
    _call_llm,
    _parse_findings,
    _sample_representative,
)

logger = logging.getLogger(__name__)
_SENTENCE_RE = re.compile(r"[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$")
_TOKEN_RE = re.compile(r"\b\w+\b|[\u4e00-\u9fff]", re.UNICODE)

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
        model: str | None = None,
        api_base: str | None = None,
        api_key: str | None = None,
    ) -> None:
        self.model = model
        self.api_base = api_base
        self.api_key = api_key
        self._outlier_dims: dict[str, list[tuple[str, float]]] = {}

    @property
    def outlier_dims(self) -> dict[str, list[tuple[str, float]]]:
        """Outlier dimensions from the most recent analysis run."""
        return self._outlier_dims

    async def analyze(
        self,
        features: list[FeatureVector],
        task_context: str,
        *,
        raw_texts: list[str] | None = None,
    ) -> AgentReport:
        """Run computational analysis, then send results to LLM for interpretation."""
        # Phase 1: compute statistical summaries locally (uses ALL features).
        comp_results = self._compute_statistics(features, raw_texts=raw_texts)
        self._outlier_dims = comp_results.get("outlier_dims", {})
        model = self.model
        if not model:
            findings = comp_results.get("auto_findings", [])
            summary = (
                "未配置 LLM 模型，仅返回本地计算发现。"
                if findings
                else "未配置 LLM 模型，且本地计算未产生额外发现。"
            )
            return AgentReport(
                agent_name="computational",
                discipline="computational_linguistics",
                findings=findings,
                summary=summary,
            )

        # Phase 2: build prompt with sampled features and computed results.
        # For large corpora, limit per-sample blocks to avoid context overflow.
        prompt_features = features
        if len(features) > MAX_PROMPT_SAMPLES:
            prompt_features = _sample_representative(features, MAX_PROMPT_SAMPLES)

        user_prompt = self._build_prompt(prompt_features, task_context, comp_results)

        try:
            raw_response = await _call_llm(
                self.SYSTEM_PROMPT,
                user_prompt,
                model,
                api_base=self.api_base,
                api_key=self.api_key,
            )
        except Exception as exc:
            logger.exception("ComputationalAgent LLM call failed")
            return AgentReport(
                agent_name="computational",
                discipline="computational_linguistics",
                summary=f"由于 LLM 调用失败，分析未完成。原因：{type(exc).__name__}: {exc}",
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
        raw_texts: list[str] | None = None,
    ) -> dict[str, Any]:
        """Pre-compute similarity, clustering, and anomaly data."""
        results: dict[str, Any] = {
            "auto_findings": [],
            "similarity_matrix": None,
            "cluster_labels": None,
            "outlier_dims": {},
            "all_text_ids": [fv.text_id for fv in features],
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

            text_ids = [fv.text_id for fv in features]
            tri_i, tri_j = np.triu_indices(len(features), k=1)
            tri_vals = sim_matrix[tri_i, tri_j]
            high_mask = tri_vals > 0.85
            high_count = int(np.sum(high_mask))

            if high_count:
                high_i = tri_i[high_mask]
                high_j = tri_j[high_mask]
                high_vals = tri_vals[high_mask]
                k = min(MAX_AUTO_FINDINGS, high_count)
                if high_count <= k:
                    top_idx = np.arange(high_count, dtype=int)
                else:
                    top_idx = np.argpartition(-high_vals, k - 1)[:k]
                top_idx = top_idx[np.argsort(-high_vals[top_idx])]

                for idx in top_idx:
                    tid_a = text_ids[int(high_i[idx])]
                    tid_b = text_ids[int(high_j[idx])]
                    sim = float(high_vals[idx])
                    results["auto_findings"].append(
                        AgentFinding(
                            discipline="computational_linguistics",
                            category="semantic_similarity",
                            description=(
                                f"Very high semantic similarity ({sim:.3f}) detected "
                                f"between texts '{tid_a}' and '{tid_b}'. "
                                f"This exceeds the 0.85 threshold commonly used in "
                                f"authorship attribution and warrants further investigation."
                            ),
                            confidence=min(0.9, sim),
                            evidence=[f"cosine_similarity({tid_a}, {tid_b}) = {sim:.4f}"],
                        )
                    )

            if high_count > MAX_AUTO_FINDINGS:
                results["auto_findings"].append(
                    AgentFinding(
                        discipline="computational_linguistics",
                        category="semantic_similarity",
                        description=(
                            f"共发现 {high_count} 对高相似度文本对（> 0.85），"
                            f"仅展示前 {MAX_AUTO_FINDINGS} 对。"
                            f"大量高相似度对暗示语料主题或作者高度集中。"
                        ),
                        confidence=0.7,
                        evidence=[f"total_high_similarity_pairs = {high_count}"],
                    )
                )

        # --- Burrows' Delta (Cosine Delta variant) ---
        func_vectors = self._build_func_word_vectors(features)
        if func_vectors is not None:
            # Standardize: z-score each dimension
            means = func_vectors.mean(axis=0)
            stds = func_vectors.std(axis=0)
            stds[stds == 0] = 1.0
            z_func = (func_vectors - means) / stds
            # Cosine Delta: 1 - cosine_similarity on z-scored function word vectors
            if _HAS_SKLEARN:
                cos_sim = cosine_similarity(z_func)
                delta_matrix = 1.0 - cos_sim
                results["delta_matrix"] = delta_matrix

        # --- Normalized Compression Distance (NCD) ---
        if raw_texts is not None and len(raw_texts) == len(features):
            ncd_matrix = self._compute_ncd_matrix(raw_texts)
            results["ncd_matrix"] = ncd_matrix
            results["burstiness_by_text"] = self._compute_burstiness(
                text_ids=[fv.text_id for fv in features],
                texts=raw_texts,
            )

        # --- Cross-entropy (char n-gram based) ---
        if len(features) >= 3:
            ce_matrix = self._compute_cross_entropy(features)
            if ce_matrix is not None:
                results["cross_entropy_matrix"] = ce_matrix
                results["perplexity_matrix"] = self._cross_entropy_to_perplexity(ce_matrix)

        # --- Stylometric Unmasking ---
        if _HAS_SKLEARN and len(features) >= 6:
            unmasking_results = self._stylometric_unmasking(features)
            if unmasking_results:
                results["unmasking"] = unmasking_results

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
                "brunets_w": r.brunets_w,
                "honores_r": r.honores_r,
                "simpsons_d": r.simpsons_d,
                "mtld": r.mtld,
                "hd_d": r.hd_d,
                "coleman_liau_index": r.coleman_liau_index,
            }
            rows.append(row)
        return rows

    @staticmethod
    def _build_func_word_vectors(features: list[FeatureVector]) -> np.ndarray | None:
        """Build a matrix of function word frequencies for Delta computation."""
        if not features:
            return None
        # Collect all function words across all texts
        all_words: set[str] = set()
        for fv in features:
            all_words.update(fv.rust_features.function_word_freq.keys())
        if len(all_words) < 10:
            return None
        words = sorted(all_words)
        matrix = np.zeros((len(features), len(words)))
        for i, fv in enumerate(features):
            for j, w in enumerate(words):
                matrix[i, j] = fv.rust_features.function_word_freq.get(w, 0.0)
        return matrix

    @staticmethod
    def _compute_ncd_matrix(texts: list[str]) -> np.ndarray:
        """Compute pairwise NCD using zlib compression."""
        import zlib

        n = len(texts)
        encoded = [t.encode("utf-8") for t in texts]
        compressed_sizes = [len(zlib.compress(blob, 9)) for blob in encoded]
        ncd = np.zeros((n, n))
        for i in range(n):
            for j in range(i + 1, n):
                c_combined = len(zlib.compress(encoded[i] + encoded[j], 9))
                c_min = min(compressed_sizes[i], compressed_sizes[j])
                c_max = max(compressed_sizes[i], compressed_sizes[j])
                if c_max > 0:
                    ncd[i][j] = (c_combined - c_min) / c_max
                    ncd[j][i] = ncd[i][j]
        return ncd

    @staticmethod
    def _compute_cross_entropy(features: list[FeatureVector]) -> np.ndarray | None:
        """Compute pairwise cross-entropy using character n-gram models."""
        n = len(features)
        # Build char trigram probability distributions per text
        models: list[dict[str, float]] = []
        for fv in features:
            trigrams = {
                k: v for k, v in fv.rust_features.char_ngrams.items() if k.startswith("c3:")
            }
            if not trigrams:
                return None
            # Already normalized frequencies
            models.append(trigrams)
        model_items = [list(model.items()) for model in models]

        ce = np.zeros((n, n))
        for i in range(n):
            model_i = models[i]
            for j in range(n):
                if i == j:
                    continue
                # Cross-entropy of text j under model i
                # H(p_j, q_i) = -sum p_j(x) * log(q_i(x))
                h = 0.0
                total_weight = 0.0
                for ngram, p_j in model_items[j]:
                    q_i = model_i.get(ngram, 1e-10)  # smoothing
                    h -= p_j * np.log(max(q_i, 1e-10))
                    total_weight += p_j
                ce[i][j] = h / max(total_weight, 1e-10)
        return ce

    @staticmethod
    def _cross_entropy_to_perplexity(
        cross_entropy_matrix: np.ndarray,
        *,
        max_log_value: float = 30.0,
    ) -> np.ndarray:
        """Convert cross-entropy (nats) to perplexity with overflow protection."""
        clipped = np.clip(cross_entropy_matrix, 0.0, max_log_value)
        perplexity = np.exp(clipped)
        np.fill_diagonal(perplexity, 1.0)
        return perplexity

    @staticmethod
    def _compute_burstiness(
        text_ids: list[str],
        texts: list[str],
    ) -> dict[str, dict[str, float]]:
        """Compute per-text burstiness metrics from sentence lengths and token gaps."""
        if len(text_ids) != len(texts):
            return {}

        results: dict[str, dict[str, float]] = {}
        for text_id, text in zip(text_ids, texts):
            tokens = [tok.lower() for tok in _TOKEN_RE.findall(text)]
            sentences = [s.strip() for s in _SENTENCE_RE.findall(text) if s.strip()]

            sent_lengths = np.array(
                [len(_TOKEN_RE.findall(sentence)) for sentence in sentences if sentence.strip()],
                dtype=float,
            )
            token_count = float(len(tokens))
            sentence_count = float(len(sent_lengths))

            sentence_mean = float(sent_lengths.mean()) if sent_lengths.size > 0 else 0.0
            sentence_var = float(sent_lengths.var()) if sent_lengths.size > 1 else 0.0
            sentence_std = float(sent_lengths.std()) if sent_lengths.size > 1 else 0.0
            sentence_fano = sentence_var / sentence_mean if sentence_mean > 0 else 0.0
            sentence_cv = sentence_std / sentence_mean if sentence_mean > 0 else 0.0

            token_positions: dict[str, list[int]] = {}
            for idx, tok in enumerate(tokens):
                token_positions.setdefault(tok, []).append(idx)

            weighted_cv_sum = 0.0
            total_weight = 0.0
            for positions in token_positions.values():
                if len(positions) < 3:
                    continue
                gaps = np.diff(np.array(positions, dtype=float))
                if gaps.size < 2:
                    continue
                mean_gap = float(gaps.mean())
                if mean_gap <= 0:
                    continue
                gap_cv = float(gaps.std()) / mean_gap
                if np.isfinite(gap_cv):
                    weight = float(len(gaps))
                    weighted_cv_sum += gap_cv * weight
                    total_weight += weight

            lexical_gap_cv = weighted_cv_sum / total_weight if total_weight > 0 else 0.0

            metrics = {
                "sentence_fano": float(max(sentence_fano, 0.0)),
                "sentence_cv": float(max(sentence_cv, 0.0)),
                "lexical_gap_cv": float(max(lexical_gap_cv, 0.0)),
                "token_count": token_count,
                "sentence_count": sentence_count,
            }
            # Guard against accidental NaN/Inf propagation.
            results[text_id] = {k: float(v if np.isfinite(v) else 0.0) for k, v in metrics.items()}

        return results

    def _stylometric_unmasking(self, features: list[FeatureVector]) -> list[dict] | None:
        """Koppel-style unmasking: iteratively remove top features and measure accuracy decay."""
        from sklearn.svm import LinearSVC

        scalar_features = self._extract_scalar_features(features)
        if not scalar_features or len(features) < 6:
            return None

        dim_names = sorted(scalar_features[0])
        X = np.array([[sf[k] for k in dim_names] for sf in scalar_features])

        # Group texts by author (using text_ids - split into two halves for verification)
        n = len(features)
        mid = n // 2
        labels = np.array([0] * mid + [1] * (n - mid))

        # Standardize
        means = X.mean(axis=0)
        stds = X.std(axis=0)
        stds[stds == 0] = 1.0
        X_std = (X - means) / stds

        results: list[dict] = []
        remaining_dims = list(range(len(dim_names)))
        n_rounds = min(8, len(dim_names) - 2)

        for round_i in range(n_rounds):
            if len(remaining_dims) < 3:
                break
            X_cur = X_std[:, remaining_dims]
            try:
                clf = LinearSVC(max_iter=1000, dual=True)
                clf.fit(X_cur, labels)
                acc = clf.score(X_cur, labels)
            except Exception:
                break

            results.append(
                {
                    "round": round_i,
                    "n_features": len(remaining_dims),
                    "accuracy": float(acc),
                }
            )

            # Remove the feature with highest absolute weight
            weights = np.abs(clf.coef_[0])
            top_idx = int(np.argmax(weights))
            removed_dim = dim_names[remaining_dims[top_idx]]
            results[-1]["removed_feature"] = removed_dim
            remaining_dims.pop(top_idx)

        return results

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
            all_ids = comp_results.get("all_text_ids", [fv.text_id for fv in features])
            n_total = len(all_ids)

            if n_total <= 30:
                # Small corpus: show full matrix.
                lines = ["## Pairwise Cosine Similarity Matrix"]
                header = "       " + "  ".join(f"{tid[:8]:>8}" for tid in all_ids)
                lines.append(header)
                for i, tid in enumerate(all_ids):
                    row_vals = "  ".join(f"{sim_matrix[i][j]:8.4f}" for j in range(n_total))
                    lines.append(f"{tid[:8]:>8}  {row_vals}")
                sections.append("\n".join(lines))
            else:
                # Large corpus: show summary statistics + top notable pairs.
                upper_tri = sim_matrix[np.triu_indices_from(sim_matrix, k=1)]
                lines = [
                    "## Pairwise Cosine Similarity Summary",
                    f"- Total pairs: {len(upper_tri)}",
                    f"- Mean similarity: {float(upper_tri.mean()):.4f}",
                    f"- Median similarity: {float(np.median(upper_tri)):.4f}",
                    f"- Min: {float(upper_tri.min()):.4f}  |  Max: {float(upper_tri.max()):.4f}",
                    f"- Pairs above 0.85: {int((upper_tri > 0.85).sum())}",
                    f"- Pairs below 0.5: {int((upper_tri < 0.5).sum())}",
                    "",
                    "**Top 20 highest-similarity pairs:**",
                ]
                # Collect top pairs.
                pair_sims = []
                for i in range(n_total):
                    for j in range(i + 1, n_total):
                        pair_sims.append((all_ids[i], all_ids[j], float(sim_matrix[i][j])))
                pair_sims.sort(key=lambda x: x[2], reverse=True)
                for tid_a, tid_b, sim in pair_sims[:20]:
                    lines.append(f"  {tid_a[:12]} <-> {tid_b[:12]}: {sim:.4f}")
                sections.append("\n".join(lines))

        # Cluster labels.
        cluster_labels = comp_results.get("cluster_labels")
        if cluster_labels is not None:
            all_ids = comp_results.get("all_text_ids", [fv.text_id for fv in features])

            if len(all_ids) <= 30:
                # Small corpus: show all assignments.
                cluster_info = ", ".join(
                    f"{tid}: cluster {lbl}" for tid, lbl in zip(all_ids, cluster_labels)
                )
                sections.append(f"## DBSCAN Clustering Results\n{cluster_info}")
            else:
                # Large corpus: show cluster distribution summary.
                from collections import Counter

                label_counts = Counter(cluster_labels)
                n_clusters = sum(1 for lbl in label_counts if lbl >= 0)
                n_noise = label_counts.get(-1, 0)
                lines = [
                    "## DBSCAN Clustering Summary",
                    f"- Clusters found: {n_clusters}",
                    f"- Noise points (unclustered): {n_noise}",
                    "- Cluster sizes:",
                ]
                for lbl, cnt in sorted(label_counts.items()):
                    label_name = f"cluster {lbl}" if lbl >= 0 else "noise (-1)"
                    lines.append(f"  {label_name}: {cnt} samples")
                sections.append("\n".join(lines))

        # Outlier dimensions.
        outlier_dims = comp_results.get("outlier_dims", {})
        if outlier_dims:
            lines = ["## Feature-Level Outliers (|z| > 2.0)"]
            for tid, dims in outlier_dims.items():
                dim_str = ", ".join(f"{name} (z={z:.2f})" for name, z in dims)
                lines.append(f"- {tid}: {dim_str}")
            sections.append("\n".join(lines))

        # Delta matrix
        delta_matrix = comp_results.get("delta_matrix")
        if delta_matrix is not None:
            all_ids = comp_results.get("all_text_ids", [fv.text_id for fv in features])
            if len(all_ids) <= 30:
                lines = ["## Burrows' Cosine Delta Distance Matrix"]
                header = "       " + "  ".join(f"{tid[:8]:>8}" for tid in all_ids)
                lines.append(header)
                for i, tid in enumerate(all_ids):
                    row_vals = "  ".join(f"{delta_matrix[i][j]:8.4f}" for j in range(len(all_ids)))
                    lines.append(f"{tid[:8]:>8}  {row_vals}")
                sections.append("\n".join(lines))
            else:
                upper_tri = delta_matrix[np.triu_indices_from(delta_matrix, k=1)]
                lines = [
                    "## Burrows' Cosine Delta Summary",
                    f"- Mean distance: {float(upper_tri.mean()):.4f}",
                    f"- Min: {float(upper_tri.min()):.4f}  |  Max: {float(upper_tri.max()):.4f}",
                    f"- Pairs below 0.3 (same author signal): {int((upper_tri < 0.3).sum())}",
                ]
                sections.append("\n".join(lines))

        # NCD matrix
        ncd_matrix = comp_results.get("ncd_matrix")
        if ncd_matrix is not None:
            all_ids = comp_results.get("all_text_ids", [fv.text_id for fv in features])
            upper_tri = ncd_matrix[np.triu_indices_from(ncd_matrix, k=1)]
            lines = [
                "## Normalized Compression Distance (NCD) Summary",
                f"- Mean NCD: {float(upper_tri.mean()):.4f}",
                f"- Min: {float(upper_tri.min()):.4f}  |  Max: {float(upper_tri.max()):.4f}",
                f"- Pairs below 0.5 (high similarity): {int((upper_tri < 0.5).sum())}",
            ]
            # Top 10 most similar pairs by NCD
            pair_ncds: list[tuple[str, str, float]] = []
            for i in range(len(all_ids)):
                for j in range(i + 1, len(all_ids)):
                    pair_ncds.append((all_ids[i], all_ids[j], float(ncd_matrix[i][j])))
            pair_ncds.sort(key=lambda x: x[2])
            lines.append("**Top 10 lowest NCD pairs (most similar):**")
            for tid_a, tid_b, d in pair_ncds[:10]:
                lines.append(f"  {tid_a[:12]} <-> {tid_b[:12]}: {d:.4f}")
            sections.append("\n".join(lines))

        # Cross-entropy
        ce_matrix = comp_results.get("cross_entropy_matrix")
        if ce_matrix is not None:
            all_ids = comp_results.get("all_text_ids", [fv.text_id for fv in features])
            # Show summary stats (CE is asymmetric, so use all off-diagonal)
            off_diag = ce_matrix[~np.eye(len(all_ids), dtype=bool)]
            lines = [
                "## Cross-Entropy (Character Trigram) Summary",
                f"- Mean cross-entropy: {float(off_diag.mean()):.4f}",
                f"- Min: {float(off_diag.min()):.4f}  |  Max: {float(off_diag.max()):.4f}",
            ]
            sections.append("\n".join(lines))

        # Perplexity
        perplexity_matrix = comp_results.get("perplexity_matrix")
        if perplexity_matrix is not None:
            all_ids = comp_results.get("all_text_ids", [fv.text_id for fv in features])
            off_diag = perplexity_matrix[~np.eye(len(all_ids), dtype=bool)]
            lines = [
                "## Perplexity (Character Trigram) Summary",
                f"- Mean perplexity: {float(off_diag.mean()):.4f}",
                f"- Min: {float(off_diag.min()):.4f}  |  Max: {float(off_diag.max()):.4f}",
            ]
            # Perplexity is directional (model_i -> text_j), also add symmetric pair ranking.
            pair_scores: list[tuple[str, str, float]] = []
            for i in range(len(all_ids)):
                for j in range(i + 1, len(all_ids)):
                    sym = float((perplexity_matrix[i][j] + perplexity_matrix[j][i]) / 2.0)
                    pair_scores.append((all_ids[i], all_ids[j], sym))
            pair_scores.sort(key=lambda x: x[2])
            lines.append("**Top 10 lowest symmetric perplexity pairs (most predictable):**")
            for tid_a, tid_b, score in pair_scores[:10]:
                lines.append(f"  {tid_a[:12]} <-> {tid_b[:12]}: {score:.4f}")
            sections.append("\n".join(lines))

        # Burstiness
        burstiness = comp_results.get("burstiness_by_text")
        if burstiness:
            rows: list[tuple[str, float]] = []
            for tid, metrics in burstiness.items():
                score = (
                    0.5 * float(metrics.get("sentence_cv", 0.0))
                    + 0.3 * float(metrics.get("sentence_fano", 0.0))
                    + 0.2 * float(metrics.get("lexical_gap_cv", 0.0))
                )
                rows.append((tid, score))
            rows.sort(key=lambda x: x[1], reverse=True)

            lines = [
                "## Burstiness Summary",
                "- Composite score = 0.5*sentence_cv + 0.3*sentence_fano + 0.2*lexical_gap_cv",
                f"- Samples evaluated: {len(rows)}",
                "**Top 10 highest-burstiness samples:**",
            ]
            for tid, score in rows[:10]:
                m = burstiness.get(tid, {})
                lines.append(
                    "  "
                    f"{tid[:12]}: score={score:.4f}, "
                    f"sentence_cv={float(m.get('sentence_cv', 0.0)):.4f}, "
                    f"sentence_fano={float(m.get('sentence_fano', 0.0)):.4f}, "
                    f"lexical_gap_cv={float(m.get('lexical_gap_cv', 0.0)):.4f}"
                )
            sections.append("\n".join(lines))

        # Unmasking
        unmasking = comp_results.get("unmasking")
        if unmasking:
            lines = ["## Stylometric Unmasking (Accuracy Decay Curve)"]
            for r in unmasking:
                removed = r.get("removed_feature", "N/A")
                lines.append(
                    f"- Round {r['round']}: {r['n_features']} features, "
                    f"accuracy={r['accuracy']:.3f}, removed={removed}"
                )
            # Interpret: fast decay = same author, slow decay = different authors
            if len(unmasking) >= 3:
                decay = unmasking[0]["accuracy"] - unmasking[-1]["accuracy"]
                lines.append(f"- Total accuracy decay: {decay:.3f}")
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
