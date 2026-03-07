"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
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

interface DistributionChartProps {
  features: FeatureVector[];
  authorMap: Record<string, string>;
  selectedAuthors: string[];
  highlightedAuthors?: string[];
  featureKey: string;
  featureLabel: string;
  source: "rust" | "nlp";
}

function getValue(fv: FeatureVector, key: string, source: "rust" | "nlp"): number {
  if (source === "rust") return (fv.rust_features as unknown as Record<string, number>)[key] ?? 0;
  return (fv.nlp_features as unknown as Record<string, number>)[key] ?? 0;
}

export function DistributionChart({
  features,
  authorMap,
  selectedAuthors,
  highlightedAuthors = [],
  featureKey,
  featureLabel,
  source,
}: DistributionChartProps) {
  const { t } = useI18n();
  const authorGroups: Record<string, number[]> = {};
  for (const fv of features) {
    const author = authorMap[fv.text_id] ?? "unknown";
    if (selectedAuthors.length > 0 && !selectedAuthors.includes(author)) continue;
    (authorGroups[author] ??= []).push(getValue(fv, featureKey, source));
  }

  const authors = Object.keys(authorGroups).sort();

  const data = authors.map((author) => {
    const vals = authorGroups[author];
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    return { author, mean: +mean.toFixed(4), count: vals.length };
  });

  return (
    <Card className="border-border/70 bg-card/96 shadow-none">
      <CardHeader className="border-b border-border/50">
        <CardTitle className="text-lg">
          {t("distribution.byGroup", { feature: featureLabel })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="author" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value: number) => [value.toFixed(4), featureLabel]}
              labelFormatter={(label) => t("distribution.groupLabel", { label })}
            />
            <Bar dataKey="mean" name={featureLabel} radius={[4, 4, 0, 0]}>
              {data.map((entry, i) => {
                const highlighted =
                  highlightedAuthors.length === 0 || highlightedAuthors.includes(entry.author);
                return (
                  <Cell
                    key={i}
                    fill={AUTHOR_COLORS[i % AUTHOR_COLORS.length]}
                    fillOpacity={highlighted ? 1 : 0.35}
                    stroke={highlighted ? "hsl(var(--foreground))" : "none"}
                    strokeWidth={highlighted ? 1 : 0}
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
