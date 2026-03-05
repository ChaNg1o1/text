"use client";

import type { AnalysisDetail } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Clock,
  FileText,
  Users,
  Cpu,
  Calendar,
} from "lucide-react";
import { NumberTween } from "@/components/motion/number-tween";
import { useI18n } from "@/components/providers/i18n-provider";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  running: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  canceled: "bg-slate-100 text-slate-700",
  failed: "bg-red-100 text-red-800",
};

interface ReportHeaderProps {
  analysis: AnalysisDetail;
}

export function ReportHeader({ analysis }: ReportHeaderProps) {
  const { t } = useI18n();
  const duration = analysis.completed_at && analysis.created_at
    ? ((new Date(analysis.completed_at).getTime() - new Date(analysis.created_at).getTime()) / 1000).toFixed(1)
    : null;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="max-w-full truncate font-mono text-lg font-bold">{analysis.id}</span>
              <Badge className={STATUS_STYLES[analysis.status] ?? ""}>{t(`status.${analysis.status}`)}</Badge>
              <Badge variant="outline" className="capitalize">{t(`task.${analysis.task_type}`)}</Badge>
            </div>
          </div>
          <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 xl:grid-cols-3">
            <div className="flex items-center gap-1.5 rounded-md border border-border/50 px-2.5 py-1.5">
              <FileText className="h-4 w-4 shrink-0" />
              <span className="truncate"><NumberTween value={analysis.text_count} /> {t("report.textCountSuffix")}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-md border border-border/50 px-2.5 py-1.5">
              <Users className="h-4 w-4 shrink-0" />
              <span className="truncate"><NumberTween value={analysis.author_count} /> {t("report.authorCountSuffix")}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-md border border-border/50 px-2.5 py-1.5">
              <Cpu className="h-4 w-4 shrink-0" />
              <span className="truncate">{analysis.llm_backend}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-md border border-border/50 px-2.5 py-1.5 sm:col-span-2 xl:col-span-2">
              <Calendar className="h-4 w-4 shrink-0" />
              <span className="truncate">{new Date(analysis.created_at).toLocaleString()}</span>
            </div>
            {duration && (
              <div className="flex items-center gap-1.5 rounded-md border border-border/50 px-2.5 py-1.5">
                <Clock className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  <NumberTween value={Number(duration)} decimals={1} suffix="s" />
                </span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
