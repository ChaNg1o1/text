"use client";

import type { AnomalySample } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";

interface AnomalyTableProps {
  samples: AnomalySample[];
}

export function AnomalyTable({ samples }: AnomalyTableProps) {
  const { t } = useI18n();
  if (samples.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
          <CardTitle className="text-lg">{t("report.anomalySamples")}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">{t("report.textId")}</TableHead>
              <TableHead>{t("report.contentPreview")}</TableHead>
              <TableHead className="w-48">{t("report.outlierDimensions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {samples.map((s) => (
              <TableRow key={s.text_id}>
                <TableCell className="font-mono text-xs">{s.text_id}</TableCell>
                <TableCell className="text-sm max-w-md truncate">
                  {s.content.slice(0, 120)}
                  {s.content.length > 120 && "..."}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(s.outlier_dimensions).map(([dim, val]) => (
                      <Badge key={dim} variant="destructive" className="text-xs">
                        {dim}: {typeof val === "number" ? val.toFixed(2) : val}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
