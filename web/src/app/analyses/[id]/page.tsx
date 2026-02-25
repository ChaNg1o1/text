"use client";

import { use, useEffect } from "react";
import Link from "next/link";
import { useAnalysis } from "@/hooks/use-analysis";
import { useSSEProgress } from "@/hooks/use-sse-progress";
import { useAnalysisStore } from "@/stores/analysis-store";
import { BarChart3, ArrowLeft, RefreshCcw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FadeIn } from "@/components/motion/fade-in";
import { StaggerContainer, StaggerItem } from "@/components/motion/stagger-container";
import { ProgressPanel } from "@/components/progress/progress-panel";
import { ReportHeader } from "@/components/report/report-header";
import { ConfidenceOverview } from "@/components/report/confidence-overview";
import { AgentSection } from "@/components/report/agent-section";
import { SynthesisPanel } from "@/components/report/synthesis-panel";
import { AnomalyTable } from "@/components/report/anomaly-table";
import { ExportButtons } from "@/components/report/export-buttons";
import { useI18n } from "@/components/providers/i18n-provider";

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-36" />
      <Skeleton className="h-20" />
      <Skeleton className="h-56" />
    </div>
  );
}

export default function AnalysisDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { t } = useI18n();
  const { data, isLoading, mutate } = useAnalysis(id);
  const progress = useAnalysisStore((s) => s.getProgress(id));
  const isRunning = data?.status === "pending" || data?.status === "running";

  const sse = useSSEProgress(id, data?.status);

  useEffect(() => {
    if (
      (progress.phase === "completed" || progress.phase === "failed") &&
      (data?.status === "running" || data?.status === "pending")
    ) {
      void mutate();
    }
  }, [progress.phase, data?.status, mutate]);

  useEffect(() => {
    if (!isRunning || sse.isConnected) return;
    const timer = setInterval(() => {
      void mutate();
    }, sse.retryDelayMs);
    return () => clearInterval(timer);
  }, [isRunning, sse.isConnected, sse.retryDelayMs, mutate]);

  if (isLoading) {
    return <DetailSkeleton />;
  }

  if (!data) {
    return <div className="py-12 text-center text-muted-foreground">{t("detail.notFound")}</div>;
  }

  const hasReport = data.status === "completed" && data.report;

  return (
    <StaggerContainer className="space-y-6" delayChildren={0.04} staggerChildren={0.05}>
      <StaggerItem>
        <div className="flex items-center justify-between">
          <Button asChild variant="ghost" size="sm">
            <Link href="/analyses">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              {t("common.back")}
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => mutate()}>
              <RefreshCcw className="mr-1.5 h-4 w-4" />
              {t("common.refresh")}
            </Button>
            {hasReport && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/analyses/${id}/features`}>
                  <BarChart3 className="mr-1.5 h-4 w-4" />
                  {t("detail.features")}
                </Link>
              </Button>
            )}
            {hasReport && data.report && <ExportButtons report={data.report} analysisId={id} />}
          </div>
        </div>
      </StaggerItem>

      <StaggerItem>
        <ReportHeader analysis={data} />
      </StaggerItem>

      {isRunning && (
        <StaggerItem>
          <ProgressPanel progress={progress} />
        </StaggerItem>
      )}

      {data.status === "failed" && (
        <FadeIn>
          <Card className="border-destructive/35">
            <CardContent className="pt-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-destructive">{t("detail.failedTitle")}</h3>
                  <p className="mt-1 text-sm text-destructive/90">
                    {data.error_message ?? t("detail.failedUnknown")}
                  </p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => mutate()}>
                    {t("detail.retryRefresh")}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </FadeIn>
      )}

      {hasReport && data.report && (
        <StaggerItem>
          <Tabs defaultValue="synthesis" className="space-y-4">
            <TabsList>
              <TabsTrigger value="synthesis">{t("detail.tab.synthesis")}</TabsTrigger>
              <TabsTrigger value="agents">{t("detail.tab.agents")}</TabsTrigger>
              {data.report.anomaly_samples.length > 0 && (
                <TabsTrigger value="anomalies">{t("detail.tab.anomalies")}</TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="synthesis" className="space-y-4 mt-1">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="md:col-span-2">
                  <SynthesisPanel report={data.report} />
                </div>
                <div>
                  <ConfidenceOverview scores={data.report.confidence_scores} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="agents" className="mt-1">
              <AgentSection reports={data.report.agent_reports} />
            </TabsContent>

            {data.report.anomaly_samples.length > 0 && (
              <TabsContent value="anomalies" className="mt-1">
                <AnomalyTable samples={data.report.anomaly_samples} />
              </TabsContent>
            )}
          </Tabs>
        </StaggerItem>
      )}

      {!isRunning && !hasReport && data.status !== "failed" && (
        <FadeIn>
          <p className="text-sm text-muted-foreground">{t("detail.waitingForReport")}</p>
        </FadeIn>
      )}
    </StaggerContainer>
  );
}
