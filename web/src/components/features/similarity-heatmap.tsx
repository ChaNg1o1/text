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

interface NormalizedEmbedding {
  vector: number[] | null;
  length: number;
}

function normalizeEmbedding(embedding: number[]): NormalizedEmbedding {
  if (embedding.length === 0) return { vector: null, length: 0 };
  let sumSquares = 0;
  for (let i = 0; i < embedding.length; i++) {
    sumSquares += embedding[i] * embedding[i];
  }
  const magnitude = Math.sqrt(sumSquares);
  if (magnitude === 0) return { vector: null, length: embedding.length };

  const vector = new Array<number>(embedding.length);
  for (let i = 0; i < embedding.length; i++) {
    vector[i] = embedding[i] / magnitude;
  }
  return { vector, length: embedding.length };
}

function cosineSimilarityNormalized(a: NormalizedEmbedding, b: NormalizedEmbedding): number {
  if (a.length === 0 || a.length !== b.length || a.vector === null || b.vector === null) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a.vector[i] * b.vector[i];
  }
  return dot;
}
function heatColor(value: number): string {
  if (value >= 0.9) return "rgb(15, 118, 110)";
  if (value >= 0.82) return "rgb(16, 185, 129)";
  if (value >= 0.72) return "rgb(56, 189, 248)";
  if (value >= 0.6) return "rgb(191, 219, 254)";
  return "rgb(226, 232, 240)";
}

export function SimilarityHeatmap({
  features,
  authorMap,
  selectedAuthors,
  selectedTextIds = [],
  onSelectPair,
}: SimilarityHeatmapProps) {
  const { t } = useI18n();
  const selectedAuthorSet = useMemo(
    () => (selectedAuthors.length === 0 ? null : new Set(selectedAuthors)),
    [selectedAuthors],
  );
  const filtered = useMemo(() => {
    if (selectedAuthorSet === null) return features;
    return features.filter((fv) => selectedAuthorSet.has(authorMap[fv.text_id] ?? "unknown"));
  }, [features, authorMap, selectedAuthorSet]);

  const matrix = useMemo(() => {
    const n = Math.min(filtered.length, 50);
    const items = filtered.slice(0, n);
    const normalizedEmbeddings = items.map((item) => normalizeEmbedding(item.nlp_features.embedding));
    const result: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      result[i][i] = normalizedEmbeddings[i].vector === null ? 0 : 1;
      for (let j = i + 1; j < n; j++) {
        const score = cosineSimilarityNormalized(normalizedEmbeddings[i], normalizedEmbeddings[j]);
        result[i][j] = score;
        result[j][i] = score;
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
      <Card className="border-border/70 bg-card/96 shadow-none">
        <CardHeader className="border-b border-border/50">
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
      <Card className="border-border/70 bg-card/96 shadow-none">
        <CardHeader className="border-b border-border/50">
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
    <Card className="border-border/70 bg-card/96 shadow-none">
      <CardHeader className="border-b border-border/50">
        <CardTitle className="text-lg">{t("heatmap.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("heatmap.description")}</p>
      </CardHeader>
      <CardContent className="space-y-4 overflow-x-auto">
        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
          <div>{t("heatmap.samplesShown", { count: stats.sampleCount })}</div>
          <div>{t("heatmap.groupsShown", { count: stats.authorCount })}</div>
          <div>{t("heatmap.pairsCompared", { count: stats.pairCount })}</div>
          <div>{t("heatmap.avgSimilarity", { value: stats.avgSimilarity.toFixed(3) })}</div>
          <div>{t("heatmap.lowPairs", { count: stats.lowPairs })}</div>
          {stats.withinAuthorAvg != null && stats.crossAuthorAvg != null && (
            <div>
              {t("heatmap.groupGap", {
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
                      className="cursor-pointer rounded-[2px] transition-opacity"
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
                          {t("heatmap.groups", {
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
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {[
            { label: "0.60-", color: "rgb(226, 232, 240)" },
            { label: "0.60+", color: "rgb(191, 219, 254)" },
            { label: "0.72+", color: "rgb(56, 189, 248)" },
            { label: "0.82+", color: "rgb(16, 185, 129)" },
            { label: "0.90+", color: "rgb(15, 118, 110)" },
          ].map((step) => (
            <div key={step.label} className="flex items-center gap-1.5">
              <span
                className="h-3 w-3 rounded-sm border border-border/50"
                style={{ backgroundColor: step.color }}
              />
              <span>{step.label}</span>
            </div>
          ))}
          <span className="ml-2">{t("heatmap.legend")}</span>
        </div>
        <p className="text-xs text-muted-foreground">{t("heatmap.clickHint")}</p>
      </CardContent>
    </Card>
  );
}
