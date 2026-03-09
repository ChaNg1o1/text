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
import {
  buildAuthorSummaries,
  getAuthorColor,
  MAX_CHART_GROUPS,
  prioritizeAuthors,
} from "@/components/features/chart-helpers";

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

function truncateLabel(value: string) {
  return value.length > 18 ? `${value.slice(0, 18)}...` : value;
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

  const authorSummaries = buildAuthorSummaries(features, authorMap, selectedAuthors);
  const orderedAuthors = prioritizeAuthors(
    authorSummaries.map((summary) => summary.author),
    highlightedAuthors,
  );
  const visibleAuthors = orderedAuthors.slice(0, MAX_CHART_GROUPS);

  const data = visibleAuthors.map((author) => {
    const vals = authorGroups[author];
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    return { author, mean: +mean.toFixed(4), count: vals.length };
  });
  const hiddenGroupCount = Math.max(0, authorSummaries.length - visibleAuthors.length);
  const chartHeight = Math.max(320, data.length * 42);

  if (data.length === 0) {
    return (
      <Card className="border-border/70 bg-card/96 shadow-none">
        <CardHeader className="border-b border-border/50">
          <CardTitle className="text-lg">
            {t("distribution.byGroup", { feature: featureLabel })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("features.noData")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/70 bg-card/96 shadow-none">
      <CardHeader className="border-b border-border/50">
        <CardTitle className="text-lg">
          {t("distribution.byGroup", { feature: featureLabel })}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {hiddenGroupCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("features.chartCapHint", {
              visible: visibleAuthors.length,
              total: authorSummaries.length,
            })}
          </p>
        )}

        <div className="max-h-[560px] overflow-y-auto pr-2">
          <div style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis
                  dataKey="author"
                  type="category"
                  width={140}
                  tick={{ fontSize: 11 }}
                  tickFormatter={truncateLabel}
                />
                <Tooltip
                  formatter={(value: number) => [value.toFixed(4), featureLabel]}
                  labelFormatter={(label) => t("distribution.groupLabel", { label })}
                />
                <Bar dataKey="mean" name={featureLabel} radius={[0, 4, 4, 0]}>
                  {data.map((entry, i) => {
                    const highlighted =
                      highlightedAuthors.length === 0 || highlightedAuthors.includes(entry.author);
                    return (
                      <Cell
                        key={i}
                        fill={getAuthorColor(i)}
                        fillOpacity={highlighted ? 1 : 0.35}
                        stroke={highlighted ? "hsl(var(--foreground))" : "none"}
                        strokeWidth={highlighted ? 1 : 0}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
