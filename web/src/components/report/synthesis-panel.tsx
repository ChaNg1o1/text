"use client";

import type { ForensicReport } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  CircleHelp,
  FileSearch,
  Scale,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/providers/i18n-provider";

interface SynthesisPanelProps {
  report: ForensicReport;
  className?: string;
}

function verdictMeta(grade?: string) {
  switch (grade) {
    case "strong_support":
      return {
        label: "支持度高",
        hint: "当前证据明显偏向支持，但仍应结合案情与材料来源一起判断。",
        shell: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
        icon: ShieldCheck,
      };
    case "moderate_support":
      return {
        label: "比较支持",
        hint: "目前更偏向支持，但还不是可以忽略风险的铁证结论。",
        shell: "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-200",
        icon: Scale,
      };
    case "moderate_against":
    case "strong_against":
      return {
        label: "偏向不支持",
        hint: "当前证据更偏向排除或反对，需要重点检查是否存在样本偏差或题材差异。",
        shell: "border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-200",
        icon: ShieldAlert,
      };
    default:
      return {
        label: "暂时无法判断",
        hint: "现有材料还不够稳，适合把它当作辅助线索，而不是最终定论。",
        shell: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200",
        icon: CircleHelp,
      };
  }
}

function taskLabel(task?: string) {
  switch (task) {
    case "verification":
      return "作者验证";
    case "closed_set_id":
      return "候选集识别";
    case "open_set_id":
      return "开放集识别";
    case "clustering":
      return "聚类分组";
    case "profiling":
      return "写作画像";
    case "sockpuppet":
      return "马甲检测";
    default:
      return "综合分析";
  }
}

export function SynthesisPanel({ report, className }: SynthesisPanelProps) {
  const { t } = useI18n();
  const leadConclusion = report.conclusions[0];
  const leadMeta = verdictMeta(leadConclusion?.grade);
  const interpretiveResults = report.results.filter((item) => item.interpretive_opinion);
  const LeadIcon = leadMeta.icon;
  const cautionItems = Array.from(
    new Set(
      [
        ...(leadConclusion?.counter_evidence ?? []),
        ...(leadConclusion?.limitations ?? []),
        ...report.limitations,
      ]
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );

  return (
    <Card
      className={cn(
        "h-full border-border/60 bg-card/92 shadow-[0_24px_80px_-56px_rgba(15,23,42,0.9)]",
        className,
      )}
    >
      <CardHeader>
        <CardTitle className="text-lg">{t("report.synthesis")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {leadConclusion && (
          <div className={cn("rounded-[28px] border p-5", leadMeta.shell)}>
            <div className="flex items-start gap-4">
              <div className="mt-0.5 rounded-2xl bg-background/80 p-2.5">
                <LeadIcon className="h-5 w-5" />
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-[0.22em] opacity-75">
                    {t("report.synthesisLead")}
                  </span>
                  <Badge variant="outline" className="bg-background/80">
                    {leadMeta.label}
                  </Badge>
                  <span className="text-xs uppercase tracking-[0.16em] opacity-75">
                    {taskLabel(leadConclusion.task)}
                  </span>
                </div>
                <div className="text-base font-semibold leading-7 text-foreground">
                  {leadConclusion.statement}
                </div>
                <p className="text-sm leading-6 text-foreground/80">{leadMeta.hint}</p>
              </div>
            </div>
          </div>
        )}

        {report.summary && (
          <div className="rounded-[26px] border border-border/60 bg-[linear-gradient(180deg,rgba(15,23,42,0.04),rgba(15,23,42,0.01))] p-5 dark:bg-[linear-gradient(180deg,rgba(148,163,184,0.08),rgba(15,23,42,0.14))]">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <FileSearch className="h-4 w-4 text-sky-600" />
              {t("report.synthesisNarrative")}
            </div>
            <div className="prose prose-sm max-w-none dark:prose-invert prose-p:leading-7">
              <Markdown rehypePlugins={[rehypeRaw]}>{report.summary}</Markdown>
            </div>
          </div>
        )}

        {cautionItems.length > 0 && (
          <div className="rounded-[24px] border border-amber-500/25 bg-amber-500/8 p-4">
            <div className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              {t("report.synthesisCaution")}
            </div>
            <ul className="space-y-2 text-sm leading-6 text-foreground/80">
              {cautionItems.slice(0, 6).map((item, index) => (
                <li key={`${item}-${index}`} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {interpretiveResults.length > 0 && (
          <Accordion type="multiple" className="rounded-[24px] border border-border/60 px-4">
            <AccordionItem value="read-more">
              <AccordionTrigger className="text-sm font-semibold">
                {t("report.synthesisReasoning")}
              </AccordionTrigger>
              <AccordionContent className="space-y-3">
                {interpretiveResults.map((result) => (
                  <div
                    key={result.key}
                    className="rounded-2xl border border-border/60 bg-background/60 p-4"
                  >
                    <div className="text-sm font-medium">{result.title}</div>
                    <div className="mt-1 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
                      {result.body}
                    </div>
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}
