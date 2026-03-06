"use client";

import type { AgentReport, AgentFinding } from "@/lib/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { useI18n } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/utils";

const AGENT_ORDER = [
  "stylometry",
  "writing_process",
  "computational",
  "sociolinguistics",
];

const AGENT_LABELS: Record<string, string> = {
  stylometry: "Stylometry",
  writing_process: "Writing Process",
  computational_linguistics: "Computational Linguistics",
  computational: "Computational Linguistics",
  sociolinguistics: "Sociolinguistics",
};

interface AgentSectionProps {
  reports: AgentReport[];
}

function confidenceTone(c: number): {
  chip: string;
  shell: string;
  marker: string;
} {
  if (c >= 0.75) {
    return {
      chip: "text-emerald-700 dark:text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
      shell: "border-emerald-500/30 shadow-[0_0_0_1px_hsl(var(--background))_inset,0_12px_28px_-18px_rgba(16,185,129,0.65)]",
      marker: "bg-emerald-500/80",
    };
  }
  if (c >= 0.45) {
    return {
      chip: "text-amber-700 dark:text-amber-300 border-amber-500/40 bg-amber-500/10",
      shell: "border-amber-500/30 shadow-[0_0_0_1px_hsl(var(--background))_inset,0_12px_28px_-18px_rgba(245,158,11,0.65)]",
      marker: "bg-amber-500/80",
    };
  }
  return {
    chip: "text-rose-700 dark:text-rose-300 border-rose-500/40 bg-rose-500/10",
    shell: "border-rose-500/30 shadow-[0_0_0_1px_hsl(var(--background))_inset,0_12px_28px_-18px_rgba(244,63,94,0.6)]",
    marker: "bg-rose-500/80",
  };
}

function FindingCard({
  finding,
  moreLabel,
}: {
  finding: AgentFinding;
  moreLabel: (count: number) => string;
}) {
  const tone = confidenceTone(finding.confidence);

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-card",
        tone.shell,
      )}
    >
      <div className="pointer-events-none absolute inset-0 opacity-35 [background-image:radial-gradient(circle_at_1px_1px,hsl(var(--foreground)/0.08)_1px,transparent_0)] [background-size:11px_11px]" />
      <div className="relative space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-xs font-semibold tracking-wide">
              {finding.category}
            </Badge>
            <Badge variant="secondary" className="text-[11px] font-medium">
              {finding.opinion_kind === "deterministic_evidence" ? "evidence" : "interpretive"}
            </Badge>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
                tone.chip,
              )}
            >
              <span className={cn("size-1.5 rounded-full", tone.marker)} />
              {(finding.confidence * 100).toFixed(0)}%
            </span>
          </div>
        </div>
        <p className="text-sm leading-relaxed">{finding.description}</p>
        {finding.evidence.length > 0 && (
          <ul className="space-y-1.5">
            {finding.evidence.slice(0, 5).map((e, i) => (
              <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                <span className={cn("mt-[6px] size-1.5 shrink-0 rounded-full", tone.marker)} />
                <span>{e}</span>
              </li>
            ))}
            {finding.evidence.length > 5 && (
              <li className="flex gap-2 text-xs text-muted-foreground">
                <span className="mt-[6px] size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                <span>{moreLabel(finding.evidence.length - 5)}</span>
              </li>
            )}
          </ul>
        )}
      </div>
    </article>
  );
}

export function AgentSection({ reports }: AgentSectionProps) {
  const { t } = useI18n();
  const sorted = [...reports].sort((a, b) => {
    const aIdx = AGENT_ORDER.indexOf(a.agent_name);
    const bIdx = AGENT_ORDER.indexOf(b.agent_name);
    return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
  });

  return (
    <Accordion type="multiple" defaultValue={[]} className="space-y-2">
      {sorted.map((report) => (
        <AccordionItem
          key={report.agent_name}
          value={report.agent_name}
          className="border rounded-lg px-4 transition-[background-color,border-color,box-shadow] duration-300 data-[state=open]:bg-card/55 data-[state=open]:shadow-[0_10px_24px_-18px_rgba(15,23,42,0.45)] dark:data-[state=open]:shadow-[0_10px_24px_-18px_rgba(2,6,23,0.9)]"
        >
          <AccordionTrigger className="hover:no-underline data-[state=open]:text-foreground">
            <div className="flex items-center gap-3">
              <span className="font-medium tracking-wide">
                {AGENT_LABELS[report.agent_name] ?? AGENT_LABELS[report.discipline] ?? report.agent_name}
              </span>
              <Badge variant="secondary" className="text-xs transition-colors data-[state=open]:bg-secondary/80">
                {t("report.findings", { count: report.findings.length })}
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-3 pt-2 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1">
            {report.summary && (
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <Markdown rehypePlugins={[rehypeRaw]}>{report.summary}</Markdown>
              </div>
            )}
            {report.llm_call && (
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span>model: {report.llm_call.model_id}</span>
                  <span>{new Date(report.llm_call.timestamp).toLocaleString()}</span>
                  <span>prompt: {report.llm_call.token_count_in ?? "-"}</span>
                  <span>output: {report.llm_call.token_count_out ?? "-"}</span>
                  <span>{report.llm_call.cache_hit ? "cache hit" : "cache miss"}</span>
                </div>
              </div>
            )}
            {report.findings.map((f, i) => (
              <FindingCard
                key={i}
                finding={f}
                moreLabel={(count) => t("report.moreFindings", { count })}
              />
            ))}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
