"use client";

import { memo, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ForensicReport, NarrativeSection } from "@/lib/types";
import { FADE_VARIANTS, TRANSITION_ENTER } from "@/lib/motion";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ReportMetaLabel, ReportSectionIntro } from "@/components/report/report-primitives";
import { useI18n } from "@/components/providers/i18n-provider";

interface NarrativeSpineProps {
  report: ForensicReport;
  onFocusEvidence?: (evidenceId: string) => void;
  onFocusCluster?: (clusterId: number) => void;
}

const SECTION_COLORS: Record<string, string> = {
  bottom_line: "bg-cyan-400",
  evidence_chain: "bg-emerald-400",
  conflicts: "bg-rose-400",
  limitations: "bg-amber-400",
  next_actions: "bg-violet-400",
};

export const NarrativeSpine = memo(function NarrativeSpine({ report, onFocusEvidence, onFocusCluster }: NarrativeSpineProps) {
  const { t } = useI18n();
  const sections = useMemo(() => report.narrative?.sections ?? [], [report.narrative?.sections]);
  const defaultKey = sections.find((section) => section.default_expanded)?.key ?? sections[0]?.key;
  const [activeKeyOverride, setActiveKeyOverride] = useState<string | null>(null);
  const activeKey =
    activeKeyOverride && sections.some((section) => section.key === activeKeyOverride)
      ? activeKeyOverride
      : defaultKey;

  if (sections.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[28px] border border-border/60 bg-card/88 p-7 shadow-[0_28px_72px_-58px_rgba(15,23,42,0.95)]">
      <div className="mb-5 flex items-center justify-between gap-3">
        <ReportSectionIntro
          kicker={t("report.narrativeSpine.kicker")}
          title={t("report.narrativeSpine.title")}
          description={t("report.narrativeSpine.description")}
        />
        <Badge variant="outline">{t("report.narrativeSpine.sectionCount", { count: sections.length })}</Badge>
      </div>

      <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
        <div className="space-y-3">
          {sections.map((section, index) => {
            const active = activeKey === section.key;
            return (
              <button
                key={section.key}
                type="button"
                onClick={() => {
                  setActiveKeyOverride(section.key);
                  if (section.key === "evidence_chain" && report.cluster_view?.clusters[0]) {
                    onFocusCluster?.(report.cluster_view.clusters[0].cluster_id);
                  }
                }}
                aria-pressed={active}
                className={cn(
                  "group flex w-full items-start gap-3 rounded-[22px] border border-border/60 bg-background/30 px-4 py-3.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  active && "border-cyan-400/35 bg-cyan-500/[0.08]",
                )}
              >
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "size-3 rounded-full",
                      SECTION_COLORS[section.key] ?? "bg-slate-400",
                    )}
                  />
                  {index < sections.length - 1 && (
                    <div className="mt-2 h-12 w-px bg-border/70" />
                  )}
                </div>
                <div className="min-w-0 space-y-1">
                  <ReportMetaLabel>{section.key.replaceAll("_", " ")}</ReportMetaLabel>
                  <div className="font-medium">{section.title}</div>
                  <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
                    {section.summary}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          {sections
            .filter((section) => section.key === activeKey)
            .map((section) => (
              <motion.div
                key={section.key}
                variants={FADE_VARIANTS}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={TRANSITION_ENTER}
              >
                <NarrativeSectionPanel
                  section={section}
                  onFocusEvidence={onFocusEvidence}
                />
              </motion.div>
            ))}
        </AnimatePresence>
      </div>
    </section>
  );
});

function NarrativeSectionPanel({
  section,
  onFocusEvidence,
}: {
  section: NarrativeSection;
  onFocusEvidence?: (evidenceId: string) => void;
}) {
  return (
    <div className="rounded-[26px] bg-background/40 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <ReportMetaLabel>{section.key.replaceAll("_", " ")}</ReportMetaLabel>
          <h4 className="text-xl font-semibold">{section.title}</h4>
          <p className="text-base leading-8 text-foreground/90">{section.summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {section.evidence_ids.slice(0, 4).map((evidenceId) => (
            <button
              key={evidenceId}
              type="button"
              onClick={() => onFocusEvidence?.(evidenceId)}
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center px-1 py-1 cursor-pointer hover:bg-muted/30 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-md"
            >
              <Badge variant="outline">{evidenceId}</Badge>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-5 rounded-[22px] bg-card/70 p-5">
        <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
          {section.detail}
        </p>
      </div>
      {section.result_keys.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {section.result_keys.map((item) => (
            <Badge key={item} variant="secondary">
              {item}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}