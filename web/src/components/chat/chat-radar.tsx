"use client";

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";

const SERIES_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export interface ChatRadarData {
  title: string;
  dimensions: string[];
  series: { name: string; values: number[] }[];
}

export function ChatRadar({ title, dimensions, series }: ChatRadarData) {
  const config: ChartConfig = {};
  for (let i = 0; i < series.length; i++) {
    config[series[i].name] = {
      label: series[i].name,
      color: SERIES_COLORS[i % SERIES_COLORS.length],
    };
  }

  const data = dimensions.map((dim, di) => {
    const point: Record<string, unknown> = { dimension: dim };
    for (const s of series) {
      point[s.name] = s.values[di] ?? 0;
    }
    return point;
  });

  return (
    <div className="w-full space-y-2" role="img" aria-label={title}>
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <ChartContainer config={config} className="mx-auto h-[250px] w-full max-w-[320px]">
        <RadarChart data={data}>
          <PolarGrid />
          <PolarAngleAxis dataKey="dimension" fontSize={10} />
          <PolarRadiusAxis angle={30} domain={[0, "auto"]} fontSize={9} />
          <ChartTooltip content={<ChartTooltipContent />} />
          {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
          {series.map((s, i) => (
            <Radar
              key={s.name}
              name={s.name}
              dataKey={s.name}
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              fill={SERIES_COLORS[i % SERIES_COLORS.length]}
              fillOpacity={0.15}
              strokeWidth={2}
            />
          ))}
        </RadarChart>
      </ChartContainer>
    </div>
  );
}
