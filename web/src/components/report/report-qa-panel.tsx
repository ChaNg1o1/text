"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MessageSquare, SendHorizonal } from "lucide-react";
import type { ForensicReport } from "@/lib/types";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/components/providers/i18n-provider";

interface ReportQaPanelProps {
  analysisId: string;
  report: ForensicReport;
}

type Role = "user" | "assistant";

interface QaMessage {
  id: string;
  role: Role;
  content: string;
}

function asText(data: unknown): string {
  if (typeof data === "string") return data;
  if (data && typeof data === "object" && "detail" in data) {
    const detail = (data as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
  }
  return "";
}

export function ReportQaPanel({ analysisId, report }: ReportQaPanelProps) {
  const { t } = useI18n();
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<QaMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  const sourceRef = useRef<EventSource | null>(null);
  const assistantIdRef = useRef<string | null>(null);
  const streamDoneRef = useRef(false);

  const suggestions = useMemo(() => {
    const list = [
      t("report.qaSuggestionSummary"),
      t("report.qaSuggestionStrongestAgent"),
      t("report.qaSuggestionEvidence"),
    ];

    if (report.contradictions.length > 0) {
      list.push(t("report.qaSuggestionContradictions"));
    }
    if (report.anomaly_samples.length > 0) {
      list.push(t("report.qaSuggestionAnomalies"));
    }
    if (report.recommendations.length > 0) {
      list.push(t("report.qaSuggestionRecommendations"));
    }

    return list.slice(0, 5);
  }, [
    report.contradictions.length,
    report.anomaly_samples.length,
    report.recommendations.length,
    t,
  ]);

  useEffect(() => {
    return () => {
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, []);

  const appendAssistantDelta = (delta: string) => {
    const assistantId = assistantIdRef.current;
    if (!assistantId) return;

    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== assistantId) return msg;
        return { ...msg, content: `${msg.content}${delta}` };
      }),
    );
  };

  const finalizeAssistant = (fallback?: string) => {
    const assistantId = assistantIdRef.current;
    if (!assistantId) return;

    if (fallback) {
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== assistantId) return msg;
          if (msg.content.trim().length > 0) return msg;
          return { ...msg, content: fallback };
        }),
      );
    }
  };

  const closeStream = () => {
    sourceRef.current?.close();
    sourceRef.current = null;
    setIsStreaming(false);
    assistantIdRef.current = null;
    streamDoneRef.current = false;
  };

  const askQuestion = async (rawQuestion: string) => {
    const trimmed = rawQuestion.trim();
    if (!trimmed || isStreaming) return;

    setStreamError(null);
    setQuestion("");
    streamDoneRef.current = false;

    const now = Date.now();
    const userId = `user-${now}`;
    const assistantId = `assistant-${now}`;
    assistantIdRef.current = assistantId;

    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", content: trimmed },
      { id: assistantId, role: "assistant", content: "" },
    ]);

    setIsStreaming(true);

    try {
      const url = await api.qaStreamUrl(analysisId, trimmed);
      const source = new EventSource(url);
      sourceRef.current = source;

      source.addEventListener("qa_chunk", (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as { delta?: string };
          if (payload.delta) appendAssistantDelta(payload.delta);
        } catch {
          // ignore malformed chunks
        }
      });

      source.addEventListener("qa_completed", (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as { answer?: string };
          finalizeAssistant(payload.answer || t("report.qaEmptyAnswer"));
        } catch {
          finalizeAssistant(t("report.qaEmptyAnswer"));
        }
        streamDoneRef.current = true;
        closeStream();
      });

      source.addEventListener("qa_error", (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as Record<string, unknown>;
          const detail = asText(payload) || t("report.qaStreamFailed");
          setStreamError(detail);
          finalizeAssistant(detail);
        } catch {
          const fallback = t("report.qaStreamFailed");
          setStreamError(fallback);
          finalizeAssistant(fallback);
        }
        streamDoneRef.current = true;
        closeStream();
      });

      source.onerror = () => {
        // Ignore onerror fired after normal stream completion (server closes connection).
        if (!sourceRef.current || streamDoneRef.current) return;
        const fallback = t("report.qaStreamDisconnected");
        setStreamError(fallback);
        finalizeAssistant(fallback);
        closeStream();
      };
    } catch {
      const fallback = t("report.qaRequestFailed");
      setStreamError(fallback);
      finalizeAssistant(fallback);
      closeStream();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          {t("report.qaTitle")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t("report.qaSubtitle")}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {suggestions.map((item) => (
            <Button
              key={item}
              variant="outline"
              size="xs"
              onClick={() => setQuestion(item)}
              disabled={isStreaming}
            >
              {item}
            </Button>
          ))}
        </div>

        <div className="rounded-lg border border-border/70 bg-background/40 p-3">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("report.qaEmpty")}</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={message.role === "user" ? "text-right" : "text-left"}
                >
                  <div
                    className={
                      message.role === "user"
                        ? "inline-block max-w-[92%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                        : "inline-block max-w-[92%] rounded-lg border border-border/70 bg-card px-3 py-2 text-sm"
                    }
                  >
                    {message.content || (isStreaming && message.role === "assistant" ? t("report.qaThinking") : "")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {streamError && (
          <Badge variant="destructive" className="whitespace-normal">
            {streamError}
          </Badge>
        )}

        <div className="space-y-2">
          <Textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={t("report.qaPlaceholder")}
            rows={3}
            disabled={isStreaming}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void askQuestion(question);
              }
            }}
          />
          <div className="flex justify-end">
            <Button
              onClick={() => void askQuestion(question)}
              disabled={isStreaming || question.trim().length === 0}
            >
              {isStreaming ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("report.qaStreaming")}
                </>
              ) : (
                <>
                  <SendHorizonal className="h-4 w-4" />
                  {t("report.qaSend")}
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
