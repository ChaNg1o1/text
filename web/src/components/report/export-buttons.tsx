"use client";

import { useState } from "react";
import { Download, FileText, Braces, Check } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ForensicReport } from "@/lib/types";
import { useI18n } from "@/components/providers/i18n-provider";
import { useReducedMotionPreference } from "@/hooks/use-reduced-motion";

interface ExportButtonsProps {
  report: ForensicReport;
  analysisId: string;
}

function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "__TAURI_INTERNALS__" in window ||
    window.location.protocol === "tauri:" ||
    window.location.hostname === "tauri.localhost"
  );
}

async function saveTauri(content: string, filename: string): Promise<string> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("save_file", { content, filename });
}

function saveBrowser(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function reportToMarkdown(report: ForensicReport): string {
  const lines: string[] = [];
  lines.push("# Forensic Insight Report\n");
  lines.push(`**Task:** ${report.request.task}`);
  lines.push(`**Created:** ${report.created_at}\n`);

  if (report.summary) {
    lines.push("## Summary\n");
    lines.push(report.summary + "\n");
  }

  if (report.narrative) {
    lines.push("## Narrative\n");
    if (report.narrative.lead) {
      lines.push(`- Lead: ${report.narrative.lead}`);
    }
    for (const section of report.narrative.sections) {
      lines.push(`### ${section.title || section.key}\n`);
      if (section.summary) lines.push(section.summary);
      if (section.detail) lines.push(section.detail);
      if (section.evidence_ids.length > 0) {
        lines.push(`- Evidence: ${section.evidence_ids.join(", ")}`);
      }
      if (section.result_keys.length > 0) {
        lines.push(`- Results: ${section.result_keys.join(", ")}`);
      }
      lines.push("");
    }
    if (report.narrative.action_items.length > 0) {
      lines.push("### Action Items\n");
      for (const item of report.narrative.action_items) lines.push(`- ${item}`);
      lines.push("");
    }
    if (report.narrative.contradictions.length > 0) {
      lines.push("### Contradictions\n");
      for (const item of report.narrative.contradictions) lines.push(`- ${item}`);
      lines.push("");
    }
  }

  if (report.entity_aliases) {
    lines.push("## Alias Legend\n");
    if (report.entity_aliases.author_aliases.length > 0) {
      lines.push("### Source Groups\n");
      for (const item of report.entity_aliases.author_aliases) {
        lines.push(`- ${item.alias}: ${item.author_id}`);
      }
      lines.push("");
    }
    if (report.entity_aliases.text_aliases.length > 0) {
      lines.push("### Texts\n");
      for (const item of report.entity_aliases.text_aliases) {
        lines.push(`- ${item.alias}: ${item.text_id} (${item.author})`);
      }
      lines.push("");
    }
  }

  if (report.cluster_view && report.cluster_view.clusters.length > 0) {
    lines.push("## Cluster View\n");
    for (const cluster of report.cluster_view.clusters) {
      lines.push(
        `- ${cluster.label}: ${cluster.member_aliases.join(", ") || cluster.member_text_ids.join(", ")}`,
      );
      if (cluster.theme_summary) {
        lines.push(`  - Theme: ${cluster.theme_summary}`);
      }
      if (cluster.separation_summary) {
        lines.push(`  - Distinction: ${cluster.separation_summary}`);
      }
      if (cluster.top_markers && cluster.top_markers.length > 0) {
        lines.push(`  - Markers: ${cluster.top_markers.join(", ")}`);
      }
      if (cluster.representative_excerpt) {
        lines.push(`  - Representative: ${cluster.representative_excerpt}`);
      }
    }
    if (report.cluster_view.excluded_text_ids.length > 0) {
      lines.push(`- Excluded: ${report.cluster_view.excluded_text_ids.join(", ")}`);
    }
    lines.push("");
  }

  if (report.conclusions.length > 0) {
    lines.push("## Conclusions\n");
    for (const item of report.conclusions) {
      lines.push(
        `- **${item.task}** [${item.grade}] ${item.statement}${typeof item.score === "number" ? ` (score=${item.score.toFixed(2)})` : ""}`,
      );
    }
    lines.push("");
  }

  for (const ar of report.agent_reports) {
    lines.push(`## ${ar.agent_name}\n`);
    if (ar.summary) lines.push(ar.summary + "\n");
    for (const f of ar.findings) {
      lines.push(`### ${f.category} (${(f.confidence * 100).toFixed(0)}%)\n`);
      lines.push(f.description + "\n");
      if (f.evidence.length > 0) {
        for (const e of f.evidence) {
          lines.push(`- ${e}`);
        }
        lines.push("");
      }
    }
  }

  if (report.limitations.length > 0) {
    lines.push("## Limitations\n");
    for (const c of report.limitations) lines.push(`- ${c}`);
    lines.push("");
  }

  if (report.writing_profiles.length > 0) {
    lines.push("## Writing Portraits\n");
    for (const profile of report.writing_profiles) {
      lines.push(`### ${profile.headline || profile.subject}\n`);
      if (profile.observable_summary || profile.summary) {
        lines.push((profile.observable_summary || profile.summary) + "\n");
      }
      if (profile.stable_habits && profile.stable_habits.length > 0) {
        lines.push("- Stable habits:");
        for (const item of profile.stable_habits) lines.push(`  - ${item}`);
      }
      if (profile.process_clues && profile.process_clues.length > 0) {
        lines.push("- Process clues:");
        for (const item of profile.process_clues) lines.push(`  - ${item}`);
      }
      if (profile.anomalies && profile.anomalies.length > 0) {
        lines.push("- Anomalies:");
        for (const item of profile.anomalies) lines.push(`  - ${item}`);
      }
      lines.push("");
    }
  }

  if (report.evidence_items.length > 0) {
    lines.push("## Evidence Explanations\n");
    for (const item of report.evidence_items) {
      lines.push(`### ${item.evidence_id} ${item.label}\n`);
      lines.push((item.finding || item.summary) + "\n");
      if (item.why_it_matters) {
        lines.push(`- Why it matters: ${item.why_it_matters}`);
      }
      if (item.counter_readings && item.counter_readings.length > 0) {
        lines.push("- Counter readings:");
        for (const entry of item.counter_readings) lines.push(`  - ${entry}`);
      }
      lines.push("");
    }
  }

  if (report.results.length > 0) {
    lines.push("## Results\n");
    for (const r of report.results) lines.push(`- **${r.title}**: ${r.body}`);
    lines.push("");
  }

  return lines.join("\n");
}

export function ExportButtons({ report, analysisId }: ExportButtonsProps) {
  const { t } = useI18n();
  const [saved, setSaved] = useState<"md" | "json" | null>(null);
  const reducedMotion = useReducedMotionPreference();

  const doExport = async (format: "md" | "json") => {
    const content =
      format === "md"
        ? reportToMarkdown(report)
        : JSON.stringify(report, null, 2);
    const filename =
      format === "md"
        ? `report_${analysisId}.md`
        : `report_${analysisId}.json`;
    const mime =
      format === "md" ? "text/markdown" : "application/json";

    try {
      if (isTauri()) {
        const savedPath = await saveTauri(content, filename);
        toast.success(t("export.saved"), { description: savedPath });
      } else {
        saveBrowser(content, filename, mime);
      }
      setSaved(format);
      setTimeout(() => setSaved(null), 1500);
    } catch {
      toast.error(t("export.failed"));
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon-lg" className="h-10 w-10 rounded-xl">
          <Download className="h-4.5 w-4.5" />
          <span className="sr-only">{t("export.title")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuItem onClick={() => void doExport("md")}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={saved === "md" ? "check-md" : "icon-md"}
              initial={reducedMotion ? false : { opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reducedMotion ? undefined : { opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              className="mr-2 inline-flex"
            >
              {saved === "md" ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
            </motion.span>
          </AnimatePresence>
          {t("export.markdown")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void doExport("json")}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={saved === "json" ? "check-json" : "icon-json"}
              initial={reducedMotion ? false : { opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reducedMotion ? undefined : { opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              className="mr-2 inline-flex"
            >
              {saved === "json" ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <Braces className="h-4 w-4" />
              )}
            </motion.span>
          </AnimatePresence>
          {t("export.json")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
