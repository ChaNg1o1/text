"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FeatureVector } from "@/lib/types";
import { useI18n } from "@/components/providers/i18n-provider";
import {
  buildAuthorSummaries,
  getAuthorColor,
  MAX_CHART_GROUPS,
} from "@/components/features/chart-helpers";

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
  const authorSummaries = buildAuthorSummaries(features, authorMap, selectedAuthors);
  const authors = authorSummaries
    .map((summary) => summary.author)
    .slice(0, MAX_CHART_GROUPS);
  const hiddenGroupCount = Math.max(0, authorSummaries.length - authors.length);

  if (authors.length === 0) {
    return (
      <Card className="border-border/70 bg-card/96 shadow-none">
        <CardHeader className="border-b border-border/50">
          <CardTitle className="text-lg">{t("comparison.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("features.noData")}</p>
        </CardContent>
      </Card>
    );
  }

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
      <CardContent className="space-y-4">
        {hiddenGroupCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("features.chartCapHint", {
              visible: authors.length,
              total: authorSummaries.length,
            })}
          </p>
        )}

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {authors.map((author, i) => {
            const summary = authorSummaries.find((item) => item.author === author);
            return (
              <div
                key={author}
                className="flex min-w-0 items-center gap-2 rounded-lg border border-border/50 bg-background/40 px-3 py-2"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: getAuthorColor(i) }}
                />
                <span className="truncate text-sm text-foreground/88">{author}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {summary?.count ?? 0}
                </span>
              </div>
            );
          })}
        </div>

        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="feature" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} />
            <Tooltip />
            {authors.map((author, i) => (
              <Bar
                key={author}
                dataKey={author}
                fill={getAuthorColor(i)}
                radius={[2, 2, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
