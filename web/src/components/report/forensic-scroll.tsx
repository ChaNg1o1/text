"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AnalysisDetail,
  ClusterViewCluster,
  EvidenceItem,
  FeatureVector,
  ForensicReport,
  ReportConclusion,
  WritingProfile,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/providers/i18n-provider";
import {
  type FocusContext,
  useReportVisualizationStore,
} from "@/stores/report-visualization-store";

type SectionKey =
  | "case-header"
  | "conclusion-rail"
  | "evidence-chain"
  | "writing-profiles"
  | "cluster-view"
  | "narrative-spine"
  | "appendix";

type DrawerEntity =
  | { kind: "conclusion"; conclusion: ReportConclusion }
  | { kind: "evidence"; evidence: EvidenceItem }
  | { kind: "text"; textId: string }
  | { kind: "profile"; profile: WritingProfile }
  | { kind: "cluster"; cluster: ClusterViewCluster };

type LensKey = "feature" | "cluster" | "anomaly";

const SECTION_ORDER: Array<{
  key: SectionKey;
  labelKey: string;
  color: string;
  borderClass: string;
  tintClass: string;
}> = [
  {
    key: "case-header",
    labelKey: "detail.scroll.section.caseHeader",
    color: "#0EA5E9",
    borderClass: "border-sky-300/60 dark:border-sky-500/45",
    tintClass: "bg-sky-50 dark:bg-sky-500/8",
  },
  {
    key: "conclusion-rail",
    labelKey: "detail.scroll.section.conclusionRail",
    color: "#0EA5E9",
    borderClass: "border-sky-300/60 dark:border-sky-500/45",
    tintClass: "bg-sky-50 dark:bg-sky-500/8",
  },
  {
    key: "evidence-chain",
    labelKey: "detail.scroll.section.evidenceChain",
    color: "#F59E0B",
    borderClass: "border-amber-300/60 dark:border-amber-500/45",
    tintClass: "bg-amber-50 dark:bg-amber-500/8",
  },
  {
    key: "writing-profiles",
    labelKey: "detail.scroll.section.writingProfiles",
    color: "#8B5CF6",
    borderClass: "border-violet-300/60 dark:border-violet-500/45",
    tintClass: "bg-violet-50 dark:bg-violet-500/8",
  },
  {
    key: "cluster-view",
    labelKey: "detail.scroll.section.clusterView",
    color: "#10B981",
    borderClass: "border-emerald-300/60 dark:border-emerald-500/45",
    tintClass: "bg-emerald-50 dark:bg-emerald-500/8",
  },
  {
    key: "narrative-spine",
    labelKey: "detail.scroll.section.narrativeSpine",
    color: "#64748B",
    borderClass: "border-slate-300/70 dark:border-slate-500/45",
    tintClass: "bg-slate-50 dark:bg-slate-500/8",
  },
  {
    key: "appendix",
    labelKey: "detail.scroll.section.appendix",
    color: "#6366F1",
    borderClass: "border-indigo-300/60 dark:border-indigo-500/45",
    tintClass: "bg-indigo-50 dark:bg-indigo-500/8",
  },
];

