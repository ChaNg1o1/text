"use client";

import { useMemo, useState } from "react";
import type { AgentReport, AgentFinding } from "@/lib/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { useI18n } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/utils";
import { AutoCollapse } from "@/components/report/auto-collapse";
import { ReportMetaLabel } from "@/components/report/report-primitives";

const AGENT_ORDER = [
  "stylometry",
  "writing_process",
  "computational",
  "sociolinguistics",
];

const FINDING_LAYER_ORDER = ["clue", "portrait", "evidence"] as const;
type FindingLayer = (typeof FINDING_LAYER_ORDER)[number];
const DEFAULT_VISIBLE_FINDINGS = 8;

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
      shell: "shadow-sm",
      marker: "bg-emerald-500/80",
    };
  }
  if (c >= 0.45) {
    return {
      chip: "text-amber-700 dark:text-amber-300 border-amber-500/40 bg-amber-500/10",
      shell: "shadow-sm",
      marker: "bg-amber-500/80",
    };
  }
  return {
    chip: "text-rose-700 dark:text-rose-300 border-rose-500/40 bg-rose-500/10",
    shell: "shadow-sm",
    marker: "bg-rose-500/80",
  };
}

function FindingCard({
  finding,
  moreLabel,
  t,
}: {
  finding: AgentFinding;
  moreLabel: (count: number) => string;
  t: (key: string) => string;
}) {
  const tone = confidenceTone(finding.confidence);
  const meta = (finding.metadata ?? {}) as Record<string, unknown>;
  const inferenceMode = typeof meta.inference_mode === "string" ? meta.inference_mode : "";
  const inferenceLabel =
    typeof meta.display_label === "string"
      ? meta.display_label
      : inferenceMode === "subjective_hypothesis"
        ? t("report.inferenceMode.subjective")
        : inferenceMode === "observable_process"
          ? t("report.inferenceMode.observable")
          : "";
  const caution = typeof meta.caution === "string" ? meta.caution : "";
  const layer = finding.layer ?? "clue";

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/60 bg-card/88",
        tone.shell,
      )}
      style={{ contentVisibility: "auto", containIntrinsicSize: "280px" }}
    >
      <div className="relative space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-xs font-semibold tracking-wide">
              {finding.category}
            </Badge>
            <Badge variant="outline" className="text-[11px] font-medium">
              {t(`report.findingLayer.${layer}`)}
            </Badge>
            <Badge variant="secondary" className="text-[11px] font-medium">
              {finding.opinion_kind === "deterministic_evidence"
                ? t("report.opinionKind.deterministic")
                : t("report.opinionKind.interpretive")}
            </Badge>
            {inferenceLabel && (
              <Badge variant="outline" className="text-[11px] font-medium">
                {inferenceLabel}
              </Badge>
            )}
            <span
              className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold", tone.chip)}
            >
              <span className={cn("size-1.5 rounded-full", tone.marker)} aria-hidden="true" />
              {(finding.confidence * 100).toFixed(0)}%
            </span>
          </div>
        </div>
        <AutoCollapse
          collapsedHeight={220}
          contentKey={`${finding.category}-${finding.description}`}
        >
          <div className="space-y-3">
            <p className="text-sm leading-7 text-foreground/92">{finding.description}</p>
            {finding.interpretation && (
              <p
                className="mt-1 rounded-r-lg border-l-2 border-border/70 bg-muted/10 py-1 pl-3 pr-2 text-xs
                           leading-6 text-foreground/68 italic"
              >
                {finding.interpretation}
              </p>
            )}
            {caution && (
              <p className="rounded-xl bg-amber-500/8 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
                {caution}
              </p>
            )}
            {finding.evidence.length > 0 && (
              <ul className="space-y-2">
                {finding.evidence.slice(0, 5).map((e, i) => (
                  <li key={i} className="flex gap-2 text-xs leading-6 text-foreground/72">
                    <span className={cn("mt-[6px] size-1.5 shrink-0 rounded-full", tone.marker)} aria-hidden="true" />
                    <span>{e}</span>
                  </li>
                ))}
                {finding.evidence.length > 5 && (
                  <li className="flex gap-2 text-xs leading-6 text-foreground/64">
                    <span className="mt-[6px] size-1.5 shrink-0 rounded-full bg-muted-foreground/40" aria-hidden="true" />
                    <span>{moreLabel(finding.evidence.length - 5)}</span>
                  </li>
                )}
              </ul>
            )}
          </div>
        </AutoCollapse>
      </div>
    </article>
  );
}

