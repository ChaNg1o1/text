"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MessageSquare, RefreshCcw, SendHorizonal } from "lucide-react";
import Markdown from "react-markdown";
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

interface SuggestionItem {
  prompt: string;
  label: string;
}

const SUGGESTION_PAGE_SIZE = 4;

function asText(data: unknown): string {
  if (typeof data === "string") return data;
  if (data && typeof data === "object" && "detail" in data) {
    const detail = (data as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
  }
  return "";
}

function compactText(raw: string, limit: number): string {
  const normalized = raw.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit).trim()}...`;
}

export function ReportQaPanel({ analysisId, report }: ReportQaPanelProps) {
  const { t } = useI18n();
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<QaMessage[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [thinkingTick, setThinkingTick] = useState(0);
  const [activeAssistantId, setActiveAssistantId] = useState<string | null>(null);

  const sourceRef = useRef<EventSource | null>(null);
  const assistantIdRef = useRef<string | null>(null);
  const streamDoneRef = useRef(false);
  const messagesRef = useRef<QaMessage[]>([]);

  const fallbackSuggestions = useMemo(() => {
    const list: string[] = [];
    if (report.conclusions.length > 0) {
      list.push("先用最简单的话告诉我，这次结论偏向什么？");
      list.push("这个结果更像是线索支持，还是已经比较稳？");
    }
    if (report.evidence_items.length > 0) {
      list.push("最关键的几条依据分别是什么？");
    }
    if (report.limitations.length > 0) {
      list.push("这份结果最需要小心的地方是什么？");
    }
    if (report.writing_profiles.length > 0) {
      list.push("从写作习惯看，这个人最明显的特征是什么？");
    }
    list.push(t("report.qaSuggestionCore"));
    return Array.from(new Set(list))
      .slice(0, SUGGESTION_PAGE_SIZE)
      .map((prompt) => ({ prompt, label: compactText(prompt, 38) }));
  }, [report.conclusions.length, report.evidence_items.length, report.limitations.length, report.writing_profiles.length, t]);

  const loadSuggestions = useCallback(
    async (exclude: string[] = []) => {
      setIsLoadingSuggestions(true);
      try {
        const response = await api.getQaSuggestions(analysisId, {
          count: SUGGESTION_PAGE_SIZE,
          exclude,
        });
        const next = response.suggestions
          .filter((item) => item.trim().length > 0)
          .slice(0, SUGGESTION_PAGE_SIZE)
          .map((prompt) => ({
            prompt,
            label: compactText(prompt, 38),
          }));
        setSuggestions(next.length > 0 ? next : fallbackSuggestions);
      } catch {
        setSuggestions(fallbackSuggestions);
      } finally {
        setIsLoadingSuggestions(false);
      }
    },
    [analysisId, fallbackSuggestions],
  );

  useEffect(() => {
    return () => {
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, []);

  useEffect(() => {
    void loadSuggestions();
  }, [loadSuggestions]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!isStreaming) return;
    const timer = setInterval(() => {
      setThinkingTick((prev) => (prev + 1) % 4);
    }, 420);
    return () => clearInterval(timer);
  }, [isStreaming]);

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
    setActiveAssistantId(null);
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
    setActiveAssistantId(assistantId);

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

      source.addEventListener("qa_heartbeat", () => {
        // keep-alive only
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

        // If we already have streamed answer content, treat abrupt close as end-of-stream.
        const assistantId = assistantIdRef.current;
        if (assistantId) {
          const currentAssistant = messagesRef.current.find((msg) => msg.id === assistantId);
          if (currentAssistant && currentAssistant.content.trim().length > 0) {
            closeStream();
            return;
          }
        }

        // Let browser reconnect attempts continue instead of failing immediately.
        if (source.readyState === EventSource.CONNECTING) {
          return;
        }

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

  const refreshSuggestions = () => loadSuggestions(suggestions.map((item) => item.prompt));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          {t("report.qaTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-1">
        <div className="flex items-start gap-3">
          <div className="flex flex-1 flex-wrap gap-2.5">
            {suggestions.map((item) => (
              <Button
                key={item.prompt}
                variant="outline"
                size="xs"
                className="h-auto max-w-full px-3 py-1.5 text-xs leading-relaxed"
                title={item.prompt}
                onClick={() => setQuestion(item.prompt)}
                disabled={isStreaming || isLoadingSuggestions}
              >
                {item.label}
              </Button>
            ))}
            {suggestions.length === 0 && isLoadingSuggestions && (
              <div className="inline-flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("report.qaGeneratingSuggestions")}
              </div>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-lg border border-border/60"
            title={t("report.qaRefreshSuggestions")}
            aria-label={t("report.qaRefreshSuggestions")}
            onClick={() => void refreshSuggestions()}
            disabled={isStreaming || isLoadingSuggestions}
          >
            {isLoadingSuggestions ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div className="rounded-xl border border-border/60 bg-background/35 p-4 md:p-5">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("report.qaEmpty")}</p>
          ) : (
            <div className="space-y-4 max-h-[32rem] overflow-y-auto pr-2">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={message.role === "user" ? "text-right" : "text-left"}
                >
                  {message.role === "user" ? (
                    <div className="inline-block max-w-[74%] rounded-2xl bg-primary px-4 py-2.5 text-sm leading-7 text-primary-foreground whitespace-pre-wrap">
                      {message.content}
                    </div>
                  ) : (
                    <div className="inline-block max-w-[86%] rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm leading-7">
                      {message.content ? (
                        <div className="prose prose-sm max-w-none break-words dark:prose-invert prose-headings:my-2 prose-p:my-2.5 prose-p:leading-7 prose-li:leading-7 prose-ul:my-2.5 prose-ol:my-2.5 prose-pre:my-2.5">
                          <Markdown>{message.content}</Markdown>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>{`${t("report.qaThinking")}${".".repeat(Math.max(1, thinkingTick))}`}</span>
                        </div>
                      )}
                      {isStreaming && message.id === activeAssistantId && message.content.trim().length > 0 && (
                        <div className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>{`${t("report.qaThinking")}${".".repeat(Math.max(1, thinkingTick))}`}</span>
                        </div>
                      )}
                    </div>
                  )}
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

        <div className="space-y-3">
          <Textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={t("report.qaPlaceholder")}
            rows={4}
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
