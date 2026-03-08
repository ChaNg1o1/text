"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DURATION } from "@/lib/motion";

function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  if ("__TAURI_INTERNALS__" in window || "__TAURI__" in window) return true;
  const protocol = window.location?.protocol?.toLowerCase?.() ?? "";
  const hostname = window.location?.hostname?.toLowerCase?.() ?? "";
  const userAgent = window.navigator?.userAgent?.toLowerCase?.() ?? "";
  return (
    protocol.startsWith("tauri:") ||
    hostname === "tauri.localhost" ||
    userAgent.includes("tauri")
  );
}

type BackendStatus = "loading" | "ready" | "error";

export function BackendReadinessGuard({ children }: { children: ReactNode }) {
  // Always initialize as "ready" so SSR and client first-render match.
  // Tauri detection happens in useEffect (client-only) to avoid hydration mismatch.
  const [status, setStatus] = useState<BackendStatus>("ready");
  const [errorMessage, setErrorMessage] = useState("");
  const [dismissing, setDismissing] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    setStatus("loading");
    setShowOverlay(true);

    let cancelled = false;

    async function setup() {
      const { listen } = await import("@tauri-apps/api/event");
      const { invoke } = await import("@tauri-apps/api/core");

      const unlistenReady = await listen("backend-ready", () => {
        if (!cancelled) setStatus("ready");
      });

      const unlistenError = await listen<string>("backend-error", (e) => {
        if (!cancelled) {
          setErrorMessage(e.payload);
          setStatus("error");
        }
      });

      // Race condition guard: backend may have started before listener was set up
      try {
        const origin = await invoke<string>("get_api_origin");
        const res = await fetch(`${origin}/api/v1/health`);
        if (res.ok && !cancelled) {
          setStatus("ready");
        }
      } catch {
        // Not ready yet -- wait for events
      }

      return () => {
        cancelled = true;
        unlistenReady();
        unlistenError();
      };
    }

    const cleanup = setup();
    return () => {
      cancelled = true;
      cleanup.then((fn) => fn?.());
    };
  }, []);

  // Fade-out overlay when status transitions to "ready"
  useEffect(() => {
    if (status !== "ready" || !showOverlay) return;

    setDismissing(true);
    const timer = setTimeout(() => {
      setShowOverlay(false);
      setDismissing(false);
    }, DURATION.normal * 1000); // 250ms fade-out

    return () => clearTimeout(timer);
  }, [status, showOverlay]);

  if (!showOverlay) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm"
        style={{
          opacity: dismissing ? 0 : 1,
          transition: `opacity ${DURATION.normal}s ease-out`,
        }}
      >
        <div className="flex flex-col items-center gap-4 text-center">
          {status === "loading" && (
            <video
              src="/welcome.mp4"
              autoPlay
              loop
              muted
              playsInline
              className="max-h-[60vh] max-w-[80vw] object-contain"
            />
          )}
          {status === "error" && (
            <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-6 shadow-lg">
              <p className="text-sm font-medium text-destructive">
                Failed to start backend
              </p>
              {errorMessage && (
                <p className="max-w-md text-xs text-muted-foreground">
                  {errorMessage}
                </p>
              )}
              <button
                className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
                onClick={() => window.location.reload()}
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
