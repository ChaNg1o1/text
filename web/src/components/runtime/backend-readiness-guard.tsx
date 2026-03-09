"use client";

import { useEffect, type ReactNode } from "react";

type RuntimeWindow = Window & {
  __TEXT_BACKEND_READY__?: boolean;
};

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

function markBackendReady(): void {
  const runtimeWindow = window as RuntimeWindow;
  if (runtimeWindow.__TEXT_BACKEND_READY__) return;
  runtimeWindow.__TEXT_BACKEND_READY__ = true;
  window.dispatchEvent(new Event("text:backend-ready"));
}

export function BackendReadinessGuard({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!isTauriRuntime()) return;

    let cancelled = false;
    let teardown: (() => void) | undefined;

    async function setup() {
      const { listen } = await import("@tauri-apps/api/event");
      const { invoke } = await import("@tauri-apps/api/core");

      const unlistenReady = await listen("backend-ready", () => {
        if (cancelled) return;
        markBackendReady();
      });

      const unlistenError = await listen<string>("backend-error", (e) => {
        if (cancelled) return;
        console.error("[text/backend] startup error", e.payload);
      });

      try {
        const origin = await invoke<string>("get_api_origin");
        fetch(`${origin}/api/v1/health`, { cache: "no-store" })
          .then((response) => {
            if (cancelled || !response.ok) return;
            markBackendReady();
          })
          .catch(() => {});
      } catch (error) {
        if (!cancelled) {
          console.error("[text/backend] failed to resolve api origin", error);
        }
      }

      teardown = () => {
        cancelled = true;
        unlistenReady();
        unlistenError();
      };
    }

    setup().catch((error) => {
      if (!cancelled) {
        console.error("[text/backend] background bootstrap failed", error);
      }
    });

    return () => {
      cancelled = true;
      teardown?.();
    };
  }, []);

  return <>{children}</>;
}
