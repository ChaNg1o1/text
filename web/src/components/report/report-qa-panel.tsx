"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  type DynamicToolUIPart,
  type ToolUIPart,
  type UIMessage,
} from "ai";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, RefreshCcw, SendHorizonal } from "lucide-react";
import Markdown from "react-markdown";
import type { ForensicReport } from "@/lib/types";
import { FADE_FAST_VARIANTS } from "@/lib/motion";
import { api as apiClient } from "@/lib/api-client";
import { normalizeUiMessageStreamResponse } from "@/lib/normalize-ui-message-stream";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/components/providers/i18n-provider";
import { ChatChart, type ChatChartData } from "@/components/chat/chat-chart";
import { ChatRadar, type ChatRadarData } from "@/components/chat/chat-radar";
import { ChatTable, type ChatTableData } from "@/components/chat/chat-table";
import { ChatHeatmap, type ChatHeatmapData } from "@/components/chat/chat-heatmap";
import { ToolSkeleton } from "@/components/chat/tool-skeleton";

interface ReportQaPanelProps {
  analysisId: string;
  report: ForensicReport;
}

interface SuggestionItem {
  prompt: string;
  label: string;
}

type ReportQaDataParts = {
  reportFocus: {
    mode: string;
    items: Array<{ label: string; detail: string; accent?: string }>;
  };
  reportSnapshot: {
    summary: string;
    topConclusion: string | null;
    backend: string;
    evidenceCount: number;
    limitationCount: number;
    agentCount: number;
  };
};

type ReportQaTools = {
  displayChart: { input: ChatChartData; output: ChatChartData };
  displayRadar: { input: ChatRadarData; output: ChatRadarData };
  displayTable: { input: ChatTableData; output: ChatTableData };
  displayHeatmap: { input: ChatHeatmapData; output: ChatHeatmapData };
};

type ReportQaMessage = UIMessage<unknown, ReportQaDataParts, ReportQaTools>;
type ReportQaToolPart = ToolUIPart<ReportQaTools> | DynamicToolUIPart;

const SUGGESTION_PAGE_SIZE = 4;

