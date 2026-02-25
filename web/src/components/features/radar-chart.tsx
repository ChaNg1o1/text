"use client";

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Legend,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FeatureVector } from "@/lib/types";

const AUTHOR_COLORS = [
  "hsl(221, 83%, 53%)",
  "hsl(142, 71%, 45%)",
  "hsl(0, 84%, 60%)",
  "hsl(38, 92%, 50%)",
  "hsl(280, 67%, 55%)",
  "hsl(172, 66%, 50%)",
  "hsl(330, 80%, 60%)",
  "hsl(45, 93%, 47%)",
];

// Key scalar features suitable for radar visualization
const RADAR_FEATURES: { key: string; label: string; source: "rust" | "nlp" }[] = [
  { key: "type_token_ratio", label: "TTR", source: "rust" },
  { key: "avg_word_length", label: "Avg Word Len", source: "rust" },
  { key: "avg_sentence_length", label: "Avg Sent Len", source: "rust" },
  { key: "formality_score", label: "Formality", source: "rust" },
  { key: "hapax_legomena_ratio", label: "Hapax Ratio", source: "rust" },
  { key: "sentiment_valence", label: "Sentiment", source: "nlp" },
  { key: "cognitive_complexity", label: "Cognitive", source: "nlp" },
  { key: "emotional_tone", label: "Emotional", source: "nlp" },
  { key: "clause_depth_avg", label: "Clause Depth", source: "nlp" },
  { key: "coleman_liau_index", label: "Readability", source: "rust" },
];

const FEATURE_BOUNDS: Record<string, [number, number]> = {
  type_token_ratio: [0, 1],
  avg_word_length: [0, 20],
  avg_sentence_length: [0, 60],
  formality_score: [0, 1],
  hapax_legomena_ratio: [0, 1],
  sentiment_valence: [-1, 1],
  cognitive_complexity: [0, 1],
  emotional_tone: [0, 1],
  clause_depth_avg: [0, 10],
  coleman_liau_index: [-10, 25],
};

function getValue(fv: FeatureVector, key: string, source: "rust" | "nlp"): number {
  if (source === "rust") return (fv.rust_features as unknown as Record<string, number>)[key] ?? 0;
  return (fv.nlp_features as unknown as Record<string, number>)[key] ?? 0;
}

function normalizeFeatureValue(key: string, value: number, min: number, max: number): number {
  const range = max - min;
  if (range > 1e-9) {
    return (value - min) / range;
  }

  const bounds = FEATURE_BOUNDS[key];
  if (bounds) {
    const [low, high] = bounds;
    const boundRange = high - low;
    if (boundRange > 1e-9) {
      return Math.max(0, Math.min(1, (value - low) / boundRange));
    }
  }

  return 0.5;
}

interface RadarChartProps {
  features: FeatureVector[];
  authorMap: Record<string, string>;
  selectedAuthors: string[];
}

export function FeatureRadarChart({ features, authorMap, selectedAuthors }: RadarChartProps) {
  // Group by author -> compute means
  const authorGroups: Record<string, FeatureVector[]> = {};
  for (const fv of features) {
    const author = authorMap[fv.text_id] ?? "unknown";
    if (selectedAuthors.length > 0 && !selectedAuthors.includes(author)) continue;
    (authorGroups[author] ??= []).push(fv);
  }

  const authors = Object.keys(authorGroups);

  // Compute per-feature min/max for normalization
  const rawMeans: Record<string, Record<string, number>> = {};
  for (const [author, fvs] of Object.entries(authorGroups)) {
    rawMeans[author] = {};
    for (const { key, source } of RADAR_FEATURES) {
      const sum = fvs.reduce((acc, fv) => acc + getValue(fv, key, source), 0);
      rawMeans[author][key] = sum / fvs.length;
    }
  }

  // Normalize each feature to 0-1 range across all authors
  const data = RADAR_FEATURES.map(({ key, label }) => {
    const allVals = authors.map((a) => rawMeans[a][key]);
    const min = Math.min(...allVals);
    const max = Math.max(...allVals);
    const point: Record<string, string | number> = { feature: label };
    for (const author of authors) {
      point[author] = +normalizeFeatureValue(key, rawMeans[author][key], min, max).toFixed(3);
    }
    return point;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Feature Profile Radar</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <RadarChart data={data}>
            <PolarGrid />
            <PolarAngleAxis dataKey="feature" tick={{ fontSize: 11 }} />
            <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
            {authors.map((author, i) => (
              <Radar
                key={author}
                name={author}
                dataKey={author}
                stroke={AUTHOR_COLORS[i % AUTHOR_COLORS.length]}
                fill={AUTHOR_COLORS[i % AUTHOR_COLORS.length]}
                fillOpacity={0.15}
                strokeWidth={2}
              />
            ))}
            <Tooltip />
            <Legend />
          </RadarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
