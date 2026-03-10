"use client";

import { Suspense, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { ArrowLeft, Loader2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { useAnalysis } from "@/hooks/use-analysis";
import type { FeaturesResponse } from "@/lib/types";
import { cosineSimilarity } from "@/lib/forensic-math";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NumberTween } from "@/components/motion/number-tween";
import { DistributionChart } from "@/components/features/distribution-chart";
import { FeatureComparison } from "@/components/features/feature-comparison";
import {
  MAX_CHART_GROUPS,
  MAX_GROUP_FILTER_CHIPS,
} from "@/components/features/chart-helpers";
import dynamic from "next/dynamic";
import { FeatureDataViewer } from "@/components/features/feature-data-viewer";

const SimilarityHeatmap = dynamic(
  () => import("@/components/features/similarity-heatmap").then(m => ({ default: m.SimilarityHeatmap })),
  { ssr: false },
);
import { useI18n } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/utils";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";

const SCALAR_FEATURES: {
  key: string;
  labelKey: string;
  source: "rust" | "nlp";
  groupKey: string;
}[] = [
  { key: "type_token_ratio", labelKey: "features.scalar.type_token_ratio", source: "rust", groupKey: "features.group.lexical" },
  { key: "hapax_legomena_ratio", labelKey: "features.scalar.hapax_legomena_ratio", source: "rust", groupKey: "features.group.lexical" },
  { key: "yules_k", labelKey: "features.scalar.yules_k", source: "rust", groupKey: "features.group.lexical" },
  { key: "simpsons_d", labelKey: "features.scalar.simpsons_d", source: "rust", groupKey: "features.group.lexical" },
  { key: "mtld", labelKey: "features.scalar.mtld", source: "rust", groupKey: "features.group.lexical" },
  { key: "hd_d", labelKey: "features.scalar.hd_d", source: "rust", groupKey: "features.group.lexical" },
  { key: "brunets_w", labelKey: "features.scalar.brunets_w", source: "rust", groupKey: "features.group.lexical" },
  { key: "honores_r", labelKey: "features.scalar.honores_r", source: "rust", groupKey: "features.group.lexical" },
  { key: "avg_word_length", labelKey: "features.scalar.avg_word_length", source: "rust", groupKey: "features.group.sentence" },
  { key: "avg_sentence_length", labelKey: "features.scalar.avg_sentence_length", source: "rust", groupKey: "features.group.sentence" },
  { key: "sentence_length_variance", labelKey: "features.scalar.sentence_length_variance", source: "rust", groupKey: "features.group.sentence" },
  { key: "coleman_liau_index", labelKey: "features.scalar.coleman_liau_index", source: "rust", groupKey: "features.group.sentence" },
  { key: "formality_score", labelKey: "features.scalar.formality_score", source: "rust", groupKey: "features.group.style" },
  { key: "cjk_ratio", labelKey: "features.scalar.cjk_ratio", source: "rust", groupKey: "features.group.style" },
  { key: "emoji_density", labelKey: "features.scalar.emoji_density", source: "rust", groupKey: "features.group.style" },
  { key: "code_switching_ratio", labelKey: "features.scalar.code_switching_ratio", source: "rust", groupKey: "features.group.style" },
  { key: "sentiment_valence", labelKey: "features.scalar.sentiment_valence", source: "nlp", groupKey: "features.group.nlp" },
  { key: "emotional_tone", labelKey: "features.scalar.emotional_tone", source: "nlp", groupKey: "features.group.nlp" },
  { key: "cognitive_complexity", labelKey: "features.scalar.cognitive_complexity", source: "nlp", groupKey: "features.group.nlp" },
  { key: "clause_depth_avg", labelKey: "features.scalar.clause_depth_avg", source: "nlp", groupKey: "features.group.nlp" },
];

const FEATURE_GROUPS = [...new Set(SCALAR_FEATURES.map((feature) => feature.groupKey))];

function getValue(
  featureVector: FeaturesResponse["features"][number],
  key: string,
  source: "rust" | "nlp",
) {
  const data =
    source === "rust"
      ? (featureVector.rust_features as unknown as Record<string, unknown>)
      : (featureVector.nlp_features as unknown as Record<string, unknown>);
  const value = data[key];
  return typeof value === "number" ? value : 0;
}

function FeaturesPageContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  const { t } = useI18n();
  const { data: analysis } = useAnalysis(id);
  const { data: featuresData, isLoading, error, mutate } = useSWR<FeaturesResponse>(
    analysis?.status === "completed" ? `/analyses/${id}/features` : null,
    () => api.getFeatures(id),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
      dedupingInterval: 4000,
    },
  );

  const [selectedAuthors, setSelectedAuthors] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>("features.group.lexical");
  const [selectedFeature, setSelectedFeature] = useState<string>("type_token_ratio");
  const [selectedTextIds, setSelectedTextIds] = useState<string[]>([]);
  const [showAllAuthors, setShowAllAuthors] = useState(false);

  const requestAuthorMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (analysis?.report?.request.texts) {
      for (const text of analysis.report.request.texts) {
        map[text.id] = text.author;
      }
    }
    return map;
  }, [analysis]);

  const features = useMemo(() => featuresData?.features ?? [], [featuresData?.features]);

  const groupFeatures = useMemo(
    () => SCALAR_FEATURES.filter((feature) => feature.groupKey === selectedGroup),
    [selectedGroup],
  );

  const effectiveSelectedFeature = groupFeatures.some((feature) => feature.key === selectedFeature)
    ? selectedFeature
    : (groupFeatures[0]?.key ?? "");
  const currentFeatureMeta = SCALAR_FEATURES.find((feature) => feature.key === effectiveSelectedFeature);

  const authorMap = useMemo(() => {
    const normalizeGroup = (value: string | undefined) => {
      const next = value?.trim();
      if (!next || next.toLowerCase() === "unknown") return "";
      return next;
    };

    const map: Record<string, string> = {};
    for (const feature of features) {
      const groupName = normalizeGroup(requestAuthorMap[feature.text_id]);
      map[feature.text_id] = groupName || `text-${feature.text_id.slice(0, 8)}`;
    }
    return map;
  }, [features, requestAuthorMap]);

  const filteredFeatures = useMemo(() => {
    if (selectedAuthors.length === 0) return features;
    const selected = new Set(selectedAuthors);
    return features.filter((feature) => selected.has(authorMap[feature.text_id] ?? "unknown"));
  }, [authorMap, features, selectedAuthors]);

  const allAuthors = useMemo(() => [...new Set(Object.values(authorMap))].sort(), [authorMap]);
  const visibleAuthorChips = useMemo(
    () => (showAllAuthors ? allAuthors : allAuthors.slice(0, MAX_GROUP_FILTER_CHIPS)),
    [allAuthors, showAllAuthors],
  );
  const hasNamedGroups = useMemo(
    () => Object.values(authorMap).some((groupName) => !groupName.startsWith("text-")),
    [authorMap],
  );

  const highlightedAuthors = useMemo(() => {
    if (selectedTextIds.length === 0) return [];
    return [...new Set(selectedTextIds.map((textId) => authorMap[textId]).filter(Boolean))] as string[];
  }, [authorMap, selectedTextIds]);

  const featureStats = useMemo(() => {
    if (!currentFeatureMeta || filteredFeatures.length === 0) {
      return { mean: 0, std: 0, outliers: 0 };
    }

    const values = filteredFeatures.map((feature) =>
      getValue(feature, currentFeatureMeta.key, currentFeatureMeta.source),
    );
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance =
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    const std = Math.sqrt(variance);
    const outliers =
      std === 0
        ? 0
        : values.filter((value) => Math.abs((value - mean) / std) > 2).length;

    return { mean, std, outliers };
  }, [currentFeatureMeta, filteredFeatures]);

  const lowSimilarityPairs = useMemo(() => {
    const capped = filteredFeatures.slice(0, 50);
    let count = 0;
    for (let index = 0; index < capped.length; index += 1) {
      for (let peer = index + 1; peer < capped.length; peer += 1) {
        const similarity = cosineSimilarity(
          capped[index].nlp_features.embedding,
          capped[peer].nlp_features.embedding,
        );
        if (similarity < 0.78) count += 1;
      }
    }
    return count;
  }, [filteredFeatures]);

  const toggleAuthor = (author: string) => {
    if (selectedAuthors.length === 0) {
      setSelectedAuthors([author]);
      return;
    }
    if (selectedAuthors.includes(author)) {
      setSelectedAuthors(selectedAuthors.filter((entry) => entry !== author));
      return;
    }
    setSelectedAuthors([...selectedAuthors, author]);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!id) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/analyses">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {t("features.backToAnalysis")}
          </Link>
        </Button>
        <p className="text-muted-foreground">{t("features.unavailable")}</p>
      </div>
    );
  }

  if (!analysis || analysis.status !== "completed") {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/analyses/detail?id=${encodeURIComponent(id)}`}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {t("features.backToAnalysis")}
          </Link>
        </Button>
        <p className="text-muted-foreground">{t("features.unavailable")}</p>
      </div>
    );
  }

  if (error) {
    const message = error instanceof Error ? error.message : t("features.loadFailed");
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/analyses/detail?id=${encodeURIComponent(id)}`}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {t("features.backToAnalysis")}
          </Link>
        </Button>
        <p className="text-muted-foreground">{t("features.loadFailed")}</p>
        <p className="text-xs text-muted-foreground">{message}</p>
        <Button variant="outline" size="sm" onClick={() => void mutate()}>
          {t("common.refresh")}
        </Button>
      </div>
    );
  }

  const controlsPanel = (
    <Card className="border-border/70 surface-flat">
      <CardContent className="space-y-4 pt-5">
        <div>
          <SectionEyebrow>
            {t("features.controlsTitle")}
          </SectionEyebrow>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            {t("features.contextHint")}
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_220px_220px]">
          <div className="space-y-2 lg:col-span-1">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{t("features.groups")}</span>
              {allAuthors.length > MAX_GROUP_FILTER_CHIPS && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="shrink-0"
                  onClick={() => setShowAllAuthors((value) => !value)}
                >
                  {showAllAuthors ? t("common.showLess") : t("common.showMore")}
                </Button>
              )}
            </div>
            <div
              className={cn(
                "flex flex-wrap gap-1.5",
                allAuthors.length > MAX_GROUP_FILTER_CHIPS && "max-h-40 overflow-y-auto pr-1",
              )}
            >
              {visibleAuthorChips.map((author) => {
                const isSelected =
                  selectedAuthors.length === 0 || selectedAuthors.includes(author);
                return (
                  <Button
                    key={author}
                    type="button"
                    variant={isSelected ? "secondary" : "outline"}
                    size="xs"
                    className="max-w-full"
                    onClick={() => toggleAuthor(author)}
                  >
                    <span className="max-w-[10rem] truncate">{author}</span>
                  </Button>
                );
              })}
              {selectedAuthors.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="text-muted-foreground"
                  onClick={() => setSelectedAuthors([])}
                >
                  {t("common.showAll")}
                </Button>
              )}
            </div>
            {allAuthors.length > MAX_GROUP_FILTER_CHIPS && (
              <p className="text-xs text-muted-foreground">
                {t("features.groupPreview", {
                  visible: visibleAuthorChips.length,
                  total: allAuthors.length,
                })}
              </p>
            )}
            {allAuthors.length > MAX_CHART_GROUPS && (
              <p className="text-xs text-muted-foreground">
                {t("features.chartCapHint", {
                  visible: Math.min(allAuthors.length, MAX_CHART_GROUPS),
                  total: allAuthors.length,
                })}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">{t("features.group")}</span>
            <Select value={selectedGroup} onValueChange={setSelectedGroup}>
              <SelectTrigger aria-label={t("features.group")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FEATURE_GROUPS.map((groupKey) => (
                  <SelectItem key={groupKey} value={groupKey}>
                    {t(groupKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">{t("features.feature")}</span>
            <Select value={effectiveSelectedFeature} onValueChange={setSelectedFeature}>
              <SelectTrigger aria-label={t("features.feature")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {groupFeatures.map((feature) => (
                  <SelectItem key={feature.key} value={feature.key}>
                    {t(feature.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex flex-wrap gap-2 pt-1">
              {selectedTextIds.length > 0 && (
                <Button type="button" variant="outline" size="sm" onClick={() => setSelectedTextIds([])}>
                  {t("features.clearLink")}
                </Button>
              )}
            </div>
          </div>
        </div>

        {!hasNamedGroups && (
          <p className="text-xs text-muted-foreground">{t("features.missingGroup")}</p>
        )}
        {selectedTextIds.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("features.linkHint", { count: selectedTextIds.length })}
          </p>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <>
        <div className="rounded-3xl border border-border/70 surface-flat p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <Button asChild variant="ghost" size="sm" className="w-fit rounded-full">
                <Link href={`/analyses/detail?id=${encodeURIComponent(id)}`}>
                  <ArrowLeft className="h-4 w-4" />
                  {t("common.back")}
                </Link>
              </Button>
              <div>
                <SectionEyebrow>
                  {t("features.labEyebrow")}
                </SectionEyebrow>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t("features.title")}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
                  {t("features.labHint")}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
              <SectionEyebrow>
                {t("features.contextTitle")}
              </SectionEyebrow>
              <div className="mt-3 space-y-2 text-sm">
                <div className="font-mono">{analysis.id}</div>
                <div className="text-muted-foreground">{analysis.llm_backend}</div>
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  {t(`task.${analysis.task_type}`)}
                </Badge>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <InsightStat label={t("features.insight.samples")} value={<NumberTween value={filteredFeatures.length} />} />
            <InsightStat label={t("features.insight.groups")} value={<NumberTween value={allAuthors.length} />} />
            <InsightStat
              label={t("features.insight.currentMean")}
              value={<NumberTween value={featureStats.mean} decimals={3} />}
              caption={`${t("features.insight.currentStd")}: ${featureStats.std.toFixed(3)}`}
            />
            <InsightStat
              label={t("features.insight.anomalies")}
              value={<NumberTween value={featureStats.outliers + lowSimilarityPairs} />}
            />
          </div>

          <div className="mt-5">
            {controlsPanel}
          </div>
        </div>
      </>

      {features.length === 0 ? (
        <>
          <p className="text-muted-foreground">{t("features.noData")}</p>
        </>
      ) : (
        <div className="space-y-6">
          {currentFeatureMeta && (
            <DistributionChart
              features={features}
              authorMap={authorMap}
              selectedAuthors={selectedAuthors}
              highlightedAuthors={highlightedAuthors}
              featureKey={currentFeatureMeta.key}
              featureLabel={currentFeatureMeta ? t(currentFeatureMeta.labelKey) : ""}
              source={currentFeatureMeta.source}
            />
          )}

          <FeatureComparison
            features={features}
            authorMap={authorMap}
            selectedAuthors={selectedAuthors}
          />

          <SimilarityHeatmap
            features={features}
            authorMap={authorMap}
            selectedAuthors={selectedAuthors}
            selectedTextIds={selectedTextIds}
            onSelectPair={(payload) => {
              setSelectedTextIds([payload.firstTextId, payload.secondTextId]);
            }}
          />

          <FeatureDataViewer
            features={features}
            authorMap={authorMap}
            selectedAuthors={selectedAuthors}
            selectedTextIds={selectedTextIds}
          />
        </div>
      )}
    </div>
  );
}

function InsightStat({
  label,
  value,
  caption,
}: {
  label: string;
  value: ReactNode;
  caption?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
      <SectionEyebrow>{label}</SectionEyebrow>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {caption && <div className="mt-1 text-xs text-muted-foreground">{caption}</div>}
    </div>
  );
}

export default function FeaturesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <FeaturesPageContent />
    </Suspense>
  );
}
