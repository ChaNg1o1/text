"use client";

import { memo, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import type { FeatureVector, ForensicReport } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { useSimilarityMatrix } from "@/hooks/use-similarity-matrix";
import { FadeIn } from "@/components/motion/fade-in";
import { ReportMetaLabel, ReportSectionIntro } from "@/components/report/report-primitives";
import { useI18n } from "@/components/providers/i18n-provider";

interface ClusterLandscapeProps {
  report: ForensicReport;
  features: FeatureVector[];
  featuresLoading?: boolean;
  focusedClusterId?: number | null;
  onFocusCluster?: (clusterId: number) => void;
}

const HEAT_LEVELS = [
  "var(--heat-0)", "var(--heat-1)", "var(--heat-2)",
  "var(--heat-3)", "var(--heat-4)",
];

function heatColor(value: number) {
  const clamped = Math.max(0, Math.min(1, value));
  const idx = Math.min(4, Math.floor(clamped * 5));
  return HEAT_LEVELS[idx];
}

export const ClusterLandscape = memo(function ClusterLandscape({
  report,
  features,
  featuresLoading = false,
  focusedClusterId = null,
  onFocusCluster,
}: ClusterLandscapeProps) {
  const { t } = useI18n();
  const clusters = useMemo(() => report.cluster_view?.clusters ?? [], [report.cluster_view?.clusters]);
  const aliases = useMemo(() => report.entity_aliases?.text_aliases ?? [], [report.entity_aliases?.text_aliases]);
  const aliasMap = useMemo(
    () => new Map(aliases.map((item) => [item.text_id, item.alias])),
    [aliases],
  );
  const clusterByTextId = useMemo(() => {
    const mapping = new Map<string, number>();
    clusters.forEach((cluster) => {
      cluster.member_text_ids.forEach((textId) => mapping.set(textId, cluster.cluster_id));
    });
    return mapping;
  }, [clusters]);

  const items = useMemo(() => {
    if (features.length === 0) {
      return aliases.map((alias) => alias.text_id);
    }
    return features.map((feature) => feature.text_id);
  }, [aliases, features]);

  const matrix = useSimilarityMatrix(features, items);

  const [activeClusterIdState, setActiveClusterIdState] = useState<number | null>(null);
  const activeClusterId = focusedClusterId ?? activeClusterIdState ?? clusters[0]?.cluster_id ?? null;

  if (clusters.length === 0) {
    return null;
  }

  const anomalyData = report.anomaly_samples.slice(0, 8).map((sample) => ({
    label: aliasMap.get(sample.text_id) ?? sample.text_id,
    value: Object.keys(sample.outlier_dimensions).length,
  }));

  return (
    <FadeIn>
    <section className="space-y-6">
      <ReportSectionIntro
        kicker={t("report.cluster.kicker")}
        title={t("report.cluster.title")}
        description={t("report.cluster.description")}
      />

      <div className="flex flex-wrap gap-2">
        {clusters.map((cluster) => (
          <button
            key={cluster.cluster_id}
            type="button"
            aria-pressed={activeClusterId === cluster.cluster_id}
            onClick={() => {
              setActiveClusterIdState(cluster.cluster_id);
              onFocusCluster?.(cluster.cluster_id);
            }}
            className={cn(
              "rounded-full border px-4 py-2 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              activeClusterId === cluster.cluster_id
                ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-100"
                : "border-border/60 bg-card/70 text-foreground",
            )}
          >
            {cluster.label} · {cluster.member_aliases.length}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_380px]">
        <Card className="border-border/60 bg-card/90">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <ReportMetaLabel>{t("report.cluster.heatmapLabel")}</ReportMetaLabel>
                <div className="mt-1 text-base font-semibold">{t("report.cluster.heatmapTitle")}</div>
              </div>
              {featuresLoading && <Badge variant="secondary">{t("report.cluster.featuresLoading")}</Badge>}
            </div>

            {matrix ? (
              <div className="mt-5 overflow-x-auto">
                <div
                  className="inline-grid gap-1 rounded-[24px] bg-background/25 p-4"
                  style={{ gridTemplateColumns: `repeat(${items.length}, 22px)` }}
                >
                  {matrix.flatMap((row, rowIndex) =>
                    row.map((value, colIndex) => {
                      const firstId = items[rowIndex];
                      const secondId = items[colIndex];
                      const firstCluster = clusterByTextId.get(firstId);
                      const secondCluster = clusterByTextId.get(secondId);
                      const active =
                        activeClusterId != null &&
                        (firstCluster === activeClusterId || secondCluster === activeClusterId);
                      return (
                        <div
                          key={`${firstId}-${secondId}`}
                          role="img"
                          aria-label={`${aliasMap.get(firstId) ?? firstId} vs ${aliasMap.get(secondId) ?? secondId}: ${value.toFixed(2)}`}
                          className={cn(
                            "size-[22px] rounded-[6px] transition-all",
                            !active && activeClusterId != null && "opacity-35",
                          )}
                          style={{ backgroundColor: heatColor(value) }}
                          title={`${aliasMap.get(firstId) ?? firstId} ↔ ${aliasMap.get(secondId) ?? secondId} · ${value.toFixed(3)}`}
                        />
                      );
                    }),
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-[22px] bg-background/30 p-4 text-sm text-muted-foreground">
                {t("report.cluster.noFeatures")}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          {clusters.map((cluster) => {
            const active = cluster.cluster_id === activeClusterId;
            return (
              <Card
                key={cluster.cluster_id}
                className={cn(
                  "border-border/60 bg-card/90 transition-all",
                  active && "border-cyan-400/35 bg-cyan-500/[0.05]",
                )}
              >
                <CardContent className="p-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{cluster.label}</Badge>
                    {cluster.top_markers?.slice(0, 2).map((marker) => (
                      <Badge key={`${cluster.cluster_id}-${marker}`} variant="secondary">
                        {marker}
                      </Badge>
                    ))}
                  </div>
                  <p className="mt-4 text-sm leading-7 text-foreground/88">
                    {cluster.theme_summary}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">
                    {cluster.separation_summary}
                  </p>
                  {cluster.representative_excerpt && (
                    <div className="mt-4 rounded-[18px] bg-background/30 p-5 text-sm leading-7 text-muted-foreground">
                      {cluster.representative_excerpt}
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {cluster.member_text_ids.map((textId) => (
                      <Badge key={textId} variant="outline">
                        {aliasMap.get(textId) ?? textId}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {anomalyData.length > 0 && (
        <Card className="border-border/60 bg-card/90">
          <CardContent className="p-6">
            <ReportMetaLabel>{t("report.cluster.anomalyLabel")}</ReportMetaLabel>
            <div className="mt-1 text-base font-semibold">{t("report.cluster.anomalyTitle")}</div>
            <ChartContainer
              className="mt-4 h-[220px] w-full"
              config={{
                value: {
                  label: "Outliers",
                  color: "hsl(38 92% 50%)",
                },
              }}
            >
              <BarChart data={anomalyData}>
                <CartesianGrid vertical={false} strokeDasharray="4 4" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {anomalyData.map((item) => (
                    <Cell key={item.label} fill="var(--color-value)" />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}
    </section>
    </FadeIn>
  );
});
