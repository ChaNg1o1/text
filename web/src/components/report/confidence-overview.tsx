"use client";

import { useMemo } from "react";
import type { ReportConclusion } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/providers/i18n-provider";
import { conclusionCertaintyPercent } from "@/lib/forensic-math";
import { motion } from "framer-motion";
import { NumberTween } from "@/components/motion/number-tween";
import { useReducedMotionPreference } from "@/hooks/use-reduced-motion";
import { DURATION, EASE } from "@/lib/motion";

interface ConfidenceOverviewProps {
  conclusions: ReportConclusion[];
  className?: string;
}

function gradeTone(grade: ReportConclusion["grade"]) {
  if (grade === "strong_support") {
    return {
      badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
      value: "text-emerald-600 dark:text-emerald-300",
      bar: "bg-emerald-500",
    };
  }
  if (grade === "moderate_support") {
    return {
      badge: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-200",
      value: "text-sky-600 dark:text-sky-300",
      bar: "bg-sky-500",
    };
  }
  if (grade === "inconclusive") {
    return {
      badge: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200",
      value: "text-amber-600 dark:text-amber-300",
      bar: "bg-amber-500",
    };
  }
  return {
    badge: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-200",
    value: "text-rose-600 dark:text-rose-300",
    bar: "bg-rose-500",
  };
}

function gradeLabel(grade: ReportConclusion["grade"]): string {
  const labels: Record<ReportConclusion["grade"], string> = {
    strong_support: "强支持",
    moderate_support: "中等支持",
    inconclusive: "无法判断",
    moderate_against: "中等反对",
    strong_against: "强反对",
  };
  return labels[grade];
}

function taskLabel(task: ReportConclusion["task"]): string {
  const labels: Record<ReportConclusion["task"], string> = {
    full: "综合分析",
    verification: "来源比对",
    closed_set_id: "候选集识别",
    open_set_id: "开放集识别",
    clustering: "聚类分组",
    profiling: "写作画像",
    sockpuppet: "马甲检测",
    self_discovery: "文字 DNA",
    clue_extraction: "线索提取",
  };
  return labels[task];
}

function scoreLabel(conclusion: ReportConclusion): string | null {
  if (typeof conclusion.score !== "number") return null;
  const label = conclusion.score_type === "log10_lr" ? "log10(LR)" : conclusion.score_type ?? "score";
  return `${label} ${conclusion.score.toFixed(2)}`;
}

export function ConfidenceOverview({ conclusions, className }: ConfidenceOverviewProps) {
  const { t } = useI18n();
  const reducedMotion = useReducedMotionPreference();
  const items = useMemo(
    () =>
      conclusions
        .map((conclusion) => ({
          conclusion,
          percent: conclusionCertaintyPercent(conclusion),
        }))
        .sort((a, b) => b.percent - a.percent),
    [conclusions],
  );

  if (items.length === 0) return null;

  return (
    <Card
      className={cn(
        "h-full border-border/60 bg-card/92 shadow-[0_24px_80px_-56px_rgba(15,23,42,0.9)]",
        className,
      )}
    >
      <CardHeader>
        <CardTitle className="text-lg">{t("report.confidence")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map(({ conclusion, percent }) => {
          const tone = gradeTone(conclusion.grade);
          const metricLabel = scoreLabel(conclusion);

          return (
            <div
              key={conclusion.key}
              className="rounded-[22px] border border-border/60 bg-background/40 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    {taskLabel(conclusion.task)}
                  </div>
                  {conclusion.subject && (
                    <div className="mt-1 text-sm font-medium">{conclusion.subject}</div>
                  )}
                  <p className="mt-1 text-sm leading-6 text-foreground/85">
                    {conclusion.statement}
                  </p>
                </div>
                <div className={cn("shrink-0 text-lg font-semibold tabular-nums", tone.value)}>
                  <NumberTween value={percent} decimals={0} suffix="%" />
                </div>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted/45">
                <motion.div
                  className={cn("h-full rounded-full", tone.bar)}
                  initial={reducedMotion ? false : { width: 0 }}
                  animate={{ width: `${percent}%` }}
                  transition={{ duration: DURATION.slow, ease: EASE.outQuart, delay: 0.1 }}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <Badge variant="outline" className={cn("font-normal", tone.badge)}>
                  {gradeLabel(conclusion.grade)}
                </Badge>
                <div className="text-xs text-muted-foreground">
                  {metricLabel ??
                    t("report.personaEvidenceCount", { count: conclusion.evidence_ids.length })}
                </div>
              </div>
            </div>
          );
        })}

        <p className="text-xs leading-5 text-muted-foreground">{t("report.confidenceFootnote")}</p>
      </CardContent>
    </Card>
  );
}
