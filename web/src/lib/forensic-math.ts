import type { ReportConclusion } from "./types";

/**
 * Unified certainty-percentage formula used across all report views.
 *
 * Combines a grade-based baseline, a score-derived boost, and a penalty
 * for limitations / counter-evidence to produce a 30-98 % confidence.
 */
export function conclusionCertaintyPercent(
  conclusion: ReportConclusion,
): number {
  const BASE: Record<string, number> = {
    strong_support: 86,
    moderate_support: 74,
    inconclusive: 56,
    moderate_against: 74,
    strong_against: 86,
  };
  const base = BASE[conclusion.grade] ?? 56;
  const penalty = Math.min(
    20,
    conclusion.limitations.length * 3 + conclusion.counter_evidence.length * 2,
  );
  const boost = normalizedScore(conclusion) * 8;
  return Math.max(30, Math.min(98, Math.round(base - penalty + boost)));
}

function normalizedScore(conclusion: ReportConclusion): number {
  if (
    typeof conclusion.score !== "number" ||
    !Number.isFinite(conclusion.score)
  )
    return 0;
  if (conclusion.score_type === "log10_lr")
    return Math.min(1, Math.abs(conclusion.score) / 4);
  return Math.min(1, Math.abs(conclusion.score));
}

/**
 * Cosine similarity between two numeric vectors.
 * Returns 0 for empty or mismatched-length inputs.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}
