"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
} from "recharts";
import type { TextAliasRecord, WritingProfile } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { ReportMetaLabel } from "@/components/report/report-primitives";
import { FadeIn } from "@/components/motion/fade-in";
import { useI18n } from "@/components/providers/i18n-provider";

interface WritingPortraitCardProps {
  profile: WritingProfile;
  aliases: TextAliasRecord[];
}

export function WritingPortraitCard({ profile, aliases }: WritingPortraitCardProps) {
  const { t } = useI18n();
  const radarData = profile.dimensions
    .filter((dim) => dim.dimension_type === "observable")
    .slice(0, 6)
    .map((dim) => ({
      label: dim.label,
      score: dim.score,
    }));
  const aliasMap = new Map(aliases.map((item) => [item.text_id, item.alias]));

  return (
    <FadeIn>
      <Card className="card-interactive overflow-hidden border-border/60 bg-card/90">
        <CardContent className="p-0">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.15fr)_380px]">
          <div className="space-y-5 p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{profile.subject}</Badge>
              {profile.headline && <Badge variant="secondary">{profile.headline}</Badge>}
            </div>
            <div>
              <h4 className="text-xl font-semibold">{profile.headline || profile.subject}</h4>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {profile.observable_summary || profile.summary}
              </p>
            </div>

            <PortraitList title={t("report.writingPortrait.stableHabits")} items={profile.stable_habits ?? []} tone="cyan" />
            <PortraitList title={t("report.writingPortrait.processClues")} items={profile.process_clues ?? []} tone="amber" />
            <PortraitList title={t("report.writingPortrait.anomalies")} items={profile.anomalies ?? []} tone="rose" />

            {profile.confidence_note && (
              <div className="rounded-2xl bg-background/35 p-5 text-sm leading-7 text-muted-foreground">
                {profile.confidence_note}
              </div>
            )}

            {profile.representative_text_ids && profile.representative_text_ids.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {profile.representative_text_ids.map((textId) => (
                  <Badge key={textId} variant="outline">
                    {aliasMap.get(textId) ?? textId}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-border/60 bg-card/50 p-6 lg:border-t-0 lg:border-l">
            <ReportMetaLabel>{t("report.writingPortrait.featureProfile")}</ReportMetaLabel>
            <ChartContainer
              className="mt-4 h-[320px] w-full"
              role="img"
              aria-label={t("report.chart.featurePortraitAria", { subject: profile.subject })}
              config={{
                score: {
                  label: t("report.chart.score"),
                  color: "hsl(192 91% 46%)",
                },
              }}
            >
              <RadarChart data={radarData}>
                <ChartTooltip content={<ChartTooltipContent />} />
                <PolarGrid />
                <PolarAngleAxis dataKey="label" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar
                  dataKey="score"
                  stroke="var(--color-score)"
                  fill="var(--color-score)"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </RadarChart>
            </ChartContainer>
          </div>
        </div>
      </CardContent>
    </Card>
    </FadeIn>
  );
}

function PortraitList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "cyan" | "amber" | "rose";
}) {
  if (items.length === 0) {
    return null;
  }

  const bulletTone = {
    cyan: "bg-cyan-400",
    amber: "bg-amber-400",
    rose: "bg-rose-400",
  }[tone];

  return (
    <section className="space-y-3">
      <ReportMetaLabel>{title}</ReportMetaLabel>
      <div className="grid gap-3">
        {items.map((item) => (
          <div
            key={`${title}-${item}`}
            className="flex gap-3 rounded-2xl bg-background/35 px-5 py-4"
          >
            <span className={`mt-2 size-2 shrink-0 rounded-full ${bulletTone}`} aria-hidden="true" />
            <p className="text-sm leading-7 text-foreground/88">{item}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
