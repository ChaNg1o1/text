"use client";

import { memo } from "react";
import { AnimatePresence, motion } from "framer-motion";

import type { ClusterViewCluster, EvidenceItem, ReportConclusion, WritingProfile } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ReportMetaLabel } from "@/components/report/report-primitives";
import { useReducedMotionPreference } from "@/hooks/use-reduced-motion";
import { SCALE_FADE_VARIANTS, TRANSITION_REVEAL } from "@/lib/motion";
import { useI18n } from "@/components/providers/i18n-provider";

interface EvidenceInspectorProps {
  item:
    | { kind: "evidence"; evidence: EvidenceItem }
    | { kind: "conclusion"; conclusion: ReportConclusion }
    | { kind: "cluster"; cluster: ClusterViewCluster }
    | { kind: "profile"; profile: WritingProfile }
    | null;
}

export const EvidenceInspector = memo(function EvidenceInspector({ item }: EvidenceInspectorProps) {
  const { t } = useI18n();
  const reducedMotion = useReducedMotionPreference();
  const contentKey = item
    ? item.kind === "evidence"
      ? `evidence-${item.evidence.evidence_id}`
      : item.kind === "conclusion"
        ? `conclusion-${item.conclusion.task}`
        : item.kind === "cluster"
          ? `cluster-${item.cluster.label}`
          : `profile-${item.profile.subject}`
    : "empty";

  return (
    <Card className="border-border/60 bg-card/95">
      <CardContent className="p-5">
        <ReportMetaLabel>{t("report.evidenceInspector.label")}</ReportMetaLabel>
        <AnimatePresence mode="wait">
          <motion.div
            key={contentKey}
            variants={reducedMotion ? undefined : SCALE_FADE_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={TRANSITION_REVEAL}
          >
            {!item && (
              <div className="mt-3 rounded-[20px] border border-border/60 bg-background/30 p-4 text-sm leading-7 text-muted-foreground">
                {t("report.evidenceInspector.empty")}
              </div>
            )}

            {item?.kind === "evidence" && (
              <section className="mt-3 space-y-3">
                <Badge variant="outline">{item.evidence.evidence_id}</Badge>
                <h4 className="text-lg font-semibold">{item.evidence.label}</h4>
                <p className="text-sm leading-7 text-foreground/88">
                  {item.evidence.finding || item.evidence.summary}
                </p>
                <p className="text-sm leading-7 text-muted-foreground">{item.evidence.why_it_matters}</p>
                {item.evidence.counter_readings && item.evidence.counter_readings.length > 0 && (
                  <div className="space-y-2">
                    <ReportMetaLabel>{t("report.evidenceInspector.counterReadings")}</ReportMetaLabel>
                    {item.evidence.counter_readings.map((entry) => (
                      <div
                        key={entry}
                        className="rounded-[18px] border border-border/50 bg-background/30 p-3 text-sm leading-7 text-muted-foreground"
                      >
                        {entry}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {item?.kind === "conclusion" && (
              <section className="mt-3 space-y-3">
                <Badge variant="outline">{item.conclusion.task}</Badge>
                <h4 className="text-lg font-semibold">{item.conclusion.statement}</h4>
                <p className="text-sm leading-7 text-muted-foreground">
                  {t("report.evidenceInspector.conclusionMeta", { grade: item.conclusion.grade, anchors: item.conclusion.evidence_ids.join(", ") || t("report.evidenceInspector.noAnchors") })}
                </p>
              </section>
            )}

            {item?.kind === "cluster" && (
              <section className="mt-3 space-y-3">
                <Badge variant="outline">{item.cluster.label}</Badge>
                <h4 className="text-lg font-semibold">{item.cluster.theme_summary}</h4>
                <p className="text-sm leading-7 text-muted-foreground">{item.cluster.separation_summary}</p>
              </section>
            )}

            {item?.kind === "profile" && (
              <section className="mt-3 space-y-3">
                <Badge variant="outline">{item.profile.subject}</Badge>
                <h4 className="text-lg font-semibold">{item.profile.headline || item.profile.subject}</h4>
                <p className="text-sm leading-7 text-muted-foreground">
                  {item.profile.observable_summary || item.profile.summary}
                </p>
              </section>
            )}
          </motion.div>
        </AnimatePresence>
      </CardContent>
    </Card>
  );
});