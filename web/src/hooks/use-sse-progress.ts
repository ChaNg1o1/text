import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { createSSEClient } from "@/lib/sse-client";
import { useAnalysisStore } from "@/stores/analysis-store";
import type { AnalysisStatus } from "@/lib/types";

const RETRY_DELAYS_MS = [3000, 5000, 8000, 15000] as const;

export function useSSEProgress(
  analysisId: string | undefined,
  status?: AnalysisStatus,
  options?: { replayHistory?: boolean },
) {
  const handleSSEEvent = useAnalysisStore((s) => s.handleSSEEvent);
  const clientRef = useRef<ReturnType<typeof createSSEClient> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttemptRef = useRef(0);
  const [retryTick, setRetryTick] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [connectedAnalysisId, setConnectedAnalysisId] = useState<string | null>(null);
  const [retryDelayMs, setRetryDelayMs] = useState<number>(RETRY_DELAYS_MS[0]);

  useEffect(() => {
    if (!analysisId || status === "completed" || status === "failed" || status === "canceled") {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      clientRef.current?.close();
      clientRef.current = null;
      retryAttemptRef.current = 0;
      return;
    }

    let active = true;
    let client: ReturnType<typeof createSSEClient> | null = null;

    const bootstrapSSE = async () => {
      try {
        const replayHistory = options?.replayHistory ?? true;
        const url = await api.progressUrl(analysisId, { replay: replayHistory });
        if (!active) return;

        client = createSSEClient(
          url,
          (event, data) => handleSSEEvent(analysisId, event, data),
          () => {
            if (!active) return;
            retryAttemptRef.current = 0;
            setIsConnected(true);
            setConnectedAnalysisId(analysisId);
            setRetryDelayMs(RETRY_DELAYS_MS[0]);
          },
          () => {
            if (!active) return;
            setIsConnected(false);
            clientRef.current?.close();
            clientRef.current = null;

            const attempt = retryAttemptRef.current;
            const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
            retryAttemptRef.current = attempt + 1;
            setRetryDelayMs(delay);

            if (retryTimerRef.current) {
              clearTimeout(retryTimerRef.current);
            }
            retryTimerRef.current = setTimeout(() => {
              setRetryTick((v) => v + 1);
            }, delay);
          },
        );
        clientRef.current = client;
      } catch {
        const delay = RETRY_DELAYS_MS[Math.min(retryAttemptRef.current, RETRY_DELAYS_MS.length - 1)];
        retryAttemptRef.current += 1;
        setRetryDelayMs(delay);
        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
        }
        retryTimerRef.current = setTimeout(() => {
          setRetryTick((v) => v + 1);
        }, delay);
      }
    };

    void bootstrapSSE();

    return () => {
      active = false;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      client?.close();
      clientRef.current = null;
    };
  }, [analysisId, status, handleSSEEvent, options?.replayHistory, retryTick]);

  return {
    isConnected:
      !!analysisId && status !== "completed" && status !== "failed" && status !== "canceled" && isConnected
      && connectedAnalysisId === analysisId,
    retryDelayMs,
  };
}
