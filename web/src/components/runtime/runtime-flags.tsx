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

    window.addEventListener("contextmenu", blockContextMenu);
    window.addEventListener("keydown", blockDevtoolsShortcuts, true);

    void (async () => {
      const retryDelays = [50, 120, 220, 350, 500] as const;
      for (const delay of retryDelays) {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const origin = await invoke<string>("get_api_origin");
          const normalized = origin.replace(/\/$/, "");
          if (normalized) {
            (window as Window & { __TEXT_API_ORIGIN__?: string }).__TEXT_API_ORIGIN__ = normalized;
            return;
          }
        } catch {
          // Continue retrying.
        }
        await wait(delay);
      }
    })();

    return () => {
      window.removeEventListener("contextmenu", blockContextMenu);
      window.removeEventListener("keydown", blockDevtoolsShortcuts, true);
    };
  }, []);

  return null;
}
