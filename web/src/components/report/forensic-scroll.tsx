"use client";

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
  ArtifactRecord,
  ClusterViewCluster,
  EvidenceItem,
  FeatureVector,
  ForensicReport,
  ReportConclusion,
  TextEntry,
  WritingProfile,
  WritingProfileDimension,
} from "@/lib/types";
import { conclusionCertaintyPercent, cosineSimilarity } from "@/lib/forensic-math";
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
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { FADE_VARIANTS, TRANSITION_ENTER } from "@/lib/motion";
import { RevealOnScroll } from "@/components/motion/reveal-on-scroll";
import { useI18n } from "@/components/providers/i18n-provider";
import { AutoCollapse } from "@/components/report/auto-collapse";
import { EvidenceAppendix } from "@/components/report/evidence-appendix";
import {
  type FocusContext,
  useReportVisualizationStore,
} from "@/stores/report-visualization-store";
import { ReportMetaLabel } from "@/components/report/report-primitives";

type SectionKey =
  | "case-header"
  | "conclusion-rail"
  | "evidence-chain"
  | "writing-profiles"
  | "cluster-view"
  | "narrative-spine";

type DrawerEntity =
  | { kind: "conclusion"; conclusion: ReportConclusion }
  | { kind: "evidence"; evidence: EvidenceItem }
  | { kind: "text"; textId: string }
  | { kind: "profile"; profile: WritingProfile }
  | { kind: "cluster"; cluster: ClusterViewCluster };

const SECTION_ORDER: Array<{
  key: SectionKey;
  labelKey: string;
  color: string;
}> = [
  {
    key: "case-header",
    labelKey: "detail.scroll.section.caseHeader",
    color: "var(--section-narrative)",
  },
  {
    key: "narrative-spine",
    labelKey: "detail.scroll.section.narrativeSpine",
    color: "var(--section-evidence)",
  },
  {
    key: "writing-profiles",
    labelKey: "detail.scroll.section.writingProfiles",
    color: "var(--section-writing)",
  },
  {
    key: "cluster-view",
    labelKey: "detail.scroll.section.clusterView",
    color: "var(--section-cluster)",
  },
  {
    key: "conclusion-rail",
    labelKey: "detail.scroll.section.conclusionRail",
    color: "var(--section-graph)",
  },
  {
    key: "evidence-chain",
    labelKey: "detail.scroll.section.evidenceChain",
    color: "var(--section-timeline)",
  },
];

const PROFILE_COLORS = [
  "var(--profile-0)", "var(--profile-1)", "var(--profile-2)",
  "var(--profile-3)", "var(--profile-4)", "var(--profile-5)",
];
const HEAT_COLORS = [
  "var(--heat-0)", "var(--heat-1)", "var(--heat-2)",
  "var(--heat-3)", "var(--heat-4)",
];
const DEFAULT_VISIBLE_PROFILES = 8;
const DEFAULT_VISIBLE_PROFILE_DIMENSIONS = 12;
const DEFAULT_VISIBLE_REPRESENTATIVE_TEXTS = 16;
const DEFAULT_VISIBLE_CLUSTERS = 10;
const DEFAULT_VISIBLE_APPENDIX_ROWS = 8;
const DEFAULT_BULLET_LIMIT = 6;

const FEATURE_SIGNATURE = [
  {
    key: "type_token_ratio",
    source: "rust" as const,
    labelKey: "detail.scroll.feature.vocabDiversity",
    hintKey: "detail.scroll.feature.vocabDiversityHint",
    min: 0,
    max: 1,
  },
  {
    key: "avg_sentence_length",
    source: "rust" as const,
    labelKey: "detail.scroll.feature.sentenceLength",
    hintKey: "detail.scroll.feature.sentenceLengthHint",
    min: 0,
    max: 60,
  },
  {
    key: "formality_score",
    source: "rust" as const,
    labelKey: "detail.scroll.feature.formality",
    hintKey: "detail.scroll.feature.formalityHint",
    min: 0,
    max: 1,
  },
  {
    key: "emotional_tone",
    source: "nlp" as const,
    labelKey: "detail.scroll.feature.emotionalTone",
    hintKey: "detail.scroll.feature.emotionalToneHint",
    min: 0,
    max: 1,
  },
];

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

