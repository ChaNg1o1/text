"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, Loader2, BarChart3, Link2Off } from "lucide-react";
import { api } from "@/lib/api-client";
import { useAnalysis } from "@/hooks/use-analysis";
import type { FeaturesResponse } from "@/lib/types";
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
import { SimilarityHeatmap } from "@/components/features/similarity-heatmap";
import { FeatureDataViewer } from "@/components/features/feature-data-viewer";
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

const FEATURE_GROUPS = [...new Set(SCALAR_FEATURES.map((f) => f.group))];

function getValue(fv: FeaturesResponse["features"][number], key: string, source: "rust" | "nlp") {
  const data = source === "rust"
    ? (fv.rust_features as unknown as Record<string, unknown>)
    : (fv.nlp_features as unknown as Record<string, unknown>);
  const value = data[key];
  return typeof value === "number" ? value : 0;
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

export default function FeaturesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { t } = useI18n();
  const { data: analysis } = useAnalysis(id);
  const { data: featuresData, isLoading } = useSWR<FeaturesResponse>(
    analysis?.status === "completed" ? `/analyses/${id}/features` : null,
    () => api.getFeatures(id),
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

  const groupFeatures = useMemo(
    () => SCALAR_FEATURES.filter((f) => f.group === selectedGroup),
    [selectedGroup],
  );

  const effectiveSelectedFeature = groupFeatures.some((f) => f.key === selectedFeature)
    ? selectedFeature
    : (groupFeatures[0]?.key ?? "");
  const currentFeatureMeta = SCALAR_FEATURES.find((f) => f.key === effectiveSelectedFeature);

  const features = useMemo(() => featuresData?.features ?? [], [featuresData?.features]);

  const authorMap = useMemo(() => {
    const normalizeAuthor = (value: string | undefined) => {
      const next = value?.trim();
      if (!next || next.toLowerCase() === "unknown") return "";
      return next;
    };

    const map: Record<string, string> = {};
    for (const fv of features) {
      const author = normalizeAuthor(requestAuthorMap[fv.text_id]);
      map[fv.text_id] = author || `text-${fv.text_id.slice(0, 8)}`;
    }
    return map;
  }, [requestAuthorMap, features]);

  const filteredFeatures = useMemo(() => {
    if (selectedAuthors.length === 0) return features;
    const selected = new Set(selectedAuthors);
    return features.filter((fv) => selected.has(authorMap[fv.text_id] ?? "unknown"));
  }, [features, selectedAuthors, authorMap]);

  const hasAnyNamedAuthor = useMemo(
    () => Object.values(authorMap).some((author) => !author.startsWith("text-")),
    [authorMap],
  );
  const allAuthors = useMemo(() => [...new Set(Object.values(authorMap))].sort(), [authorMap]);
  const isAllAuthorsSelected = selectedAuthors.length === 0;

  const highlightedAuthors = useMemo(() => {
    if (selectedTextIds.length === 0) return [];
    return [...new Set(selectedTextIds.map((id) => authorMap[id]).filter(Boolean))] as string[];
  }, [selectedTextIds, authorMap]);

  const featureStats = useMemo(() => {
    if (!currentFeatureMeta || filteredFeatures.length === 0) {
      return { mean: 0, std: 0, outliers: 0 };
    }

    const values = filteredFeatures.map((fv) =>
      getValue(fv, currentFeatureMeta.key, currentFeatureMeta.source),
    );
    const mean = values.reduce((acc, val) => acc + val, 0) / values.length;
    const variance = values.reduce((acc, val) => acc + (val - mean) ** 2, 0) / values.length;
    const std = Math.sqrt(variance);
    const outliers = std === 0
      ? 0
      : values.filter((value) => Math.abs((value - mean) / std) > 2).length;

    return { mean, std, outliers };
  }, [filteredFeatures, currentFeatureMeta]);

  const lowSimilarityPairs = useMemo(() => {
    const capped = filteredFeatures.slice(0, 50);
    let count = 0;
    for (let i = 0; i < capped.length; i++) {
      for (let j = i + 1; j < capped.length; j++) {
        const similarity = cosineSimilarity(capped[i].nlp_features.embedding, capped[j].nlp_features.embedding);
        if (similarity < 0.78) count += 1;
      }
    }
    return count;
  }, [filteredFeatures]);

  const toggleAuthor = (author: string) => {
    if (isAllAuthorsSelected) {
      setSelectedAuthors([author]);
      return;
    }
    if (selectedAuthors.includes(author)) {
      setSelectedAuthors(selectedAuthors.filter((a) => a !== author));
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

  if (!analysis || analysis.status !== "completed") {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/analyses/${id}`}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {t("features.backToAnalysis")}
          </Link>
        </Button>
        <p className="text-muted-foreground">{t("features.unavailable")}</p>
      </div>
    );
  }

  return (
    <StaggerContainer className="space-y-6" delayChildren={0.03} staggerChildren={0.04}>
      <StaggerItem>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link href={`/analyses/${id}`}>
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                {t("common.back")}
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2 tracking-tight">
                <BarChart3 className="h-6 w-6" />
                {t("features.title")}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {t("features.subtitle", { features: features.length, authors: allAuthors.length })}
              </p>
            </div>
          </div>
        </div>
      </StaggerItem>

      <StaggerItem>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">{t("features.insight.samples")}</p>
              <p className="mt-1 text-2xl font-semibold"><NumberTween value={filteredFeatures.length} /></p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">{t("features.insight.authors")}</p>
              <p className="mt-1 text-2xl font-semibold"><NumberTween value={allAuthors.length} /></p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">{t("features.insight.currentMean")}</p>
              <p className="mt-1 text-2xl font-semibold"><NumberTween value={featureStats.mean} decimals={3} /></p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("features.insight.currentStd")}: <NumberTween value={featureStats.std} decimals={3} />
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">{t("features.insight.anomalies")}</p>
              <p className="mt-1 text-2xl font-semibold"><NumberTween value={featureStats.outliers + lowSimilarityPairs} /></p>
            </CardContent>
          </Card>
        </div>
      </StaggerItem>

      <StaggerItem>
        <Card>
          <CardContent className="pt-5 space-y-3">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{t("features.authors")}</span>
                <div className="flex gap-1.5 flex-wrap">
                  {allAuthors.map((author) => {
                    const isSelected = selectedAuthors.length === 0 || selectedAuthors.includes(author);
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

              <div className="flex items-center gap-2 ml-auto">
                <span className="text-sm font-medium">{t("features.group")}</span>
                <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FEATURE_GROUPS.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{t("features.feature")}</span>
                <Select value={effectiveSelectedFeature} onValueChange={setSelectedFeature}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {groupFeatures.map((f) => (
                      <SelectItem key={f.key} value={f.key}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedTextIds.length > 0 && (
                <Button type="button" variant="outline" size="sm" onClick={() => setSelectedTextIds([])}>
                  <Link2Off className="h-3.5 w-3.5" />
                  {t("features.clearLink")}
                </Button>
              )}
            </div>

            {!hasAnyNamedAuthor && (
              <p className="text-xs text-muted-foreground">{t("features.missingAuthor")}</p>
            )}
            {selectedTextIds.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("features.linkHint", { count: selectedTextIds.length })}
              </p>
            )}
          </CardContent>
        </Card>
      </StaggerItem>

      {features.length === 0 ? (
        <StaggerItem>
          <p className="text-muted-foreground">{t("features.noData")}</p>
        </StaggerItem>
      ) : (
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
      )}
    </StaggerContainer>
  );
}
