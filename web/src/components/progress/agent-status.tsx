"use client";

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

const AGENT_META: Record<string, { label: string; icon: typeof Brain }> = {
  stylometry: { label: "Stylometry", icon: BarChart3 },
  psycholinguistics: { label: "Psycholinguistics", icon: Brain },
  computational: { label: "Computational", icon: BarChart3 },
  sociolinguistics: { label: "Sociolinguistics", icon: Users },
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

export function AgentStatusGrid({ agents }: AgentStatusGridProps) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Object.entries(agents).map(([key, agent]) => {
        const meta = AGENT_META[key] ?? { label: key, icon: Brain };
        const statusCfg = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.pending;
        const StatusIcon = statusCfg.icon;
        const AgentIcon = meta.icon;
        const isSpinning = agent.status === "running";

        return (
          <Card key={key} className="transition-transform duration-200 hover:-translate-y-0.5">
            <CardContent className="flex flex-col gap-2 pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <AgentIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{meta.label}</span>
                </div>
                <StatusIcon
                  className={`h-4 w-4 ${statusCfg.color} ${isSpinning ? "animate-spin" : ""}`}
                />
              </div>
              {agent.findingsCount != null && (
                <div className="text-xs text-muted-foreground">
                  {t("progress.findings", { count: agent.findingsCount })}
                </div>
              )}
              {agent.durationSeconds != null && (
                <div className="text-xs text-muted-foreground">
                  {agent.durationSeconds.toFixed(1)}s
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
