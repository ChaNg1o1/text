"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAnalysis } from "@/hooks/use-analysis";
import { useSSEProgress } from "@/hooks/use-sse-progress";
import { useAnalysisStore } from "@/stores/analysis-store";
import { BarChart3, ArrowLeft, RefreshCcw, AlertTriangle, Loader2, Square } from "lucide-react";
import { api } from "@/lib/api-client";
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
import { ReportQaPanel } from "@/components/report/report-qa-panel";
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

function AnalysisDetailContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  const { t } = useI18n();
  const { data, error, isLoading, mutate } = useAnalysis(id);
  const progress = useAnalysisStore((s) => s.getProgress(id));
  const [isCancelling, setIsCancelling] = useState(false);
  const isRunning = data?.status === "pending" || data?.status === "running";

  const sse = useSSEProgress(id, data?.status);

  useEffect(() => {
    if (
      (progress.phase === "completed" || progress.phase === "failed" || progress.phase === "canceled") &&
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

  if (!id) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">{t("detail.notFound")}</p>
        <Button asChild variant="ghost" size="sm" className="mt-3">
          <Link href="/analyses">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {t("features.backToAnalysis")}
          </Link>
        </Button>
      </div>
    );
  }

  if (error) {
    const maybeStatus =
      typeof (error as { status?: unknown }).status === "number"
        ? ((error as { status: number }).status)
        : null;
    if (maybeStatus === 404) {
      return (
        <div className="py-12 text-center">
          <p className="text-muted-foreground">{t("detail.notFound")}</p>
          <Button asChild variant="ghost" size="sm" className="mt-3">
            <Link href="/analyses">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              {t("features.backToAnalysis")}
            </Link>
          </Button>
        </div>
      );
    }

    const message = error instanceof Error ? error.message : t("detail.loadFailed");
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">{t("detail.loadFailed")}</p>
        <p className="mt-1 text-xs text-muted-foreground/80">{message}</p>
        <div className="mt-3 flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => mutate()}>
            <RefreshCcw className="mr-1.5 h-4 w-4" />
            {t("detail.retryRefresh")}
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/analyses">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              {t("features.backToAnalysis")}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="py-12 text-center text-muted-foreground">{t("detail.notFound")}</div>;
  }

  const handleCancel = async () => {
    if (!window.confirm(t("analysis.cancelConfirm", { id }))) {
      return;
    }

    setIsCancelling(true);
    try {
      await api.cancelAnalysis(id);
      toast.success(t("analysis.cancelled"));
      await mutate();
    } catch {
      toast.error(t("analysis.cancelFailed"));
    } finally {
      setIsCancelling(false);
    }
  };

  const hasReport = data.status === "completed" && data.report;

  return (
    <StaggerContainer className="space-y-6" delayChildren={0.04} staggerChildren={0.05}>
      <StaggerItem>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button asChild variant="ghost" size="sm">
            <Link href="/analyses">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              {t("common.back")}
            </Link>
          </Button>
          <div className="flex w-full flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end">
            <Button variant="ghost" size="sm" onClick={() => mutate()}>
              <RefreshCcw className="mr-1.5 h-4 w-4" />
              {t("common.refresh")}
            </Button>
            {isRunning && (
              <Button variant="outline" size="sm" onClick={handleCancel} disabled={isCancelling}>
                {isCancelling ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Square className="mr-1.5 h-4 w-4" />
                )}
                {t("analysis.cancelTitle")}
              </Button>
            )}
            {hasReport && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/analyses/features?id=${encodeURIComponent(id)}`}>
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

      {data.status === "canceled" && (
        <FadeIn>
          <Card className="border-amber-500/30">
            <CardContent className="pt-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-amber-700">{t("detail.canceledTitle")}</h3>
                  <p className="mt-1 text-sm text-amber-700/90">
                    {data.error_message ?? t("detail.canceledMessage")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </FadeIn>
      )}

      {hasReport && data.report && (
        <StaggerItem>
          <Tabs defaultValue="synthesis" className="space-y-4">
            <TabsList className="w-full justify-start overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:w-fit">
              <TabsTrigger value="synthesis">{t("detail.tab.synthesis")}</TabsTrigger>
              <TabsTrigger value="agents">{t("detail.tab.agents")}</TabsTrigger>
              {data.report.anomaly_samples.length > 0 && (
                <TabsTrigger value="anomalies">{t("detail.tab.anomalies")}</TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="synthesis" className="space-y-4 mt-1">
              <div className="grid items-stretch gap-4 md:grid-cols-3">
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

      {hasReport && data.report && (
        <StaggerItem>
          <ReportQaPanel analysisId={id} report={data.report} />
        </StaggerItem>
      )}

      {!isRunning && !hasReport && data.status !== "failed" && data.status !== "canceled" && (
        <FadeIn>
          <p className="text-sm text-muted-foreground">{t("detail.waitingForReport")}</p>
        </FadeIn>
      )}
    </StaggerContainer>
  );
}

export default function AnalysisDetailPage() {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <AnalysisDetailContent />
    </Suspense>
  );
}
