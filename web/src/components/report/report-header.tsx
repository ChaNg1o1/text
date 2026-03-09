"use client";

import type { AnalysisDetail } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/providers/i18n-provider";
import { AnalysisStatusBadge } from "@/components/analysis/analysis-status-badge";
import { FadeIn } from "@/components/motion/fade-in";

interface ReportHeaderProps {
  analysis: AnalysisDetail;
}

export function ReportHeader({ analysis }: ReportHeaderProps) {
  const { t } = useI18n();
  const duration =
    analysis.completed_at && analysis.created_at
      ? (
          (new Date(analysis.completed_at).getTime() - new Date(analysis.created_at).getTime()) /
          1000
        ).toFixed(1)
      : null;

  return (
    <FadeIn>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="font-mono text-sm font-semibold">{analysis.id}</span>
        <AnalysisStatusBadge status={analysis.status}>
          {t(`status.${analysis.status}`)}
        </AnalysisStatusBadge>
        <Badge variant="outline" className="capitalize">{t(`task.${analysis.task_type}`)}</Badge>
        <span className="text-xs text-muted-foreground">{analysis.llm_backend}</span>
        {duration && <span className="text-xs text-muted-foreground">{duration}s</span>}
      </div>
    </FadeIn>
  );
}
