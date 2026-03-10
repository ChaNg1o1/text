"use client";

import { Badge } from "@/components/ui/badge";
import type { ForensicReport } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CircleHelp, Scale, ShieldAlert, ShieldCheck } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";
import { ReportMetaLabel } from "@/components/report/report-primitives";
import { FadeIn } from "@/components/motion/fade-in";

interface NarrativeLeadProps {
  report: ForensicReport;
}

function gradeMeta(grade: string | undefined, t: (key: string) => string) {
  switch (grade) {
    case "strong_support":
      return {
        label: t("report.grade.strongSupport"),
        shell: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
        icon: ShieldCheck,
      };
    case "moderate_support":
      return {
        label: t("report.grade.moderateSupport"),
        shell: "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-200",
        icon: Scale,
      };
    case "moderate_against":
    case "strong_against":
      return {
        label: t("report.grade.against"),
        shell: "border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-200",
        icon: ShieldAlert,
      };
    default:
      return {
        label: t("report.grade.inconclusive"),
        shell: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200",
        icon: CircleHelp,
      };
  }
}

export function NarrativeLead({ report }: NarrativeLeadProps) {
  const { t } = useI18n();
  const leadConclusion = report.conclusions[0];
  const leadText =
    report.narrative?.lead?.trim() ||
    leadConclusion?.statement ||
    report.summary ||
    t("report.narrativeLeadFallback");
  const meta = gradeMeta(leadConclusion?.grade, t);
  const LeadIcon = meta.icon;

  return (
    <FadeIn delay={0.06}>
      <div className={cn("rounded-3xl border p-5", meta.shell)}>
        <div className="flex items-start gap-4">
          <div className="mt-0.5 rounded-2xl bg-background/80 p-2.5">
            <LeadIcon className="h-5 w-5" />
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <ReportMetaLabel className="text-current/80">{t("report.narrativeLead")}</ReportMetaLabel>
              <Badge variant="outline" className="bg-background/80">
                {meta.label}
              </Badge>
              {leadConclusion?.task && (
                <Badge variant="secondary" className="text-xs">
                  {leadConclusion.task}
                </Badge>
              )}
            </div>
            <p className="text-base font-semibold leading-7 text-foreground">{leadText}</p>
          </div>
        </div>
      </div>
    </FadeIn>
  );
}
