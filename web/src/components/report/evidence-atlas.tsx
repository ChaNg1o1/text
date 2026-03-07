"use client";

import type { ForensicReport, TextAliasRecord } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMemo } from "react";
import { useI18n } from "@/components/providers/i18n-provider";

interface EvidenceAtlasProps {
  report: ForensicReport;
}

function AliasBadge({ alias, compact = false }: { alias: TextAliasRecord; compact?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={compact ? "text-[11px]" : ""}>
          {alias.alias}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="space-y-1">
          <div className="font-mono text-xs">{alias.text_id}</div>
          <div className="text-xs text-muted-foreground">author: {alias.author}</div>
          {alias.preview && <div className="text-xs leading-relaxed">{alias.preview}</div>}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function EvidenceAtlas({ report }: EvidenceAtlasProps) {
  const { t } = useI18n();
  const textAliases = useMemo(
    () => report.entity_aliases?.text_aliases ?? [],
    [report.entity_aliases],
  );
  const aliasMap = useMemo(
    () => new Map(textAliases.map((item) => [item.text_id, item])),
    [textAliases],
  );

  if (
    report.evidence_items.length === 0 &&
    textAliases.length === 0 &&
    !report.cluster_view &&
    report.anomaly_samples.length === 0
  ) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("report.evidenceAtlas")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {report.evidence_items.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">{t("report.evidenceAnchors")}</h4>
            <div className="grid gap-3 md:grid-cols-2">
              {report.evidence_items.slice(0, 10).map((item) => (
                <div key={item.evidence_id} className="rounded-xl border border-border/60 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{item.evidence_id}</span>
                    <span className="text-sm font-medium">{item.label}</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{item.summary}</p>
                  {item.source_text_ids.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.source_text_ids.slice(0, 6).map((textId) => {
                        const alias = aliasMap.get(textId);
                        if (!alias) {
                          return (
                            <Badge key={`${item.evidence_id}-${textId}`} variant="outline">
                              {textId}
                            </Badge>
                          );
                        }
                        return (
                          <AliasBadge
                            key={`${item.evidence_id}-${textId}`}
                            alias={alias}
                            compact
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {textAliases.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">{t("report.aliasLegend")}</h4>
            <div className="rounded-xl border border-border/60 p-3">
              <div className="flex flex-wrap gap-2">
                {textAliases.map((alias) => (
                  <AliasBadge key={alias.text_id} alias={alias} />
                ))}
              </div>
            </div>
          </div>
        )}

        {report.cluster_view && report.cluster_view.clusters.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">{t("report.clusterView")}</h4>
            <div className="grid gap-3 md:grid-cols-2">
              {report.cluster_view.clusters.map((cluster) => (
                <div key={`cluster-${cluster.cluster_id}`} className="rounded-xl border border-border/60 p-3">
                  <div className="text-sm font-medium">{cluster.label}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {cluster.member_text_ids.map((textId) => {
                      const alias = aliasMap.get(textId);
                      if (!alias) {
                        return (
                          <Badge key={`${cluster.cluster_id}-${textId}`} variant="outline">
                            {textId}
                          </Badge>
                        );
                      }
                      return (
                        <AliasBadge
                          key={`${cluster.cluster_id}-${textId}`}
                          alias={alias}
                          compact
                        />
                      );
                    })}
                  </div>
                  {cluster.representative_excerpt && (
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {cluster.representative_excerpt}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {report.cluster_view.excluded_text_ids.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("report.clusterExcluded", {
                  count: report.cluster_view.excluded_text_ids.length,
                })}
              </p>
            )}
          </div>
        )}

        {report.anomaly_samples.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">{t("report.anomalySignals")}</h4>
            <div className="flex flex-wrap gap-2">
              {report.anomaly_samples.slice(0, 8).map((sample) => {
                const alias = aliasMap.get(sample.text_id);
                return (
                  <Badge key={sample.text_id} variant="secondary">
                    {alias?.alias ?? sample.text_id} · {Object.keys(sample.outlier_dimensions).length}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
