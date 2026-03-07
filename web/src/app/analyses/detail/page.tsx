"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAnalysis } from "@/hooks/use-analysis";
import { useAnalysisFeatures } from "@/hooks/use-analysis-features";
import { useSSEProgress } from "@/hooks/use-sse-progress";
import { useAnalysisStore } from "@/stores/analysis-store";
import {
  ArrowLeft,
  AlertTriangle,
  BarChart3,
  Check,
  Loader2,
  RefreshCcw,
  RotateCcw,
  Square,
} from "lucide-react";
import { api } from "@/lib/api-client";
import type { BackendInfo } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { FadeIn } from "@/components/motion/fade-in";
import { StaggerContainer, StaggerItem } from "@/components/motion/stagger-container";
import { useI18n } from "@/components/providers/i18n-provider";
import { ProgressPanel } from "@/components/progress/progress-panel";
import { AgentSection } from "@/components/report/agent-section";
import { AnomalyTable } from "@/components/report/anomaly-table";
import { ExportButtons } from "@/components/report/export-buttons";
import { ForensicScroll } from "@/components/report/forensic-scroll";
import { ReportHeader } from "@/components/report/report-header";
import { ReportQaPanel } from "@/components/report/report-qa-panel";

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-36" />
      <Skeleton className="h-20" />
      <Skeleton className="h-56" />
    </div>
  );
}

