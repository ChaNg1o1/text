"use client";

import { useMemo, useState } from "react";
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

interface ClusterLandscapeProps {
  report: ForensicReport;
  features: FeatureVector[];
  featuresLoading?: boolean;
  focusedClusterId?: number | null;
  onFocusCluster?: (clusterId: number) => void;
}

function cosine(a: number[], b: number[]) {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    magA += a[index] * a[index];
    magB += b[index] * b[index];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

function heatColor(value: number) {
  const clamped = Math.max(0, Math.min(1, value));
  const cyan = Math.round(32 + 170 * clamped);
  const green = Math.round(70 + 120 * clamped);
  const blue = Math.round(110 + 130 * (1 - clamped * 0.7));
  return `rgba(${cyan}, ${green}, ${blue}, ${0.32 + clamped * 0.48})`;
}

export function ClusterLandscape({
  report,
  features,
  featuresLoading = false,
  focusedClusterId = null,
  onFocusCluster,
}: ClusterLandscapeProps) {
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

  const matrix = useMemo(() => {
    if (features.length < 2) {
      return null;
    }
    const featureMap = new Map(features.map((item) => [item.text_id, item]));
    return items.map((firstId) =>
      items.map((secondId) => {
        const first = featureMap.get(firstId);
        const second = featureMap.get(secondId);
        if (!first || !second) return 0;
        return cosine(first.nlp_features.embedding, second.nlp_features.embedding);
      }),
    );
  }, [features, items]);

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
    <section className="space-y-6">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          Cluster Landscape
        </div>
        <h3 className="mt-1 text-2xl font-semibold">聚类地貌</h3>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          先看样本内部被分成了几种写法，再看每组之间到底差在哪，最后用异常样本确认哪些文本需要拆开单独复核。
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {clusters.map((cluster) => (
          <button
            key={cluster.cluster_id}
            type="button"
            onClick={() => {
              setActiveClusterIdState(cluster.cluster_id);
              onFocusCluster?.(cluster.cluster_id);
            }}
            className={cn(
              "rounded-full border px-4 py-2 text-sm transition-all",
              activeClusterId === cluster.cluster_id
                ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-100"
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
                <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                  Similarity Map
                </div>
                <div className="mt-1 text-base font-semibold">样本相似度热力图</div>
              </div>
              {featuresLoading && <Badge variant="secondary">loading features…</Badge>}
            </div>

            {matrix ? (
              <div className="mt-5 overflow-x-auto">
                <div
                  className="inline-grid gap-1 rounded-[24px] border border-border/50 bg-background/25 p-4"
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
                          className={cn(
                            "size-[22px] rounded-[6px] border border-white/5 transition-all",
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
              <div className="mt-5 rounded-[22px] border border-border/60 bg-background/30 p-4 text-sm text-muted-foreground">
                当前缺少足够的 features 数据，先用右侧的簇解释卡阅读分组结构。
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
                  active && "border-cyan-400/35 shadow-[0_24px_60px_-46px_rgba(34,211,238,0.8)]",
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
                    <div className="mt-4 rounded-[18px] border border-border/60 bg-background/30 p-5 text-sm leading-7 text-muted-foreground">
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
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Outlier Ribbon
            </div>
            <div className="mt-1 text-base font-semibold">异常样本条带</div>
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
  );
}