const PROFILE_COLORS = ["#0EA5E9", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#6366F1"];
const HEAT_COLORS = ["#E2E8F0", "#BFDBFE", "#7DD3FC", "#34D399", "#0F766E"];

const FEATURE_SIGNATURE = [
  { key: "type_token_ratio", source: "rust" as const, label: "TTR", min: 0, max: 1 },
  { key: "avg_sentence_length", source: "rust" as const, label: "Sentence", min: 0, max: 60 },
  { key: "formality_score", source: "rust" as const, label: "Formality", min: 0, max: 1 },
  { key: "emotional_tone", source: "nlp" as const, label: "Emotion", min: 0, max: 1 },
];

function certainty(conclusion: ReportConclusion) {
  const base = {
    strong_support: 88,
    moderate_support: 76,
    inconclusive: 58,
    moderate_against: 72,
    strong_against: 86,
  }[conclusion.grade];
  const penalty = conclusion.limitations.length * 4 + conclusion.counter_evidence.length * 3;
  return Math.max(22, Math.min(97, base - penalty));
}

function conclusionTone(grade: ReportConclusion["grade"]) {
  switch (grade) {
    case "strong_support":
      return {
        valueClass: "text-sky-700 dark:text-sky-300",
        barClass: "bg-sky-500",
        badgeClass: "border-sky-300/70 bg-sky-50 text-sky-700 dark:border-sky-500/35 dark:bg-sky-500/10 dark:text-sky-300",
      };
    case "moderate_support":
      return {
        valueClass: "text-emerald-700 dark:text-emerald-300",
        barClass: "bg-emerald-500",
        badgeClass: "border-emerald-300/70 bg-emerald-50 text-emerald-700 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-300",
      };
    case "inconclusive":
      return {
        valueClass: "text-amber-700 dark:text-amber-300",
        barClass: "bg-amber-500",
        badgeClass: "border-amber-300/70 bg-amber-50 text-amber-700 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-300",
      };
    default:
      return {
        valueClass: "text-rose-700 dark:text-rose-300",
        barClass: "bg-rose-500",
        badgeClass: "border-rose-300/70 bg-rose-50 text-rose-700 dark:border-rose-500/35 dark:bg-rose-500/10 dark:text-rose-300",
      };
  }
}

function heatColor(value: number) {
  if (value >= 0.9) return HEAT_COLORS[4];
  if (value >= 0.82) return HEAT_COLORS[3];
  if (value >= 0.72) return HEAT_COLORS[2];
  if (value >= 0.6) return HEAT_COLORS[1];
  return HEAT_COLORS[0];
}

function cosineSimilarity(a: number[], b: number[]) {
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

function normalizeMetric(value: number, min: number, max: number) {
  if (!Number.isFinite(value) || max <= min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripPreview(content?: string) {
  if (!content) return "";
  return content.replace(/\s+/g, " ").trim();
}

interface ForensicScrollProps {
  analysis: AnalysisDetail;
  features: FeatureVector[];
  featuresLoading?: boolean;
}

export function ForensicScroll({
  analysis,
  features,
  featuresLoading = false,
}: ForensicScrollProps) {
  const { t } = useI18n();
  const report = analysis.report as ForensicReport;
  const focus = useReportVisualizationStore((state) => state.focus);
  const lenses = useReportVisualizationStore((state) => state.lenses);
  const setFocus = useReportVisualizationStore((state) => state.setFocus);
  const clearFocus = useReportVisualizationStore((state) => state.clearFocus);
  const toggleLens = useReportVisualizationStore((state) => state.toggleLens);
  const resetVisualization = useReportVisualizationStore((state) => state.reset);

  const [drawerEntity, setDrawerEntity] = useState<DrawerEntity | null>(null);
  const [activeNarrativeKey, setActiveNarrativeKey] = useState<string | null>(
    report.narrative?.sections.find((section) => section.default_expanded)?.key ??
      report.narrative?.sections[0]?.key ??
      null,
  );
  const [currentSection, setCurrentSection] = useState<SectionKey>("case-header");

  const sectionRefs = useRef<Record<SectionKey, HTMLElement | null>>({
    "case-header": null,
    "conclusion-rail": null,
    "evidence-chain": null,
    "writing-profiles": null,
    "cluster-view": null,
    "narrative-spine": null,
    appendix: null,
  });

  useEffect(() => {
    resetVisualization();
    return () => resetVisualization();
  }, [analysis.id, resetVisualization]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const next = visible[0]?.target.getAttribute("data-section-key") as SectionKey | null;
        if (next) {
          setCurrentSection(next);
        }
      },
      {
        rootMargin: "-18% 0px -60% 0px",
        threshold: [0.1, 0.3, 0.55],
      },
    );

    SECTION_ORDER.forEach((section) => {
      const node = sectionRefs.current[section.key];
      if (node) observer.observe(node);
    });

    return () => observer.disconnect();
  }, []);

  const evidenceById = useMemo(
    () => new Map(report.evidence_items.map((item) => [item.evidence_id, item])),
    [report.evidence_items],
  );

  const featureMap = useMemo(
    () => new Map(features.map((item) => [item.text_id, item])),
    [features],
  );

  const clusterByTextId = useMemo(() => {
    const map = new Map<string, number>();
    report.cluster_view?.clusters.forEach((cluster) => {
      cluster.member_text_ids.forEach((textId) => map.set(textId, cluster.cluster_id));
    });
    return map;
  }, [report.cluster_view?.clusters]);

  const anomaliesByTextId = useMemo(
    () => new Map(report.anomaly_samples.map((item) => [item.text_id, item])),
    [report.anomaly_samples],
  );

  const textMeta = useMemo(() => {
    const aliasRecords = report.entity_aliases?.text_aliases ?? [];
    const aliasMap = new Map(aliasRecords.map((item) => [item.text_id, item]));
    return report.request.texts.map((text) => {
      const alias = aliasMap.get(text.id);
      return {
        textId: text.id,
        alias: alias?.alias ?? text.id.slice(0, 8),
        preview: stripPreview(alias?.preview || text.content).slice(0, 160),
        group: text.author?.trim() || alias?.author || text.id,
      };
    });
  }, [report.entity_aliases?.text_aliases, report.request.texts]);

  const textMetaMap = useMemo(
    () => new Map(textMeta.map((item) => [item.textId, item])),
    [textMeta],
  );

  const conclusionTextIds = useMemo(
    () =>
      new Map(
        report.conclusions.map((conclusion) => [
          conclusion.key,
          Array.from(
            new Set(
              conclusion.evidence_ids.flatMap(
                (evidenceId) => evidenceById.get(evidenceId)?.source_text_ids ?? [],
              ),
            ),
          ),
        ]),
      ),
    [evidenceById, report.conclusions],
  );

  const evidenceScopeTextIds = useMemo(() => {
    const ordered = Array.from(
      new Set(
        report.evidence_items.flatMap((item) => item.source_text_ids),
      ),
    );
    if (ordered.length >= 4) {
      return ordered.slice(0, 8);
    }
    return report.request.texts.slice(0, 8).map((text) => text.id);
  }, [report.evidence_items, report.request.texts]);

  const groupedEvidence = useMemo(() => {
    const groups: Record<"core" | "supporting" | "conflicting", EvidenceItem[]> = {
      core: [],
      supporting: [],
      conflicting: [],
    };
    report.evidence_items.forEach((item) => {
      const key = item.strength ?? "supporting";
      groups[key].push(item);
    });
    return groups;
  }, [report.evidence_items]);

  const humanizeNarrative = useMemo(() => {
    let replacers: Array<[string, string]> = textMeta.map((item) => [item.textId, item.alias]);
    replacers = replacers.concat(
      (report.entity_aliases?.author_aliases ?? []).map((item) => [item.author_id, item.alias]),
    );
    return (value: string) =>
      replacers.reduce(
        (next, [from, to]) => next.replace(new RegExp(escapeRegExp(from), "g"), to),
        value,
      );
  }, [report.entity_aliases?.author_aliases, textMeta]);

  const profileDimensions = useMemo(() => {
    const dimensionMap = new Map<
      string,
      { key: string; label: string; avgConfidence: number; sampleCount: number }
    >();
    report.writing_profiles.forEach((profile) => {
      profile.dimensions.forEach((dimension) => {
        const prev = dimensionMap.get(dimension.key);
        if (prev) {
          prev.avgConfidence += dimension.confidence;
          prev.sampleCount += 1;
        } else {
          dimensionMap.set(dimension.key, {
            key: dimension.key,
            label: dimension.label,
            avgConfidence: dimension.confidence,
            sampleCount: 1,
          });
        }
      });
    });
    return Array.from(dimensionMap.values())
      .map((item) => ({
        ...item,
        avgConfidence: item.avgConfidence / item.sampleCount,
      }))
      .sort((a, b) => b.avgConfidence - a.avgConfidence)
      .slice(0, 6);
  }, [report.writing_profiles]);

  const clusterPalette = useMemo(() => {
    const palette = new Map<number, string>();
    (report.cluster_view?.clusters ?? []).forEach((cluster, index) => {
      palette.set(cluster.cluster_id, PROFILE_COLORS[index % PROFILE_COLORS.length]);
    });
    return palette;
  }, [report.cluster_view?.clusters]);

  const dominantClusterForTexts = useCallback((textIds: string[]) => {
    const counts = new Map<number, number>();
    textIds.forEach((textId) => {
      const clusterId = clusterByTextId.get(textId);
      if (clusterId != null) {
        counts.set(clusterId, (counts.get(clusterId) ?? 0) + 1);
      }
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [clusterByTextId]);

  const profileClusterMap = useMemo(() => {
    const map = new Map<string, number | null>();
    report.writing_profiles.forEach((profile) => {
      map.set(
        profile.subject,
        dominantClusterForTexts(profile.representative_text_ids ?? []),
      );
    });
    return map;
  }, [dominantClusterForTexts, report.writing_profiles]);

  const visibleClusterTextIds = useMemo(() => {
    const clusters = report.cluster_view?.clusters ?? [];
    if (features.length > 1) {
      return features.slice(0, 10).map((item) => item.text_id);
    }
    return clusters.flatMap((cluster) => cluster.member_text_ids).slice(0, 10);
  }, [features, report.cluster_view?.clusters]);

  const clusterSimilarity = useMemo(() => {
    const ids = visibleClusterTextIds;
    if (ids.length === 0) return [];
    return ids.map((firstId) =>
      ids.map((secondId) => {
        const first = featureMap.get(firstId);
        const second = featureMap.get(secondId);
        if (!first || !second) {
          return firstId === secondId ? 1 : clusterByTextId.get(firstId) === clusterByTextId.get(secondId)
            ? 0.82
            : 0.54;
        }
        return cosineSimilarity(first.nlp_features.embedding, second.nlp_features.embedding);
      }),
    );
  }, [clusterByTextId, featureMap, visibleClusterTextIds]);

  const leadConclusion = report.conclusions[0];
  const leadPercent = leadConclusion ? certainty(leadConclusion) : null;

  const scrollToSection = (section: SectionKey) => {
    sectionRefs.current[section]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openDrawer = (entity: DrawerEntity, source: string, focusContext?: FocusContext) => {
    setDrawerEntity(entity);
    if (focusContext) {
      setFocus(focusContext);
      return;
    }
    if (entity.kind === "conclusion") {
      setFocus({ entityType: "conclusion", entityId: entity.conclusion.key, source });
      return;
    }
    if (entity.kind === "evidence") {
      setFocus({ entityType: "evidence", entityId: entity.evidence.evidence_id, source });
      return;
    }
    if (entity.kind === "text") {
      setFocus({ entityType: "text", entityId: entity.textId, source });
      return;
    }
    if (entity.kind === "cluster") {
      setFocus({ entityType: "cluster", entityId: String(entity.cluster.cluster_id), source });
      return;
    }
    setFocus({ entityType: "profile", entityId: entity.profile.subject, source });
  };

  const isTextFocused = (textId: string) => {
    if (!focus) return true;
    if (focus.entityType === "text") return focus.entityId === textId;
    if (focus.entityType === "evidence") {
      return evidenceById.get(focus.entityId)?.source_text_ids.includes(textId) ?? false;
    }
    if (focus.entityType === "conclusion") {
      return conclusionTextIds.get(focus.entityId)?.includes(textId) ?? false;
    }
    if (focus.entityType === "cluster") {
      return String(clusterByTextId.get(textId) ?? "") === focus.entityId;
    }
    if (focus.entityType === "profile") {
      return (
        report.writing_profiles.find((item) => item.subject === focus.entityId)?.representative_text_ids?.includes(textId) ??
        false
      );
    }
    return true;
  };

  const isEvidenceFocused = (item: EvidenceItem) => {
    if (!focus) return true;
    if (focus.entityType === "evidence") return focus.entityId === item.evidence_id;
    if (focus.entityType === "text") return item.source_text_ids.includes(focus.entityId);
    if (focus.entityType === "conclusion") return item.linked_conclusion_keys?.includes(focus.entityId) ?? false;
    if (focus.entityType === "cluster") {
      return item.source_text_ids.some(
        (textId) => String(clusterByTextId.get(textId) ?? "") === focus.entityId,
      );
    }
    if (focus.entityType === "profile") {
      const textIds =
        report.writing_profiles.find((profile) => profile.subject === focus.entityId)?.representative_text_ids ?? [];
      return textIds.some((textId) => item.source_text_ids.includes(textId));
    }
    return true;
  };

  const isConclusionFocused = (conclusion: ReportConclusion) => {
    if (!focus) return true;
    if (focus.entityType === "conclusion") return focus.entityId === conclusion.key;
    if (focus.entityType === "evidence") return conclusion.evidence_ids.includes(focus.entityId);
    if (focus.entityType === "text") return conclusionTextIds.get(conclusion.key)?.includes(focus.entityId) ?? false;
    if (focus.entityType === "cluster") {
      return (conclusionTextIds.get(conclusion.key) ?? []).some(
        (textId) => String(clusterByTextId.get(textId) ?? "") === focus.entityId,
      );
    }
    if (focus.entityType === "profile") {
      const profileTextIds =
        report.writing_profiles.find((profile) => profile.subject === focus.entityId)?.representative_text_ids ?? [];
      return (conclusionTextIds.get(conclusion.key) ?? []).some((textId) => profileTextIds.includes(textId));
    }
    return true;
  };

  const isProfileFocused = (profile: WritingProfile) => {
    if (!focus) return true;
    if (focus.entityType === "profile") return focus.entityId === profile.subject;
    if (focus.entityType === "text") {
      return profile.representative_text_ids?.includes(focus.entityId) ?? false;
    }
    if (focus.entityType === "cluster") {
      return String(profileClusterMap.get(profile.subject) ?? "") === focus.entityId;
    }
    if (focus.entityType === "evidence") {
      const evidence = evidenceById.get(focus.entityId);
      return (
        profile.representative_text_ids?.some((textId) => evidence?.source_text_ids.includes(textId)) ??
        false
      );
    }
    if (focus.entityType === "conclusion") {
      const scoped = conclusionTextIds.get(focus.entityId) ?? [];
      return profile.representative_text_ids?.some((textId) => scoped.includes(textId)) ?? false;
    }
    return true;
  };

  const isClusterFocused = (cluster: ClusterViewCluster) => {
    if (!focus) return true;
    if (focus.entityType === "cluster") return focus.entityId === String(cluster.cluster_id);
    if (focus.entityType === "text") return cluster.member_text_ids.includes(focus.entityId);
    if (focus.entityType === "evidence") {
      return cluster.member_text_ids.some((textId) =>
        evidenceById.get(focus.entityId)?.source_text_ids.includes(textId),
      );
    }
    if (focus.entityType === "profile") {
      return (
        report.writing_profiles
          .find((profile) => profile.subject === focus.entityId)
          ?.representative_text_ids?.some((textId) => cluster.member_text_ids.includes(textId)) ??
        false
      );
    }
    if (focus.entityType === "conclusion") {
      return cluster.member_text_ids.some((textId) =>
        (conclusionTextIds.get(focus.entityId) ?? []).includes(textId),
      );
    }
    return true;
  };

  const renderFeatureSignature = (textId: string) => {
    const feature = featureMap.get(textId);
    if (!feature) return null;

    return (
      <div className="mt-2 flex items-center gap-2">
        {FEATURE_SIGNATURE.map((metric) => {
          const source = metric.source === "rust"
            ? (feature.rust_features as unknown as Record<string, number>)
            : (feature.nlp_features as unknown as Record<string, number>);
          const value = source[metric.key] ?? 0;
          const normalized = normalizeMetric(value, metric.min, metric.max);
          return (
            <Tooltip key={`${textId}-${metric.key}`}>
              <TooltipTrigger asChild>
                <div className="w-12">
                  <div className="h-1.5 rounded-full bg-border/70">
                    <div
                      className="h-1.5 rounded-full bg-indigo-500"
                      style={{ width: `${Math.max(12, normalized * 100)}%` }}
                    />
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <div>{metric.label}</div>
                <div>{value.toFixed(3)}</div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    );
  };

  const renderDrawer = () => {
    if (!drawerEntity) return null;

    if (drawerEntity.kind === "conclusion") {
      const conclusion = drawerEntity.conclusion;
      return (
        <>
          <SheetHeader className="border-b border-border/60 pb-5">
            <SheetTitle>{t("detail.scroll.drawer.conclusionTitle")}</SheetTitle>
            <SheetDescription>{conclusion.statement}</SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-5rem)]">
            <div className="space-y-6 p-5">
              <MetricList
                items={[
                  [t("detail.scroll.drawer.signalStrength"), `${certainty(conclusion)}%`],
                  [t("detail.scroll.drawer.evidenceCount"), String(conclusion.evidence_ids.length)],
                  [t("detail.scroll.drawer.counterCount"), String(conclusion.counter_evidence.length)],
                ]}
              />
              <DrawerBlock title={t("detail.scroll.drawer.evidenceList")}>
                <div className="flex flex-wrap gap-2">
                  {conclusion.evidence_ids.map((evidenceId) => (
                    <Button
                      key={evidenceId}
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        const evidence = evidenceById.get(evidenceId);
                        if (evidence) {
                          scrollToSection("evidence-chain");
                          openDrawer(
                            { kind: "evidence", evidence },
                            "conclusion-drawer",
                            { entityType: "evidence", entityId: evidence.evidence_id, source: "conclusion-drawer" },
                          );
                        }
                      }}
                    >
                      {evidenceId}
                    </Button>
                  ))}
                </div>
              </DrawerBlock>
              <DrawerBlock title={t("detail.scroll.drawer.counterSignals")}>
                <BulletedList items={conclusion.counter_evidence} emptyLabel={t("detail.scroll.empty")} />
              </DrawerBlock>
              <DrawerBlock title={t("detail.scroll.drawer.limitations")}>
                <BulletedList items={conclusion.limitations} emptyLabel={t("detail.scroll.empty")} />
              </DrawerBlock>
            </div>
          </ScrollArea>
        </>
      );
    }

    if (drawerEntity.kind === "evidence") {
      const item = drawerEntity.evidence;
      const compareIds = item.source_text_ids.slice(0, 2);
      return (
        <>
          <SheetHeader className="border-b border-border/60 pb-5">
            <SheetTitle>{item.label}</SheetTitle>
            <SheetDescription>{item.finding || item.summary}</SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-5rem)]">
            <div className="space-y-6 p-5">
              <MetricList
                items={[
                  [t("detail.scroll.drawer.strength"), item.strength ?? t("detail.scroll.notSpecified")],
                  [t("detail.scroll.drawer.linkedConclusions"), String(item.linked_conclusion_keys?.length ?? 0)],
                  [t("detail.scroll.drawer.relatedTexts"), String(item.source_text_ids.length)],
                ]}
              />
              {item.why_it_matters && (
                <DrawerBlock title={t("detail.scroll.drawer.whyItMatters")}>
                  <p className="text-sm leading-7 text-foreground/88">{item.why_it_matters}</p>
                </DrawerBlock>
              )}
              <DrawerBlock title={t("detail.scroll.drawer.relatedTexts")}>
                <div className="flex flex-wrap gap-2">
                  {item.source_text_ids.map((textId) => (
                    <Button
                      key={textId}
                      variant="outline"
                      size="xs"
                      onClick={() =>
                        openDrawer(
                          { kind: "text", textId },
                          "evidence-drawer",
                          { entityType: "text", entityId: textId, source: "evidence-drawer" },
                        )
                      }
                    >
                      {textMetaMap.get(textId)?.alias ?? textId}
                    </Button>
                  ))}
                </div>
              </DrawerBlock>
              {compareIds.length >= 1 && (
                <DrawerBlock title={t("detail.scroll.drawer.featureSignature")}>
                  <div className="space-y-3">
                    {compareIds.map((textId) => (
                      <div key={textId} className="rounded-lg border border-border/60 p-3">
                        <div className="text-sm font-medium">
                          {textMetaMap.get(textId)?.alias ?? textId}
                        </div>
                        {renderFeatureSignature(textId)}
                      </div>
                    ))}
                  </div>
                </DrawerBlock>
              )}
              <DrawerBlock title={t("detail.scroll.drawer.counterSignals")}>
                <BulletedList items={item.counter_readings ?? []} emptyLabel={t("detail.scroll.empty")} />
              </DrawerBlock>
            </div>
          </ScrollArea>
        </>
      );
    }

    if (drawerEntity.kind === "text") {
      const meta = textMetaMap.get(drawerEntity.textId);
      const anomaly = anomaliesByTextId.get(drawerEntity.textId);
      return (
        <>
          <SheetHeader className="border-b border-border/60 pb-5">
            <SheetTitle>{meta?.alias ?? drawerEntity.textId}</SheetTitle>
            <SheetDescription>{meta?.group ?? drawerEntity.textId}</SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-5rem)]">
            <div className="space-y-6 p-5">
              <DrawerBlock title={t("detail.scroll.drawer.preview")}>
                <p className="text-sm leading-7 text-foreground/88">
                  {meta?.preview || t("detail.scroll.empty")}
                </p>
              </DrawerBlock>
              <MetricList
                items={[
                  [t("detail.scroll.drawer.cluster"), clusterByTextId.get(drawerEntity.textId)?.toString() ?? t("detail.scroll.notSpecified")],
                  [t("detail.scroll.drawer.anomalyFlag"), anomaly ? t("detail.scroll.yes") : t("detail.scroll.no")],
                  [t("detail.scroll.drawer.evidenceCount"), String(report.evidence_items.filter((item) => item.source_text_ids.includes(drawerEntity.textId)).length)],
                ]}
              />
              {renderFeatureSignature(drawerEntity.textId) && (
                <DrawerBlock title={t("detail.scroll.drawer.featureSignature")}>
                  {renderFeatureSignature(drawerEntity.textId)}
                </DrawerBlock>
              )}
              {anomaly && (
                <DrawerBlock title={t("detail.scroll.drawer.anomalyDimensions")}>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(anomaly.outlier_dimensions).map(([key, value]) => (
                      <Badge key={key} variant="outline" className="border-red-300/60 text-red-700 dark:border-red-500/35 dark:text-red-300">
                        {key}: {typeof value === "number" ? value.toFixed(2) : String(value)}
                      </Badge>
                    ))}
                  </div>
                </DrawerBlock>
              )}
            </div>
          </ScrollArea>
        </>
      );
    }

    if (drawerEntity.kind === "profile") {
      const profile = drawerEntity.profile;
      return (
        <>
          <SheetHeader className="border-b border-border/60 pb-5">
            <SheetTitle>{profile.headline || profile.subject}</SheetTitle>
            <SheetDescription>{profile.observable_summary || profile.summary}</SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-5rem)]">
            <div className="space-y-6 p-5">
              <MetricList
                items={[
                  [t("detail.scroll.drawer.dimensionCount"), String(profile.dimensions.length)],
                  [t("detail.scroll.drawer.cluster"), profileClusterMap.get(profile.subject)?.toString() ?? t("detail.scroll.notSpecified")],
                  [t("detail.scroll.drawer.representativeTexts"), String(profile.representative_text_ids?.length ?? 0)],
                ]}
              />
              <DrawerBlock title={t("detail.scroll.drawer.stableHabits")}>
                <BulletedList items={profile.stable_habits ?? []} emptyLabel={t("detail.scroll.empty")} />
              </DrawerBlock>
              <DrawerBlock title={t("detail.scroll.drawer.processClues")}>
                <BulletedList items={profile.process_clues ?? []} emptyLabel={t("detail.scroll.empty")} />
              </DrawerBlock>
              <DrawerBlock title={t("detail.scroll.drawer.anomalyWatch")}>
                <BulletedList items={profile.anomalies ?? []} emptyLabel={t("detail.scroll.empty")} />
              </DrawerBlock>
            </div>
          </ScrollArea>
        </>
      );
    }

    const cluster = drawerEntity.cluster;
    return (
      <>
        <SheetHeader className="border-b border-border/60 pb-5">
          <SheetTitle>{cluster.label}</SheetTitle>
          <SheetDescription>{cluster.theme_summary || cluster.separation_summary || t("detail.scroll.empty")}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-5rem)]">
          <div className="space-y-6 p-5">
            <MetricList
              items={[
                [t("detail.scroll.drawer.memberCount"), String(cluster.member_text_ids.length)],
                [t("detail.scroll.drawer.evidenceCount"), String(cluster.representative_evidence_ids?.length ?? 0)],
                [t("detail.scroll.drawer.anomalyFlag"), String(cluster.member_text_ids.filter((textId) => anomaliesByTextId.has(textId)).length)],
              ]}
            />
            {cluster.separation_summary && (
              <DrawerBlock title={t("detail.scroll.drawer.separationSummary")}>
                <p className="text-sm leading-7 text-foreground/88">{cluster.separation_summary}</p>
              </DrawerBlock>
            )}
            <DrawerBlock title={t("detail.scroll.drawer.members")}>
              <div className="flex flex-wrap gap-2">
                {cluster.member_text_ids.map((textId) => (
                  <Button
                    key={textId}
                    variant="outline"
                    size="xs"
                    onClick={() =>
                      openDrawer(
                        { kind: "text", textId },
                        "cluster-drawer",
                        { entityType: "text", entityId: textId, source: "cluster-drawer" },
                      )
                    }
                  >
                    {textMetaMap.get(textId)?.alias ?? textId}
                  </Button>
                ))}
              </div>
            </DrawerBlock>
          </div>
        </ScrollArea>
      </>
    );
  };

  return (
    <TooltipProvider>
      <div className="grid gap-6 xl:grid-cols-[228px_minmax(0,1fr)]">
        <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <div className="rounded-2xl border border-border/70 bg-card/96 p-4">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {t("detail.scroll.lenses")}
            </div>
            <div className="mt-3 space-y-2">
              {(["feature", "cluster", "anomaly"] as LensKey[]).map((lens) => (
                <button
                  key={lens}
                  type="button"
                  onClick={() => toggleLens(lens)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                    lenses[lens]
                      ? "border-foreground/20 bg-muted text-foreground"
                      : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  <span>{t(`detail.scroll.lens.${lens}`)}</span>
                  <span className="text-xs uppercase">{lenses[lens] ? t("detail.scroll.on") : t("detail.scroll.off")}</span>
                </button>
              ))}
            </div>
            <div className="mt-4 text-xs leading-6 text-muted-foreground">
              {featuresLoading ? t("detail.scroll.featuresLoading") : t("detail.scroll.focusHint")}
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/96 p-4">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {t("detail.scroll.minimap")}
            </div>
            <div className="mt-3 space-y-2">
              {SECTION_ORDER.map((section) => (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => scrollToSection(section.key)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors",
                    currentSection === section.key
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  )}
                >
                  <span
                    className="h-8 w-1.5 rounded-full"
                    style={{ backgroundColor: section.color }}
                  />
                  <span>{t(section.labelKey)}</span>
                </button>
              ))}
            </div>
          </div>

          {focus && (
            <div className="rounded-2xl border border-border/70 bg-card/96 p-4">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {t("detail.scroll.focused")}
              </div>
              <div className="mt-2 text-sm text-foreground">
                {focus.entityType} · {focus.entityId}
              </div>
              <Button variant="ghost" size="xs" className="mt-3" onClick={() => clearFocus()}>
                {t("detail.scroll.clearFocus")}
              </Button>
            </div>
          )}
        </aside>

        <div className="space-y-6">
          {SECTION_ORDER.map((section) => {
            if (section.key === "case-header") {
              return (
                <section
                  key={section.key}
                  ref={(node) => {
                    sectionRefs.current[section.key] = node;
                  }}
                  data-section-key={section.key}
                  className={cn(
                    "rounded-[28px] border bg-card/96 p-6",
                    section.borderClass,
                    section.tintClass,
                  )}
                >
                  <SectionHeader title={t(section.labelKey)} accentColor={section.color} />
                  <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.7fr)]">
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-border/60 bg-background/80 p-5">
                        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                          {t("detail.scroll.verdictBar")}
                        </div>
                        <div className="mt-3 text-2xl font-semibold leading-9 text-foreground">
                          {report.narrative?.lead || report.summary || t("detail.scroll.empty")}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {leadConclusion && (
                            <>
                              <Badge variant="outline" className={conclusionTone(leadConclusion.grade).badgeClass}>
                                {t(`detail.scroll.grade.${leadConclusion.grade}`)}
                              </Badge>
                              <Badge variant="outline">
                                {leadPercent}% {t("detail.scroll.signalStrength")}
                              </Badge>
                            </>
                          )}
                          <Badge variant="outline">{analysis.llm_backend}</Badge>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border/60 bg-background/80 p-5">
                        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                          {t("detail.scroll.readingPath")}
                        </div>
                        <p className="mt-3 text-sm leading-7 text-muted-foreground">
                          {t("detail.scroll.readingHint")}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                        <MetricCard label={t("report.textCountSuffix")} value={String(analysis.text_count)} />
                        <MetricCard label={t("detail.scroll.sourceGroups")} value={String(analysis.author_count)} />
                        <MetricCard label={t("detail.scroll.evidenceCount")} value={String(report.evidence_items.length)} />
                        <MetricCard label={t("detail.scroll.clusterCount")} value={String(report.cluster_view?.clusters.length ?? 0)} />
                      </div>
                      <div className="rounded-2xl border border-border/60 bg-background/80 p-5">
                        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                          {t("detail.scroll.nextStep")}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/analyses/features?id=${encodeURIComponent(analysis.id)}`}>
                              {t("detail.scroll.openFeatureWorkbench")}
                            </Link>
                          </Button>
                          {report.anomaly_samples.length > 0 && (
                            <Button size="sm" variant="ghost" onClick={() => scrollToSection("cluster-view")}>
                              {t("detail.scroll.openAnomalyView")}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              );
            }

            if (section.key === "conclusion-rail") {
              return (
                <section
                  key={section.key}
                  ref={(node) => {
                    sectionRefs.current[section.key] = node;
                  }}
                  data-section-key={section.key}
                  className="rounded-[28px] border border-border/70 bg-card/96 p-6"
                >
                  <SectionHeader title={t(section.labelKey)} accentColor={section.color} />
                  <div className="space-y-4">
                    {report.conclusions.map((conclusion) => {
                      const percent = certainty(conclusion);
                      const tone = conclusionTone(conclusion.grade);
                      const focused = isConclusionFocused(conclusion);
                      return (
                        <button
                          key={conclusion.key}
                          type="button"
                          onClick={() => openDrawer({ kind: "conclusion", conclusion }, "conclusion-rail")}
                          className={cn(
                            "w-full rounded-2xl border border-border/60 bg-background/80 p-5 text-left transition-colors",
                            focused ? "opacity-100" : "opacity-35",
                            focus && focused && "border-foreground/20",
                          )}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className={tone.badgeClass}>
                                  {t(`detail.scroll.grade.${conclusion.grade}`)}
                                </Badge>
                                <Badge variant="outline">{conclusion.evidence_ids.length} {t("detail.scroll.evidenceCount")}</Badge>
                                {conclusion.counter_evidence.length > 0 && (
                                  <Badge variant="outline">{conclusion.counter_evidence.length} {t("detail.scroll.counterSignals")}</Badge>
                                )}
                              </div>
                              <div className="text-lg font-semibold text-foreground">
                                {conclusion.subject || conclusion.statement}
                              </div>
                              <p className="text-sm leading-7 text-muted-foreground">
                                {conclusion.statement}
                              </p>
                            </div>
                            <div className={cn("shrink-0 text-2xl font-semibold", tone.valueClass)}>
                              {percent}%
                            </div>
                          </div>
                          <div className="mt-4 h-2 rounded-full bg-muted">
                            <div className={cn("h-2 rounded-full", tone.barClass)} style={{ width: `${percent}%` }} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            }

            if (section.key === "evidence-chain") {
              return (
                <section
                  key={section.key}
                  ref={(node) => {
                    sectionRefs.current[section.key] = node;
                  }}
                  data-section-key={section.key}
                  className={cn(
                    "rounded-[28px] border border-border/70 bg-card/96 p-6",
                    lenses.feature && "border-dashed border-indigo-400/45",
                  )}
                >
                  <SectionHeader title={t(section.labelKey)} accentColor={section.color} />
                  <div className="overflow-x-auto">
                    <div className="min-w-[760px] space-y-5">
                      <div className="grid gap-3" style={{ gridTemplateColumns: `minmax(320px,1.1fr) repeat(${evidenceScopeTextIds.length}, minmax(64px, 1fr))` }}>
                        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                          {t("detail.scroll.evidenceSummary")}
                        </div>
                        {evidenceScopeTextIds.map((textId) => (
                          <button
                            key={`column-${textId}`}
                            type="button"
                            onClick={() =>
                              openDrawer(
                                { kind: "text", textId },
                                "evidence-chain",
                                { entityType: "text", entityId: textId, source: "evidence-chain" },
                              )
                            }
                            className={cn(
                              "rounded-lg border border-border/60 px-2 py-2 text-center text-xs text-muted-foreground transition-colors",
                              isTextFocused(textId) ? "opacity-100" : "opacity-30",
                            )}
                          >
                            <div className="font-medium text-foreground">{textMetaMap.get(textId)?.alias ?? textId}</div>
                            <div className="mt-1 truncate">{textMetaMap.get(textId)?.group ?? textId}</div>
                          </button>
                        ))}
                      </div>

                      {(["core", "supporting", "conflicting"] as const).map((strength) =>
                        groupedEvidence[strength].length > 0 ? (
                          <div key={strength} className="space-y-3">
                            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                              {t(`detail.scroll.strength.${strength}`)}
                            </div>
                            {groupedEvidence[strength].map((item) => (
                              <div
                                key={item.evidence_id}
                                className={cn(
                                  "grid gap-3 rounded-2xl border border-border/60 bg-background/80 p-4 transition-colors",
                                  isEvidenceFocused(item) ? "opacity-100" : "opacity-35",
                                )}
                                style={{ gridTemplateColumns: `minmax(320px,1.1fr) repeat(${evidenceScopeTextIds.length}, minmax(64px, 1fr))` }}
                              >
                                <button
                                  type="button"
                                  onClick={() => openDrawer({ kind: "evidence", evidence: item }, "evidence-chain")}
                                  className="space-y-2 text-left"
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="outline">{item.evidence_id}</Badge>
                                    <div className="text-sm font-semibold text-foreground">{item.label}</div>
                                  </div>
                                  <p className="text-sm leading-7 text-muted-foreground">
                                    {item.finding || item.summary}
                                  </p>
                                  {lenses.feature && item.source_text_ids[0] && renderFeatureSignature(item.source_text_ids[0])}
                                </button>
                                {evidenceScopeTextIds.map((textId) => {
                                  const isDirect = item.source_text_ids.includes(textId);
                                  const sharesCluster =
                                    !isDirect &&
                                    clusterByTextId.get(textId) != null &&
                                    item.source_text_ids.some(
                                      (sourceTextId) => clusterByTextId.get(sourceTextId) === clusterByTextId.get(textId),
                                    );
                                  const anomaly = anomaliesByTextId.get(textId);
                                  return (
                                    <Tooltip key={`${item.evidence_id}-${textId}`}>
                                      <TooltipTrigger asChild>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            openDrawer(
                                              { kind: "text", textId },
                                              "evidence-cell",
                                              { entityType: "text", entityId: textId, source: "evidence-cell" },
                                            )
                                          }
                                          className={cn(
                                            "flex min-h-16 items-center justify-center rounded-xl border border-border/60 transition-colors",
                                            isDirect && "border-amber-300/70 bg-amber-50 dark:border-amber-500/35 dark:bg-amber-500/10",
                                            !isDirect && sharesCluster && lenses.cluster && "border-emerald-300/70 bg-emerald-50 dark:border-emerald-500/35 dark:bg-emerald-500/10",
                                            anomaly && lenses.anomaly && "outline outline-1 outline-red-400",
                                            !isTextFocused(textId) && "opacity-30",
                                          )}
                                        >
                                          <span
                                            className={cn(
                                              "h-3 w-3 rounded-full border",
                                              isDirect
                                                ? "border-amber-500 bg-amber-500"
                                                : sharesCluster && lenses.cluster
                                                  ? "border-emerald-500 bg-transparent"
                                                  : "border-muted-foreground/35 bg-transparent",
                                            )}
                                          />
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent side="top">
                                        <div className="max-w-56 space-y-1">
                                          <div className="font-medium">{textMetaMap.get(textId)?.alias ?? textId}</div>
                                          <div>{item.why_it_matters || item.summary}</div>
                                          {item.counter_readings?.[0] && (
                                            <div className="text-muted-foreground">
                                              {item.counter_readings[0]}
                                            </div>
                                          )}
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        ) : null,
                      )}
                    </div>
                  </div>
                </section>
              );
            }

            if (section.key === "writing-profiles") {
              const chartWidth = Math.max(760, profileDimensions.length * 120);
              const chartHeight = 300;
              const axisYTop = 26;
              const axisYBottom = chartHeight - 44;
              const xStep = profileDimensions.length > 1 ? (chartWidth - 80) / (profileDimensions.length - 1) : 0;
              const axisX = profileDimensions.map((_, index) => 40 + xStep * index);
              return (
                <section
                  key={section.key}
                  ref={(node) => {
                    sectionRefs.current[section.key] = node;
                  }}
                  data-section-key={section.key}
                  className={cn(
                    "rounded-[28px] border border-border/70 bg-card/96 p-6",
                    lenses.cluster && "border-dashed border-emerald-400/45",
                  )}
                >
                  <SectionHeader title={t(section.labelKey)} accentColor={section.color} />
                  {report.writing_profiles.length > 0 && profileDimensions.length > 0 ? (
                    <div className="space-y-5">
                      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-background/80 p-4">
                        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="min-w-full">
                          {profileDimensions.map((dimension, index) => (
                            <g key={dimension.key}>
                              <line
                                x1={axisX[index]}
                                x2={axisX[index]}
                                y1={axisYTop}
                                y2={axisYBottom}
                                stroke="currentColor"
                                opacity={0.18}
                              />
                              <text
                                x={axisX[index]}
                                y={chartHeight - 16}
                                textAnchor="middle"
                                fontSize="11"
                                fill="currentColor"
                              >
                                {dimension.label}
                              </text>
                            </g>
                          ))}

                          {report.writing_profiles.map((profile, profileIndex) => {
                            const points = profileDimensions.map((dimension, index) => {
                              const current = profile.dimensions.find((item) => item.key === dimension.key);
                              const score = current?.score ?? 0;
                              const y = axisYBottom - (Math.max(0, Math.min(100, score)) / 100) * (axisYBottom - axisYTop);
                              return `${axisX[index]},${y}`;
                            });
                            const clusterId = profileClusterMap.get(profile.subject) ?? null;
                            const color = lenses.cluster && clusterId != null
                              ? clusterPalette.get(clusterId) ?? PROFILE_COLORS[profileIndex % PROFILE_COLORS.length]
                              : PROFILE_COLORS[profileIndex % PROFILE_COLORS.length];
                            return (
                              <g key={profile.subject} opacity={isProfileFocused(profile) ? 1 : 0.25}>
                                <polyline
                                  points={points.join(" ")}
                                  fill="none"
                                  stroke={color}
                                  strokeWidth="2.5"
                                  onClick={() => openDrawer({ kind: "profile", profile }, "writing-profiles")}
                                  className="cursor-pointer"
                                />
                                {points.map((point, index) => {
                                  const [cx, cy] = point.split(",").map(Number);
                                  return (
                                    <circle
                                      key={`${profile.subject}-${profileDimensions[index]?.key}`}
                                      cx={cx}
                                      cy={cy}
                                      r="4"
                                      fill={color}
                                      className="cursor-pointer"
                                      onClick={() => openDrawer({ kind: "profile", profile }, "writing-profiles")}
                                    />
                                  );
                                })}
                              </g>
                            );
                          })}
                        </svg>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        {report.writing_profiles.map((profile, index) => {
                          const clusterId = profileClusterMap.get(profile.subject) ?? null;
                          return (
                            <button
                              key={profile.subject}
                              type="button"
                              onClick={() => openDrawer({ kind: "profile", profile }, "writing-profile-list")}
                              className={cn(
                                "rounded-2xl border border-border/60 bg-background/80 p-4 text-left transition-colors",
                                isProfileFocused(profile) ? "opacity-100" : "opacity-35",
                              )}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-base font-semibold text-foreground">
                                  {profile.headline || profile.subject}
                                </div>
                                <span
                                  className="h-3 w-3 rounded-full"
                                  style={{
                                    backgroundColor:
                                      lenses.cluster && clusterId != null
                                        ? clusterPalette.get(clusterId) ?? PROFILE_COLORS[index % PROFILE_COLORS.length]
                                        : PROFILE_COLORS[index % PROFILE_COLORS.length],
                                  }}
                                />
                              </div>
                              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                                {profile.observable_summary || profile.summary}
                              </p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {(profile.stable_habits ?? []).slice(0, 2).map((habit) => (
                                  <Badge key={habit} variant="outline">
                                    {habit}
                                  </Badge>
                                ))}
                                {lenses.cluster && clusterId != null && (
                                  <Badge variant="outline">
                                    Cluster {clusterId}
                                  </Badge>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <EmptyBlock label={t("detail.scroll.empty")} />
                  )}
                </section>
              );
            }

            if (section.key === "cluster-view") {
              return (
                <section
                  key={section.key}
                  ref={(node) => {
                    sectionRefs.current[section.key] = node;
                  }}
                  data-section-key={section.key}
                  className={cn(
                    "rounded-[28px] border border-border/70 bg-card/96 p-6",
                    lenses.anomaly && "border-dashed border-red-400/45",
                  )}
                >
                  <SectionHeader title={t(section.labelKey)} accentColor={section.color} />
                  {(report.cluster_view?.clusters.length ?? 0) > 0 ? (
                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
                      <div className="space-y-4">
                        <div className="overflow-x-auto rounded-2xl border border-border/60 bg-background/80 p-4">
                          <div
                            className="inline-grid gap-1"
                            style={{ gridTemplateColumns: `repeat(${visibleClusterTextIds.length}, 26px)` }}
                          >
                            {clusterSimilarity.flatMap((row, rowIndex) =>
                              row.map((value, columnIndex) => {
                                const firstId = visibleClusterTextIds[rowIndex];
                                const secondId = visibleClusterTextIds[columnIndex];
                                const pairSelected =
                                  focus?.entityType === "text" &&
                                  (focus.entityId === firstId || focus.entityId === secondId);
                                return (
                                  <Tooltip key={`${firstId}-${secondId}`}>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          openDrawer(
                                            { kind: "text", textId: firstId },
                                            "cluster-heatmap",
                                            { entityType: "text", entityId: firstId, source: "cluster-heatmap" },
                                          )
                                        }
                                        className={cn(
                                          "h-6 w-6 rounded-[6px] border border-border/50 transition-opacity",
                                          pairSelected ? "opacity-100" : focus ? "opacity-40" : "opacity-100",
                                        )}
                                        style={{ backgroundColor: heatColor(value) }}
                                      />
                                    </TooltipTrigger>
                                    <TooltipContent side="top">
                                      <div className="space-y-1">
                                        <div>
                                          {textMetaMap.get(firstId)?.alias ?? firstId} ↔ {textMetaMap.get(secondId)?.alias ?? secondId}
                                        </div>
                                        <div>{value.toFixed(3)}</div>
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                );
                              }),
                            )}
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <MetricCard label={t("detail.scroll.samplesCompared")} value={String(visibleClusterTextIds.length)} />
                          <MetricCard label={t("detail.scroll.clusterCount")} value={String(report.cluster_view?.clusters.length ?? 0)} />
                        </div>
                      </div>

                      <div className="space-y-3 rounded-2xl border border-border/60 bg-background/80 p-4">
                        {(report.cluster_view?.clusters ?? []).map((cluster) => {
                          const anomalyCount = cluster.member_text_ids.filter((textId) => anomaliesByTextId.has(textId)).length;
                          return (
                            <button
                              key={cluster.cluster_id}
                              type="button"
                              onClick={() => openDrawer({ kind: "cluster", cluster }, "cluster-view")}
                              className={cn(
                                "w-full rounded-xl border border-border/60 p-4 text-left transition-colors",
                                isClusterFocused(cluster) ? "opacity-100" : "opacity-35",
                              )}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-base font-semibold text-foreground">{cluster.label}</div>
                                <Badge variant="outline">{cluster.member_text_ids.length}</Badge>
                              </div>
                              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                                {cluster.theme_summary || cluster.separation_summary || t("detail.scroll.empty")}
                              </p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {(cluster.top_markers ?? []).slice(0, 2).map((marker) => (
                                  <Badge key={marker} variant="outline">
                                    {marker}
                                  </Badge>
                                ))}
                                {lenses.anomaly && anomalyCount > 0 && (
                                  <Badge variant="outline" className="border-red-300/60 text-red-700 dark:border-red-500/35 dark:text-red-300">
                                    {anomalyCount} {t("detail.scroll.anomalyWatch")}
                                  </Badge>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <EmptyBlock label={t("detail.scroll.empty")} />
                  )}
                </section>
              );
            }

            if (section.key === "narrative-spine") {
              const narrativeSections = report.narrative?.sections ?? [];
              const activeSection = narrativeSections.find((item) => item.key === activeNarrativeKey) ?? narrativeSections[0];
              const relatedTextIds = Array.from(
                new Set(
                  (activeSection?.evidence_ids ?? []).flatMap(
                    (evidenceId) => evidenceById.get(evidenceId)?.source_text_ids ?? [],
                  ),
                ),
              );
              return (
                <section
                  key={section.key}
                  ref={(node) => {
                    sectionRefs.current[section.key] = node;
                  }}
                  data-section-key={section.key}
                  className="rounded-[28px] border border-border/70 bg-card/96 p-6"
                >
                  <SectionHeader title={t(section.labelKey)} accentColor={section.color} />
                  {narrativeSections.length > 0 ? (
                    <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
                      <div className="space-y-2">
                        {narrativeSections.map((sectionItem, index) => (
                          <button
                            key={sectionItem.key}
                            type="button"
                            onClick={() => setActiveNarrativeKey(sectionItem.key)}
                            className={cn(
                              "flex w-full gap-3 rounded-xl border px-3 py-3 text-left transition-colors",
                              activeSection?.key === sectionItem.key
                                ? "border-slate-400/45 bg-slate-50 text-foreground dark:bg-slate-500/10"
                                : "border-border/60 bg-background/80 text-muted-foreground hover:text-foreground",
                            )}
                          >
                            <span
                              className="mt-1 h-10 w-1.5 shrink-0 rounded-full"
                              style={{
                                backgroundColor: SECTION_ORDER[5].color,
                                opacity: activeSection?.key === sectionItem.key ? 1 : 0.35,
                              }}
                            />
                            <div className="space-y-1">
                              <div className="text-xs uppercase tracking-[0.16em]">
                                {index + 1}
                              </div>
                              <div className="font-medium">{sectionItem.title}</div>
                              <div className="text-sm leading-6">
                                {humanizeNarrative(sectionItem.summary)}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>

                      {activeSection ? (
                        <div className="rounded-2xl border border-border/60 bg-background/80 p-5">
                          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                            {activeSection.title}
                          </div>
                          <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground/88">
                            {humanizeNarrative(activeSection.detail || activeSection.summary)}
                          </div>
                          {relatedTextIds.length > 0 && (
                            <div className="mt-5">
                              <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                                {t("detail.scroll.relatedTexts")}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {relatedTextIds.map((textId) => (
                                  <Button
                                    key={textId}
                                    variant="outline"
                                    size="xs"
                                    onClick={() =>
                                      openDrawer(
                                        { kind: "text", textId },
                                        "narrative-spine",
                                        { entityType: "text", entityId: textId, source: "narrative-spine" },
                                      )
                                    }
                                  >
                                    {textMetaMap.get(textId)?.alias ?? textId}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <EmptyBlock label={t("detail.scroll.empty")} />
                      )}
                    </div>
                  ) : (
                    <EmptyBlock label={t("detail.scroll.empty")} />
                  )}
                </section>
              );
            }

            return (
              <section
                key={section.key}
                ref={(node) => {
                  sectionRefs.current[section.key] = node;
                }}
                data-section-key={section.key}
                className="rounded-[28px] border border-border/70 bg-card/96 p-6"
              >
                <SectionHeader title={t(section.labelKey)} accentColor={section.color} />
                <Accordion type="multiple" className="space-y-3">
                  <AccordionItem value="methods" className="rounded-2xl border border-border/60 bg-background/80 px-4">
                    <AccordionTrigger>{t("detail.scroll.methods")}</AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                      {report.methods.length > 0 ? (
                        report.methods.map((method) => (
                          <div key={method.key} className="rounded-xl border border-border/60 p-4">
                            <div className="text-sm font-semibold">{method.title}</div>
                            <div className="mt-1 text-sm leading-7 text-muted-foreground">{method.description}</div>
                          </div>
                        ))
                      ) : (
                        <EmptyBlock label={t("detail.scroll.empty")} />
                      )}
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="reproducibility" className="rounded-2xl border border-border/60 bg-background/80 px-4">
                    <AccordionTrigger>{t("detail.scroll.reproducibility")}</AccordionTrigger>
                    <AccordionContent className="pt-2">
                      <MetricList
                        items={[
                          [t("detail.scroll.pipelineVersion"), report.reproducibility.pipeline_version],
                          [t("detail.scroll.modelId"), report.reproducibility.model_id ?? analysis.llm_backend],
                          [t("detail.scroll.generatedAt"), new Date(report.reproducibility.generated_at).toLocaleString()],
                        ]}
                      />
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="results" className="rounded-2xl border border-border/60 bg-background/80 px-4">
                    <AccordionTrigger>{t("detail.scroll.rawSignals")}</AccordionTrigger>
                    <AccordionContent className="space-y-3 pt-2">
                      {report.results.length > 0 ? (
                        report.results.map((result) => (
                          <div key={result.key} className="rounded-xl border border-border/60 p-4">
                            <div className="text-sm font-semibold">{result.title}</div>
                            <div className="mt-1 text-sm leading-7 text-muted-foreground">{result.body}</div>
                          </div>
                        ))
                      ) : (
                        <EmptyBlock label={t("detail.scroll.empty")} />
                      )}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </section>
            );
          })}
        </div>
      </div>

      <Sheet open={drawerEntity !== null} onOpenChange={(open) => {
        if (!open) {
          setDrawerEntity(null);
          clearFocus();
        }
      }}>
        <SheetContent side="right" className="w-full sm:max-w-[520px]">
          {renderDrawer()}
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  );
}

function SectionHeader({ title, accentColor }: { title: string; accentColor: string }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <span className="h-10 w-1.5 rounded-full" style={{ backgroundColor: accentColor }} />
      <div className="text-lg font-semibold text-foreground">{title}</div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function MetricList({ items }: { items: string[][] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-border/60 bg-background/60 p-3">
          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
          <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
        </div>
      ))}
    </div>
  );
}

function DrawerBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-border/60 bg-background/70 p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{title}</div>
      {children}
    </section>
  );
}

function EmptyBlock({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/70 bg-background/70 p-5 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function BulletedList({ items, emptyLabel }: { items: string[]; emptyLabel: string }) {
  if (items.length === 0) {
    return <div className="text-sm text-muted-foreground">{emptyLabel}</div>;
  }

  return (
    <ul className="space-y-2 text-sm leading-7 text-foreground/88">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/45" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