function normalizeMetric(value: number, min: number, max: number) {
  if (!Number.isFinite(value) || max <= min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripPreview(content?: string) {
  if (!content) return "";
  let preview = "";
  let pendingSpace = false;
  for (let index = 0; index < content.length && preview.length < 160; index += 1) {
    const char = content[index];
    if (/\s/u.test(char)) {
      pendingSpace = preview.length > 0;
      continue;
    }
    if (pendingSpace && preview.length > 0) {
      preview += " ";
      pendingSpace = false;
      if (preview.length >= 160) {
        break;
      }
    }
    preview += char;
  }
  return preview.trim();
}

function compactText(value?: string, limit = 140) {
  if (!value) return "";
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit).trimEnd()}…`;
}

function firstMeaningful(...values: Array<string | null | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim();
}

const PLACEHOLDER_LABELS = new Set([
  "",
  "unknown",
  "unknownsource",
  "unknowntime",
  "unnamedsubject",
  "none",
  "null",
  "n/a",
  "na",
  "未命名目标",
]);

const GENERIC_SOURCE_STEMS = new Set([
  "index",
  "data",
  "dump",
  "export",
  "sample",
  "samples",
  "message",
  "messages",
  "chat",
  "bundle",
  "records",
  "record",
  "text",
  "texts",
]);

function normalizeComparableText(value?: string) {
  return (value ?? "").toLowerCase().replace(/[\s./:_-]+/g, "").trim();
}

function isPlaceholderLabel(value?: string) {
  return PLACEHOLDER_LABELS.has(normalizeComparableText(value));
}

function firstInformative(...values: Array<string | null | undefined>) {
  return values.find((value) => {
    if (typeof value !== "string") return false;
    const trimmed = value.trim();
    return trimmed.length > 0 && !isPlaceholderLabel(trimmed);
  })?.trim();
}

function pickRecordString(
  record: Record<string, unknown>,
  ...keys: string[]
) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function summarizeSourceLabel(value?: string) {
  if (!value) return "";
  const cleaned = value
    .trim()
    .replace(/^file:\/\//i, "")
    .replace(/\\/g, "/")
    .replace(/[?#].*$/u, "")
    .replace(/:(line|item|segment|text):\d+$/iu, "");
  const rawSegments = cleaned.split("/").filter(Boolean);
  if (rawSegments.length === 0) return "";
  const segments = rawSegments
    .map((segment) => segment.replace(/\.[^.]+$/u, "").trim())
    .filter(Boolean);
  const chosen =
    [...segments]
      .reverse()
      .find((segment) => {
        const normalized = normalizeComparableText(segment);
        return !isPlaceholderLabel(segment) && !GENERIC_SOURCE_STEMS.has(normalized);
      }) ??
    [...segments].reverse().find((segment) => !isPlaceholderLabel(segment)) ??
    "";

  return chosen.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function inferTextGroupLabel({
  text,
  aliasAuthor,
  artifact,
}: {
  text: TextEntry;
  aliasAuthor?: string;
  artifact?: ArtifactRecord;
}) {
  const metadata = (text.metadata ?? {}) as Record<string, unknown>;
  const directAuthor = firstInformative(
    text.author,
    aliasAuthor,
    pickRecordString(metadata, "author", "account", "username", "handle"),
  );
  if (directAuthor) return directAuthor;

  const sourceLabel = firstInformative(
    summarizeSourceLabel(
      pickRecordString(metadata, "source", "source_name", "file_name", "filename", "path"),
    ),
    summarizeSourceLabel(text.source),
    summarizeSourceLabel(artifact?.source_name),
  );

  return sourceLabel ?? text.id.slice(0, 8);
}

const FOCUS_ENTITY_LABEL_KEYS: Record<FocusContext["entityType"], string> = {
  conclusion: "detail.scroll.focusEntity.conclusion",
  evidence: "detail.scroll.focusEntity.evidence",
  text: "detail.scroll.focusEntity.text",
  cluster: "detail.scroll.focusEntity.cluster",
  profile: "detail.scroll.focusEntity.profile",
};

type SubjectiveCueTone = "neutral" | "accent" | "warning";

interface SubjectiveCue {
  title: string;
  value: string;
  detail: string;
  tone: SubjectiveCueTone;
}

interface CaseHeaderFact {
  label: string;
  value: string;
  monospace?: boolean;
}

interface CaseHeaderBeat {
  label: string;
  detail: string;
  tone: SubjectiveCueTone;
}

interface CaseHeaderDigest {
  headline: string;
  narrativeBlocks: string[];
  factPills: CaseHeaderFact[];
  statGrid: CaseHeaderFact[];
  beats: CaseHeaderBeat[];
  dossierHeadline: string;
  dossierSummary: string;
  excerpt: string;
  excerptLabel?: string;
  tags: string[];
  memo?: string;
  nextStep: string;
}

function matchDimensionScore(profile: WritingProfile | undefined, patterns: string[]) {
  if (!profile) return null;
  const match = profile.dimensions.find((dimension) => {
    const haystack = `${dimension.key} ${dimension.label}`.toLowerCase();
    return patterns.some((pattern) => haystack.includes(pattern));
  });
  return match ? Math.max(0, Math.min(100, match.score)) : null;
}

function includesAnyKeyword(pool: string, keywords: string[]) {
  return keywords.some((keyword) => pool.includes(keyword));
}

function buildSubjectivePortrait({
  t,
  analysis,
  report,
  leadProfile,
  leadCluster,
  fragmentedClusterCount,
  leadConclusion,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
  analysis: AnalysisDetail;
  report: ForensicReport;
  leadProfile?: WritingProfile;
  leadCluster?: ClusterViewCluster;
  fragmentedClusterCount: number;
  leadConclusion?: ReportConclusion;
}): SubjectiveCue[] {
  const signalPool = [
    leadProfile?.headline,
    leadProfile?.observable_summary,
    leadProfile?.summary,
    ...(leadProfile?.stable_habits ?? []),
    ...(leadProfile?.process_clues ?? []),
    ...(leadCluster?.top_markers ?? []),
    leadCluster?.label,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const formalityScore = matchDimensionScore(leadProfile, ["正式", "formal", "formality"]);
  const sentenceScore = matchDimensionScore(leadProfile, ["句", "sentence", "complex", "复杂"]);
  const anomalyCount = report.anomaly_samples.length;
  const clusterCount = report.cluster_view?.clusters.length ?? 0;
  const representativeCount = leadProfile?.representative_text_ids?.length ?? 0;
  const dominantClusterLabel =
    leadCluster?.label ?? t("detail.scroll.portrait.noDominantCluster");

  let roleValue = t("detail.scroll.role.documentation");
  let roleDetail = t("detail.scroll.role.documentationDetail", { cluster: dominantClusterLabel });
  if (includesAnyKeyword(signalPool, ["技术", "工程", "分析", "复盘", "debug", "code", "产品"])) {
    roleValue = t("detail.scroll.role.technical");
    roleDetail = t("detail.scroll.role.technicalDetail");
  } else if (
    includesAnyKeyword(signalPool, ["运营", "协调", "流程", "通知", "跟进", "排期", "对接"])
  ) {
    roleValue = t("detail.scroll.role.coordination");
    roleDetail = t("detail.scroll.role.coordinationDetail");
  } else if ((formalityScore ?? 0) >= 70 && (sentenceScore ?? 0) >= 60) {
    roleValue = t("detail.scroll.role.professional");
    roleDetail = t("detail.scroll.role.professionalDetail");
  }

  let postureValue = t("detail.scroll.posture.structured");
  if ((sentenceScore ?? 0) >= 68 && (formalityScore ?? 0) >= 65) {
    postureValue = t("detail.scroll.posture.contextFirst");
  } else if ((sentenceScore ?? 0) < 40 && (formalityScore ?? 0) < 45) {
    postureValue = t("detail.scroll.posture.reactive");
  }
  const postureDetail = t("detail.scroll.posture.detail", {
    sentenceScore: Math.round(sentenceScore ?? 50),
    formalityScore: Math.round(formalityScore ?? 50),
    leadType: leadConclusion ? t("detail.scroll.posture.evidenceLed") : t("detail.scroll.posture.underBuilt"),
  });

  let rhythmValue = t("detail.scroll.rhythm.sustained");
  if (analysis.text_count < 20) {
    rhythmValue = t("detail.scroll.rhythm.phaseSpecific");
  } else if (clusterCount >= 5 || fragmentedClusterCount >= 2) {
    rhythmValue = t("detail.scroll.rhythm.parallel");
  }
  const rhythmDetail = t("detail.scroll.rhythm.detail", {
    textCount: analysis.text_count,
    representativeCount,
    clusterCount,
  });

  const riskValue =
    anomalyCount > 0 || fragmentedClusterCount > 0
      ? t("detail.scroll.risk.contextDrift")
      : t("detail.scroll.risk.stable");
  const riskDetail = t("detail.scroll.risk.detail", {
    anomalyCount,
    fragmentedClusterCount,
  });

  return [
    {
      title: t("detail.scroll.portrait.likelyRole"),
      value: roleValue,
      detail: roleDetail,
      tone: "accent",
    },
    {
      title: t("detail.scroll.portrait.expressionPosture"),
      value: postureValue,
      detail: postureDetail,
      tone: "neutral",
    },
    {
      title: t("detail.scroll.portrait.workRhythm"),
      value: rhythmValue,
      detail: rhythmDetail,
      tone: "neutral",
    },
    {
      title: t("detail.scroll.portrait.riskWatch"),
      value: riskValue,
      detail: riskDetail,
      tone: anomalyCount > 0 || fragmentedClusterCount > 0 ? "warning" : "neutral",
    },
  ];
}

function buildCaseHeaderDigest({
  t,
  analysis,
  report,
  leadConclusion,
  leadProfile,
  leadCluster,
  subjectivePortrait,
  fragmentedClusterCount,
  textMetaMap,
  dominantGroupLabel,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
  analysis: AnalysisDetail;
  report: ForensicReport;
  leadConclusion?: ReportConclusion;
  leadProfile?: WritingProfile;
  leadCluster?: ClusterViewCluster;
  subjectivePortrait: SubjectiveCue[];
  fragmentedClusterCount: number;
  textMetaMap: Map<
    string,
    {
      textId: string;
      alias: string;
      preview: string;
      group: string;
    }
  >;
  dominantGroupLabel: string;
}): CaseHeaderDigest {
  const caseMeta = report.request.case_metadata;
  const taskLabel = t(`task.${report.request.task}`);
  const gradeLabel = leadConclusion
    ? t(`detail.scroll.grade.${leadConclusion.grade}`)
    : t("detail.scroll.grade.inconclusive");
  const caseId = firstMeaningful(caseMeta?.case_id, analysis.id) ?? analysis.id;
  const client = firstMeaningful(caseMeta?.client);
  const analyst = firstMeaningful(caseMeta?.analyst);
  const representativeTextId =
    leadProfile?.representative_text_ids?.[0] ??
    leadCluster?.representative_text_id ??
    leadCluster?.member_text_ids[0];
  const representativeText = representativeTextId ? textMetaMap.get(representativeTextId) : undefined;
  const subject =
    firstInformative(
      leadConclusion?.subject,
      leadProfile?.subject,
      representativeText?.group,
      leadCluster?.label,
      dominantGroupLabel,
    ) ?? t("detail.scroll.caseFile.unknownSubject");

  const primaryEvidence =
    report.evidence_items.find((item) => item.strength === "core") ?? report.evidence_items[0];
  const primaryTrace =
    compactText(firstMeaningful(primaryEvidence?.finding, primaryEvidence?.summary), 126) ||
    t("detail.scroll.caseFile.noTrace");

  const dossierHeadline =
    firstInformative(
      leadProfile?.headline,
      representativeText?.group,
      subjectivePortrait[0]?.value,
      leadProfile?.subject,
      subject,
    ) ?? subject;
  const dossierSummary =
    compactText(
      firstMeaningful(
        leadProfile?.observable_summary,
        leadProfile?.summary,
        subjectivePortrait[1]?.detail,
        subjectivePortrait[0]?.detail,
      ),
      170,
    ) || compactText(report.summary, 170);
  const excerpt =
    compactText(
      firstMeaningful(representativeText?.preview, leadCluster?.representative_excerpt),
      156,
    ) || t("detail.scroll.caseFile.noExcerpt");

  const anomalySample = report.anomaly_samples[0];
  const anomalyRisk = anomalySample
    ? t("detail.scroll.caseFile.anomalyRisk", {
        text: textMetaMap.get(anomalySample.text_id)?.alias ?? anomalySample.text_id,
        dimensions:
          Object.keys(anomalySample.outlier_dimensions).slice(0, 3).join(" / ") ||
          t("detail.scroll.anomalyWatch"),
      })
    : "";
  const openQuestion =
    compactText(
      firstMeaningful(
        report.limitations[0],
        leadConclusion?.counter_evidence[0],
        report.narrative?.contradictions[0],
        anomalyRisk,
      ),
      130,
    ) || t("detail.scroll.caseFile.noQuestion");

  const premise =
    compactText(
      firstMeaningful(leadConclusion?.statement, report.narrative?.lead, report.summary),
      130,
    ) || t("detail.scroll.empty");
  const nextStep =
    compactText(
      firstMeaningful(
        report.narrative?.action_items[0],
        report.narrative?.sections.find((section) => section.key === "next_actions")?.summary,
        report.narrative?.sections.find((section) => section.key === "next_actions")?.detail,
      ),
      150,
    ) || t("detail.scroll.readingHint");

  const memo = compactText(caseMeta?.notes, 220);
  const topMarkers = (leadCluster?.top_markers ?? [])
    .map((marker) => compactText(marker, 30))
    .filter(Boolean);
  const tags = Array.from(
    new Set(
      [
        compactText(leadCluster?.label, 26),
        compactText(leadProfile?.headline, 30),
        ...topMarkers,
        fragmentedClusterCount > 0
          ? t("detail.scroll.isolatedClusters", { count: fragmentedClusterCount })
          : null,
      ].filter(Boolean),
    ),
  ).slice(0, 6) as string[];

  const coreEvidenceCount = report.evidence_items.filter((item) => item.strength === "core").length;
  const storyOpening = leadConclusion
    ? t("detail.scroll.caseFile.storyOpening", {
        task: taskLabel,
        grade: gradeLabel,
        texts: analysis.text_count,
        groups: analysis.author_count,
        subject,
      })
    : t("detail.scroll.caseFile.storyOpeningFallback", {
        task: taskLabel,
        texts: analysis.text_count,
        groups: analysis.author_count,
      });
  const storyEvidence = primaryEvidence
    ? t("detail.scroll.caseFile.storyEvidence", {
        evidence: primaryEvidence.evidence_id,
        detail: primaryTrace,
      })
    : t("detail.scroll.caseFile.storyEvidenceFallback");

  return {
    headline: leadConclusion
      ? t("detail.scroll.caseFile.headline", {
          subject,
          task: taskLabel,
          grade: gradeLabel,
        })
      : t("detail.scroll.caseFile.headlineFallback", {
          task: taskLabel,
          subject,
        }),
    narrativeBlocks: [storyOpening, storyEvidence],
    factPills: [
      {
        label: t("detail.scroll.caseFile.caseId"),
        value: caseId,
        monospace: true,
      },
      {
        label: t("detail.scroll.caseFile.task"),
        value: taskLabel,
      },
      ...(client
        ? [
            {
              label: t("detail.scroll.caseFile.client"),
              value: client,
            },
          ]
        : []),
      ...(analyst
        ? [
            {
              label: t("detail.scroll.caseFile.analyst"),
              value: analyst,
            },
          ]
        : []),
      {
        label: t("detail.scroll.caseFile.activity"),
        value: String(report.request.activity_events.length),
      },
      {
        label: t("detail.scroll.caseFile.network"),
        value: String(report.request.interaction_edges.length),
      },
    ],
    statGrid: [
      {
        label: t("detail.scroll.caseFile.texts"),
        value: String(analysis.text_count),
      },
      {
        label: t("detail.scroll.sourceGroups"),
        value: String(analysis.author_count),
      },
      {
        label: t("detail.scroll.evidenceCount"),
        value: String(report.evidence_items.length),
      },
      {
        label: t("detail.scroll.caseFile.coreEvidence"),
        value: String(coreEvidenceCount),
      },
      {
        label: t("detail.scroll.clusterCount"),
        value: String(report.cluster_view?.clusters.length ?? 0),
      },
      {
        label: t("detail.scroll.profileCount"),
        value: String(report.writing_profiles.length),
      },
      {
        label: t("detail.scroll.anomalyWatch"),
        value: String(report.anomaly_samples.length),
      },
      {
        label: t("detail.scroll.caseFile.materials"),
        value: String(report.materials.length),
      },
    ],
    beats: [
      {
        label: t("detail.scroll.caseFile.premise"),
        detail: premise,
        tone: leadConclusion ? "accent" : "neutral",
      },
      {
        label: t("detail.scroll.caseFile.keyTrace"),
        detail: primaryEvidence
          ? `${primaryEvidence.evidence_id} · ${primaryTrace}`
          : t("detail.scroll.caseFile.noTrace"),
        tone: "neutral",
      },
      {
        label: t("detail.scroll.caseFile.openQuestion"),
        detail: openQuestion,
        tone:
          report.limitations.length > 0 || report.anomaly_samples.length > 0 ? "warning" : "neutral",
      },
    ],
    dossierHeadline,
    dossierSummary,
    excerpt,
    excerptLabel: [representativeText?.group, representativeText?.alias]
      .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index)
      .join(" · ") || representativeTextId,
    tags,
    memo,
    nextStep,
  };
}

interface ForensicScrollProps {
  analysis: AnalysisDetail;
  features: FeatureVector[];
}

export function ForensicScroll({
  analysis,
  features,
}: ForensicScrollProps) {
  const { t } = useI18n();
  const report = analysis.report as ForensicReport;
  const focus = useReportVisualizationStore((state) => state.focus);
  const setFocus = useReportVisualizationStore((state) => state.setFocus);
  const clearFocus = useReportVisualizationStore((state) => state.clearFocus);
  const resetVisualization = useReportVisualizationStore((state) => state.reset);

  const [drawerEntity, setDrawerEntity] = useState<DrawerEntity | null>(null);
  const [activeNarrativeKey, setActiveNarrativeKey] = useState<string | null>(
    report.narrative?.sections.find((section) => section.default_expanded)?.key ??
      report.narrative?.sections[0]?.key ??
      null,
  );
  const [expandedBlocks, setExpandedBlocks] = useState<Record<string, boolean>>({});

  const sectionRefs = useRef<Record<SectionKey, HTMLElement | null>>({
    "case-header": null,
    "conclusion-rail": null,
    "evidence-chain": null,
    "writing-profiles": null,
    "cluster-view": null,
    "narrative-spine": null,
  });

  useEffect(() => {
    resetVisualization();
    return () => resetVisualization();
  }, [analysis.id, resetVisualization]);

  const evidenceById = useMemo(
    () => new Map(report.evidence_items.map((item) => [item.evidence_id, item])),
    [report.evidence_items],
  );

  const featureMap = useMemo(
    () => new Map(features.map((item) => [item.text_id, item])),
    [features],
  );

  const artifactMap = useMemo(
    () => new Map(report.request.artifacts.map((artifact) => [artifact.artifact_id, artifact])),
    [report.request.artifacts],
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
      const artifact = text.artifact_id ? artifactMap.get(text.artifact_id) : undefined;
      return {
        textId: text.id,
        alias: alias?.alias ?? text.id.slice(0, 8),
        preview: stripPreview(alias?.preview || text.content),
        group: inferTextGroupLabel({
          text,
          aliasAuthor: alias?.author,
          artifact,
        }),
      };
    });
  }, [artifactMap, report.entity_aliases?.text_aliases, report.request.texts]);

  const textMetaMap = useMemo(
    () => new Map(textMeta.map((item) => [item.textId, item])),
    [textMeta],
  );

  const dominantGroupLabel = useMemo(() => {
    const counts = new Map<string, number>();
    textMeta.forEach((item) => {
      if (isPlaceholderLabel(item.group)) return;
      counts.set(item.group, (counts.get(item.group) ?? 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  }, [textMeta]);

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
  const leadPercent = leadConclusion ? conclusionCertaintyPercent(leadConclusion) : null;
  const sortedClusters = useMemo(
    () =>
      [...(report.cluster_view?.clusters ?? [])].sort(
        (first, second) => second.member_text_ids.length - first.member_text_ids.length,
      ),
    [report.cluster_view?.clusters],
  );
  const leadCluster = sortedClusters[0];
  const fragmentedClusterCount = sortedClusters.filter(
    (cluster) => cluster.member_text_ids.length <= 2,
  ).length;
  const leadProfile = useMemo(() => {
    return [...report.writing_profiles].sort(
      (first, second) =>
        (second.representative_text_ids?.length ?? 0) -
        (first.representative_text_ids?.length ?? 0),
    )[0];
  }, [report.writing_profiles]);
  const subjectivePortrait = useMemo(
    () =>
      buildSubjectivePortrait({
        t,
        analysis,
        report,
        leadProfile,
        leadCluster,
        fragmentedClusterCount,
        leadConclusion,
      }),
    [
      t,
      analysis,
      report,
      leadProfile,
      leadCluster,
      fragmentedClusterCount,
      leadConclusion,
    ],
  );
  const caseHeaderDigest = useMemo(
    () =>
      buildCaseHeaderDigest({
        t,
        analysis,
        report,
        leadConclusion,
        leadProfile,
        leadCluster,
        subjectivePortrait,
        fragmentedClusterCount,
        textMetaMap,
        dominantGroupLabel,
      }),
    [
      t,
      analysis,
      report,
      leadConclusion,
      leadProfile,
      leadCluster,
      subjectivePortrait,
      fragmentedClusterCount,
      textMetaMap,
      dominantGroupLabel,
    ],
  );

  const toggleExpandedBlock = useCallback((key: string) => {
    setExpandedBlocks((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }, []);

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
                <div className="font-medium">{t(metric.labelKey)}</div>
                <div>{value.toFixed(3)}</div>
                {metric.hintKey && (
                  <div className="mt-1 max-w-48 text-xs text-muted-foreground">
                    {t(metric.hintKey)}
                  </div>
                )}
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
                  [t("detail.scroll.drawer.signalStrength"), `${conclusionCertaintyPercent(conclusion)}%`],
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
      const relatedTextIds = Array.from(new Set(item.source_text_ids));
      const relatedTextsExpanded = expandedBlocks[`drawer:evidence:${item.evidence_id}:texts`] ?? false;
      const visibleRelatedTextIds = relatedTextsExpanded
        ? relatedTextIds
        : relatedTextIds.slice(0, DEFAULT_VISIBLE_REPRESENTATIVE_TEXTS);
      const hiddenRelatedTextCount = Math.max(0, relatedTextIds.length - visibleRelatedTextIds.length);
      const compareIds = relatedTextIds.slice(0, 2);
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
                  [t("detail.scroll.drawer.relatedTexts"), String(relatedTextIds.length)],
                ]}
              />
              {item.why_it_matters && (
                <DrawerBlock title={t("detail.scroll.drawer.whyItMatters")}>
                  <p className="text-sm leading-7 text-foreground/88">{item.why_it_matters}</p>
                </DrawerBlock>
              )}
              <DrawerBlock title={t("detail.scroll.drawer.relatedTexts")}>
                <div className="flex flex-wrap gap-2">
                  {visibleRelatedTextIds.map((textId) => (
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
                {(hiddenRelatedTextCount > 0 || relatedTextsExpanded) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-8 px-2 text-xs"
                    onClick={() => toggleExpandedBlock(`drawer:evidence:${item.evidence_id}:texts`)}
                  >
                    {t(relatedTextsExpanded ? "common.showLess" : "common.showMore")}
                    {!relatedTextsExpanded && hiddenRelatedTextCount > 0 ? ` (${hiddenRelatedTextCount})` : ""}
                  </Button>
                )}
              </DrawerBlock>
              {compareIds.length >= 1 && (
                <DrawerBlock title={t("detail.scroll.drawer.featureSignature")}>
                  <div className="space-y-3">
                    {compareIds.map((textId) => (
                      <div key={textId} className="rounded-lg bg-muted/20 p-3">
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
                <AutoCollapse collapsedHeight={220} contentKey={drawerEntity.textId}>
                  <p className="text-sm leading-7 text-foreground/88">
                    {meta?.preview || t("detail.scroll.empty")}
                  </p>
                </AutoCollapse>
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
              {profile.confidence_note && (
                <DrawerBlock title={t("detail.scroll.drawer.confidenceNote")}>
                  <p className="text-xs text-muted-foreground/80 italic">{profile.confidence_note}</p>
                </DrawerBlock>
              )}
            </div>
          </ScrollArea>
        </>
      );
    }

    const cluster = drawerEntity.cluster;
    const membersExpanded = expandedBlocks[`drawer:cluster:${cluster.cluster_id}:members`] ?? false;
    const visibleMemberTextIds = membersExpanded
      ? cluster.member_text_ids
      : cluster.member_text_ids.slice(0, DEFAULT_VISIBLE_REPRESENTATIVE_TEXTS);
    const hiddenMemberCount = Math.max(0, cluster.member_text_ids.length - visibleMemberTextIds.length);
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
                <AutoCollapse collapsedHeight={180} contentKey={`cluster-${cluster.cluster_id}-summary`}>
                  <p className="text-sm leading-7 text-foreground/88">{cluster.separation_summary}</p>
                </AutoCollapse>
              </DrawerBlock>
            )}
            {cluster.confidence_note && (
              <DrawerBlock title={t("detail.scroll.drawer.confidenceNote")}>
                <p className="text-xs text-muted-foreground/80 italic">{cluster.confidence_note}</p>
              </DrawerBlock>
            )}
            <DrawerBlock title={t("detail.scroll.drawer.members")}>
              <div className="flex flex-wrap gap-2">
                {visibleMemberTextIds.map((textId) => (
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
              {(hiddenMemberCount > 0 || membersExpanded) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-8 px-2 text-xs"
                  onClick={() => toggleExpandedBlock(`drawer:cluster:${cluster.cluster_id}:members`)}
                >
                  {t(membersExpanded ? "common.showLess" : "common.showMore")}
                  {!membersExpanded && hiddenMemberCount > 0 ? ` (${hiddenMemberCount})` : ""}
                </Button>
              )}
            </DrawerBlock>
          </div>
        </ScrollArea>
      </>
    );
  };

  return (
    <TooltipProvider>
      <div className="space-y-5">
        {SECTION_ORDER.map((section) => {
            if (section.key === "case-header") {
              return (
                <RevealOnScroll key={section.key}>
                  <CaseHeaderPanel
                    sectionRef={(node) => {
                      sectionRefs.current[section.key] = node;
                    }}
                    sectionKey={section.key}
                    sectionLabel={t(section.labelKey)}
                    focus={focus}
                    clearFocus={clearFocus}
                    leadConclusion={leadConclusion}
                    leadPercent={leadPercent}
                    subjectivePortrait={subjectivePortrait}
                    digest={caseHeaderDigest}
                    onScrollToSection={scrollToSection}
                    t={t}
                  />
                </RevealOnScroll>
              );
            }

            if (section.key === "conclusion-rail") {
              return (
                <RevealOnScroll key={section.key}>
                <section
                  ref={(node) => {
                    sectionRefs.current[section.key] = node;
                  }}
                  data-section-key={section.key}
                  className="rounded-3xl border border-border/70 bg-card/96 p-5 lg:p-6"
                >
                  <SectionHeader title={t(section.labelKey)} accentColor={section.color} />
                  <div className="space-y-2.5">
                    {report.conclusions.map((conclusion) => {
                      const percent = conclusionCertaintyPercent(conclusion);
                      const tone = conclusionTone(conclusion.grade);
                      const focused = isConclusionFocused(conclusion);
                      return (
                        <button
                          key={conclusion.key}
                          type="button"
                          onClick={() => openDrawer({ kind: "conclusion", conclusion }, "conclusion-rail")}
                          className={cn(
                            "w-full rounded-2xl border border-transparent bg-muted/15 px-4 py-3.5 text-left transition-colors hover:bg-muted/24 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                            focused ? "opacity-100" : "opacity-50",
                            focus && focused && "border-foreground/10 ring-1 ring-foreground/12",
                          )}
                        >
                          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_92px] md:items-center">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className={tone.badgeClass}>
                                  {t(`detail.scroll.grade.${conclusion.grade}`)}
                                </Badge>
                                <Badge variant="outline">{conclusion.evidence_ids.length} {t("detail.scroll.evidenceCount")}</Badge>
                                {conclusion.counter_evidence.length > 0 && (
                                  <Badge variant="outline">{conclusion.counter_evidence.length} {t("detail.scroll.counterSignals")}</Badge>
                                )}
                              </div>
                              <div className="mt-2 flex items-start gap-3">
                                <span className={cn("mt-1 h-8 w-1 shrink-0 rounded-full", tone.barClass)} />
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-foreground">
                                    {conclusion.subject || conclusion.statement}
                                  </div>
                                  {conclusion.subject && (
                                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
                                      {conclusion.statement}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-3 md:block md:text-right">
                              <div className={cn("text-lg font-semibold tabular-nums md:text-xl", tone.valueClass)}>
                                {percent}%
                              </div>
                              <div className="h-1.5 w-20 rounded-full bg-muted md:ml-auto md:mt-2">
                                <div className={cn("h-1.5 rounded-full", tone.barClass)} style={{ width: `${percent}%` }} />
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
                </RevealOnScroll>
              );
            }

            if (section.key === "evidence-chain") {
              return (
                <RevealOnScroll key={section.key}>
                <section
                  ref={(node) => {
                    sectionRefs.current[section.key] = node;
                  }}
                  data-section-key={section.key}
                  className={cn(
                    "rounded-3xl border border-border/70 bg-card/96 p-5 lg:p-6",
                  )}
                >
                  <SectionHeader title={t(section.labelKey)} accentColor={section.color} />
                  <EvidenceAppendix
                    report={report}
                    textMetaMap={textMetaMap}
                    anomaliesByTextId={anomaliesByTextId}
                    isEvidenceFocused={isEvidenceFocused}
                    isTextFocused={isTextFocused}
                    isConclusionFocused={isConclusionFocused}
                    onOpenEvidence={(item, source) => {
                      openDrawer({ kind: "evidence", evidence: item }, source);
                    }}
                    onOpenText={(textId, source) => {
                      openDrawer(
                        { kind: "text", textId },
                        source,
                        { entityType: "text", entityId: textId, source },
                      );
                    }}
                    onOpenConclusion={(conclusion, source) => {
                      openDrawer(
                        { kind: "conclusion", conclusion },
                        source,
                        { entityType: "conclusion", entityId: conclusion.key, source },
                      );
                    }}
                  />
                </section>
                </RevealOnScroll>
              );
            }

            if (section.key === "writing-profiles") {
              const activeProfile =
                report.writing_profiles.find(
                  (profile) => focus?.entityType === "profile" && profile.subject === focus.entityId,
                ) ??
                report.writing_profiles.find((profile) => isProfileFocused(profile)) ??
                report.writing_profiles[0];
              const activeProfileIndex = Math.max(
                0,
                report.writing_profiles.findIndex((profile) => profile.subject === activeProfile?.subject),
              );
              const activeColor = PROFILE_COLORS[activeProfileIndex % PROFILE_COLORS.length];
              const activeCluster =
                activeProfile ? profileClusterMap.get(activeProfile.subject) : null;
              const flaggedProfilesCount = report.writing_profiles.filter(
                (profile) => (profile.anomalies?.length ?? 0) > 0,
              ).length;
              const activeDimensionRows = [...(activeProfile?.dimensions ?? [])].sort((first, second) => {
                if (first.dimension_type !== second.dimension_type) {
                  return first.dimension_type === "observable" ? -1 : 1;
                }
                if (second.confidence !== first.confidence) {
                  return second.confidence - first.confidence;
                }
                return second.score - first.score;
              });
              const observableDimensionCount = activeDimensionRows.filter(
                (dimension) => dimension.dimension_type === "observable",
              ).length;
              const evidenceSpanCount = activeDimensionRows.reduce(
                (sum, dimension) => sum + dimension.evidence_spans.length,
                0,
              );
              const counterSignalCount = activeDimensionRows.reduce(
                (sum, dimension) => sum + dimension.counter_evidence.length,
                0,
              );
              const multiProfileMode = report.writing_profiles.length > 1;
              const profilesExpanded = expandedBlocks["writing-profiles:index"] ?? false;
              const visibleProfiles = profilesExpanded
                ? report.writing_profiles
                : report.writing_profiles.slice(0, DEFAULT_VISIBLE_PROFILES);
              const hiddenProfileCount = Math.max(0, report.writing_profiles.length - visibleProfiles.length);
              const dimensionsExpanded = expandedBlocks["writing-profiles:dimensions"] ?? false;
              const visibleDimensionRows = dimensionsExpanded
                ? activeDimensionRows
                : activeDimensionRows.slice(0, DEFAULT_VISIBLE_PROFILE_DIMENSIONS);
              const hiddenDimensionCount = Math.max(0, activeDimensionRows.length - visibleDimensionRows.length);
              const relatedTextsExpanded = expandedBlocks["writing-profiles:texts"] ?? false;
              const visibleRepresentativeTextIds = relatedTextsExpanded
                ? (activeProfile?.representative_text_ids ?? [])
                : (activeProfile?.representative_text_ids ?? []).slice(0, DEFAULT_VISIBLE_REPRESENTATIVE_TEXTS);
              const hiddenRepresentativeTextCount = Math.max(
                0,
                (activeProfile?.representative_text_ids?.length ?? 0) - visibleRepresentativeTextIds.length,
              );
              return (
                <RevealOnScroll key={section.key}>
                <section
                  ref={(node) => {
                    sectionRefs.current[section.key] = node;
                  }}
                  data-section-key={section.key}
                  className={cn(
                    "rounded-3xl border border-border/70 bg-card/96 p-5 lg:p-6",
                  )}
                >
                  <SectionHeader title={t(section.labelKey)} accentColor={section.color} />
                  {report.writing_profiles.length > 0 && activeDimensionRows.length > 0 ? (
                    <div className={cn("grid gap-4", multiProfileMode && "xl:grid-cols-[248px_minmax(0,1fr)]")}>
                      {multiProfileMode && (
                        <aside className="space-y-3">
                          <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                            <MetricCard
                              label={t("detail.scroll.profileCount")}
                              value={String(report.writing_profiles.length)}
                            />
                            <MetricCard
                              label={t("detail.scroll.drawer.dimensionCount")}
                              value={String(activeDimensionRows.length)}
                            />
                            <MetricCard
                              label={t("detail.scroll.anomalyWatch")}
                              value={String(flaggedProfilesCount)}
                            />
                          </div>

                          <div className="rounded-2xl bg-muted/15 p-3">
                            <ReportMetaLabel>{t("detail.scroll.profileIndex")}</ReportMetaLabel>
                            <div className="mt-2 space-y-2">
                              {visibleProfiles.map((profile, index) => {
                                const paletteIndex = report.writing_profiles.findIndex(
                                  (candidate) => candidate.subject === profile.subject,
                                );
                                const profileCluster = profileClusterMap.get(profile.subject);
                                const anomalyCount = profile.anomalies?.length ?? 0;
                                const selected = profile.subject === activeProfile?.subject;
                                return (
                                  <button
                                    key={profile.subject}
                                    type="button"
                                    onClick={() => openDrawer({ kind: "profile", profile }, "writing-profile-index")}
                                    className={cn(
                                      "w-full rounded-xl border border-transparent bg-background/40 px-3 py-2.5 text-left transition-colors hover:bg-background/70 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                      selected && "border-border/70 bg-background/78",
                                      !selected &&
                                        (isProfileFocused(profile) ? "opacity-100" : "opacity-50"),
                                    )}
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span
                                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                                            style={{
                                              backgroundColor:
                                                PROFILE_COLORS[(paletteIndex === -1 ? index : paletteIndex) % PROFILE_COLORS.length],
                                            }}
                                          />
                                          <div className="truncate text-sm font-semibold text-foreground">
                                            {profile.headline || profile.subject}
                                          </div>
                                        </div>
                                        <div className="mt-1 truncate text-xs text-muted-foreground">
                                          {profileCluster != null
                                            ? `${t("detail.scroll.drawer.cluster")} ${profileCluster}`
                                            : t("detail.scroll.notSpecified")}
                                        </div>
                                      </div>
                                      <div className="text-right text-xs text-muted-foreground">
                                        <div>{profile.representative_text_ids?.length ?? 0}</div>
                                        {anomalyCount > 0 && (
                                          <div className="mt-1 text-red-300">{anomalyCount}</div>
                                        )}
                                      </div>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                            {(hiddenProfileCount > 0 || profilesExpanded) && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="mt-2 h-8 px-2 text-xs"
                                onClick={() => toggleExpandedBlock("writing-profiles:index")}
                              >
                                {t(profilesExpanded ? "common.showLess" : "common.showMore")}
                                {!profilesExpanded && hiddenProfileCount > 0 ? ` (${hiddenProfileCount})` : ""}
                              </Button>
                            )}
                          </div>
                        </aside>
                      )}

                      <div className="space-y-3">
                        <div className="rounded-2xl bg-muted/15 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-base font-semibold text-foreground">
                                {activeProfile?.headline || activeProfile?.subject}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {activeProfile?.headline && (
                                  <Badge variant="outline">{activeProfile.subject}</Badge>
                                )}
                                {activeCluster != null && (
                                  <Badge variant="outline">
                                    {t("detail.scroll.drawer.cluster")} {activeCluster}
                                  </Badge>
                                )}
                                <Badge variant="outline">
                                  {activeProfile?.representative_text_ids?.length ?? 0}{" "}
                                  {t("detail.scroll.drawer.representativeTexts")}
                                </Badge>
                                <Badge variant="outline">
                                  {t("detail.scroll.observableDimensions", { count: observableDimensionCount })}
                                </Badge>
                                {(activeProfile?.anomalies?.length ?? 0) > 0 && (
                                  <Badge
                                    variant="outline"
                                    className="border-red-300/60 text-red-700 dark:border-red-500/35 dark:text-red-300"
                                  >
                                    {activeProfile?.anomalies?.length ?? 0}{" "}
                                    {t("detail.scroll.anomalyWatch")}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <span
                              className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full"
                              style={{ backgroundColor: activeColor }}
                            />
                          </div>
                          <AutoCollapse
                            className="mt-3"
                            collapsedHeight={160}
                            contentKey={activeProfile?.subject ?? "profile-summary"}
                          >
                            <p className="text-sm leading-6 text-muted-foreground">
                              {activeProfile?.observable_summary || activeProfile?.summary}
                            </p>
                          </AutoCollapse>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                            {[
                              [t("detail.scroll.drawer.dimensionCount"), String(activeDimensionRows.length)],
                              [t("detail.scroll.evidenceSpans"), String(evidenceSpanCount)],
                              [t("detail.scroll.counterSignals"), String(counterSignalCount)],
                              [t("report.confidence"), `${Math.round((activeDimensionRows[0]?.confidence ?? 0) * 100)}%`],
                            ].map(([label, value]) => (
                              <div
                                key={`${label}-${value}`}
                                className="rounded-xl border border-border/35 bg-background/35 px-3 py-2.5"
                              >
                                <ReportMetaLabel>{label}</ReportMetaLabel>
                                <div className="mt-1 text-sm font-semibold text-foreground">{value}</div>
                              </div>
                            ))}
                          </div>
                          {activeProfile?.confidence_note && (
                            <p className="mt-3 text-xs italic leading-5 text-muted-foreground/85">
                              {activeProfile.confidence_note}
                            </p>
                          )}
                        </div>

                        <div className="rounded-2xl bg-muted/15 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <ReportMetaLabel>{t("detail.scroll.dimensionLedger")}</ReportMetaLabel>
                            <div className="text-xs text-muted-foreground">
                              {t("detail.scroll.dimensionCount2", { count: activeDimensionRows.length })}
                            </div>
                          </div>
                          <div className="mt-3 grid gap-2 xl:grid-cols-2">
                            {visibleDimensionRows.map((dimension) => (
                              <ProfileDimensionLedgerCard
                                key={`${activeProfile?.subject}-${dimension.key}`}
                                dimension={dimension}
                                color={activeColor}
                              />
                            ))}
                          </div>
                          {(hiddenDimensionCount > 0 || dimensionsExpanded) && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="mt-3 h-8 px-2 text-xs"
                              onClick={() => toggleExpandedBlock("writing-profiles:dimensions")}
                            >
                              {t(dimensionsExpanded ? "common.showLess" : "common.showMore")}
                              {!dimensionsExpanded && hiddenDimensionCount > 0 ? ` (${hiddenDimensionCount})` : ""}
                            </Button>
                          )}
                        </div>

                        <div className="grid gap-2 xl:grid-cols-3">
                          <CompactSignalPanel
                            title={t("detail.scroll.drawer.stableHabits")}
                            items={(activeProfile?.stable_habits ?? []).slice(0, 4)}
                          />
                          <CompactSignalPanel
                            title={t("detail.scroll.drawer.processClues")}
                            items={(activeProfile?.process_clues ?? []).slice(0, 4)}
                          />
                          <CompactSignalPanel
                            title={t("detail.scroll.drawer.anomalyWatch")}
                            items={(activeProfile?.anomalies ?? []).slice(0, 4)}
                            tone="warning"
                          />
                        </div>

                        {(activeProfile?.representative_text_ids?.length ?? 0) > 0 && (
                          <section className="rounded-2xl bg-muted/15 p-3.5">
                            <div className="flex items-center justify-between gap-3">
                              <ReportMetaLabel>{t("detail.scroll.relatedTexts")}</ReportMetaLabel>
                              <div className="text-xs text-muted-foreground">
                                {activeProfile?.representative_text_ids?.length ?? 0}
                              </div>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {visibleRepresentativeTextIds.map((textId) => (
                                <Button
                                  key={`${activeProfile?.subject}-${textId}`}
                                  variant="outline"
                                  size="xs"
                                  onClick={() =>
                                    openDrawer(
                                      { kind: "text", textId },
                                      "writing-profile-texts",
                                      {
                                        entityType: "text",
                                        entityId: textId,
                                        source: "writing-profile-texts",
                                      },
                                    )
                                  }
                                >
                                  {textMetaMap.get(textId)?.alias ?? textId}
                                </Button>
                              ))}
                            </div>
                            {(hiddenRepresentativeTextCount > 0 || relatedTextsExpanded) && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="mt-2 h-8 px-2 text-xs"
                                onClick={() => toggleExpandedBlock("writing-profiles:texts")}
                              >
                                {t(relatedTextsExpanded ? "common.showLess" : "common.showMore")}
                                {!relatedTextsExpanded && hiddenRepresentativeTextCount > 0 ? ` (${hiddenRepresentativeTextCount})` : ""}
                              </Button>
                            )}
                          </section>
                        )}
                      </div>
                    </div>
                  ) : (
                    <EmptyBlock label={t("detail.scroll.empty")} />
                  )}
                </section>
                </RevealOnScroll>
              );
            }

            if (section.key === "cluster-view") {
              const clusters = report.cluster_view?.clusters ?? [];
              const clustersExpanded = expandedBlocks["cluster-view:list"] ?? false;
              const visibleClusters = clustersExpanded ? clusters : clusters.slice(0, DEFAULT_VISIBLE_CLUSTERS);
              const hiddenClusterCount = Math.max(0, clusters.length - visibleClusters.length);
              const maxClusterMembers = Math.max(
                1,
                ...clusters.map((cluster) => cluster.member_text_ids.length),
              );
              const comparedAnomalyCount = visibleClusterTextIds.filter((textId) => anomaliesByTextId.has(textId)).length;
              return (
                <RevealOnScroll key={section.key}>
                <section
                  ref={(node) => {
                    sectionRefs.current[section.key] = node;
                  }}
                  data-section-key={section.key}
                  className="rounded-3xl border border-border/70 bg-card/96 p-5 lg:p-6"
                >
                  <SectionHeader title={t(section.labelKey)} accentColor={section.color} />
                  {clusters.length > 0 ? (
                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
                      <div className="space-y-4">
                        <div className="grid gap-4 xl:grid-cols-[minmax(340px,0.96fr)_minmax(220px,0.74fr)]">
                          <div className="overflow-x-auto rounded-2xl bg-muted/15 p-4">
                            <div
                              className="inline-grid gap-1.5"
                              style={{
                                gridTemplateColumns: `72px repeat(${visibleClusterTextIds.length}, 30px)`,
                              }}
                            >
                              <div />
                              {visibleClusterTextIds.map((textId) => (
                                <button
                                  key={`cluster-column-${textId}`}
                                  type="button"
                                  onClick={() =>
                                    openDrawer(
                                      { kind: "text", textId },
                                      "cluster-heatmap-label",
                                      { entityType: "text", entityId: textId, source: "cluster-heatmap-label" },
                                    )
                                  }
                                  className={cn(
                                    "truncate px-1 text-center text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground",
                                    isTextFocused(textId) ? "opacity-100" : "opacity-55",
                                  )}
                                >
                                  {textMetaMap.get(textId)?.alias ?? textId}
                                </button>
                              ))}

                              {clusterSimilarity.flatMap((row, rowIndex) => {
                                const firstId = visibleClusterTextIds[rowIndex];
                                return [
                                  <button
                                    key={`cluster-row-${firstId}`}
                                    type="button"
                                    onClick={() =>
                                      openDrawer(
                                        { kind: "text", textId: firstId },
                                        "cluster-heatmap-label",
                                        { entityType: "text", entityId: firstId, source: "cluster-heatmap-label" },
                                      )
                                    }
                                    className={cn(
                                      "truncate pr-2 text-right text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
                                      isTextFocused(firstId) ? "opacity-100" : "opacity-55",
                                    )}
                                  >
                                    {textMetaMap.get(firstId)?.alias ?? firstId}
                                  </button>,
                                  ...row.map((value, columnIndex) => {
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
                                              "h-7 w-7 rounded-sm transition-opacity",
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
                                ];
                              })}
                            </div>

                            <div className="mt-4 flex flex-wrap items-center gap-3">
                              {[0.54, 0.72, 0.9].map((value) => (
                                <div key={value} className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                                  <span
                                    className="h-3 w-3 rounded-[4px]"
                                    style={{ backgroundColor: heatColor(value) }}
                                  />
                                  <span>{value.toFixed(2)}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="rounded-2xl bg-muted/15 p-4">
                            <div className="space-y-3">
                              {visibleClusters.map((cluster) => {
                                const anomalyCount = cluster.member_text_ids.filter((textId) => anomaliesByTextId.has(textId)).length;
                                const share = `${(cluster.member_text_ids.length / maxClusterMembers) * 100}%`;
                                return (
                                  <button
                                    key={`cluster-strip-${cluster.cluster_id}`}
                                    type="button"
                                    onClick={() => openDrawer({ kind: "cluster", cluster }, "cluster-strip")}
                                    className={cn(
                                      "w-full rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted/35",
                                      isClusterFocused(cluster) ? "bg-background/50" : "bg-transparent",
                                    )}
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="truncate text-sm font-semibold text-foreground">
                                        {cluster.label}
                                      </div>
                                      <span className="text-sm font-semibold text-foreground">
                                        {cluster.member_text_ids.length}
                                      </span>
                                    </div>
                                    <div className="mt-2 h-1.5 rounded-full bg-muted">
                                      <div
                                        className="h-1.5 rounded-full bg-emerald-500"
                                        style={{ width: share }}
                                      />
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {(cluster.top_markers ?? []).slice(0, 2).map((marker) => (
                                        <Badge key={`${cluster.cluster_id}-${marker}`} variant="outline">
                                          {marker}
                                        </Badge>
                                      ))}
                                      {anomalyCount > 0 && (
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
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                          <MetricCard label={t("detail.scroll.samplesCompared")} value={String(visibleClusterTextIds.length)} />
                          <MetricCard label={t("detail.scroll.clusterCount")} value={String(clusters.length)} />
                          <MetricCard label={t("detail.scroll.anomalyWatch")} value={String(comparedAnomalyCount)} />
                        </div>
                      </div>

                      <div className="space-y-3">
                        {visibleClusters.map((cluster) => {
                          const anomalyCount = cluster.member_text_ids.filter((textId) => anomaliesByTextId.has(textId)).length;
                          return (
                            <button
                              key={cluster.cluster_id}
                              type="button"
                              onClick={() => openDrawer({ kind: "cluster", cluster }, "cluster-view")}
                              className={cn(
                                "w-full rounded-2xl bg-muted/15 p-4 text-left transition-colors hover:bg-muted/28 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                isClusterFocused(cluster) ? "opacity-100" : "opacity-50",
                              )}
                              style={{ contentVisibility: "auto", containIntrinsicSize: "180px" }}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-base font-semibold text-foreground">{cluster.label}</div>
                                <Badge variant="outline">{cluster.member_text_ids.length}</Badge>
                              </div>
                              <p className="mt-2 line-clamp-4 text-sm leading-7 text-muted-foreground">
                                {cluster.theme_summary || cluster.separation_summary || t("detail.scroll.empty")}
                              </p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {(cluster.top_markers ?? []).slice(0, 2).map((marker) => (
                                  <Badge key={marker} variant="outline">
                                    {marker}
                                  </Badge>
                                ))}
                                {anomalyCount > 0 && (
                                  <Badge variant="outline" className="border-red-300/60 text-red-700 dark:border-red-500/35 dark:text-red-300">
                                    {anomalyCount} {t("detail.scroll.anomalyWatch")}
                                  </Badge>
                                )}
                              </div>
                            </button>
                          );
                        })}
                        {(hiddenClusterCount > 0 || clustersExpanded) && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            onClick={() => toggleExpandedBlock("cluster-view:list")}
                          >
                            {t(clustersExpanded ? "common.showLess" : "common.showMore")}
                            {!clustersExpanded && hiddenClusterCount > 0 ? ` (${hiddenClusterCount})` : ""}
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <EmptyBlock label={t("detail.scroll.empty")} />
                  )}
                </section>
                </RevealOnScroll>
              );
            }

            if (section.key === "narrative-spine") {
              const narrativeSections = report.narrative?.sections ?? [];
              const activeSection = narrativeSections.find((item) => item.key === activeNarrativeKey) ?? narrativeSections[0];
              const sectionEvidence = (activeSection?.evidence_ids ?? [])
                .map((evidenceId) => evidenceById.get(evidenceId))
                .filter((item): item is EvidenceItem => Boolean(item));
              const relatedTextIds = Array.from(
                new Set(
                  sectionEvidence.flatMap((item) => item.source_text_ids),
                ),
              );
              return (
                <RevealOnScroll key={section.key}>
                <section
                  ref={(node) => {
                    sectionRefs.current[section.key] = node;
                  }}
                  data-section-key={section.key}
                  className="rounded-3xl border border-border/70 bg-card/96 p-5 lg:p-6"
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
                              "flex w-full gap-3 rounded-xl px-3 py-3 text-left transition-colors",
                              activeSection?.key === sectionItem.key
                                ? "bg-slate-50 text-foreground dark:bg-slate-500/10"
                                : "bg-muted/25 text-muted-foreground hover:bg-muted/40 hover:text-foreground",
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
                              <ReportMetaLabel>{t("detail.scroll.sectionIndex", { index: index + 1 })}</ReportMetaLabel>
                              <div className="font-medium">{sectionItem.title}</div>
                              <div className="text-sm leading-6">
                                {humanizeNarrative(sectionItem.summary)}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>

                      <AnimatePresence mode="wait">
                        {activeSection ? (
                          <motion.div
                            key={activeSection.key}
                            variants={FADE_VARIANTS}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            transition={TRANSITION_ENTER}
                            className="rounded-2xl bg-muted/15 p-5"
                          >
                            <ReportMetaLabel>{activeSection.title}</ReportMetaLabel>
                            <AutoCollapse
                              className="mt-3"
                              collapsedHeight={240}
                              contentKey={activeSection.key}
                            >
                              <div className="whitespace-pre-wrap text-sm leading-7 text-foreground/88">
                                {humanizeNarrative(activeSection.detail || activeSection.summary)}
                              </div>
                            </AutoCollapse>
                            {relatedTextIds.length > 0 && (
                              <div className="mt-5">
                                <ReportMetaLabel>{t("detail.scroll.relatedTexts")}</ReportMetaLabel>
                                <div className="mt-3">
                                  <NarrativeTopologyGraph
                                    sectionTitle={activeSection.title}
                                    evidenceItems={sectionEvidence}
                                    relatedTextIds={relatedTextIds}
                                    textMetaMap={textMetaMap}
                                    clusterByTextId={clusterByTextId}
                                    isTextFocused={isTextFocused}
                                    isEvidenceFocused={isEvidenceFocused}
                                    onOpenText={(textId) =>
                                      openDrawer(
                                        { kind: "text", textId },
                                        "narrative-topology",
                                        { entityType: "text", entityId: textId, source: "narrative-topology" },
                                      )
                                    }
                                    onOpenEvidence={(evidence) =>
                                      openDrawer(
                                        { kind: "evidence", evidence },
                                        "narrative-topology",
                                        {
                                          entityType: "evidence",
                                          entityId: evidence.evidence_id,
                                          source: "narrative-topology",
                                        },
                                      )
                                    }
                                  />
                                </div>
                              </div>
                            )}
                          </motion.div>
                        ) : (
                          <EmptyBlock label={t("detail.scroll.empty")} />
                        )}
                      </AnimatePresence>
                    </div>
                  ) : (
                    <EmptyBlock label={t("detail.scroll.empty")} />
                  )}
                </section>
                </RevealOnScroll>
              );
            }

            return (
              <RevealOnScroll key={section.key}>
              <section
                ref={(node) => {
                  sectionRefs.current[section.key] = node;
                }}
                data-section-key={section.key}
                className="rounded-3xl border border-border/70 bg-card/96 p-5 lg:p-6"
              >
                <SectionHeader title={t(section.labelKey)} accentColor={section.color} />
                <Accordion type="multiple" className="space-y-3">
                  <AccordionItem value="methods" className="rounded-2xl bg-muted/15 px-4">
                    <AccordionTrigger>{t("detail.scroll.methods")}</AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                      {report.methods.length > 0 ? (
                        (expandedBlocks["appendix:methods"] ? report.methods : report.methods.slice(0, DEFAULT_VISIBLE_APPENDIX_ROWS)).map((method) => (
                          <div key={method.key} className="rounded-xl bg-muted/20 p-4">
                            <div className="text-sm font-semibold">{method.title}</div>
                            <AutoCollapse collapsedHeight={160} contentKey={method.key}>
                              <div className="mt-1 text-sm leading-7 text-muted-foreground">{method.description}</div>
                            </AutoCollapse>
                          </div>
                        ))
                      ) : (
                        <EmptyBlock label={t("detail.scroll.empty")} />
                      )}
                      {(report.methods.length > DEFAULT_VISIBLE_APPENDIX_ROWS || expandedBlocks["appendix:methods"]) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs"
                          onClick={() => toggleExpandedBlock("appendix:methods")}
                        >
                          {t(expandedBlocks["appendix:methods"] ? "common.showLess" : "common.showMore")}
                          {!expandedBlocks["appendix:methods"]
                            ? ` (${report.methods.length - Math.min(report.methods.length, DEFAULT_VISIBLE_APPENDIX_ROWS)})`
                            : ""}
                        </Button>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="reproducibility" className="rounded-2xl bg-muted/15 px-4">
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
                  <AccordionItem value="results" className="rounded-2xl bg-muted/15 px-4">
                    <AccordionTrigger>{t("detail.scroll.rawSignals")}</AccordionTrigger>
                    <AccordionContent className="space-y-3 pt-2">
                      {report.results.length > 0 ? (
                        (expandedBlocks["appendix:results"] ? report.results : report.results.slice(0, DEFAULT_VISIBLE_APPENDIX_ROWS)).map((result) => (
                          <div key={result.key} className="rounded-xl bg-muted/20 p-4">
                            <div className="text-sm font-semibold">{result.title}</div>
                            <AutoCollapse collapsedHeight={180} contentKey={result.key}>
                              <div className="mt-1 text-sm leading-7 text-muted-foreground">{result.body}</div>
                            </AutoCollapse>
                          </div>
                        ))
                      ) : (
                        <EmptyBlock label={t("detail.scroll.empty")} />
                      )}
                      {(report.results.length > DEFAULT_VISIBLE_APPENDIX_ROWS || expandedBlocks["appendix:results"]) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs"
                          onClick={() => toggleExpandedBlock("appendix:results")}
                        >
                          {t(expandedBlocks["appendix:results"] ? "common.showLess" : "common.showMore")}
                          {!expandedBlocks["appendix:results"]
                            ? ` (${report.results.length - Math.min(report.results.length, DEFAULT_VISIBLE_APPENDIX_ROWS)})`
                            : ""}
                        </Button>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </section>
              </RevealOnScroll>
            );
        })}
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
    <div className="mb-4 flex items-center gap-3">
      <span className="h-9 w-1.5 rounded-full" style={{ backgroundColor: accentColor }} />
      <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
    </div>
  );
}

function CaseHeaderPanel({
  sectionRef,
  sectionKey,
  sectionLabel,
  focus,
  clearFocus,
  leadConclusion,
  leadPercent,
  subjectivePortrait,
  digest,
  onScrollToSection,
  t,
}: {
  sectionRef: (node: HTMLElement | null) => void;
  sectionKey: SectionKey;
  sectionLabel: string;
  focus: FocusContext | null;
  clearFocus: () => void;
  leadConclusion?: ReportConclusion;
  leadPercent: number | null;
  subjectivePortrait: SubjectiveCue[];
  digest: CaseHeaderDigest;
  onScrollToSection: (section: SectionKey) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <section
      ref={sectionRef}
      data-section-key={sectionKey}
      className="rounded-3xl border border-border/50 surface-flat p-5 lg:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/45 pb-3">
        <div className="min-w-0 space-y-2">
          <ReportMetaLabel className="tracking-[0.22em] uppercase">{sectionLabel}</ReportMetaLabel>
          <div className="flex flex-wrap gap-2">
            {digest.factPills.map((fact) => (
              <CaseFactChip key={`${fact.label}-${fact.value}`} {...fact} />
            ))}
          </div>
        </div>

        <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
          {leadConclusion && (
            <>
              <Badge variant="outline" className={conclusionTone(leadConclusion.grade).badgeClass}>
                {t(`detail.scroll.grade.${leadConclusion.grade}`)}
              </Badge>
              {leadPercent != null && (
                <Badge variant="outline">
                  {leadPercent}% {t("detail.scroll.signalStrength")}
                </Badge>
              )}
            </>
          )}
          {focus && (
            <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-border/60 bg-background/45 px-3 py-1.5 text-xs text-muted-foreground">
              <span className="truncate">
                {t("detail.scroll.focused")} · {t(FOCUS_ENTITY_LABEL_KEYS[focus.entityType])} ·{" "}
                {focus.entityId}
              </span>
              <button
                type="button"
                onClick={() => clearFocus()}
                className="shrink-0 text-foreground transition-colors hover:text-muted-foreground"
              >
                {t("detail.scroll.clearFocus")}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.38fr)_360px]">
        <div className="space-y-4">
          <div className="space-y-3 rounded-3xl border border-white/5 bg-background/35 p-4 lg:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <ReportMetaLabel>{t("detail.scroll.verdictBar")}</ReportMetaLabel>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {t("detail.scroll.readingHint")}
                </p>
              </div>
            </div>

            <div className="text-[clamp(1.18rem,1.7vw,1.65rem)] font-semibold leading-[1.48] tracking-[-0.02em] text-foreground">
              {digest.headline}
            </div>

            <div className="grid gap-2.5 md:grid-cols-[1.08fr_0.92fr]">
              {digest.narrativeBlocks.map((block, index) => (
                <div
                  key={`${sectionKey}-narrative-${index}`}
                  className="rounded-xl border border-border/35 bg-background/30 px-3.5 py-3"
                >
                  <p className="text-sm leading-6 text-foreground/88">{block}</p>
                </div>
              ))}
            </div>

            {digest.memo && (
              <div className="rounded-xl border border-border/35 bg-background/26 px-3.5 py-3">
                <ReportMetaLabel>{t("detail.scroll.caseFile.caseMemo")}</ReportMetaLabel>
                <p className="mt-1.5 text-sm leading-6 text-foreground/84">{digest.memo}</p>
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {digest.beats.map((beat) => (
                <CaseBeatCard key={`${beat.label}-${beat.detail}`} {...beat} />
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {digest.statGrid.map((fact) => (
                <CaseStatCell key={`${fact.label}-${fact.value}`} {...fact} />
              ))}
            </div>
          </div>
        </div>

        <aside className="space-y-3 rounded-3xl border border-amber-400/15 bg-muted/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <ReportMetaLabel>{t("detail.scroll.subjectivePortrait")}</ReportMetaLabel>
              <div className="mt-1 text-sm font-semibold leading-6 text-foreground">
                {digest.dossierHeadline}
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {digest.dossierSummary}
              </p>
            </div>
            <Badge variant="outline">{t("detail.scroll.subjectivePortraitBadge")}</Badge>
          </div>

          <div className="space-y-2">
            {subjectivePortrait.map((cue) => (
              <PortraitCueRow key={cue.title} {...cue} />
            ))}
          </div>

          {digest.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {digest.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-border/35 bg-background/42 p-3">
            <ReportMetaLabel>{t("detail.scroll.caseFile.representativeExcerpt")}</ReportMetaLabel>
            <p className="mt-2 text-sm leading-6 text-foreground/88">“{digest.excerpt}”</p>
            {digest.excerptLabel && (
              <div className="mt-2 text-[11px] text-muted-foreground">{digest.excerptLabel}</div>
            )}
          </div>

          <p className="text-[11px] leading-5 text-muted-foreground/85">
            {t("detail.scroll.subjectivePortraitCaveat")}
          </p>
        </aside>
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-border/45 pt-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <ReportMetaLabel>{t("detail.scroll.nextStep")}</ReportMetaLabel>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-foreground/84">{digest.nextStep}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="xs" variant="outline" onClick={() => onScrollToSection("narrative-spine")}>
            {t("detail.scroll.section.narrativeSpine")} &rarr;
          </Button>
          <Button size="xs" variant="outline" onClick={() => onScrollToSection("writing-profiles")}>
            {t("detail.scroll.section.writingProfiles")} &rarr;
          </Button>
          <Button size="xs" variant="outline" onClick={() => onScrollToSection("conclusion-rail")}>
            {t("detail.scroll.section.conclusionRail")} &rarr;
          </Button>
          <Button size="xs" variant="outline" onClick={() => onScrollToSection("evidence-chain")}>
            {t("detail.scroll.section.evidenceChain")} &rarr;
          </Button>
        </div>
      </div>
    </section>
  );
}

function CaseFactChip({ label, value, monospace = false }: CaseHeaderFact) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border/45 bg-background/40 px-3 py-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "max-w-[16rem] truncate font-medium text-foreground",
          monospace && "font-mono text-[11px]",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function CaseBeatCard({ label, detail, tone }: CaseHeaderBeat) {
  const toneClass = {
    neutral: "border-border/40 bg-background/28",
    accent: "border-amber-400/20 bg-amber-500/[0.06]",
    warning: "border-rose-400/20 bg-rose-500/[0.06]",
  }[tone];

  return (
    <div className={cn("rounded-xl border px-3.5 py-3", toneClass)}>
      <ReportMetaLabel>{label}</ReportMetaLabel>
      <p className="mt-1.5 text-sm leading-6 text-foreground/88">{detail}</p>
    </div>
  );
}

function CaseStatCell({ label, value }: CaseHeaderFact) {
  return (
    <div className="rounded-xl border border-border/35 bg-background/30 px-3 py-2.5">
      <ReportMetaLabel className="truncate">{label}</ReportMetaLabel>
      <div className="mt-1 text-sm font-semibold leading-5 text-foreground">{value}</div>
    </div>
  );
}

function PortraitCueRow({
  title,
  value,
  detail,
  tone,
}: SubjectiveCue) {
  const dotClass = {
    neutral: "bg-border",
    accent: "bg-amber-400",
    warning: "bg-rose-400",
  }[tone];

  return (
    <div className="rounded-xl border border-border/35 bg-background/34 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <ReportMetaLabel>{title}</ReportMetaLabel>
        <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", dotClass)} aria-hidden="true" />
      </div>
      <div className="mt-1 text-sm font-semibold leading-5 text-foreground">{value}</div>
      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function ProfileDimensionLedgerCard({
  dimension,
  color,
}: {
  dimension: WritingProfileDimension;
  color: string;
}) {
  const { t } = useI18n();
  const score = Math.max(0, Math.min(100, dimension.score));
  const confidence = Math.max(0, Math.min(100, Math.round(dimension.confidence * 100)));

  return (
    <div
      className="rounded-xl border border-border/40 bg-background/35 px-3 py-3"
      style={{ contentVisibility: "auto", containIntrinsicSize: "160px" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{dimension.label}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-[11px]">
              {dimension.dimension_type === "observable"
                ? t("detail.scroll.dimension.observable")
                : t("detail.scroll.dimension.speculative")}
            </Badge>
            <Badge variant="outline" className="text-[11px]">
              {t("detail.scroll.dimension.confidence", { confidence })}
            </Badge>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold tabular-nums text-foreground">
            {Number(score.toFixed(1))}
          </div>
        </div>
      </div>

      <div className="mt-2 h-1.5 rounded-full bg-muted">
        <div
          className="h-1.5 rounded-full"
          style={{ width: `${Math.max(score, 4)}%`, backgroundColor: color }}
        />
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] leading-4 text-muted-foreground">
        <div>
          <div>{t("detail.scroll.dimension.evidenceSpans")}</div>
          <div className="mt-0.5 font-medium text-foreground">
            {dimension.evidence_spans.length}
          </div>
        </div>
        <div>
          <div>{t("detail.scroll.dimension.counter")}</div>
          <div className="mt-0.5 font-medium text-foreground">
            {dimension.counter_evidence.length}
          </div>
        </div>
        <div>
          <div>{t("detail.scroll.dimension.type")}</div>
          <div className="mt-0.5 font-medium text-foreground">
            {dimension.dimension_type === "observable"
              ? t("detail.scroll.dimension.obs")
              : t("detail.scroll.dimension.spec")}
          </div>
        </div>
      </div>
    </div>
  );
}

function CompactSignalPanel({
  title,
  items,
  tone = "neutral",
}: {
  title: string;
  items: string[];
  tone?: "neutral" | "warning";
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section
      className={cn(
        "rounded-xl bg-muted/15 p-3.5",
        tone === "warning" && "border border-red-500/15 bg-red-500/[0.04]",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <ReportMetaLabel>{title}</ReportMetaLabel>
        <div className="text-xs text-muted-foreground">{items.length}</div>
      </div>
      <ul className="mt-2 space-y-1.5 text-sm leading-6 text-foreground/88">
        {items.map((item) => (
          <li key={`${title}-${item}`} className="flex gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-foreground/45" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NarrativeTopologyGraph({
  sectionTitle,
  evidenceItems,
  relatedTextIds,
  textMetaMap,
  clusterByTextId,
  isTextFocused,
  isEvidenceFocused,
  onOpenText,
  onOpenEvidence,
}: {
  sectionTitle: string;
  evidenceItems: EvidenceItem[];
  relatedTextIds: string[];
  textMetaMap: Map<string, { textId: string; alias: string; preview: string; group: string }>;
  clusterByTextId: Map<string, number>;
  isTextFocused: (textId: string) => boolean;
  isEvidenceFocused: (item: EvidenceItem) => boolean;
  onOpenText: (textId: string) => void;
  onOpenEvidence: (item: EvidenceItem) => void;
}) {
  const { t } = useI18n();
  const visibleEvidence = evidenceItems.slice(0, 4);
  const visibleTextIds = relatedTextIds.slice(0, 8);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState<number>(0);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
    moved: boolean;
  } | null>(null);
  const suppressClickUntilRef = useRef(0);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;

    const updateWidth = () => {
      setViewportWidth(node.clientWidth);
    };

    updateWidth();
    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  const canvasPaddingX = 24;
  const canvasPaddingY = 22;
  const rootWidth = 176;
  const rootHeight = 68;
  const evidenceWidth = 170;
  const evidenceHeight = 62;
  const textWidth = 160;
  const textHeight = 58;
  const sectionGap = 52;
  const evidenceGap = 20;
  const evidenceToTextGap = 82;
  const textColumnGap = 24;
  const textRowGap = 18;
  const textColumns = visibleTextIds.length > 4 ? 2 : 1;
  const textRows = Math.ceil(visibleTextIds.length / textColumns);
  const evidenceStackHeight =
    visibleEvidence.length * evidenceHeight + Math.max(0, visibleEvidence.length - 1) * evidenceGap;
  const textStackHeight =
    textRows * textHeight + Math.max(0, textRows - 1) * textRowGap;
  const canvasHeight = Math.max(
    248,
    rootHeight + canvasPaddingY * 2,
    evidenceStackHeight + canvasPaddingY * 2,
    textStackHeight + canvasPaddingY * 2,
  );
  const rootX = canvasPaddingX;
  const evidenceX = rootX + rootWidth + sectionGap;
  const textStartX = evidenceX + evidenceWidth + evidenceToTextGap;
  const canvasWidth =
    textStartX +
    textColumns * textWidth +
    Math.max(0, textColumns - 1) * textColumnGap +
    canvasPaddingX;
  const evidenceStartY = Math.max(canvasPaddingY, (canvasHeight - evidenceStackHeight) / 2);
  const textStartY = Math.max(canvasPaddingY, (canvasHeight - textStackHeight) / 2);
  const rootPosition = {
    x: rootX,
    y: Math.max(canvasPaddingY, canvasHeight / 2 - rootHeight / 2),
  };
  const evidencePositions = visibleEvidence.map((item, index) => ({
    item,
    x: evidenceX,
    y: evidenceStartY + index * (evidenceHeight + evidenceGap),
  }));
  const textPositions = visibleTextIds.map((textId, index) => {
    const column = textColumns === 1 ? 0 : index % 2;
    const row = textColumns === 1 ? index : Math.floor(index / 2);
    return {
      textId,
      x: textStartX + column * (textWidth + textColumnGap),
      y: textStartY + row * (textHeight + textRowGap),
    };
  });
  const textPositionMap = new Map(textPositions.map((item) => [item.textId, item]));

  const rootToEvidencePaths = evidencePositions.map(({ item, x, y }) => ({
    id: `root-${item.evidence_id}`,
    path: curvedPath(
      rootPosition.x + rootWidth,
      rootPosition.y + rootHeight / 2,
      x,
      y + evidenceHeight / 2,
    ),
  }));

  const evidenceToTextPaths = evidencePositions.flatMap(({ item, x, y }) =>
    Array.from(new Set(item.source_text_ids))
      .filter((textId) => textPositionMap.has(textId))
      .map((textId) => {
        const textPosition = textPositionMap.get(textId);
        return textPosition
          ? {
              id: `${item.evidence_id}-${textId}`,
              path: curvedPath(
                x + evidenceWidth,
                y + evidenceHeight / 2,
                textPosition.x,
                textPosition.y + textHeight / 2,
              ),
            }
          : null;
      })
      .filter((edge): edge is { id: string; path: string } => Boolean(edge)),
  );
  const fitZoom = viewportWidth > 0 ? Math.min(1, Math.max(0.72, (viewportWidth - 8) / canvasWidth)) : 1;
  const zoom = fitZoom;

  const viewportHeight = Math.min(440, Math.max(220, Math.round(canvasHeight * zoom)));
  const scaledWidth = Math.round(canvasWidth * zoom);
  const scaledHeight = Math.round(canvasHeight * zoom);
  const stageWidth = Math.max(viewportWidth, scaledWidth);
  const stageHeight = Math.max(viewportHeight, scaledHeight);
  const stageOffsetX = Math.max(0, Math.round((stageWidth - scaledWidth) / 2));

  const handleViewportPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") {
      return;
    }
    const target = event.target;
    if (target instanceof Element && target.closest('[data-topology-interactive="true"]')) {
      return;
    }
    const node = viewportRef.current;
    if (!node) return;

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: node.scrollLeft,
      scrollTop: node.scrollTop,
      moved: false,
    };
    node.setPointerCapture(event.pointerId);
  }, []);

  const handleViewportPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const node = viewportRef.current;
    const dragState = dragStateRef.current;
    if (!node || !dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    if (!dragState.moved && Math.abs(deltaX) + Math.abs(deltaY) < 4) {
      return;
    }

    dragState.moved = true;
    node.scrollLeft = dragState.scrollLeft - deltaX;
    node.scrollTop = dragState.scrollTop - deltaY;
  }, []);

  const handleViewportPointerEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const node = viewportRef.current;
    const dragState = dragStateRef.current;
    if (node?.hasPointerCapture(event.pointerId)) {
      node.releasePointerCapture(event.pointerId);
    }
    if (dragState?.moved) {
      suppressClickUntilRef.current = Date.now() + 180;
    }
    dragStateRef.current = null;
  }, []);

  const shouldSuppressClick = useCallback(() => Date.now() < suppressClickUntilRef.current, []);

  if (visibleEvidence.length === 0 || visibleTextIds.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-border/45 bg-background/30 p-3">
      <div
        ref={viewportRef}
        className="overflow-auto rounded-xl border border-border/40 bg-background/20 cursor-grab active:cursor-grabbing [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ height: viewportHeight }}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handleViewportPointerMove}
        onPointerUp={handleViewportPointerEnd}
        onPointerCancel={handleViewportPointerEnd}
      >
        <div className="relative" style={{ width: stageWidth, height: stageHeight }}>
          <div
            className="absolute top-0"
            style={{
              left: stageOffsetX,
              width: scaledWidth,
              height: scaledHeight,
            }}
          >
            <div
              className="absolute left-0 top-0"
              style={{
                width: canvasWidth,
                height: canvasHeight,
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
              }}
            >
              <svg
                className="absolute inset-0 h-full w-full"
                viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id="narrative-topology-flow" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="rgba(148,163,184,0.55)" />
                    <stop offset="100%" stopColor="rgba(245,158,11,0.35)" />
                  </linearGradient>
                </defs>
                {rootToEvidencePaths.map((edge) => (
                  <path
                    key={edge.id}
                    d={edge.path}
                    fill="none"
                    stroke="url(#narrative-topology-flow)"
                    strokeWidth="1.2"
                    strokeDasharray="5 6"
                  />
                ))}
                {evidenceToTextPaths.map((edge) => (
                  <path
                    key={edge.id}
                    d={edge.path}
                    fill="none"
                    stroke="rgba(148,163,184,0.42)"
                    strokeWidth="1.1"
                  />
                ))}
              </svg>

              <div
                className="absolute rounded-xl border border-border/45 bg-card/95 px-3 py-2"
                style={{
                  left: rootPosition.x,
                  top: rootPosition.y,
                  width: rootWidth,
                  minHeight: rootHeight,
                }}
              >
                <ReportMetaLabel>{t("detail.scroll.topology.activeSection")}</ReportMetaLabel>
                <div className="mt-1.5 line-clamp-2 text-sm font-semibold leading-5 text-foreground">
                  {sectionTitle}
                </div>
              </div>

              {evidencePositions.map(({ item, x, y }) => (
                <button
                  key={item.evidence_id}
                  type="button"
                  data-topology-interactive="true"
                  onClick={() => {
                    if (shouldSuppressClick()) return;
                    onOpenEvidence(item);
                  }}
                  className={cn(
                    "absolute cursor-pointer rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    "border-amber-300/20 bg-amber-500/[0.06] hover:bg-amber-500/[0.12]",
                    isEvidenceFocused(item) ? "opacity-100" : "opacity-55",
                  )}
                  style={{ left: x, top: y, width: evidenceWidth, minHeight: evidenceHeight }}
                >
                  <ReportMetaLabel>{item.evidence_id}</ReportMetaLabel>
                  <div className="mt-1 text-sm font-semibold leading-5 text-foreground">
                    {item.label}
                  </div>
                  <div className="mt-1 truncate text-[11px] leading-4 text-muted-foreground">
                    {t("detail.scroll.topology.linkedTexts", { count: item.source_text_ids.length })}
                  </div>
                </button>
              ))}

              {textPositions.map(({ textId, x, y }) => {
                const meta = textMetaMap.get(textId);
                const cluster = clusterByTextId.get(textId);
                return (
                  <button
                    key={textId}
                    type="button"
                    data-topology-interactive="true"
                    onClick={() => {
                      if (shouldSuppressClick()) return;
                      onOpenText(textId);
                    }}
                    className={cn(
                      "absolute cursor-pointer rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      "border-border/45 bg-card/92 hover:bg-card",
                      isTextFocused(textId) ? "opacity-100" : "opacity-55",
                    )}
                    style={{ left: x, top: y, width: textWidth, minHeight: textHeight }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-semibold leading-5 text-foreground">
                        {meta?.alias ?? textId}
                      </div>
                      {cluster != null && (
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          C{cluster}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 truncate text-[11px] leading-4 text-muted-foreground">
                      {meta?.group ?? textId}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function curvedPath(startX: number, startY: number, endX: number, endY: number) {
  const controlOffset = Math.max(48, (endX - startX) * 0.35);
  return `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`;
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background/55 px-4 py-3.5">
      <ReportMetaLabel>{label}</ReportMetaLabel>
      <div className="mt-1.5 text-xl font-semibold tracking-tight text-foreground">{value}</div>
    </div>
  );
}

function MetricList({ items }: { items: string[][] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl bg-muted/20 p-3">
          <ReportMetaLabel>{label}</ReportMetaLabel>
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
    <section className="space-y-3 rounded-xl bg-muted/15 p-4">
      <ReportMetaLabel>{title}</ReportMetaLabel>
      {children}
    </section>
  );
}

function EmptyBlock({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/70 bg-background/30 p-5 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function BulletedList({ items, emptyLabel }: { items: string[]; emptyLabel: string }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) {
    return <div className="text-sm text-muted-foreground">{emptyLabel}</div>;
  }

  const visibleItems = expanded ? items : items.slice(0, DEFAULT_BULLET_LIMIT);
  const hiddenCount = Math.max(0, items.length - visibleItems.length);

  return (
    <div>
      <ul className="space-y-2 text-sm leading-7 text-foreground/88">
        {visibleItems.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/45" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      {(hiddenCount > 0 || expanded) && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 h-8 px-2 text-xs"
          onClick={() => setExpanded((current) => !current)}
        >
          {t(expanded ? "common.showLess" : "common.showMore")}
          {!expanded && hiddenCount > 0 ? ` (${hiddenCount})` : ""}
        </Button>
      )}
    </div>
  );
}
