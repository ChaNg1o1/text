"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAnalysis } from "@/hooks/use-analysis";
import { useSSEProgress } from "@/hooks/use-sse-progress";
import { useAnalysisStore } from "@/stores/analysis-store";
import {
  BarChart3,
  ArrowLeft,
  RefreshCcw,
  AlertTriangle,
  Loader2,
  Square,
  RotateCcw,
  Check,
} from "lucide-react";
import { api } from "@/lib/api-client";
import type { BackendInfo } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

/* ------------------------------------------------------------------ */
/*  Re-run dropdown                                                    */
/* ------------------------------------------------------------------ */

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
  const readyBackends = useMemo(
    () => backends.filter((b) => b.has_api_key),
    [backends],
  );
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
    } catch (err) {
      const message = err instanceof Error ? err.message : t("detail.retryFailed");
      toast.error(t("detail.retryFailed"), { description: message });
    } finally {
      setPending(null);
    }
  };

  if (readyBackends.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" disabled={!!pending}>
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RotateCcw className="h-4 w-4" />
          )}
          {t("detail.retryTitle")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {t("detail.retryBackend")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {readyBackends.map((b) => (
          <DropdownMenuItem
            key={b.name}
            onClick={() => void handleSelect(b.name)}
            disabled={!!pending}
          >
            <span className="flex-1 truncate">
              {b.name}
              <span className="ml-2 text-xs text-muted-foreground">{b.model}</span>
            </span>
            {b.name === currentBackend && (
              <Check className="ml-2 h-3.5 w-3.5 text-muted-foreground" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------------------------------------ */
/*  Main content                                                       */
/* ------------------------------------------------------------------ */

function AnalysisDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  const { t } = useI18n();
  const { data, error, isLoading, mutate } = useAnalysis(id);
  const replayProgressEvent = useAnalysisStore((s) => s.handleSSEEvent);
  const resetProgress = useAnalysisStore((s) => s.reset);
  const progress = useAnalysisStore((s) => s.getProgress(id));
  const [isCancelling, setIsCancelling] = useState(false);
  const [availableBackends, setAvailableBackends] = useState<BackendInfo[]>([]);
  const [progressHydrated, setProgressHydrated] = useState(false);
  const [replayLiveHistory, setReplayLiveHistory] = useState(true);
  const isRunning = data?.status === "pending" || data?.status === "running";

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
        snapshot.events.forEach((event) => {
          replayProgressEvent(id, event.event, event.data);
        });
        setReplayLiveHistory(false);
      } catch {
        // Fall back to SSE history replay if snapshot hydration is unavailable.
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
  }, [progress.phase, data?.status, mutate]);

  useEffect(() => {
    if (!isRunning || sse.isConnected) return;
    const timer = setInterval(() => {
      void mutate();
    }, sse.retryDelayMs);
    return () => clearInterval(timer);
  }, [isRunning, sse.isConnected, sse.retryDelayMs, mutate]);

  const hasReport = Boolean(data?.status === "completed" && data?.report);
  const deterministicResults =
    data?.report?.results.filter((item) => !item.interpretive_opinion) ?? [];

  if (isLoading) return <DetailSkeleton />;

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
    <StaggerContainer className="space-y-6" delayChildren={0.04} staggerChildren={0.05}>
      {/* ── Toolbar ── */}
      <StaggerItem>
        <div className="flex items-center justify-between">
          <Button asChild variant="ghost" size="sm">
            <Link href="/analyses">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              {t("common.back")}
            </Link>
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => mutate()}
            >
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

            {hasReport && data.report && (
              <ExportButtons report={data.report} analysisId={id} />
            )}

            {!isRunning && (
              <RerunDropdown
                analysisId={id}
                currentBackend={data.llm_backend}
                backends={availableBackends}
                onStarted={(newId) =>
                  router.push(`/analyses/detail?id=${encodeURIComponent(newId)}`)
                }
              />
            )}
          </div>
        </div>
      </StaggerItem>

      {/* ── Header ── */}
      <StaggerItem>
        <ReportHeader analysis={data} />
      </StaggerItem>

      {/* ── Progress ── */}
      {isRunning && (
        <StaggerItem>
          <ProgressPanel
            progress={progress}
            isLiveConnected={sse.isConnected}
            historyHydrated={progressHydrated}
          />
        </StaggerItem>
      )}

      {/* ── Failed ── */}
      {data.status === "failed" && (
        <FadeIn>
          <Card className="border-destructive/35">
            <CardContent className="pt-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-destructive">
                    {t("detail.failedTitle")}
                  </h3>
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

      {/* ── Canceled ── */}
      {data.status === "canceled" && (
        <FadeIn>
          <Card className="border-amber-500/30">
            <CardContent className="pt-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-amber-700">
                    {t("detail.canceledTitle")}
                  </h3>
                  <p className="mt-1 text-sm text-amber-700/90">
                    {data.error_message ?? t("detail.canceledMessage")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </FadeIn>
      )}

      {/* ── Report tabs ── */}
      {hasReport && data.report && (
        <StaggerItem>
          <Tabs defaultValue="synthesis" className="space-y-4">
            <TabsList className="w-full justify-start overflow-x-auto overflow-y-hidden rounded-2xl border border-border/60 bg-card/74 p-1.5 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:w-fit">
              <TabsTrigger value="synthesis">{t("detail.tab.synthesis")}</TabsTrigger>
              <TabsTrigger value="agents">{t("detail.tab.agents")}</TabsTrigger>
              {data.report.anomaly_samples.length > 0 && (
                <TabsTrigger value="anomalies">{t("detail.tab.anomalies")}</TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="synthesis" className="space-y-4 mt-1">
              <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.75fr)_320px]">
                <div className="min-w-0">
                  <SynthesisPanel report={data.report} />
                </div>
                <div className="xl:sticky xl:top-20">
                  <ConfidenceOverview conclusions={data.report.conclusions} />
                </div>
              </div>

              {(data.report.evidence_items.length > 0 ||
                deterministicResults.length > 0 ||
                data.report.methods.length > 0 ||
                data.report.writing_profiles.length > 0 ||
                data.report.materials.length > 0) && (
                <Card>
                  <CardContent className="pt-5">
                    <div className="mb-4">
                      <h3 className="text-base font-semibold">更多依据与技术细节</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        默认折叠，只有在你想看证据、方法或复现信息时再展开。
                      </p>
                    </div>
                    <Accordion type="multiple" className="rounded-xl border border-border/60 px-4">
                      {data.report.evidence_items.length > 0 && (
                        <AccordionItem value="evidence">
                          <AccordionTrigger className="text-sm font-semibold">
                            证据摘要
                          </AccordionTrigger>
                          <AccordionContent className="space-y-3">
                            {data.report.evidence_items.map((item) => (
                              <div
                                key={item.evidence_id}
                                className="rounded-xl border border-border/60 p-4"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono text-xs text-muted-foreground">
                                    {item.evidence_id}
                                  </span>
                                  <span className="text-sm font-medium">{item.label}</span>
                                  {item.interpretive_opinion && (
                                    <Badge variant="outline">interpretive</Badge>
                                  )}
                                </div>
                                <p className="mt-2 text-sm">{item.summary}</p>
                                {item.excerpts.length > 0 && (
                                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                                    {item.excerpts.slice(0, 3).map((excerpt, index) => (
                                      <li key={`${item.evidence_id}-${index}`}>- {excerpt}</li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            ))}
                          </AccordionContent>
                        </AccordionItem>
                      )}

                      {deterministicResults.length > 0 && (
                        <AccordionItem value="results">
                          <AccordionTrigger className="text-sm font-semibold">
                            {t("detail.structuredResultsTitle")}
                          </AccordionTrigger>
                          <AccordionContent className="space-y-3">
                            <p className="text-sm text-muted-foreground">
                              {t("detail.structuredResultsSubtitle")}
                            </p>
                            {deterministicResults.map((result) => (
                              <div
                                key={result.key}
                                className="rounded-xl border border-border/60 p-4"
                              >
                                <div className="text-sm font-semibold">{result.title}</div>
                                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                                  {result.body}
                                </p>
                                {(result.evidence_ids.length > 0 ||
                                  result.supporting_agents.length > 0) && (
                                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                    {result.evidence_ids.map((evidenceId) => (
                                      <Badge key={evidenceId} variant="outline">
                                        {evidenceId}
                                      </Badge>
                                    ))}
                                    {result.supporting_agents.map((agent) => (
                                      <Badge
                                        key={`${result.key}-${agent}`}
                                        variant="secondary"
                                      >
                                        {agent}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </AccordionContent>
                        </AccordionItem>
                      )}

                      {data.report.methods.length > 0 && (
                        <AccordionItem value="methods">
                          <AccordionTrigger className="text-sm font-semibold">
                            {t("detail.methodsTitle")}
                          </AccordionTrigger>
                          <AccordionContent className="space-y-3">
                            <p className="text-sm text-muted-foreground">
                              {t("detail.methodsSubtitle")}
                            </p>
                            {data.report.methods.map((method) => (
                              <div
                                key={method.key}
                                className="rounded-xl border border-border/60 p-4"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-semibold">{method.title}</span>
                                  {method.threshold_profile_version && (
                                    <Badge variant="outline">
                                      {method.threshold_profile_version}
                                    </Badge>
                                  )}
                                </div>
                                <p className="mt-2 text-sm text-muted-foreground">
                                  {method.description}
                                </p>
                                {Object.keys(method.parameters).length > 0 && (
                                  <div className="mt-3 rounded-lg border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground">
                                    <div className="mb-2 font-medium text-foreground">
                                      {t("detail.methodParameters")}
                                    </div>
                                    <pre className="overflow-x-auto whitespace-pre-wrap">
                                      {JSON.stringify(method.parameters, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            ))}
                          </AccordionContent>
                        </AccordionItem>
                      )}

                      {data.report.writing_profiles.length > 0 && (
                        <AccordionItem value="profiles">
                          <AccordionTrigger className="text-sm font-semibold">
                            写作画像
                          </AccordionTrigger>
                          <AccordionContent className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                              仅展示可观察写作习惯；推测性维度单独标注，不参与主结论。
                            </p>
                            {data.report.writing_profiles.map((profile) => (
                              <div
                                key={profile.subject}
                                className="rounded-xl border border-border/60 p-4"
                              >
                                <div className="text-sm font-semibold">{profile.subject}</div>
                                {profile.summary && (
                                  <p className="mt-1 text-sm text-muted-foreground">
                                    {profile.summary}
                                  </p>
                                )}
                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                  {profile.dimensions.map((dimension) => (
                                    <div
                                      key={`${profile.subject}-${dimension.key}`}
                                      className="rounded-lg border border-border/50 bg-muted/20 p-3"
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="text-sm font-medium">
                                          {dimension.label}
                                        </span>
                                        <Badge variant="outline">{dimension.dimension_type}</Badge>
                                      </div>
                                      <div className="mt-2 text-xs text-muted-foreground">
                                        score {dimension.score.toFixed(1)} | confidence{" "}
                                        {dimension.confidence.toFixed(2)}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </AccordionContent>
                        </AccordionItem>
                      )}

                      <AccordionItem value="repro">
                        <AccordionTrigger className="text-sm font-semibold">
                          可复现信息
                        </AccordionTrigger>
                        <AccordionContent className="space-y-4">
                          <div className="space-y-2 text-sm text-muted-foreground">
                            <div>
                              pipeline: {data.report.reproducibility.pipeline_version}
                            </div>
                            <div>
                              threshold profile:{" "}
                              {data.report.reproducibility.threshold_profile_version}
                            </div>
                            <div className="break-all">
                              request fingerprint:{" "}
                              {data.report.reproducibility.request_fingerprint ?? "-"}
                            </div>
                            <div className="break-all">
                              report hash: {data.report.reproducibility.report_sha256 ?? "-"}
                            </div>
                            {data.report.provenance && (
                              <div>LLM calls: {data.report.provenance.llm_calls.length}</div>
                            )}
                          </div>
                          {data.report.materials.length > 0 && (
                            <div className="space-y-2">
                              <div className="text-sm font-medium text-foreground">材料清单</div>
                              {data.report.materials.map((material) => (
                                <div
                                  key={material.artifact_id}
                                  className="rounded-lg border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground"
                                >
                                  <div className="font-medium text-foreground">
                                    {material.source_name}
                                  </div>
                                  <div className="mt-1 break-all">{material.sha256}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </CardContent>
                </Card>
              )}
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

      {/* ── Q&A ── */}
      {hasReport && data.report && (
        <StaggerItem>
          <ReportQaPanel analysisId={id} report={data.report} />
        </StaggerItem>
      )}

      {/* ── Waiting ── */}
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
