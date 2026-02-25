"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { FeatureVector } from "@/lib/types";
import { useI18n } from "@/components/providers/i18n-provider";

interface SimilarityHeatmapProps {
  features: FeatureVector[];
  authorMap: Record<string, string>;
  selectedAuthors: string[];
  selectedTextIds?: string[];
  onSelectPair?: (payload: {
    firstTextId: string;
    secondTextId: string;
    firstAuthor: string;
    secondAuthor: string;
    similarity: number;
  }) => void;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

function heatColor(value: number): string {
  const scaled = Math.max(0, Math.min(1, value));
  const r = Math.round(22 + 230 * scaled);
  const g = Math.round(50 + 90 * (1 - Math.abs(scaled - 0.5) * 2));
  const b = Math.round(226 - 206 * scaled);
  return `rgb(${r}, ${g}, ${b})`;
}

export function SimilarityHeatmap({
  features,
  authorMap,
  selectedAuthors,
  selectedTextIds = [],
  onSelectPair,
}: SimilarityHeatmapProps) {
  const { t } = useI18n();
  const filtered = useMemo(() => {
    if (selectedAuthors.length === 0) return features;
    return features.filter((fv) => selectedAuthors.includes(authorMap[fv.text_id] ?? "unknown"));
  }, [features, authorMap, selectedAuthors]);

  const matrix = useMemo(() => {
    const n = Math.min(filtered.length, 50);
    const items = filtered.slice(0, n);
    const result: number[][] = [];
    for (let i = 0; i < n; i++) {
      result[i] = [];
      for (let j = 0; j < n; j++) {
        result[i][j] = cosineSimilarity(items[i].nlp_features.embedding, items[j].nlp_features.embedding);
      }
    }
    return { items, matrix: result };
  }, [filtered]);

  const { items, matrix: sim } = matrix;
  const stats = useMemo(() => {
    const authors = new Set(items.map((item) => authorMap[item.text_id] ?? "unknown"));
    let pairCount = 0;
    let total = 0;
    let lowPairs = 0;
    let withinAuthorSum = 0;
    let withinAuthorCount = 0;
    let crossAuthorSum = 0;
    let crossAuthorCount = 0;

    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const score = sim[i][j];
        const a = authorMap[items[i].text_id] ?? "unknown";
        const b = authorMap[items[j].text_id] ?? "unknown";
        pairCount += 1;
        total += score;
        if (score < 0.78) lowPairs += 1;
        if (a === b) {
          withinAuthorSum += score;
          withinAuthorCount += 1;
        } else {
          crossAuthorSum += score;
          crossAuthorCount += 1;
        }
      }
    }

    return {
      sampleCount: items.length,
      authorCount: authors.size,
      pairCount,
      avgSimilarity: pairCount > 0 ? total / pairCount : 0,
      lowPairs,
      withinAuthorAvg: withinAuthorCount > 0 ? withinAuthorSum / withinAuthorCount : null,
      crossAuthorAvg: crossAuthorCount > 0 ? crossAuthorSum / crossAuthorCount : null,
    };
  }, [items, sim, authorMap]);

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("heatmap.emptyTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("heatmap.empty")}</p>
        </CardContent>
      </Card>
    );
  }

  if (items.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("heatmap.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {t("heatmap.needMoreData", { count: items.length })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("heatmap.needMoreDataHint")}
          </p>
        </CardContent>
      </Card>
    );
  }

  const selectedSet = new Set(selectedTextIds);
  const cellSize = Math.max(8, Math.min(20, 600 / items.length));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("heatmap.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("heatmap.description")}</p>
      </CardHeader>
      <CardContent className="space-y-4 overflow-x-auto">
        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
          <div>{t("heatmap.samplesShown", { count: stats.sampleCount })}</div>
          <div>{t("heatmap.authorsShown", { count: stats.authorCount })}</div>
          <div>{t("heatmap.pairsCompared", { count: stats.pairCount })}</div>
          <div>{t("heatmap.avgSimilarity", { value: stats.avgSimilarity.toFixed(3) })}</div>
          <div>{t("heatmap.lowPairs", { count: stats.lowPairs })}</div>
          {stats.withinAuthorAvg != null && stats.crossAuthorAvg != null && (
            <div>
              {t("heatmap.authorGap", {
                within: stats.withinAuthorAvg.toFixed(3),
                cross: stats.crossAuthorAvg.toFixed(3),
              })}
            </div>
          )}
        </div>

        <div
          className="inline-grid gap-px rounded-md border border-border/40 bg-muted/30 p-1"
          style={{ gridTemplateColumns: `repeat(${items.length}, ${cellSize}px)` }}
        >
          {sim.flatMap((row, i) =>
            row.map((val, j) => {
              const first = items[i];
              const second = items[j];
              const isSelf = i === j;
              const isDuplicatePair = j < i;
              const isInteractive = !isSelf && !isDuplicatePair;
              const isSelected =
                selectedSet.size > 0 &&
                (selectedSet.has(first.text_id) || selectedSet.has(second.text_id));
              const isPairExact =
                selectedSet.has(first.text_id) && selectedSet.has(second.text_id);

              return (
                <Tooltip key={`${i}-${j}`}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="rounded-[2px] cursor-pointer transition-transform duration-150 hover:scale-105"
                      style={{
                        width: cellSize,
                        height: cellSize,
                        backgroundColor: isSelf ? "hsl(var(--muted))" : heatColor(val),
                        outline: isPairExact
                          ? "2px solid hsl(var(--foreground))"
                          : isSelected
                            ? "1px solid hsl(var(--foreground) / 0.65)"
                            : "none",
                        opacity: isSelf
                          ? 0.3
                          : isDuplicatePair
                            ? 0.14
                            : (selectedSet.size === 0 || isSelected ? 1 : 0.45),
                        cursor: isInteractive ? "pointer" : "default",
                      }}
                      disabled={!isInteractive}
                      aria-label={`${first.text_id} / ${second.text_id}`}
                      onClick={() => {
                        if (!isInteractive) return;
                        onSelectPair?.({
                          firstTextId: first.text_id,
                          secondTextId: second.text_id,
                          firstAuthor: authorMap[first.text_id] ?? "unknown",
                          secondAuthor: authorMap[second.text_id] ?? "unknown",
                          similarity: val,
                        });
                      }}
                    />
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">
                    {isSelf ? (
                      <div>{t("heatmap.selfCell")}</div>
                    ) : isDuplicatePair ? (
                      <div>{t("heatmap.duplicateCell")}</div>
                    ) : (
                      <>
                        <div>
                          {first.text_id} vs {second.text_id}
                        </div>
                        <div>{t("heatmap.similarity", { value: val.toFixed(3) })}</div>
                        <div>
                          {t("heatmap.authors", {
                            a: authorMap[first.text_id],
                            b: authorMap[second.text_id],
                          })}
                        </div>
                      </>
                    )}
                  </TooltipContent>
                </Tooltip>
              );
            }),
          )}
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span>0.0</span>
          <div
            className="h-3 w-32 rounded"
            style={{
              background: "linear-gradient(to right, rgb(22,138,226), rgb(252,70,24))",
            }}
          />
          <span>1.0</span>
          <span className="ml-2">{t("heatmap.legend")}</span>
        </div>
        <p className="text-xs text-muted-foreground">{t("heatmap.clickHint")}</p>
      </CardContent>
    </Card>
  );
}
