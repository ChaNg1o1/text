"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProgressState } from "@/stores/analysis-store";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FadeIn } from "@/components/motion/fade-in";
import { NumberTween } from "@/components/motion/number-tween";
import { AgentStatusGrid } from "./agent-status";
import { LogStream } from "./log-stream";
import { CheckCircle2, Loader2, AlertCircle, Clock } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";

interface ProgressPanelProps {
  progress: ProgressState;
}

const PHASE_ORDER = ["feature_extraction", "agent_analysis", "synthesis"];

function phasePercent(phase: string): number {
  switch (phase) {
    case "pending": return 0;
    case "feature_extraction": return 20;
    case "agent_analysis": return 50;
    case "synthesis": return 80;
    case "completed": return 100;
    case "canceled": return 100;
    case "failed": return 100;
    default: return 0;
  }
}

export function ProgressPanel({ progress }: ProgressPanelProps) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now() / 1000);
  const phaseLabel = (phase: string) => t(`progress.${phase}`);
  const percent = progress.phase === "feature_extraction" && progress.featureProgress.total > 0
    ? 10 + (progress.featureProgress.completed / progress.featureProgress.total) * 10
    : phasePercent(progress.phase);
  const isTerminal = progress.phase === "completed" || progress.phase === "failed" || progress.phase === "canceled";
  const elapsedSeconds = useMemo(() => {
    if (typeof progress.durationSeconds === "number") return progress.durationSeconds;
    if (typeof progress.startedAt === "number") return Math.max(0, now - progress.startedAt);
    return undefined;
  }, [now, progress.durationSeconds, progress.startedAt]);
  const lastUpdateTime = useMemo(() => {
    if (typeof progress.lastEventAt !== "number") return "";
    return new Date(progress.lastEventAt * 1000).toLocaleTimeString();
  }, [progress.lastEventAt]);
  const latestLog = progress.logs[progress.logs.length - 1];
  const agentSummary = useMemo(() => {
    const stats = { completed: 0, running: 0, pending: 0, failed: 0 };
    const runningAgents: string[] = [];
    Object.values(progress.agents).forEach((agent) => {
      if (agent.status === "completed" || agent.status === "empty") {
        stats.completed += 1;
        return;
      }
      if (agent.status === "running") {
        stats.running += 1;
        runningAgents.push(agent.name);
        return;
      }
      if (agent.status === "failed") {
        stats.failed += 1;
        return;
      }
      stats.pending += 1;
    });
    return { stats, runningAgents };
  }, [progress.agents]);

  useEffect(() => {
    if (isTerminal || progress.startedAt == null) return;
    const timer = window.setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => window.clearInterval(timer);
  }, [isTerminal, progress.startedAt]);

  const phaseIcon = () => {
    switch (progress.phase) {
      case "completed": return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "canceled": return <AlertCircle className="h-5 w-5 text-amber-600" />;
      case "failed": return <AlertCircle className="h-5 w-5 text-red-500" />;
      default: return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
    }
  };

  return (
    <div className="space-y-4">
      <FadeIn>
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {phaseIcon()}
                <CardTitle className="text-lg">
                  {phaseLabel(progress.phase)}
                </CardTitle>
              </div>
              {elapsedSeconds != null && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>{t("progress.elapsed")}:</span>
                  <NumberTween value={elapsedSeconds} decimals={1} suffix="s" />
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={percent} className="h-2" />

            {/* Phase steps */}
            <div className="flex gap-2 flex-wrap">
              {PHASE_ORDER.map((p) => {
                const idx = PHASE_ORDER.indexOf(progress.phase);
                const pIdx = PHASE_ORDER.indexOf(p);
                let variant: "default" | "secondary" | "outline" = "outline";
                if (p === progress.phase) variant = "default";
                else if (pIdx < idx || progress.phase === "completed") variant = "secondary";
                return (
                  <Badge key={p} variant={variant} className="text-xs transition-colors duration-200">
                    {phaseLabel(p)}
                  </Badge>
                );
              })}
            </div>

            {progress.meta?.textCount != null && progress.meta.authorCount != null && (
              <p className="text-xs text-muted-foreground">
                {t("progress.datasetSummary", {
                  texts: progress.meta.textCount,
                  authors: progress.meta.authorCount,
                  task: progress.meta.taskType ? t(`task.${progress.meta.taskType}`) : "-",
                  backend: progress.meta.llmBackend ?? "-",
                })}
              </p>
            )}

            <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
              <p>
                {t("progress.agentSummary", {
                  completed: agentSummary.stats.completed,
                  running: agentSummary.stats.running,
                  pending: agentSummary.stats.pending,
                  failed: agentSummary.stats.failed,
                })}
              </p>
              <p>
                {t("progress.eventCount", { count: progress.eventCount })}
                {lastUpdateTime ? ` · ${t("progress.lastUpdate", { time: lastUpdateTime })}` : ""}
              </p>
            </div>

            {agentSummary.runningAgents.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("progress.activeAgents", { agents: agentSummary.runningAgents.join(", ") })}
              </p>
            )}

            {progress.phase === "pending" && (
              <p className="text-xs text-muted-foreground">{t("progress.pendingHint")}</p>
            )}

            {/* Feature extraction detail */}
            {progress.phase === "feature_extraction" && progress.featureProgress.total > 0 && (
              <p className="text-sm text-muted-foreground">
                {t("progress.featureExtraction", {
                  current: progress.featureProgress.completed,
                  total: progress.featureProgress.total,
                })}
                {progress.featureProgress.currentTextId && (
                  <span className="ml-1 font-mono text-xs">
                    ({progress.featureProgress.currentTextId})
                  </span>
                )}
              </p>
            )}

            {latestLog && (
              <p className="rounded-md border border-border/60 bg-muted/30 px-2.5 py-2 text-xs text-muted-foreground">
                {t("progress.latestLog", { message: latestLog.message })}
              </p>
            )}
            {/* Error */}
            {progress.error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {progress.error}
              </div>
            )}
          </CardContent>
        </Card>
      </FadeIn>

      {/* Agent status grid */}
      {(progress.phase === "agent_analysis" ||
        progress.phase === "synthesis" ||
        progress.phase === "completed" ||
        progress.phase === "canceled" ||
        progress.phase === "failed") && (
        <FadeIn delay={0.04}>
          <AgentStatusGrid agents={progress.agents} />
        </FadeIn>
      )}

      {/* Log stream */}
      {progress.logs.length > 0 && (
        <FadeIn delay={0.06}>
          <LogStream logs={progress.logs} />
        </FadeIn>
      )}
    </div>
  );
}
