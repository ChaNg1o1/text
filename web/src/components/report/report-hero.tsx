"use client";

import { Badge } from "@/components/ui/badge";
import type { ForensicReport } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  BadgeCheck,
  Binary,
  BookText,
  FileSearch,
} from "lucide-react";

interface ReportHeroProps {
  report: ForensicReport;
  onFocusEvidence?: (evidenceId: string) => void;
}

function toneForGrade(grade?: string) {
  if (grade === "strong_support" || grade === "moderate_support") {
    return {
      shell: "border-cyan-400/30 bg-[rgba(4,15,29,0.96)]",
      bar: "bg-cyan-400",
      icon: BadgeCheck,
    };
  }
  if (grade === "moderate_against" || grade === "strong_against") {
    return {
      shell: "border-rose-500/30 bg-[rgba(31,8,15,0.96)]",
      bar: "bg-rose-400",
      icon: AlertTriangle,
    };
  }
  return {
    shell: "border-amber-400/30 bg-[rgba(29,18,4,0.96)]",
    bar: "bg-amber-400",
    icon: FileSearch,
  };
}

export function ReportHero({ report, onFocusEvidence }: ReportHeroProps) {
  const lead = report.narrative?.lead || report.summary || "当前没有可展示的主结论。";
  const leadConclusion = report.conclusions[0];
  const tone = toneForGrade(leadConclusion?.grade);
  const LeadIcon = tone.icon;
  const primaryEvidence = report.evidence_items.slice(0, 3);
  const clusterCount = report.cluster_view?.clusters.length ?? 0;

  return (
    <section
      className={cn(
        "overflow-hidden rounded-[28px] border p-8 text-slate-50 shadow-[0_32px_90px_-54px_rgba(8,15,28,0.95)]",
        tone.shell,
      )}
    >
      <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-4xl space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="border-white/15 bg-white/5 text-[11px] uppercase tracking-[0.24em] text-slate-200"
            >
              Decision Hero
            </Badge>
            {leadConclusion && (
              <Badge variant="secondary" className="bg-white/8 text-slate-100">
                {leadConclusion.task}
              </Badge>
            )}
            <Badge variant="secondary" className="bg-white/8 text-slate-100">
              {report.request.texts.length} texts
            </Badge>
          </div>

          <div className="flex items-start gap-5">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <LeadIcon className="h-5 w-5 text-sky-100" />
            </div>
            <div className="space-y-4">
              <p className="max-w-4xl text-xl font-semibold leading-9 text-white xl:text-[1.75rem]">
                {lead}
              </p>
              <div className="grid gap-4 text-sm text-slate-200/88 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-300">
                    支持方向
                  </div>
                  <div className="mt-2 font-medium">
                    {leadConclusion?.statement || "等待结构化结论"}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-300">
                    冲突提示
                  </div>
                  <div className="mt-2 font-medium">
                    {report.narrative?.contradictions[0] || "当前未发现主冲突项"}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-300">
                    样本充分性
                  </div>
                  <div className="mt-2 font-medium">
                    {report.limitations[0] || "当前首要问题不在样本门槛"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-[280px] max-w-[380px] space-y-5">
          <div className="rounded-3xl border border-white/10 bg-black/15 p-5">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.22em] text-slate-300">
              <span>Signal Density</span>
              <span>{report.evidence_items.length} evidence</span>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10">
              <div
                className={cn("h-full rounded-full", tone.bar)}
                style={{
                  width: `${Math.min(100, 36 + report.evidence_items.length * 7)}%`,
                }}
              />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-sm text-slate-100">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <BookText className="mb-2 h-4 w-4 text-cyan-200" />
                <div className="text-xl font-semibold">{report.writing_profiles.length}</div>
                <div className="text-xs text-slate-300">画像</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <Binary className="mb-2 h-4 w-4 text-emerald-200" />
                <div className="text-xl font-semibold">{clusterCount}</div>
                <div className="text-xs text-slate-300">分组</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <FileSearch className="mb-2 h-4 w-4 text-amber-200" />
                <div className="text-xl font-semibold">{report.limitations.length}</div>
                <div className="text-xs text-slate-300">限制</div>
              </div>
            </div>
          </div>

          {primaryEvidence.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-300">
                Key Evidence
              </div>
              <div className="flex flex-wrap gap-2">
                {primaryEvidence.map((item) => (
                  <button
                    key={item.evidence_id}
                    type="button"
                    onClick={() => onFocusEvidence?.(item.evidence_id)}
                    className="inline-flex items-center rounded-full border border-white/12 bg-white/6 px-3 py-1.5 text-sm text-slate-100 transition hover:border-cyan-300/35 hover:bg-white/10"
                  >
                    {item.evidence_id}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
