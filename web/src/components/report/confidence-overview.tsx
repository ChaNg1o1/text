"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { NumberTween } from "@/components/motion/number-tween";
import { useI18n } from "@/components/providers/i18n-provider";

interface ConfidenceOverviewProps {
  scores: Record<string, number>;
}

function confidenceColor(value: number): string {
  if (value >= 0.75) return "text-green-600";
  if (value >= 0.45) return "text-yellow-600";
  return "text-red-600";
}

function confidenceBarColor(value: number): string {
  if (value >= 0.75) return "[&>div]:bg-green-500";
  if (value >= 0.45) return "[&>div]:bg-yellow-500";
  return "[&>div]:bg-red-500";
}

export function ConfidenceOverview({ scores }: ConfidenceOverviewProps) {
  const { t } = useI18n();
  const entries = Object.entries(scores).sort(([, a], [, b]) => b - a);
  if (entries.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("report.confidence")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {entries.map(([key, value]) => (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="capitalize">{key.replace(/_/g, " ")}</span>
              <span className={`font-mono font-medium ${confidenceColor(value)}`}>
                <NumberTween value={value * 100} suffix="%" />
              </span>
            </div>
            <Progress value={value * 100} className={`h-2 ${confidenceBarColor(value)}`} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
