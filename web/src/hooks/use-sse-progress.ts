import { useEffect, useRef } from "react";
import { api } from "@/lib/api-client";
import { createSSEClient } from "@/lib/sse-client";
import { useAnalysisStore } from "@/stores/analysis-store";
import type { AnalysisStatus } from "@/lib/types";

export function useSSEProgress(analysisId: string | undefined, status?: AnalysisStatus) {
  const handleSSEEvent = useAnalysisStore((s) => s.handleSSEEvent);
  const clientRef = useRef<ReturnType<typeof createSSEClient> | null>(null);

  useEffect(() => {
    if (!analysisId || status === "completed" || status === "failed") {
      clientRef.current?.close();
      clientRef.current = null;
      return;
    }

    const client = createSSEClient(
      api.progressUrl(analysisId),
      (event, data) => handleSSEEvent(analysisId, event, data),
      () => {
        // On error, try reconnecting after a delay
        setTimeout(() => {
          clientRef.current?.close();
          // Will reconnect on next render
        }, 3000);
      },
    );
    clientRef.current = client;

    return () => {
      client.close();
      clientRef.current = null;
    };
  }, [analysisId, status, handleSSEEvent]);
}
