"use client";

import { useEffect } from "react";

function isTauriRuntime() {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}

export function RuntimeFlags() {
  useEffect(() => {
    if (!isTauriRuntime()) return;
    document.documentElement.dataset.runtime = "tauri";

    void import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke<string>("get_api_origin"))
      .then((origin) => {
        const normalized = origin.replace(/\/$/, "");
        (window as Window & { __TEXT_API_ORIGIN__?: string }).__TEXT_API_ORIGIN__ = normalized;
      })
      .catch(() => {
        // Ignore fallback errors; API client has a default local origin.
      });
  }, []);

  return null;
}
