"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ForensicReport } from "@/lib/types";
import { useI18n } from "@/components/providers/i18n-provider";

interface ExportButtonsProps {
  report: ForensicReport;
  analysisId: string;
}

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function reportToMarkdown(report: ForensicReport): string {
  const lines: string[] = [];
  lines.push("# Forensic Analysis Report\n");
  lines.push(`**Task:** ${report.request.task}`);
  lines.push(`**Created:** ${report.created_at}\n`);

  if (report.synthesis) {
    lines.push("## Synthesis\n");
    lines.push(report.synthesis + "\n");
  }

  if (Object.keys(report.confidence_scores).length > 0) {
    lines.push("## Confidence Scores\n");
    for (const [key, val] of Object.entries(report.confidence_scores)) {
      lines.push(`- **${key}**: ${(val * 100).toFixed(0)}%`);
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

  if (report.contradictions.length > 0) {
    lines.push("## Contradictions\n");
    for (const c of report.contradictions) lines.push(`- ${c}`);
    lines.push("");
  }

  if (report.recommendations.length > 0) {
    lines.push("## Recommendations\n");
    for (const r of report.recommendations) lines.push(`- ${r}`);
    lines.push("");
  }

  return lines.join("\n");
}

export function ExportButtons({ report, analysisId }: ExportButtonsProps) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => downloadBlob(reportToMarkdown(report), `report_${analysisId}.md`, "text/markdown")}
      >
        <Download className="mr-1.5 h-3.5 w-3.5" />
        {t("export.markdown")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => downloadBlob(JSON.stringify(report, null, 2), `report_${analysisId}.json`, "application/json")}
      >
        <Download className="mr-1.5 h-3.5 w-3.5" />
        {t("export.json")}
      </Button>
    </div>
  );
}
