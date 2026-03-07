"use client";

import { useMemo, useState } from "react";
import type { ForensicReport, NarrativeSection } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface NarrativeSpineProps {
  report: ForensicReport;
  onFocusEvidence?: (evidenceId: string) => void;
  onFocusCluster?: (clusterId: number) => void;
}

const SECTION_COLORS: Record<string, string> = {
  bottom_line: "bg-cyan-400",
  evidence_chain: "bg-emerald-400",
  conflicts: "bg-rose-400",
  limitations: "bg-amber-400",
  next_actions: "bg-violet-400",
};

export function NarrativeSpine({ report, onFocusEvidence, onFocusCluster }: NarrativeSpineProps) {
  const sections = useMemo(() => report.narrative?.sections ?? [], [report.narrative?.sections]);
  const defaultKey = sections.find((section) => section.default_expanded)?.key ?? sections[0]?.key;
  const [activeKeyOverride, setActiveKeyOverride] = useState<string | null>(null);
  const activeKey =
    activeKeyOverride && sections.some((section) => section.key === activeKeyOverride)
      ? activeKeyOverride
      : defaultKey;

  if (sections.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[28px] border border-border/60 bg-card/88 p-7 shadow-[0_28px_72px_-58px_rgba(15,23,42,0.95)]">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Narrative Spine
          </div>
          <h3 className="mt-1 text-lg font-semibold">结论主轴</h3>
        </div>
        <Badge variant="outline">{sections.length} sections</Badge>
      </div>

      <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
        <div className="space-y-3">
          {sections.map((section, index) => {
            const active = activeKey === section.key;
            return (
              <button
                key={section.key}
                type="button"
                onClick={() => {
                  setActiveKeyOverride(section.key);
                  if (section.key === "evidence_chain" && report.cluster_view?.clusters[0]) {
                    onFocusCluster?.(report.cluster_view.clusters[0].cluster_id);
                  }
                }}
                className={cn(
                  "group flex w-full items-start gap-3 rounded-[22px] border border-border/60 bg-background/30 px-4 py-3.5 text-left transition-all",
                  active && "border-cyan-400/35 bg-cyan-500/[0.08] shadow-[0_18px_36px_-28px_rgba(14,165,233,0.8)]",
                )}
              >
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "size-3 rounded-full",
                      SECTION_COLORS[section.key] ?? "bg-slate-400",
                    )}
                  />
                  {index < sections.length - 1 && (
                    <div className="mt-2 h-12 w-px bg-border/70" />
                  )}
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    {section.key.replaceAll("_", " ")}
                  </div>
                  <div className="font-medium">{section.title}</div>
                  <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
                    {section.summary}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {sections
          .filter((section) => section.key === activeKey)
          .map((section) => (
            <NarrativeSectionPanel
              key={section.key}
              section={section}
              onFocusEvidence={onFocusEvidence}
            />
          ))}
      </div>
    </section>
  );
}

function NarrativeSectionPanel({
  section,
  onFocusEvidence,
}: {
  section: NarrativeSection;
  onFocusEvidence?: (evidenceId: string) => void;
}) {
  return (
    <div className="rounded-[26px] border border-border/60 bg-background/40 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            {section.key.replaceAll("_", " ")}
          </div>
          <h4 className="text-xl font-semibold">{section.title}</h4>
          <p className="text-base leading-8 text-foreground/90">{section.summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {section.evidence_ids.slice(0, 4).map((evidenceId) => (
            <button
              key={evidenceId}
              type="button"
              onClick={() => onFocusEvidence?.(evidenceId)}
            >
              <Badge variant="outline">{evidenceId}</Badge>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-5 rounded-[22px] border border-border/50 bg-card/70 p-5">
        <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
          {section.detail}
        </p>
      </div>
      {section.result_keys.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {section.result_keys.map((item) => (
            <Badge key={item} variant="secondary">
              {item}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
