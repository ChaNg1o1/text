"use client";

import { useState } from "react";
import { Download, FileText, Braces, Check } from "lucide-react";
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
  lines.push("# Forensic Analysis Report\n");
  lines.push(`**Task:** ${report.request.task}`);
  lines.push(`**Created:** ${report.created_at}\n`);

  if (report.summary) {
    lines.push("## Summary\n");
    lines.push(report.summary + "\n");
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
        <Button variant="outline" size="icon" className="h-8 w-8">
          <Download className="h-4 w-4" />
          <span className="sr-only">{t("export.title")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuItem onClick={() => void doExport("md")}>
          {saved === "md" ? (
            <Check className="mr-2 h-4 w-4 text-emerald-500" />
          ) : (
            <FileText className="mr-2 h-4 w-4" />
          )}
          {t("export.markdown")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void doExport("json")}>
          {saved === "json" ? (
            <Check className="mr-2 h-4 w-4 text-emerald-500" />
          ) : (
            <Braces className="mr-2 h-4 w-4" />
          )}
          {t("export.json")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