function compactText(raw: string, limit: number): string {
  const normalized = raw.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit).trim()}...`;
}

function readUserText(message: ReportQaMessage): string {
  return message.parts
    .filter((part): part is Extract<ReportQaMessage["parts"][number], { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function hasRenderableAssistantParts(message: ReportQaMessage): boolean {
  return message.parts.some((part) => {
    if (part.type === "text") return part.text.trim().length > 0;
    return isToolUIPart(part);
  });
}

function renderToolPart(part: ReportQaToolPart, key: string) {
  const toolName = getToolName(part);
  if (part.state === "output-available") {
    switch (toolName) {
      case "displayChart":
        return <ChatChart key={key} {...(part.output as ChatChartData)} />;
      case "displayRadar":
        return <ChatRadar key={key} {...(part.output as ChatRadarData)} />;
      case "displayTable":
        return <ChatTable key={key} {...(part.output as ChatTableData)} />;
      case "displayHeatmap":
        return <ChatHeatmap key={key} {...(part.output as ChatHeatmapData)} />;
      default:
        return null;
    }
  }

  if (part.state === "output-error") {
    return (
      <Badge key={key} variant="destructive" className="max-w-full whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-xs leading-6">
        {part.errorText}
      </Badge>
    );
  }

  return <ToolSkeleton key={key} toolName={toolName} />;
}

export function ReportQaPanel({ analysisId, report }: ReportQaPanelProps) {
  const { t, locale } = useI18n();
  const [question, setQuestion] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [thinkingTick, setThinkingTick] = useState(0);

  const fallbackSuggestions = useMemo(() => {
    const list: string[] = [];
    if (report.conclusions.length > 0) {
      list.push(t("report.qa.suggestion.topClue"));
      list.push(t("report.qa.suggestion.clueStability"));
    }
    if (report.evidence_items.length > 0) {
      list.push(t("report.qa.suggestion.keyEvidence"));
    }
    if (report.limitations.length > 0) {
      list.push(t("report.qa.suggestion.caution"));
    }
    if (report.writing_profiles.length > 0) {
      list.push(t("report.qa.suggestion.writingHabit"));
    }
    list.push(t("report.qaSuggestionCore"));
    return Array.from(new Set(list))
      .slice(0, SUGGESTION_PAGE_SIZE)
      .map((prompt) => ({ prompt, label: compactText(prompt, 38) }));
  }, [
    report.conclusions.length,
    report.evidence_items.length,
    report.limitations.length,
    report.writing_profiles.length,
    t,
  ]);

  const loadSuggestions = useCallback(
    async (exclude: string[] = []) => {
      setIsLoadingSuggestions(true);
      try {
        const response = await apiClient.getQaSuggestions(analysisId, {
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
    void loadSuggestions();
  }, [loadSuggestions]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<ReportQaMessage>({
        body: { locale },
        fetch: async (input, init) => {
          const response = await fetch(input, init);
          if (response.ok) {
            return normalizeUiMessageStreamResponse(response);
          }

          let detail = response.statusText || t("report.qaStreamFailed");
          try {
            const payload = await response.clone().json();
            if (
              payload
              && typeof payload === "object"
              && "detail" in payload
              && typeof (payload as { detail?: unknown }).detail === "string"
            ) {
              detail = (payload as { detail: string }).detail;
            }
          } catch {
            const text = await response.text().catch(() => "");
            if (text.trim().length > 0) {
              detail = text;
            }
          }

          throw new Error(detail);
        },
        prepareSendMessagesRequest: async ({ id, messages, body, trigger, messageId }) => ({
          api: await apiClient.qaChatUrl(analysisId),
          body: {
            ...(body ?? {}),
            id,
            messages,
            trigger,
            messageId,
          },
        }),
      }),
    [analysisId, locale, t],
  );

  const { messages, sendMessage, status, error, clearError } = useChat<ReportQaMessage>({
    transport,
  });

  const isBusy = status === "submitted" || status === "streaming";
  const streamError = error?.message ?? null;
  const lastMessage = messages.at(-1);
  const showPendingBubble = isBusy && lastMessage?.role !== "assistant";

  useEffect(() => {
    if (!isBusy) {
      setThinkingTick(0);
      return;
    }
    const timer = setInterval(() => {
      setThinkingTick((prev) => (prev + 1) % 4);
    }, 420);
    return () => clearInterval(timer);
  }, [isBusy]);

  const askQuestion = async (rawQuestion: string) => {
    const trimmed = rawQuestion.trim();
    if (!trimmed || isBusy) return;

    clearError();
    setQuestion("");
    try {
      await sendMessage({ text: trimmed });
    } catch {
      setQuestion(trimmed);
    }
  };

  const refreshSuggestions = () => loadSuggestions(suggestions.map((item) => item.prompt));

  return (
    <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex flex-1 flex-wrap gap-2.5">
            {suggestions.map((item) => (
              <Button
                key={item.prompt}
                variant="outline"
                size="xs"
                className="h-auto max-w-full px-3 py-1.5 text-xs leading-relaxed"
                title={item.prompt}
                onClick={() => void askQuestion(item.prompt)}
                disabled={isBusy || isLoadingSuggestions}
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
            disabled={isBusy || isLoadingSuggestions}
          >
            {isLoadingSuggestions ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div className="rounded-xl bg-background/35 p-4 md:p-5">
          {messages.length === 0 && !showPendingBubble ? (
            <p className="text-sm text-muted-foreground">{t("report.qaEmpty")}</p>
          ) : (
            <div className="max-h-[32rem] space-y-4 overflow-y-auto overscroll-y-contain pr-2" aria-live="polite" role="log">
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  variants={FADE_FAST_VARIANTS}
                  initial="initial"
                  animate="animate"
                  className={message.role === "user" ? "text-right" : "text-left"}
                >
                  {message.role === "user" ? (
                    <div className="inline-block max-w-[74%] rounded-2xl bg-primary px-4 py-2.5 text-sm leading-7 text-primary-foreground whitespace-pre-wrap">
                      {readUserText(message)}
                    </div>
                  ) : (
                    <div className="inline-block max-w-[86%] rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm leading-7">
                      <div className="space-y-3">
                        {message.parts.map((part, index) => {
                          if (part.type === "text" && part.text.trim().length > 0) {
                            return (
                              <div
                                key={`${message.id}-${index}`}
                                className="prose prose-sm max-w-none break-words dark:prose-invert prose-headings:my-2 prose-p:my-2.5 prose-p:leading-7 prose-li:leading-7 prose-ul:my-2.5 prose-ol:my-2.5 prose-pre:my-2.5"
                              >
                                <Markdown>{part.text}</Markdown>
                              </div>
                            );
                          }

                          if (isToolUIPart(part)) {
                            return renderToolPart(part, `${message.id}-${index}`);
                          }

                          return null;
                        })}

                        {isBusy && lastMessage?.id === message.id && hasRenderableAssistantParts(message) && (
                          <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            <span>{`${t("report.qaThinking")}${".".repeat(Math.max(1, thinkingTick))}`}</span>
                          </div>
                        )}

                        {!hasRenderableAssistantParts(message) && isBusy && lastMessage?.id === message.id && (
                          <div className="inline-flex items-center gap-2 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>{`${t("report.qaThinking")}${".".repeat(Math.max(1, thinkingTick))}`}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}

              {showPendingBubble && (
                <motion.div variants={FADE_FAST_VARIANTS} initial="initial" animate="animate">
                  <div className="inline-block max-w-[86%] rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm leading-7">
                    <div className="inline-flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{`${t("report.qaThinking")}${".".repeat(Math.max(1, thinkingTick))}`}</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </div>

        <AnimatePresence>
          {streamError && (
            <motion.div variants={FADE_FAST_VARIANTS} initial="initial" animate="animate" exit="exit">
              <Badge
                variant="destructive"
                className="max-w-full whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-xs leading-6"
              >
                {streamError}
              </Badge>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-3">
          <Textarea
            value={question}
            onChange={(event) => {
              if (streamError) {
                clearError();
              }
              setQuestion(event.target.value);
            }}
            placeholder={t("report.qaPlaceholder")}
            aria-label={t("report.qaPlaceholder")}
            rows={4}
            disabled={isBusy}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void askQuestion(question);
              }
            }}
          />
          <div className="flex justify-end">
            <Button onClick={() => void askQuestion(question)} disabled={isBusy || question.trim().length === 0}>
              {isBusy ? (
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
    </div>
  );
}
