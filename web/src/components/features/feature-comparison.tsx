"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FeatureVector } from "@/lib/types";
import { useI18n } from "@/components/providers/i18n-provider";

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

const COMPARISON_FEATURE_KEYS: {
  key: string;
  labelKey: string;
  source: "rust" | "nlp";
}[] = [
  { key: "type_token_ratio", labelKey: "features.comparison.ttr", source: "rust" },
  { key: "avg_word_length", labelKey: "features.comparison.wordLen", source: "rust" },
  { key: "avg_sentence_length", labelKey: "features.comparison.sentLen", source: "rust" },
  { key: "formality_score", labelKey: "features.comparison.formality", source: "rust" },
  { key: "sentiment_valence", labelKey: "features.comparison.sentiment", source: "nlp" },
  { key: "cognitive_complexity", labelKey: "features.comparison.cognitive", source: "nlp" },
  { key: "emotional_tone", labelKey: "features.comparison.emotional", source: "nlp" },
  { key: "coleman_liau_index", labelKey: "features.comparison.readability", source: "rust" },
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

function getValue(
  fv: FeatureVector,
  key: string,
  source: "rust" | "nlp",
): number {
  if (source === "rust")
    return (fv.rust_features as unknown as Record<string, number>)[key] ?? 0;
  return (fv.nlp_features as unknown as Record<string, number>)[key] ?? 0;
}

function normalizeFeatureValue(
  key: string,
  value: number,
  min: number,
  max: number,
): number {
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

interface FeatureComparisonProps {
  features: FeatureVector[];
  authorMap: Record<string, string>;
  selectedAuthors: string[];
}

export function FeatureComparison({
  features,
  authorMap,
  selectedAuthors,
}: FeatureComparisonProps) {
  const { t } = useI18n();

  const COMPARISON_FEATURES = COMPARISON_FEATURE_KEYS.map((f) => ({
    ...f,
    label: t(f.labelKey),
  }));

  // Group by author
  const authorGroups: Record<string, FeatureVector[]> = {};
  for (const fv of features) {
    const author = authorMap[fv.text_id] ?? "unknown";
    if (selectedAuthors.length > 0 && !selectedAuthors.includes(author))
      continue;
    (authorGroups[author] ??= []).push(fv);
  }
  const authors = Object.keys(authorGroups).sort();

  // Build data: one row per feature, columns = author mean values (normalized 0-1)
  const rawData = COMPARISON_FEATURES.map(({ key, label, source }) => {
    const row: Record<string, string | number> = { feature: label };
    for (const author of authors) {
      const fvs = authorGroups[author];
      const mean =
        fvs.reduce((acc, fv) => acc + getValue(fv, key, source), 0) /
        fvs.length;
      row[author] = +mean.toFixed(4);
    }
    return row;
  });

  // Normalize per feature across authors (0-1)
  const data = rawData.map((row, idx) => {
    const vals = authors.map((a) => row[a] as number);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const featureKey = COMPARISON_FEATURES[idx]?.key ?? "";
    const normalized: Record<string, string | number> = {
      feature: row.feature,
    };
    for (const author of authors) {
      normalized[author] = +normalizeFeatureValue(
        featureKey,
        row[author] as number,
        min,
        max,
      ).toFixed(3);
    }
    return normalized;
  });

  return (
    <Card className="border-border/70 bg-card/96 shadow-none">
      <CardHeader className="border-b border-border/50">
        <CardTitle className="text-lg">{t("comparison.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="feature" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            {authors.map((author, i) => (
              <Bar
                key={author}
                dataKey={author}
                fill={AUTHOR_COLORS[i % AUTHOR_COLORS.length]}
                radius={[2, 2, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
