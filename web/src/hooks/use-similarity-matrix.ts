import { useMemo } from "react";
import type { FeatureVector } from "@/lib/types";
import { cosineSimilarity } from "@/lib/forensic-math";

/**
 * Computes an NxN cosine-similarity matrix for the given text IDs.
 * Returns null when there are fewer than 2 features.
 */
export function useSimilarityMatrix(
  features: FeatureVector[],
  textIds: string[],
): number[][] | null {
  return useMemo(() => {
    if (features.length < 2 || textIds.length < 2) {
      return null;
    }
    const featureMap = new Map(features.map((item) => [item.text_id, item]));
    return textIds.map((firstId) =>
      textIds.map((secondId) => {
        const first = featureMap.get(firstId);
        const second = featureMap.get(secondId);
        if (!first || !second) return 0;
        return cosineSimilarity(first.nlp_features.embedding, second.nlp_features.embedding);
      }),
    );
  }, [features, textIds]);
}
