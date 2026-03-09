"use client";

import { Loader2 } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";

const TOOL_KEY_MAP: Record<string, string> = {
  displayChart: "chat.tool.chart",
  displayRadar: "chat.tool.radar",
  displayTable: "chat.tool.table",
  displayHeatmap: "chat.tool.heatmap",
};

export function ToolSkeleton({ toolName }: { toolName: string }) {
  const { t } = useI18n();
  const key = TOOL_KEY_MAP[toolName];
  const label = key ? t(key) : toolName;
  return (
    <div className="flex h-[100px] w-full items-center justify-center rounded-lg border border-border/40 bg-muted/30">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>{t("chat.tool.generating", { label })}</span>
      </div>
    </div>
  );
}
