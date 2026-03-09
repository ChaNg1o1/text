"use client";

import { useMemo } from "react";
import type { AnomalySample, EvidenceItem, ForensicReport, ReportConclusion } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ReportMetaLabel } from "@/components/report/report-primitives";
import { useI18n } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/utils";

const STRENGTH_ORDER = ["core", "supporting", "conflicting"] as const;

interface EvidenceTextMeta {
  textId: string;
  alias: string;
  preview: string;
  group: string;
}

interface EvidenceAppendixProps {
  report: ForensicReport;
  textMetaMap: Map<string, EvidenceTextMeta>;
  anomaliesByTextId: Map<string, AnomalySample>;
  isEvidenceFocused: (item: EvidenceItem) => boolean;
  isTextFocused: (textId: string) => boolean;
  isConclusionFocused: (conclusion: ReportConclusion) => boolean;
  onOpenEvidence: (item: EvidenceItem, source: string) => void;
  onOpenText: (textId: string, source: string) => void;
  onOpenConclusion: (conclusion: ReportConclusion, source: string) => void;
}

function strengthBadgeClass(strength?: EvidenceItem["strength"]) {
  switch (strength) {
    case "core":
      return "border-amber-300/70 bg-amber-50 text-amber-700 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-300";
    case "conflicting":
      return "border-rose-300/70 bg-rose-50 text-rose-700 dark:border-rose-500/35 dark:bg-rose-500/10 dark:text-rose-300";
    default:
      return "border-emerald-300/70 bg-emerald-50 text-emerald-700 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-300";
  }
}

function conclusionBadgeClass(grade: ReportConclusion["grade"]) {
  switch (grade) {
    case "strong_support":
      return "border-sky-300/70 bg-sky-50 text-sky-700 dark:border-sky-500/35 dark:bg-sky-500/10 dark:text-sky-300";
    case "moderate_support":
      return "border-emerald-300/70 bg-emerald-50 text-emerald-700 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-300";
    case "inconclusive":
      return "border-amber-300/70 bg-amber-50 text-amber-700 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-300";
    default:
      return "border-rose-300/70 bg-rose-50 text-rose-700 dark:border-rose-500/35 dark:bg-rose-500/10 dark:text-rose-300";
  }
}

