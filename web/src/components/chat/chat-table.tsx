"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface ChatTableData {
  title: string;
  headers: { key: string; label: string }[];
  rows: Record<string, unknown>[];
}

export function ChatTable({ title, headers, rows }: ChatTableData) {
  return (
    <div className="w-full space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              {headers.map((h) => (
                <TableHead key={h.key} className="text-xs">
                  {h.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, ri) => (
              <TableRow key={ri}>
                {headers.map((h) => (
                  <TableCell key={h.key} className="text-xs">
                    {String(row[h.key] ?? "")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