function sortFindingsByLayer(findings: AgentFinding[]) {
  return [...findings].sort((a, b) => {
    const aLayer = FINDING_LAYER_ORDER.indexOf((a.layer ?? "clue") as FindingLayer);
    const bLayer = FINDING_LAYER_ORDER.indexOf((b.layer ?? "clue") as FindingLayer);
    if (aLayer !== bLayer) {
      return (aLayer === -1 ? 99 : aLayer) - (bLayer === -1 ? 99 : bLayer);
    }
    return b.confidence - a.confidence;
  });
}

function AgentReportPanel({
  report,
  label,
}: {
  report: AgentReport;
  label: string;
}) {
  const { t } = useI18n();
  const [expandedLayers, setExpandedLayers] = useState<Record<string, boolean>>({});
  const sortedFindings = useMemo(() => sortFindingsByLayer(report.findings), [report.findings]);
  const findingsByLayer = useMemo(
    () =>
      FINDING_LAYER_ORDER.reduce<Record<FindingLayer, AgentFinding[]>>((acc, layer) => {
        acc[layer] = sortedFindings.filter((finding) => (finding.layer ?? "clue") === layer);
        return acc;
      }, { clue: [], portrait: [], evidence: [] }),
    [sortedFindings],
  );

  return (
    <AccordionItem
      value={report.agent_name}
      className="rounded-lg border border-border/60 bg-background/18 px-5 py-1 transition-[background-color,border-color] duration-300 data-[state=open]:bg-card/70"
    >
      <AccordionTrigger className="hover:no-underline data-[state=open]:text-foreground">
        <div className="flex items-center gap-3">
          <span className="font-medium tracking-wide">{label}</span>
          <Badge variant="secondary" className="text-xs transition-colors data-[state=open]:bg-secondary/80">
            {t("report.findings", { count: report.findings.length })}
          </Badge>
        </div>
      </AccordionTrigger>
      <AccordionContent className="space-y-4 pt-2 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1">
        {report.summary && (
          <AutoCollapse collapsedHeight={260} contentKey={`${report.agent_name}-summary`}>
            <div
              className="prose prose-sm max-w-none text-foreground/84 dark:prose-invert
                         prose-p:leading-7 prose-p:text-foreground/84 prose-strong:text-foreground
                         prose-li:text-foreground/80"
            >
              <Markdown rehypePlugins={[rehypeRaw]}>{report.summary}</Markdown>
            </div>
          </AutoCollapse>
        )}

        {FINDING_LAYER_ORDER.map((layer) => {
          const findings = findingsByLayer[layer];
          if (findings.length === 0) {
            return null;
          }

          const expanded = expandedLayers[layer] ?? false;
          const visibleFindings = expanded ? findings : findings.slice(0, DEFAULT_VISIBLE_FINDINGS);
          const hiddenCount = Math.max(0, findings.length - visibleFindings.length);

          return (
            <section key={`${report.agent_name}-${layer}`} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <ReportMetaLabel>{t(`report.findingLayer.${layer}`)}</ReportMetaLabel>
                <Badge variant="outline" className="text-[11px] font-medium">
                  {t("report.findings", { count: findings.length })}
                </Badge>
              </div>

              {visibleFindings.map((f, i) => (
                <FindingCard
                  key={`${layer}-${i}`}
                  finding={f}
                  moreLabel={(count) => t("report.moreFindings", { count })}
                  t={t}
                />
              ))}

              {(hiddenCount > 0 || expanded) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() =>
                    setExpandedLayers((current) => ({
                      ...current,
                      [layer]: !expanded,
                    }))
                  }
                >
                  {t(expanded ? "common.showLess" : "common.showMore")}
                  {!expanded && hiddenCount > 0 ? ` (${hiddenCount})` : ""}
                </Button>
              )}
            </section>
          );
        })}
      </AccordionContent>
    </AccordionItem>
  );
}

export function AgentSection({ reports }: AgentSectionProps) {
  const { t } = useI18n();
  const AGENT_LABELS: Record<string, string> = {
    stylometry: t("report.agent.stylometry"),
    writing_process: t("report.agent.writingProcess"),
    computational: t("report.agent.computational"),
    sociolinguistics: t("report.agent.sociolinguistics"),
  };
  const sorted = useMemo(
    () =>
      [...reports].sort((a, b) => {
        const aIdx = AGENT_ORDER.indexOf(a.agent_name);
        const bIdx = AGENT_ORDER.indexOf(b.agent_name);
        return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
      }),
    [reports],
  );

  return (
    <Accordion type="multiple" defaultValue={[]} className="space-y-3">
      {sorted.map((report) => (
        <AgentReportPanel
          key={report.agent_name}
          report={report}
          label={AGENT_LABELS[report.agent_name] ?? AGENT_LABELS[report.discipline] ?? report.agent_name}
        />
      ))}
    </Accordion>
  );
}
