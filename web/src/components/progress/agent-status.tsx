"use client";

import { memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useReducedMotionPreference } from "@/hooks/use-reduced-motion";

import type { AgentProgress } from "@/stores/analysis-store";
import { Card, CardContent } from "@/components/ui/card";
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  Clock,
  Brain,
  BarChart3,
  Users,
} from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";

const AGENT_ICON: Record<string, typeof Brain> = {
  stylometry: BarChart3,
  writing_process: Brain,
  computational: BarChart3,
  sociolinguistics: Users,
};

const AGENT_LABEL_KEY: Record<string, string> = {
  stylometry: "progress.agent.stylometry",
  writing_process: "progress.agent.writingProcess",
  computational: "progress.agent.computational",
  sociolinguistics: "progress.agent.sociolinguistics",
};

const STATUS_CONFIG: Record<string, { color: string; icon: typeof Loader2 }> = {
  pending: { color: "text-muted-foreground", icon: Clock },
  running: { color: "text-blue-500", icon: Loader2 },
  completed: { color: "text-green-500", icon: CheckCircle2 },
  empty: { color: "text-yellow-500", icon: AlertCircle },
  failed: { color: "text-red-500", icon: AlertCircle },
};

interface AgentStatusGridProps {
  agents: Record<string, AgentProgress>;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  if (seconds < 0.001) return `${(seconds * 1000).toFixed(2)}ms`;
  if (seconds < 0.1) return `${(seconds * 1000).toFixed(1)}ms`;
  if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
  if (seconds < 10) return `${seconds.toFixed(2)}s`;
  return `${seconds.toFixed(1)}s`;
}

export const AgentStatusGrid = memo(function AgentStatusGrid({ agents }: AgentStatusGridProps) {
  const { t } = useI18n();
  const reducedMotion = useReducedMotionPreference();
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Object.entries(agents).map(([key, agent]) => {
        const AgentIcon = AGENT_ICON[key] ?? Brain;
        const agentLabel = AGENT_LABEL_KEY[key] ? t(AGENT_LABEL_KEY[key]) : key;
        const statusCfg = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.pending;
        const StatusIcon = statusCfg.icon;
        const isSpinning = agent.status === "running";

        return (
          <Card key={key} className="transition-transform duration-200 hover:-translate-y-0.5">
            <CardContent className="flex flex-col gap-2 pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <AgentIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span className="text-sm font-medium">{agentLabel}</span>
                </div>
                <AnimatePresence mode="wait">
                  <motion.span
                    key={agent.status}
                    initial={reducedMotion ? false : { opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={reducedMotion ? undefined : { opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.15 }}
                    className="inline-flex"
                  >
                    <StatusIcon
                      className={`h-4 w-4 ${statusCfg.color} ${isSpinning ? "animate-spin" : ""}`}
                      aria-hidden="true"
                    />
                  </motion.span>
                </AnimatePresence>
              </div>
              {agent.findingsCount != null && (
                <div className="text-xs text-muted-foreground">
                  {t("progress.findings", { count: agent.findingsCount })}
                </div>
              )}
              {agent.durationSeconds != null && (
                <div className="text-xs text-muted-foreground">
                  {formatDuration(agent.durationSeconds)}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
});