"use client";

import type { AnalysisDetail } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/components/providers/i18n-provider";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300",
  running: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  canceled: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
};

interface ReportHeaderProps {
  analysis: AnalysisDetail;
}

function joinValues(values: string[]) {
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
      ? `${t("report.scope.questioned")}: ${joinValues(request.task_params.questioned_text_ids)}`
      : null,
    request?.task_params.reference_author_ids.length
      ? `${t("report.scope.reference")}: ${joinValues(request.task_params.reference_author_ids)}`
      : null,
    request?.task_params.candidate_author_ids.length
      ? `${t("report.scope.candidate")}: ${joinValues(request.task_params.candidate_author_ids)}`
      : null,
    request?.task_params.cluster_text_ids.length
      ? `${t("report.scope.cluster")}: ${joinValues(request.task_params.cluster_text_ids)}`
      : null,
    request?.task_params.subject_ids.length
      ? `${t("report.scope.subject")}: ${joinValues(request.task_params.subject_ids)}`
      : null,
    request?.task_params.account_ids.length
      ? `${t("report.scope.account")}: ${joinValues(request.task_params.account_ids)}`
      : null,
    request?.task_params.top_k ? `Top-K: ${request.task_params.top_k}` : null,
  ].filter(Boolean) as string[];

  const hasCaseMetadata = Boolean(
    caseMetadata?.case_id || caseMetadata?.client || caseMetadata?.analyst || caseMetadata?.notes,
  );

  return (
    <Card className="border-border/70 bg-card/96 shadow-none">
      <CardContent className="space-y-5 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-lg font-semibold">{analysis.id}</span>
              <Badge className={STATUS_STYLES[analysis.status] ?? ""}>{t(`status.${analysis.status}`)}</Badge>
              <Badge variant="outline" className="capitalize">
                {t(`task.${analysis.task_type}`)}
              </Badge>
            </div>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
              {t("detail.headerHint")}
            </p>
          </div>

          <div className="grid min-w-[280px] gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <HeaderMetric label={t("report.textCountSuffix")} value={String(analysis.text_count)} />
            <HeaderMetric label={t("report.sourceCountSuffix")} value={String(analysis.author_count)} />
            <HeaderMetric label={t("detail.scroll.signalStrength")} value={analysis.llm_backend} />
            <HeaderMetric
              label={t("analysis.table.duration")}
              value={duration ? `${duration}s` : t("detail.inProgress")}
            />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          {hasCaseMetadata && (
            <div className="rounded-2xl border border-border/60 bg-background/80 p-5 text-sm">
              <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                {t("report.caseMetadata")}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {caseMetadata?.case_id && (
                  <HeaderField label={t("config.caseId")} value={caseMetadata.case_id} />
                )}
                {caseMetadata?.client && (
                  <HeaderField label={t("config.caseClient")} value={caseMetadata.client} />
                )}
                {caseMetadata?.analyst && (
                  <HeaderField label={t("config.caseAnalyst")} value={caseMetadata.analyst} />
                )}
                {caseMetadata?.notes && (
                  <HeaderField
                    label={t("config.caseNotes")}
                    value={caseMetadata.notes}
                    className="sm:col-span-2"
                  />
                )}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-border/60 bg-background/80 p-5 text-sm">
            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              {t("report.requestScope")}
            </div>
            {scopeItems.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {scopeItems.map((item) => (
                  <Badge key={item} variant="outline" className="rounded-full px-3 py-1 font-normal">
                    {item}
                  </Badge>
                ))}
              </div>
            ) : (
              <div className="mt-3 text-sm text-muted-foreground">{t("report.scopeDefault")}</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HeaderMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

function HeaderField({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-1 whitespace-pre-wrap text-sm font-medium leading-7 text-foreground">
        {value}
      </div>
    </div>
  );
}