export function EvidenceAppendix({
  report,
  textMetaMap,
  anomaliesByTextId,
  isEvidenceFocused,
  isTextFocused,
  isConclusionFocused,
  onOpenEvidence,
  onOpenText,
  onOpenConclusion,
}: EvidenceAppendixProps) {
  const { t } = useI18n();

  const groupedEvidence = useMemo(() => {
    const groups: Record<(typeof STRENGTH_ORDER)[number], EvidenceItem[]> = {
      core: [],
      supporting: [],
      conflicting: [],
    };
    report.evidence_items.forEach((item) => {
      groups[item.strength ?? "supporting"].push(item);
    });
    return groups;
  }, [report.evidence_items]);

  const linkedConclusionsByEvidenceId = useMemo(() => {
    const conclusionMap = new Map(report.conclusions.map((item) => [item.key, item]));
    return new Map(
      report.evidence_items.map((item) => {
        const linkedKeys = new Set(item.linked_conclusion_keys ?? []);
        report.conclusions.forEach((conclusion) => {
          if (conclusion.evidence_ids.includes(item.evidence_id)) {
            linkedKeys.add(conclusion.key);
          }
        });
        return [
          item.evidence_id,
          Array.from(linkedKeys)
            .map((key) => conclusionMap.get(key))
            .filter((value): value is ReportConclusion => Boolean(value)),
        ];
      }),
    );
  }, [report.conclusions, report.evidence_items]);

  if (report.evidence_items.length === 0) {
    return (
      <div className="rounded-2xl bg-muted/15 p-5 text-sm leading-7 text-muted-foreground">
        {t("detail.scroll.empty")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {STRENGTH_ORDER.map((strength) => {
        const items = groupedEvidence[strength];
        if (items.length === 0) return null;

        return (
          <div key={strength} className="space-y-3">
            <ReportMetaLabel>{t(`detail.scroll.strength.${strength}`)}</ReportMetaLabel>

            <div className="space-y-3">
              {items.map((item) => {
                const linkedConclusions = linkedConclusionsByEvidenceId.get(item.evidence_id) ?? [];
                const relatedTextIds = Array.from(new Set(item.source_text_ids));
                return (
                  <article
                    key={item.evidence_id}
                    className={cn(
                      "rounded-2xl bg-muted/15 p-5 transition-colors",
                      isEvidenceFocused(item) ? "opacity-100" : "opacity-55",
                    )}
                  >
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                      <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className={strengthBadgeClass(item.strength)}>
                            {t(`detail.scroll.strength.${item.strength ?? "supporting"}`)}
                          </Badge>
                          <Badge variant="outline">{item.evidence_id}</Badge>
                        </div>

                        <button
                          type="button"
                          onClick={() => onOpenEvidence(item, "evidence-appendix")}
                          className="block space-y-2 text-left"
                        >
                          <div className="text-lg font-semibold text-foreground">{item.label}</div>
                          <p className="text-sm leading-7 text-muted-foreground">
                            {item.finding || item.summary}
                          </p>
                        </button>

                        {item.why_it_matters && (
                          <p className="text-sm leading-7 text-foreground/85">{item.why_it_matters}</p>
                        )}

                        {item.counter_readings?.[0] && (
                          <p className="text-sm leading-7 text-muted-foreground">
                            {item.counter_readings[0]}
                          </p>
                        )}
                      </div>

                      <div className="space-y-3">
                        <div className="space-y-2">
                          <ReportMetaLabel>{t("detail.scroll.drawer.linkedConclusions")}</ReportMetaLabel>
                          <div className="flex flex-wrap gap-2">
                            {linkedConclusions.length > 0 ? (
                              linkedConclusions.map((conclusion) => (
                                <button
                                  key={`${item.evidence_id}-${conclusion.key}`}
                                  type="button"
                                  onClick={() => onOpenConclusion(conclusion, "evidence-appendix")}
                                  className={cn(
                                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                                    conclusionBadgeClass(conclusion.grade),
                                    isConclusionFocused(conclusion) ? "opacity-100" : "opacity-60 hover:opacity-100",
                                  )}
                                >
                                  {conclusion.key}
                                </button>
                              ))
                            ) : (
                              <span className="text-sm text-muted-foreground">{t("detail.scroll.empty")}</span>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <ReportMetaLabel>{t("detail.scroll.drawer.relatedTexts")}</ReportMetaLabel>
                          <div className="flex flex-wrap gap-2">
                            {relatedTextIds.map((textId) => {
                              const meta = textMetaMap.get(textId);
                              const anomaly = anomaliesByTextId.has(textId);
                              return (
                                <Tooltip key={`${item.evidence_id}-${textId}`}>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={() => onOpenText(textId, "evidence-appendix")}
                                      className={cn(
                                        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                                        isTextFocused(textId)
                                          ? "opacity-100"
                                          : "opacity-60 hover:opacity-100",
                                        anomaly
                                          ? "border-red-300/70 text-red-700 dark:border-red-500/35 dark:text-red-300"
                                          : "border-border/70 text-foreground/80",
                                      )}
                                    >
                                      <span>{meta?.alias ?? textId}</span>
                                      {anomaly ? <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> : null}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <div className="max-w-56 space-y-1">
                                      <div className="font-medium">{meta?.alias ?? textId}</div>
                                      <div className="text-xs text-muted-foreground">
                                        {meta?.group ?? textId}
                                      </div>
                                      {meta?.preview ? (
                                        <div className="text-xs leading-6">{meta.preview}</div>
                                      ) : null}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
