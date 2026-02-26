import type { SSEEventData, SSEEventType } from "./types";

export type SSEHandler = (event: SSEEventType, data: SSEEventData) => void;

export function createSSEClient(
  url: string,
  onEvent: SSEHandler,
  onOpen?: () => void,
  onError?: (error: Event) => void,
) {
  const source = new EventSource(url);

  const eventTypes: SSEEventType[] = [
    "analysis_started",
    "phase_changed",
    "feature_extraction_progress",
    "agent_started",
    "agent_completed",
    "synthesis_started",
    "synthesis_completed",
    "analysis_completed",
    "analysis_cancelled",
    "analysis_failed",
    "log",
    "heartbeat",
  ];

  for (const type of eventTypes) {
    source.addEventListener(type, (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as SSEEventData;
        onEvent(type, data);
      } catch {
        // ignore malformed events
      }
    });
  }

  source.onerror = (e) => {
    onError?.(e);
  };
  source.onopen = () => {
    onOpen?.();
  };

  return {
    close: () => source.close(),
    readyState: () => source.readyState,
  };
}
