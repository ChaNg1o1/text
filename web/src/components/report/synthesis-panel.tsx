"use client";

import type { FeatureVector, ForensicReport } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/utils";
import { ReportHero } from "@/components/report/report-hero";
import { NarrativeSpine } from "@/components/report/narrative-spine";
import { PortraitGallery } from "@/components/report/portrait-gallery";
import { ClusterLandscape } from "@/components/report/cluster-landscape";
import { EvidenceGraph } from "@/components/report/evidence-graph";
import { useState } from "react";

interface SynthesisPanelProps {
  report: ForensicReport;
  features?: FeatureVector[];
  featuresLoading?: boolean;
  className?: string;
}

export function SynthesisPanel({ report, features = [], featuresLoading = false, className }: SynthesisPanelProps) {
  const { t } = useI18n();
  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(null);
  const [activeClusterId, setActiveClusterId] = useState<number | null>(report.cluster_view?.clusters[0]?.cluster_id ?? null);

  return (
    <div className={cn("space-y-8", className)}>
      <ReportHero report={report} onFocusEvidence={setActiveEvidenceId} />
      <NarrativeSpine report={report} onFocusEvidence={setActiveEvidenceId} onFocusCluster={setActiveClusterId} />
      <PortraitGallery report={report} />
      <ClusterLandscape
        report={report}
        features={features}
        featuresLoading={featuresLoading}
        focusedClusterId={activeClusterId}
        onFocusCluster={setActiveClusterId}
      />
      <EvidenceGraph report={report} activeEvidenceId={activeEvidenceId} activeClusterId={activeClusterId} />

      {(report.narrative?.contradictions.length || report.limitations.length || report.narrative?.action_items.length) ? (
        <Card className="border-border/60 bg-card/92 shadow-[0_20px_70px_-54px_rgba(15,23,42,0.95)]">
          <CardHeader>
            <CardTitle className="text-lg">{t("report.conflictsCaveats")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 xl:grid-cols-3">
            <section className="rounded-[24px] border border-rose-400/20 bg-rose-500/5 p-6">
              <div className="text-xs uppercase tracking-[0.22em] text-rose-300/80">{t("report.contradictions")}</div>
              <ul className="mt-3 space-y-2 text-sm leading-6">
                {(report.narrative?.contradictions ?? []).length > 0
                  ? (report.narrative?.contradictions ?? []).map((item) => <li key={item}>- {item}</li>)
                  : <li>{t("report.contradictionsEmpty")}</li>}
              </ul>
            </section>
            <section className="rounded-[24px] border border-amber-400/20 bg-amber-500/5 p-6">
              <div className="text-xs uppercase tracking-[0.22em] text-amber-300/80">{t("report.narrativeSection.limitations")}</div>
              <ul className="mt-3 space-y-2 text-sm leading-6">
                {report.limitations.length > 0
                  ? report.limitations.map((item) => <li key={item}>- {item}</li>)
                  : <li>{t("report.limitationsEmpty")}</li>}
              </ul>
            </section>
            <section className="rounded-[24px] border border-cyan-400/20 bg-cyan-500/5 p-6">
              <div className="text-xs uppercase tracking-[0.22em] text-cyan-200/80">{t("report.recommendations")}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(report.narrative?.action_items ?? []).length > 0
                  ? (report.narrative?.action_items ?? []).map((item) => (
                    <Badge key={item} variant="outline" className="border-cyan-300/25 bg-cyan-500/10 text-cyan-100">
                      {item}
                    </Badge>
                  ))
                  : <span className="text-sm text-muted-foreground">{t("report.recommendationsEmpty")}</span>}
              </div>
            </section>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
