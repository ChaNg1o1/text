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

function joinValues(values: string[]): string {
  return values.join(", ");
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
  const request = analysis.report?.request;
  const caseMetadata = request?.case_metadata;
  const scopeItems = [
    request?.task_params.questioned_text_ids.length
      ? `Q: ${joinValues(request.task_params.questioned_text_ids)}`
      : null,
    request?.task_params.reference_author_ids.length
      ? `Ref: ${joinValues(request.task_params.reference_author_ids)}`
      : null,
    request?.task_params.candidate_author_ids.length
      ? `Cand: ${joinValues(request.task_params.candidate_author_ids)}`
      : null,
    request?.task_params.cluster_text_ids.length
      ? `Cluster: ${joinValues(request.task_params.cluster_text_ids)}`
      : null,
    request?.task_params.subject_ids.length
      ? `Subject: ${joinValues(request.task_params.subject_ids)}`
      : null,
    request?.task_params.account_ids.length
      ? `Account: ${joinValues(request.task_params.account_ids)}`
      : null,
    request?.task_params.top_k ? `Top-K: ${request.task_params.top_k}` : null,
  ].filter(Boolean) as string[];
  const hasCaseMetadata = Boolean(
    caseMetadata?.case_id || caseMetadata?.client || caseMetadata?.analyst || caseMetadata?.notes,
  );

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

        {(hasCaseMetadata || scopeItems.length > 0) && (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {hasCaseMetadata && (
              <div className="rounded-lg border border-border/50 bg-muted/20 p-4 text-sm">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("report.caseMetadata")}
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {caseMetadata?.case_id && (
                    <div>
                      <div className="text-xs text-muted-foreground">{t("config.caseId")}</div>
                      <div className="font-medium">{caseMetadata.case_id}</div>
                    </div>
                  )}
                  {caseMetadata?.client && (
                    <div>
                      <div className="text-xs text-muted-foreground">{t("config.caseClient")}</div>
                      <div className="font-medium">{caseMetadata.client}</div>
                    </div>
                  )}
                  {caseMetadata?.analyst && (
                    <div>
                      <div className="text-xs text-muted-foreground">{t("config.caseAnalyst")}</div>
                      <div className="font-medium">{caseMetadata.analyst}</div>
                    </div>
                  )}
                  {caseMetadata?.notes && (
                    <div className="sm:col-span-2">
                      <div className="text-xs text-muted-foreground">{t("config.caseNotes")}</div>
                      <div className="whitespace-pre-wrap font-medium">{caseMetadata.notes}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="rounded-lg border border-border/50 bg-muted/20 p-4 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("report.requestScope")}
              </div>
              {scopeItems.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {scopeItems.map((item) => (
                    <Badge key={item} variant="outline" className="font-normal">
                      {item}
                    </Badge>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-sm text-muted-foreground">{t("report.scopeDefault")}</div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