function RerunDropdown({
  analysisId,
  currentBackend,
  backends,
  onStarted,
}: {
  analysisId: string;
  currentBackend: string;
  backends: BackendInfo[];
  onStarted: (newId: string) => void;
}) {
  const { t } = useI18n();
  const readyBackends = useMemo(() => backends.filter((backend) => backend.has_api_key), [backends]);
  const [pending, setPending] = useState<string | null>(null);

  const handleSelect = async (backendName: string) => {
    setPending(backendName);
    try {
      const result = await api.retryAnalysis(analysisId, {
        llm_backend: backendName,
      });
      toast.success(t("detail.retryCreated"), {
        description: `ID: ${result.id}`,
      });
      onStarted(result.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("detail.retryFailed");
      toast.error(t("detail.retryFailed"), { description: message });
    } finally {
      setPending(null);
    }
  };

  if (readyBackends.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" disabled={Boolean(pending)}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          {t("detail.retryTitle")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {t("detail.retryBackend")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {readyBackends.map((backend) => (
          <DropdownMenuItem
            key={backend.name}
            onClick={() => void handleSelect(backend.name)}
            disabled={Boolean(pending)}
          >
            <span className="flex-1 truncate">
              {backend.name}
              <span className="ml-2 text-xs text-muted-foreground">{backend.model}</span>
            </span>
            {backend.name === currentBackend && (
              <Check className="ml-2 h-3.5 w-3.5 text-muted-foreground" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AnalysisDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  const { t } = useI18n();
  const { data, error, isLoading, mutate } = useAnalysis(id);
  const replayProgressEvent = useAnalysisStore((state) => state.handleSSEEvent);
  const resetProgress = useAnalysisStore((state) => state.reset);
  const progress = useAnalysisStore((state) => state.getProgress(id));

  const [isCancelling, setIsCancelling] = useState(false);
  const [availableBackends, setAvailableBackends] = useState<BackendInfo[]>([]);
  const [progressHydrated, setProgressHydrated] = useState(false);
  const [replayLiveHistory, setReplayLiveHistory] = useState(true);

  const isRunning = data?.status === "pending" || data?.status === "running";
  const shouldLoadFeatures = Boolean(id && data?.status === "completed" && data?.report);
  const { data: featuresData, isLoading: featuresLoading } = useAnalysisFeatures(
    id || undefined,
    shouldLoadFeatures,
  );

  const sse = useSSEProgress(
    progressHydrated ? id : undefined,
    progressHydrated ? data?.status : undefined,
    { replayHistory: replayLiveHistory },
  );

  useEffect(() => {
    api.getBackends()
      .then((response) => setAvailableBackends(response.backends))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) {
      setProgressHydrated(true);
      return;
    }

    let cancelled = false;
    setProgressHydrated(false);
    setReplayLiveHistory(true);
    resetProgress(id);

    const hydrate = async () => {
      try {
        const snapshot = await api.getProgressSnapshot(id);
        if (cancelled) return;
        snapshot.events.forEach((event) => replayProgressEvent(id, event.event, event.data));
        setReplayLiveHistory(false);
      } catch {
        setReplayLiveHistory(true);
      } finally {
        if (!cancelled) {
          setProgressHydrated(true);
        }
      }
    };

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [id, replayProgressEvent, resetProgress]);

  useEffect(() => {
    if (
      (progress.phase === "completed" || progress.phase === "failed" || progress.phase === "canceled") &&
      (data?.status === "running" || data?.status === "pending")
    ) {
      void mutate();
    }
  }, [data?.status, mutate, progress.phase]);

  useEffect(() => {
    if (!isRunning || sse.isConnected) return;
    const timer = setInterval(() => {
      void mutate();
    }, sse.retryDelayMs);
    return () => clearInterval(timer);
  }, [isRunning, mutate, sse.isConnected, sse.retryDelayMs]);

  const hasReport = Boolean(data?.status === "completed" && data?.report);

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
        ? (error as { status: number }).status
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
    if (!window.confirm(t("analysis.cancelConfirm", { id }))) return;
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

  return (
    <StaggerContainer className="space-y-8" delayChildren={0.04} staggerChildren={0.05}>
      <StaggerItem>
        <div className="flex items-center justify-between">
          <Button asChild variant="ghost" size="sm">
            <Link href="/analyses">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              {t("common.back")}
            </Link>
          </Button>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => mutate()}>
              <RefreshCcw className="h-4 w-4" />
              <span className="sr-only">{t("common.refresh")}</span>
            </Button>

            {isRunning && (
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handleCancel}
                disabled={isCancelling}
              >
                {isCancelling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
                <span className="sr-only">{t("analysis.cancelTitle")}</span>
              </Button>
            )}

            {hasReport && (
              <Button asChild variant="outline" size="icon" className="h-8 w-8">
                <Link href={`/analyses/features?id=${encodeURIComponent(id)}`}>
                  <BarChart3 className="h-4 w-4" />
                  <span className="sr-only">{t("detail.features")}</span>
                </Link>
              </Button>
            )}

            {hasReport && data.report && <ExportButtons report={data.report} analysisId={id} />}

            {!isRunning && (
              <RerunDropdown
                analysisId={id}
                currentBackend={data.llm_backend}
                backends={availableBackends}
                onStarted={(newId) => router.push(`/analyses/detail?id=${encodeURIComponent(newId)}`)}
              />
            )}
          </div>
        </div>
      </StaggerItem>

      <StaggerItem>
        <ReportHeader analysis={data} />
      </StaggerItem>

      {isRunning && (
        <StaggerItem>
          <ProgressPanel
            progress={progress}
            isLiveConnected={sse.isConnected}
            historyHydrated={progressHydrated}
          />
        </StaggerItem>
      )}

      {data.status === "failed" && (
        <FadeIn>
          <Card className="border-destructive/35">
            <CardContent className="pt-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
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
                <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
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
          <div className="space-y-6">
            <ForensicScroll
              analysis={data}
              features={featuresData?.features ?? []}
              featuresLoading={featuresLoading}
            />

            <Card className="border-border/70 bg-card/96 shadow-none">
              <CardContent className="space-y-6 pt-6">
                {data.report.anomaly_samples.length > 0 && (
                  <div className="space-y-3">
                    <div>
                      <h3 className="text-base font-semibold">{t("detail.supportingAnalysis")}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("detail.supportingAnalysisHint")}
                      </p>
                    </div>
                    <AnomalyTable samples={data.report.anomaly_samples} />
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <h3 className="text-base font-semibold">{t("detail.agentNotes")}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{t("detail.agentNotesHint")}</p>
                  </div>
                  <AgentSection reports={data.report.agent_reports} />
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/96 shadow-none">
              <CardContent className="pt-6">
                <div className="mb-3">
                  <h3 className="text-base font-semibold">{t("report.qaTitle")}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t("report.qaHint")}</p>
                </div>
                <ReportQaPanel analysisId={id} report={data.report} />
              </CardContent>
            </Card>
          </div>
        </StaggerItem>
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
