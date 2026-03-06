"use client";

import { useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Terminal } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";

interface LogEntry {
  level: string;
  message: string;
  source: string;
  timestamp: number;
}

interface LogStreamProps {
  logs: LogEntry[];
  isLiveConnected?: boolean;
}

const LEVEL_COLORS: Record<string, string> = {
  info: "text-blue-400",
  warning: "text-yellow-400",
  error: "text-red-400",
  debug: "text-gray-400",
};

export function LogStream({ logs, isLiveConnected = false }: LogStreamProps) {
  const { t } = useI18n();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm">{t("progress.logs")}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea
          className="h-48 rounded-md bg-black/95 p-3 font-mono text-xs"
          aria-label={t("progress.logs")}
        >
          {logs.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center text-xs text-gray-400">
              {isLiveConnected ? t("progress.logsEmpty") : t("progress.logsWaiting")}
            </div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="flex gap-2 leading-relaxed">
                <span className="text-gray-500 shrink-0">
                  {new Date(log.timestamp * 1000).toLocaleTimeString()}
                </span>
                <span className={`shrink-0 uppercase w-12 ${LEVEL_COLORS[log.level] ?? "text-gray-400"}`}>
                  {log.level}
                </span>
                {log.source && (
                  <span className="text-cyan-400 shrink-0">[{log.source}]</span>
                )}
                <span className="text-gray-200">{log.message}</span>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
