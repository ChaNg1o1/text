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
import { StaggerContainer, StaggerItem } from "@/components/motion/stagger-container";
import { DistributionChart } from "@/components/features/distribution-chart";
import { FeatureComparison } from "@/components/features/feature-comparison";
import dynamic from "next/dynamic";
import { FeatureDataViewer } from "@/components/features/feature-data-viewer";

const SimilarityHeatmap = dynamic(
  () => import("@/components/features/similarity-heatmap").then(m => ({ default: m.SimilarityHeatmap })),
  { ssr: false },
);
import { useI18n } from "@/components/providers/i18n-provider";

const SCALAR_FEATURES: {
  key: string;
  label: string;
  source: "rust" | "nlp";
  group: string;
}[] = [
  { key: "type_token_ratio", label: "Type-Token Ratio", source: "rust", group: "Lexical" },
  { key: "hapax_legomena_ratio", label: "Hapax Ratio", source: "rust", group: "Lexical" },
  { key: "yules_k", label: "Yule's K", source: "rust", group: "Lexical" },
  { key: "simpsons_d", label: "Simpson's D", source: "rust", group: "Lexical" },
  { key: "mtld", label: "MTLD", source: "rust", group: "Lexical" },
  { key: "hd_d", label: "HD-D", source: "rust", group: "Lexical" },
  { key: "brunets_w", label: "Brunet's W", source: "rust", group: "Lexical" },
  { key: "honores_r", label: "Honore's R", source: "rust", group: "Lexical" },
  { key: "avg_word_length", label: "Avg Word Length", source: "rust", group: "Sentence" },
  { key: "avg_sentence_length", label: "Avg Sentence Length", source: "rust", group: "Sentence" },
  { key: "sentence_length_variance", label: "Sentence Len Variance", source: "rust", group: "Sentence" },
  { key: "coleman_liau_index", label: "Coleman-Liau Index", source: "rust", group: "Sentence" },
  { key: "formality_score", label: "Formality Score", source: "rust", group: "Style" },
  { key: "cjk_ratio", label: "CJK Ratio", source: "rust", group: "Style" },
  { key: "emoji_density", label: "Emoji Density", source: "rust", group: "Style" },
  { key: "code_switching_ratio", label: "Code-Switching Ratio", source: "rust", group: "Style" },
  { key: "sentiment_valence", label: "Sentiment Valence", source: "nlp", group: "NLP" },
  { key: "emotional_tone", label: "Emotional Tone", source: "nlp", group: "NLP" },
  { key: "cognitive_complexity", label: "Cognitive Complexity", source: "nlp", group: "NLP" },
  { key: "clause_depth_avg", label: "Clause Depth Avg", source: "nlp", group: "NLP" },
];

const FEATURE_GROUPS = [...new Set(SCALAR_FEATURES.map((feature) => feature.group))];

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
  const [selectedGroup, setSelectedGroup] = useState<string>("Lexical");
  const [selectedFeature, setSelectedFeature] = useState<string>("type_token_ratio");
  const [selectedTextIds, setSelectedTextIds] = useState<string[]>([]);

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
    () => SCALAR_FEATURES.filter((feature) => feature.group === selectedGroup),
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

  return (
    <StaggerContainer className="space-y-6" delayChildren={0.03} staggerChildren={0.04}>
      <StaggerItem>
        <div className="rounded-[28px] border border-border/70 bg-card/96 p-6 shadow-none">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <Button asChild variant="ghost" size="sm" className="w-fit rounded-full">
                <Link href={`/analyses/detail?id=${encodeURIComponent(id)}`}>
                  <ArrowLeft className="h-4 w-4" />
                  {t("common.back")}
                </Link>
              </Button>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {t("features.labEyebrow")}
                </div>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t("features.title")}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
                  {t("features.labHint")}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {t("features.contextTitle")}
              </div>
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
        </div>
      </StaggerItem>

      {features.length === 0 ? (
        <StaggerItem>
          <p className="text-muted-foreground">{t("features.noData")}</p>
        </StaggerItem>
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-4 xl:sticky xl:top-20">
            <Card className="border-border/70 bg-card/96 shadow-none">
              <CardContent className="space-y-4 pt-5">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    {t("features.controlsTitle")}
                  </div>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    {t("features.contextHint")}
                  </p>
                </div>

                <div className="space-y-2">
                  <span className="text-sm font-medium">{t("features.groups")}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {allAuthors.map((author) => {
                      const isSelected =
                        selectedAuthors.length === 0 || selectedAuthors.includes(author);
                      return (
                        <Button
                          key={author}
                          type="button"
                          variant={isSelected ? "secondary" : "outline"}
                          size="xs"
                          onClick={() => toggleAuthor(author)}
                        >
                          {author}
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
                </div>

                <div className="space-y-2">
                  <span className="text-sm font-medium">{t("features.group")}</span>
                  <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                    <SelectTrigger aria-label={t("features.group")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FEATURE_GROUPS.map((groupName) => (
                        <SelectItem key={groupName} value={groupName}>
                          {groupName}
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
                          {feature.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedTextIds.length > 0 && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setSelectedTextIds([])}>
                    {t("features.clearLink")}
                  </Button>
                )}

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
          </div>

          <div className="space-y-6">
            {currentFeatureMeta && (
              <DistributionChart
                features={features}
                authorMap={authorMap}
                selectedAuthors={selectedAuthors}
                highlightedAuthors={highlightedAuthors}
                featureKey={currentFeatureMeta.key}
                featureLabel={currentFeatureMeta.label}
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
        </div>
      )}
    </StaggerContainer>
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
      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
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
