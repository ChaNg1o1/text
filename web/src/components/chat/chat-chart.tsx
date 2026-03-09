"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
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
  "var(--chart-1)",
];

export interface ChatChartData {
  chartType: "line" | "bar";
  title: string;
  data: Record<string, unknown>[];
  xKey: string;
  yKeys: string[];
  yLabels?: Record<string, string>;
}

export function ChatChart({ chartType, title, data, xKey, yKeys, yLabels }: ChatChartData) {
  const config: ChartConfig = {};
  for (let i = 0; i < yKeys.length; i++) {
    const key = yKeys[i];
    config[key] = {
      label: yLabels?.[key] ?? key,
      color: SERIES_COLORS[i % SERIES_COLORS.length],
    };
  }

  const ChartComponent = chartType === "line" ? LineChart : BarChart;

  return (
    <div className="w-full space-y-2" role="img" aria-label={title}>
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <ChartContainer config={config} className="h-[220px] w-full">
        <ChartComponent data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey={xKey} tickLine={false} axisLine={false} fontSize={11} />
          <YAxis tickLine={false} axisLine={false} fontSize={11} width={40} />
          <ChartTooltip content={<ChartTooltipContent />} />
          {yKeys.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
          {yKeys.map((key) =>
            chartType === "line" ? (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={`var(--color-${key})`}
                strokeWidth={2}
                dot={false}
              />
            ) : (
              <Bar key={key} dataKey={key} fill={`var(--color-${key})`} radius={[4, 4, 0, 0]} />
            ),
          )}
        </ChartComponent>
      </ChartContainer>
    </div>
  );
}
