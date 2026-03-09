import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { AnalysisStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<AnalysisStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300",
  running: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  canceled: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
};

export function analysisStatusTone(status: AnalysisStatus | string) {
  return STATUS_TONE[status as AnalysisStatus] ?? STATUS_TONE.pending;
}

export function AnalysisStatusBadge({
  status,
  children,
  className,
}: {
  status: AnalysisStatus | string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Badge variant="secondary" className={cn("transition-colors duration-200", analysisStatusTone(status), className)}>
      {children}
    </Badge>
  );
}
