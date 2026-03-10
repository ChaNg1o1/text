"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Trash2,
  ExternalLink,
  FilterX,
  Search,
  Square,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { useAnalyses } from "@/hooks/use-analyses";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FadeIn } from "@/components/motion/fade-in";
import { NumberTween } from "@/components/motion/number-tween";
import { AnimatePresence } from "framer-motion";
import { useI18n } from "@/components/providers/i18n-provider";
import { PageIntro, PageIntroHeader, PageIntroStat, PageIntroStatGrid } from "@/components/shell/page-intro";
import { AnalysisStatusBadge } from "@/components/analysis/analysis-status-badge";

function timeAgo(
  iso: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return t("time.secondsAgo", { count: seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("time.minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("time.hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  return t("time.daysAgo", { count: days });
}

function duration(created: string, completed?: string): string | null {
  if (!completed) return null;
  const ms = new Date(completed).getTime() - new Date(created).getTime();
  return `${(ms / 1000).toFixed(1)}s`;
}

function HistorySkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
      </div>
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="grid grid-cols-8 gap-3">
                <Skeleton className="h-5 col-span-2" />
                <Skeleton className="h-5" />
                <Skeleton className="h-5" />
                <Skeleton className="h-5" />
                <Skeleton className="h-5" />
                <Skeleton className="h-5" />
                <Skeleton className="h-5" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AnalysesPage() {
  const { t } = useI18n();
  const homeReadyAnnouncedRef = useRef(false);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [taskFilter, setTaskFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [overviewCounts, setOverviewCounts] = useState({
    total: 0,
    running: 0,
    completed: 0,
    failed: 0,
  });
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const hasActiveFilters = Boolean(draftSearch || statusFilter || taskFilter);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(draftSearch);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [draftSearch]);

  const { data, isLoading, error, mutate } = useAnalyses({
    page,
    pageSize: 20,
    status: statusFilter || undefined,
    taskType: taskFilter || undefined,
    search: search || undefined,
  });
  const hasStaleData = Boolean(error && data);

  useEffect(() => {
    if (homeReadyAnnouncedRef.current) return;
    if (isLoading || !data) return;

    homeReadyAnnouncedRef.current = true;
    document.documentElement.dataset.homeReady = "true";
    window.dispatchEvent(new Event("text:home-ready"));
  }, [data, isLoading]);
  const overviewCards = useMemo(
    () => [
      {
        key: "total",
        label: t("analysis.overview.total"),
        value: overviewCounts.total,
        accent: "border-sky-500/30",
      },
      {
        key: "running",
        label: t("analysis.overview.running"),
        value: overviewCounts.running,
        accent: "border-sky-500/30",
      },
      {
        key: "completed",
        label: t("analysis.overview.completed"),
        value: overviewCounts.completed,
        accent: "border-emerald-500/30",
      },
      {
        key: "failed",
        label: t("analysis.overview.failed"),
        value: overviewCounts.failed,
        accent: "border-rose-500/30",
      },
    ],
    [overviewCounts, t],
  );

  useEffect(() => {
    let cancelled = false;

    const loadOverviewCounts = async () => {
      try {
        const baseParams = {
          page: 1,
          page_size: 1,
          task_type: taskFilter || undefined,
          search: search || undefined,
        };
        const [all, running, completed, failed] = await Promise.all([
          api.listAnalyses(baseParams),
          api.listAnalyses({ ...baseParams, status: "running" }),
          api.listAnalyses({ ...baseParams, status: "completed" }),
          api.listAnalyses({ ...baseParams, status: "failed" }),
        ]);
        if (cancelled) return;
        setOverviewCounts({
          total: all.total,
          running: running.total,
          completed: completed.total,
          failed: failed.total,
        });
      } catch {
        if (cancelled) return;
        setOverviewCounts({
          total: data?.total ?? 0,
          running: data?.items.filter((item) => item.status === "running").length ?? 0,
          completed: data?.items.filter((item) => item.status === "completed").length ?? 0,
          failed: data?.items.filter((item) => item.status === "failed").length ?? 0,
        });
      }
    };

    void loadOverviewCounts();
    return () => {
      cancelled = true;
    };
  }, [data, search, taskFilter]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await api.deleteAnalysis(deleteTarget);
      toast.success(t("analysis.deleted"));
      await mutate();
    } catch {
      toast.error(t("analysis.deleteFailed"));
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setIsCancelling(true);
    try {
      await api.cancelAnalysis(cancelTarget);
      toast.success(t("analysis.cancelled"));
      await mutate();
    } catch {
      toast.error(t("analysis.cancelFailed"));
    } finally {
      setIsCancelling(false);
      setCancelTarget(null);
    }
  };

  const clearFilters = () => {
    setDraftSearch("");
    setSearch("");
    setStatusFilter("");
    setTaskFilter("");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <>
        <PageIntro>
          <PageIntroHeader
            eyebrow={t("analysis.workbenchEyebrow")}
            title={t("analysis.historyTitle")}
            description={t("analysis.historySubtitle")}
            actions={(
              <Button asChild className="rounded-full">
                <Link href="/analyses/new">
                  {t("analysis.createNow")}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            )}
          />
          <PageIntroStatGrid className="sm:grid-cols-2 xl:grid-cols-4">
            {overviewCards.map((card) => (
              <PageIntroStat
                key={card.key}
                label={card.label}
                value={<NumberTween value={card.value} />}
                accentClassName={card.accent}
              />
            ))}
          </PageIntroStatGrid>
          <p className="text-xs text-muted-foreground">{t("analysis.historyHint")}</p>
        </PageIntro>
      </>

      <>
        <Card className="border-border/60 surface-elevated">
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  aria-label={t("analysis.searchById")}
                  placeholder={t("analysis.searchById")}
                  value={draftSearch}
                  onChange={(e) => setDraftSearch(e.target.value)}
                  className="w-56 pl-8"
                />
              </div>
              <Select
                value={statusFilter || "all"}
                onValueChange={(v) => {
                  setStatusFilter(v === "all" ? "" : v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-36" aria-label={t("analysis.status")}>
                  <SelectValue placeholder={t("analysis.status")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("analysis.allStatus")}</SelectItem>
                  <SelectItem value="pending">{t("status.pending")}</SelectItem>
                  <SelectItem value="running">{t("status.running")}</SelectItem>
                  <SelectItem value="completed">{t("status.completed")}</SelectItem>
                  <SelectItem value="canceled">{t("status.canceled")}</SelectItem>
                  <SelectItem value="failed">{t("status.failed")}</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={taskFilter || "all"}
                onValueChange={(v) => {
                  setTaskFilter(v === "all" ? "" : v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-40" aria-label={t("analysis.taskType")}>
                  <SelectValue placeholder={t("analysis.taskType")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("analysis.allTypes")}</SelectItem>
                  <SelectItem value="full">{t("task.full")}</SelectItem>
                  <SelectItem value="verification">{t("task.verification")}</SelectItem>
                  <SelectItem value="closed_set_id">{t("task.closed_set_id")}</SelectItem>
                  <SelectItem value="open_set_id">{t("task.open_set_id")}</SelectItem>
                  <SelectItem value="clustering">{t("task.clustering")}</SelectItem>
                  <SelectItem value="profiling">{t("task.profiling")}</SelectItem>
                  <SelectItem value="sockpuppet">{t("task.sockpuppet")}</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" disabled={!hasActiveFilters} onClick={clearFilters}>
                <FilterX className="h-3.5 w-3.5" aria-hidden="true" />
                {t("common.clearFilters")}
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <p>
                <NumberTween value={data?.total ?? overviewCounts.total} /> {t("analysis.totalSuffix")}
              </p>
              <p>{t("analysis.tableHint")}</p>
            </div>
          </CardContent>
        </Card>
      </>

      <>
        {isLoading ? (
          <HistorySkeleton />
        ) : error && !data ? (
          <Card>
            <CardContent className="pt-10 pb-10 text-center">
              <p className="text-sm text-muted-foreground">
                {t("analysis.loadFailed")}
              </p>
              {error instanceof Error && (
                <p className="mt-1 text-xs text-muted-foreground/80">{error.message}</p>
              )}
              <Button className="mt-4" variant="outline" size="sm" onClick={() => void mutate()}>
                {t("detail.retryRefresh")}
              </Button>
            </CardContent>
          </Card>
        ) : data?.items.length === 0 ? (
          <FadeIn>
            <Card>
              <CardContent className="pt-10 pb-10 text-center">
                <p className="text-sm text-muted-foreground">{t("analysis.none")}</p>
                <Button asChild className="mt-4" size="sm">
                  <Link href="/analyses/new">{t("analysis.createNow")}</Link>
                </Button>
              </CardContent>
            </Card>
          </FadeIn>
        ) : (
          <>
            <AnimatePresence>
            {hasStaleData && (
              <FadeIn key="stale-warning">
              <Card className="border-amber-400/40">
                <CardContent className="pt-4 pb-4">
                  <p className="text-sm text-muted-foreground">
                    {t("analysis.loadFailed")}
                  </p>
                  {error instanceof Error && (
                    <p className="mt-1 text-xs text-muted-foreground/80">{error.message}</p>
                  )}
                </CardContent>
              </Card>
              </FadeIn>
            )}
            </AnimatePresence>
            <Card className="border-border/60 surface-elevated">
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>{t("analysis.table.task")}</TableHead>
                      <TableHead>{t("analysis.table.status")}</TableHead>
                      <TableHead>{t("analysis.table.texts")}</TableHead>
                      <TableHead>{t("analysis.table.backend")}</TableHead>
                      <TableHead>{t("analysis.table.created")}</TableHead>
                      <TableHead>{t("analysis.table.duration")}</TableHead>
                      <TableHead className="w-28">{t("analysis.table.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.items.map((item) => (
                      <TableRow key={item.id} className="analysis-table-row cursor-pointer">
                        <TableCell>
                          <Link
                            href={`/analyses/detail?id=${encodeURIComponent(item.id)}`}
                            className="font-mono text-sm hover:underline"
                          >
                            {item.id}
                          </Link>
                        </TableCell>
                        <TableCell className="capitalize">{t(`task.${item.task_type}`)}</TableCell>
                        <TableCell>
                          <AnalysisStatusBadge status={item.status}>
                            {t(`status.${item.status}`)}
                          </AnalysisStatusBadge>
                        </TableCell>
                        <TableCell className="text-sm">{item.text_count} / {item.author_count}</TableCell>
                        <TableCell className="font-mono text-xs">{item.llm_backend}</TableCell>
                        <TableCell
                          className="text-muted-foreground text-sm"
                          title={new Date(item.created_at).toLocaleString()}
                        >
                          {timeAgo(item.created_at, t)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {duration(item.created_at, item.completed_at) ??
                            (item.status === "running" ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                                <span className="sr-only">{t("status.running")}</span>
                              </>
                            ) : (
                              "—"
                            ))}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                              <Link
                                href={`/analyses/detail?id=${encodeURIComponent(item.id)}`}
                                aria-label={t("analysis.open") + item.id}
                              >
                                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                              </Link>
                            </Button>
                            {(item.status === "pending" || item.status === "running") && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-amber-600"
                                onClick={() => setCancelTarget(item.id)}
                                aria-label={t("analysis.cancelTitle") + item.id}
                              >
                                <Square className="h-3.5 w-3.5" aria-hidden="true" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => setDeleteTarget(item.id)}
                              aria-label={t("analysis.delete") + item.id}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {data && data.total > data.page_size && (
              <div className="flex justify-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  {t("analysis.previous")}
                </Button>
                <span className="flex items-center text-sm text-muted-foreground">
                  {t("analysis.pageOf", {
                    page: data.page,
                    total: Math.ceil(data.total / data.page_size),
                  })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= Math.ceil(data.total / data.page_size)}
                  onClick={() => setPage(page + 1)}
                >
                  {t("analysis.next")}
                </Button>
              </div>
            )}
          </>
        )}
      </>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("analysis.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("analysis.deleteConfirm", { id: deleteTarget ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancelTarget} onOpenChange={() => setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("analysis.cancelTitle")}</DialogTitle>
            <DialogDescription>
              {t("analysis.cancelConfirm", { id: cancelTarget ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={isCancelling}>
              {isCancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("analysis.cancelTitle")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
