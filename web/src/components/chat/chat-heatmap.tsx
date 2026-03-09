"use client";

import { useMemo } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface ChatHeatmapData {
  title: string;
  rowLabels: string[];
  colLabels: string[];
  matrix: number[][];
  minValue?: number;
  maxValue?: number;
}

const HEAT_LEVELS = [
  "var(--heat-0)", "var(--heat-1)", "var(--heat-2)",
  "var(--heat-3)", "var(--heat-4)",
];

function heatColor(value: number, min: number, max: number): string {
  const t = max === min ? 0.5 : (value - min) / (max - min);
  const idx = Math.min(4, Math.floor(Math.max(0, t) * 5));
  return HEAT_LEVELS[idx];
}

export function ChatHeatmap({ title, rowLabels, colLabels, matrix, minValue, maxValue }: ChatHeatmapData) {
  const { min, max } = useMemo(() => {
    if (minValue !== undefined && maxValue !== undefined) {
      return { min: minValue, max: maxValue };
    }
    let lo = Infinity;
    let hi = -Infinity;
    for (const row of matrix) {
      for (const v of row) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    return { min: minValue ?? lo, max: maxValue ?? hi };
  }, [matrix, minValue, maxValue]);

  const cols = colLabels.length;
  const cellSize = Math.max(10, Math.min(24, 280 / Math.max(cols, 1)));

  return (
    <div className="w-full space-y-2" role="grid" aria-label={title}>
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <div className="overflow-x-auto">
        {/* Column headers */}
        <div className="flex" style={{ paddingLeft: 56 }}>
          {colLabels.map((label) => (
            <div
              key={label}
              className="truncate text-center text-[9px] text-muted-foreground"
              style={{ width: cellSize, minWidth: cellSize }}
              title={label}
            >
              {label.length > 3 ? `${label.slice(0, 3)}` : label}
            </div>
          ))}
        </div>
        {/* Rows */}
        <TooltipProvider delayDuration={100}>
          {rowLabels.map((rowLabel, ri) => (
            <div key={rowLabel} className="flex items-center">
              <div
                className="shrink-0 truncate text-right text-[9px] text-muted-foreground pr-1"
                style={{ width: 52 }}
                title={rowLabel}
              >
                {rowLabel.length > 6 ? `${rowLabel.slice(0, 6)}…` : rowLabel}
              </div>
              <div className="flex">
                {(matrix[ri] ?? []).map((value, ci) => (
                  <Tooltip key={ci}>
                    <TooltipTrigger asChild>
                      <div
                        className="border border-background/40"
                        style={{
                          width: cellSize,
                          height: cellSize,
                          minWidth: cellSize,
                          backgroundColor: heatColor(value, min, max),
                        }}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {rowLabel} × {colLabels[ci]}: {value.toFixed(3)}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>
          ))}
        </TooltipProvider>
      </div>
    </div>
  );
}
