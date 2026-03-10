"use client";

import { useEffect } from "react";

function isTauriRuntime() {
  if (typeof window === "undefined") return false;
  if ("__TAURI_INTERNALS__" in window || "__TAURI__" in window) {
    return true;
  }
  const protocol = window.location?.protocol?.toLowerCase?.() ?? "";
  const hostname = window.location?.hostname?.toLowerCase?.() ?? "";
  const userAgent = window.navigator?.userAgent?.toLowerCase?.() ?? "";
  return protocol.startsWith("tauri:") || hostname === "tauri.localhost" || userAgent.includes("tauri");
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function shouldBlockDevtoolsShortcut(event: KeyboardEvent) {
  const key = event.key.toLowerCase();
  if (key === "f12") return true;

  const commonTargets = ["i", "j", "c", "k"];
  const ctrlOrCmd = event.ctrlKey || event.metaKey;
  const shiftCombo = ctrlOrCmd && event.shiftKey && commonTargets.includes(key);
  const macAltCombo = event.metaKey && event.altKey && commonTargets.includes(key);
  return shiftCombo || macAltCombo;
}

function areDevtoolsShortcutsEnabled() {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const queryFlag = (params.get("devtools") || "").toLowerCase();
    if (queryFlag === "1" || queryFlag === "true") return true;

    const stored = (window.localStorage?.getItem("TEXT_ALLOW_TAURI_DEVTOOLS_SHORTCUTS") || "").toLowerCase();
    return stored === "1" || stored === "true";
  } catch {
    return false;
  }
}

type FrontendDebugEventPayload = {
  level: string;
  message: string;
  source?: string;
  timestamp_ms: number;
};

function stringifyConsoleArgs(args: unknown[]) {
  return args
    .map((value) => {
      if (typeof value === "string") return value;
      if (value instanceof Error) return value.stack || value.message;
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    })
    .join(" ");
}

export function RuntimeFlags() {
  useEffect(() => {
    if (!isTauriRuntime()) return;
    document.documentElement.dataset.runtime = "tauri";

    const blockContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };
    const blockDevtoolsShortcuts = (event: KeyboardEvent) => {
      if (!shouldBlockDevtoolsShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
    };

    const rawConsole = {
      log: console.log.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      debug: console.debug.bind(console),
    };
    let cancelled = false;
    let reporterReady = false;
    let isFlushing = false;
    let flushTimer = 0;
    const queue: FrontendDebugEventPayload[] = [];

    const scheduleFlush = () => {
      if (cancelled || isFlushing || flushTimer) return;
      flushTimer = window.setTimeout(() => {
        flushTimer = 0;
        void flushQueue();
      }, 120);
    };

    const flushQueue = async () => {
      if (cancelled || isFlushing || queue.length === 0 || !reporterReady) return;
      isFlushing = true;
      const batch = queue.splice(0, queue.length);
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("record_frontend_debug_events", { events: batch });
      } catch (error) {
        rawConsole.error("[text/frontend-debug] failed to forward console batch", error);
      } finally {
        isFlushing = false;
        if (queue.length > 0) {
          scheduleFlush();
        }
      }
    };

    const enqueueEvent = (payload: FrontendDebugEventPayload) => {
      if (cancelled) return;
      queue.push(payload);
      if (queue.length > 250) {
        queue.splice(0, queue.length - 250);
      }
      scheduleFlush();
    };

    const patchConsoleMethod = (
      method: "log" | "info" | "warn" | "error" | "debug",
      level: string,
    ) => {
      console[method] = (...args: unknown[]) => {
        rawConsole[method](...args);
        enqueueEvent({
          level,
          source: "console",
          message: stringifyConsoleArgs(args),
          timestamp_ms: Date.now(),
        });
      };
    };

    patchConsoleMethod("log", "info");
    patchConsoleMethod("info", "info");
    patchConsoleMethod("warn", "warning");
    patchConsoleMethod("error", "error");
    patchConsoleMethod("debug", "debug");

    const onWindowError = (event: ErrorEvent) => {
      enqueueEvent({
        level: "error",
        source: "window-error",
        message: event.error?.stack || event.message || "Unknown window error",
        timestamp_ms: Date.now(),
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason instanceof Error
        ? event.reason.stack || event.reason.message
        : stringifyConsoleArgs([event.reason]);
      enqueueEvent({
        level: "error",
        source: "unhandledrejection",
        message: reason || "Unhandled promise rejection",
        timestamp_ms: Date.now(),
      });
    };

    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("contextmenu", blockContextMenu);
    if (!areDevtoolsShortcutsEnabled()) {
      window.addEventListener("keydown", blockDevtoolsShortcuts, true);
    }

    void (async () => {
      const retryDelays = [50, 120, 220, 350, 500] as const;
      for (const delay of retryDelays) {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const origin = await invoke<string>("get_api_origin");
          const normalized = origin.replace(/\/$/, "");
          if (normalized) {
            (window as Window & { __TEXT_API_ORIGIN__?: string }).__TEXT_API_ORIGIN__ = normalized;
            reporterReady = true;
            scheduleFlush();
            return;
          }
        } catch {
          // Continue retrying.
        }
        await wait(delay);
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(flushTimer);
      void flushQueue();
      console.log = rawConsole.log;
      console.info = rawConsole.info;
      console.warn = rawConsole.warn;
      console.error = rawConsole.error;
      console.debug = rawConsole.debug;
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("contextmenu", blockContextMenu);
      window.removeEventListener("keydown", blockDevtoolsShortcuts, true);
    };
  }, []);

  return null;
}
