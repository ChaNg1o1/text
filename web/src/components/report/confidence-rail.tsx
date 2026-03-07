"use client";

import { useMemo } from "react";
import type { ForensicReport, ReportConclusion } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ConfidenceRailProps {
  report: ForensicReport;
  className?: string;
}

function tone(grade: ReportConclusion["grade"]) {
  if (grade === "strong_support") {
    return ["text-emerald-300", "bg-emerald-400", "border-emerald-400/25"] as const;
  }
  if (grade === "moderate_support") {
    return ["text-sky-300", "bg-sky-400", "border-sky-400/25"] as const;
  }
  if (grade === "inconclusive") {
    return ["text-amber-300", "bg-amber-400", "border-amber-400/25"] as const;
  }
  return ["text-rose-300", "bg-rose-400", "border-rose-400/25"] as const;
}

function certainty(conclusion: ReportConclusion) {
  const base = {
    strong_support: 88,
    moderate_support: 76,
    inconclusive: 58,
    moderate_against: 72,
    strong_against: 86,
  }[conclusion.grade];
  const penalty = conclusion.limitations.length * 4 + conclusion.counter_evidence.length * 3;
  return Math.max(22, Math.min(97, base - penalty));
}

export function ConfidenceRail({ report, className }: ConfidenceRailProps) {
  const items = useMemo(
    () =>
      report.conclusions
        .map((conclusion) => ({
          conclusion,
          percent: certainty(conclusion),
        }))
        .sort((a, b) => b.percent - a.percent),
    [report.conclusions],
  );

  if (items.length === 0) {
    return null;
  }

  return (
    <Card
      className={cn(
        "border-border/60 bg-[rgba(6,18,34,0.94)] text-slate-50",
        className,
      )}
    >
      <CardHeader>
        <CardTitle className="text-lg text-slate-100">Confidence Rail</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map(({ conclusion, percent }) => {
          const [valueTone, barTone, borderTone] = tone(conclusion.grade);
          return (
            <section
              key={conclusion.key}
              className={cn("rounded-[24px] border bg-black/20 p-5", borderTone)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                    {conclusion.task}
                  </div>
                  <div className="text-base font-semibold text-slate-50">
                    {conclusion.subject || conclusion.statement}
                  </div>
                  <p className="text-sm leading-6 text-slate-300">
                    {conclusion.statement}
                  </p>
                </div>
                <div className={cn("shrink-0 text-3xl font-semibold tabular-nums", valueTone)}>
                  {percent}%
                </div>
              </div>

              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/8">
                <div
                  className={cn("h-full rounded-full transition-[width]", barTone)}
                  style={{ width: `${percent}%` }}
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline" className="border-white/12 bg-white/6 text-slate-100">
                  {conclusion.grade}
                </Badge>
                <Badge variant="secondary" className="bg-white/8 text-slate-200">
                  {conclusion.evidence_ids.length} evidence
                </Badge>
                {conclusion.counter_evidence.length > 0 && (
                  <Badge variant="secondary" className="bg-amber-500/12 text-amber-200">
                    {conclusion.counter_evidence.length} 冲突点
                  </Badge>
                )}
              </div>

              <div className="mt-4 space-y-1.5 text-xs text-slate-400">
                <div>
                  主驱动：
                  {conclusion.evidence_ids.length > 0
                    ? ` 结构化证据 ${conclusion.evidence_ids.slice(0, 3).join(", ")}`
                    : " 当前没有绑定证据锚点"}
                </div>
                <div>
                  风险：
                  {conclusion.limitations[0] || conclusion.counter_evidence[0] || "暂未记录首要风险"}
                </div>
              </div>
            </section>
          );
        })}
        <p className="text-xs leading-6 text-slate-400">
          这里只帮助用户快速判断“证据方向和稳定性”，并不表示统计学概率。
        </p>
      </CardContent>
    </Card>
  );
}
