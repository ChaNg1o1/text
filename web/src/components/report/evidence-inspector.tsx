"use client";

import type { ClusterViewCluster, EvidenceItem, ReportConclusion, WritingProfile } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface EvidenceInspectorProps {
  item:
    | { kind: "evidence"; evidence: EvidenceItem }
    | { kind: "conclusion"; conclusion: ReportConclusion }
    | { kind: "cluster"; cluster: ClusterViewCluster }
    | { kind: "profile"; profile: WritingProfile }
    | null;
}

export function EvidenceInspector({ item }: EvidenceInspectorProps) {
  return (
    <Card className="border-border/60 bg-card/95">
      <CardContent className="p-5">
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          Inspector
        </div>

        {!item && (
          <div className="mt-3 rounded-[20px] border border-border/60 bg-background/30 p-4 text-sm leading-7 text-muted-foreground">
            点击左侧任意节点，这里会显示它到底说明什么、为什么重要，以及有哪些需要防止误读的地方。
          </div>
        )}

        {item?.kind === "evidence" && (
          <section className="mt-3 space-y-3">
            <Badge variant="outline">{item.evidence.evidence_id}</Badge>
            <h4 className="text-lg font-semibold">{item.evidence.label}</h4>
            <p className="text-sm leading-7 text-foreground/88">
              {item.evidence.finding || item.evidence.summary}
            </p>
            <p className="text-sm leading-7 text-muted-foreground">{item.evidence.why_it_matters}</p>
            {item.evidence.counter_readings && item.evidence.counter_readings.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  反向解释
                </div>
                {item.evidence.counter_readings.map((entry) => (
                  <div
                    key={entry}
                    className="rounded-[18px] border border-border/50 bg-background/30 p-3 text-sm leading-7 text-muted-foreground"
                  >
                    {entry}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {item?.kind === "conclusion" && (
          <section className="mt-3 space-y-3">
            <Badge variant="outline">{item.conclusion.task}</Badge>
            <h4 className="text-lg font-semibold">{item.conclusion.statement}</h4>
            <p className="text-sm leading-7 text-muted-foreground">
              分级：{item.conclusion.grade}，证据锚点：{item.conclusion.evidence_ids.join(", ") || "无"}
            </p>
          </section>
        )}

        {item?.kind === "cluster" && (
          <section className="mt-3 space-y-3">
            <Badge variant="outline">{item.cluster.label}</Badge>
            <h4 className="text-lg font-semibold">{item.cluster.theme_summary}</h4>
            <p className="text-sm leading-7 text-muted-foreground">{item.cluster.separation_summary}</p>
          </section>
        )}

        {item?.kind === "profile" && (
          <section className="mt-3 space-y-3">
            <Badge variant="outline">{item.profile.subject}</Badge>
            <h4 className="text-lg font-semibold">{item.profile.headline || item.profile.subject}</h4>
            <p className="text-sm leading-7 text-muted-foreground">
              {item.profile.observable_summary || item.profile.summary}
            </p>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
