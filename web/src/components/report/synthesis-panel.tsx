"use client";

import type { ForensicReport } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, Lightbulb } from "lucide-react";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { useI18n } from "@/components/providers/i18n-provider";

interface SynthesisPanelProps {
  report: ForensicReport;
}

export function SynthesisPanel({ report }: SynthesisPanelProps) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("report.synthesis")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {report.synthesis && (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <Markdown rehypePlugins={[rehypeRaw]}>{report.synthesis}</Markdown>
          </div>
        )}

        {report.contradictions.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                {t("report.contradictions")}
              </h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {report.contradictions.map((c, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-yellow-500 shrink-0">-</span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {report.recommendations.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Lightbulb className="h-4 w-4 text-blue-500" />
                {t("report.recommendations")}
              </h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {report.recommendations.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-blue-500 shrink-0">-</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
