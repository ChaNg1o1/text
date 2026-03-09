"use client";

import { useEffect, useEffectEvent, useState } from "react";
import Script from "next/script";
import { useReducedMotionPreference } from "@/hooks/use-reduced-motion";

type LiquidGLOptions = {
  snapshot: string;
  target: string;
  resolution: number;
  refraction: number;
  bevelDepth: number;
  bevelWidth: number;
  frost: number;
  shadow: boolean;
  specular: boolean;
  reveal: "none" | "fade";
  tilt: boolean;
  magnify: number;
  on?: {
    init?: (instance: { el?: HTMLElement }) => void;
  };
};

type LiquidGLFunction = ((options: LiquidGLOptions) => unknown) & {
  registerDynamic?: (elements: string | Element[]) => void;
};

declare global {
  interface Window {
    liquidGL?: LiquidGLFunction;
  }
}

interface LiquidGlassRuntimeProps {
  targetSelector: string;
  snapshotSelector?: string;
}

export function LiquidGlassRuntime({
  targetSelector,
  snapshotSelector = ".app-surface-flow",
}: LiquidGlassRuntimeProps) {
  const reducedMotion = useReducedMotionPreference();
  const [html2CanvasReady, setHtml2CanvasReady] = useState(false);
  const [liquidReady, setLiquidReady] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (reducedMotion) {
      delete root.dataset.liquidGlassCompat;
      return;
    }

    root.dataset.liquidGlassCompat = "true";
    return () => {
      delete root.dataset.liquidGlassCompat;
    };
  }, [reducedMotion]);

  const initializeGlass = useEffectEvent(() => {
    if (reducedMotion) return;

    const liquidGL = window.liquidGL;
    if (typeof liquidGL !== "function") return;

    const pending = Array.from(
      document.querySelectorAll<HTMLElement>(
        `${targetSelector}:not([data-liquid-glass-ready="true"])`,
      ),
    );

    if (!pending.length) return;

    const batchId = `liquid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    pending.forEach((element) => {
      element.dataset.liquidGlassBatch = batchId;
      delete element.dataset.liquidGlassActive;
      delete element.dataset.liquidGlassFailed;
    });

    window.requestAnimationFrame(() => {
      try {
        liquidGL({
          snapshot: snapshotSelector,
          target: `[data-liquid-glass-batch="${batchId}"]`,
          resolution: 1.25,
          refraction: 0.016,
          bevelDepth: 0.09,
          bevelWidth: 0.18,
          frost: 1.8,
          shadow: false,
          specular: true,
          reveal: "fade",
          tilt: false,
          magnify: 1,
          on: {
            init(instance) {
              const element = instance.el;
              if (!element) return;
              element.dataset.liquidGlassReady = "true";
              element.dataset.liquidGlassActive = "true";
              delete element.dataset.liquidGlassBatch;
            },
          },
        });

        window.setTimeout(() => {
          pending.forEach((element) => {
            if (element.dataset.liquidGlassActive === "true") return;

            element.dataset.liquidGlassFailed = "true";
            delete element.dataset.liquidGlassBatch;
            delete element.dataset.liquidGlassReady;
            element.style.opacity = "";
            element.style.transition = "";
            element.style.background = "";
            element.style.backgroundColor = "";
            element.style.backgroundImage = "";
            element.style.backdropFilter = "";
            element.style.setProperty("-webkit-backdrop-filter", "");
            element.style.pointerEvents = "none";
          });
        }, 2200);
      } catch (error) {
        console.warn("liquidGL initialization failed", error);
        pending.forEach((element) => {
          element.dataset.liquidGlassFailed = "true";
          delete element.dataset.liquidGlassBatch;
          delete element.dataset.liquidGlassReady;
          element.style.opacity = "";
          element.style.transition = "";
          element.style.background = "";
          element.style.backgroundColor = "";
          element.style.backgroundImage = "";
          element.style.backdropFilter = "";
          element.style.setProperty("-webkit-backdrop-filter", "");
          element.style.pointerEvents = "none";
        });
      }
    });
  });

  useEffect(() => {
    if (!html2CanvasReady || !liquidReady || reducedMotion) return;
    initializeGlass();
  }, [html2CanvasReady, liquidReady, reducedMotion]);

  return (
    <>
      <Script
        src="/vendor/html2canvas.min.js"
        strategy="afterInteractive"
        onReady={() => setHtml2CanvasReady(true)}
      />
      <Script
        src="/vendor/liquidGL.js"
        strategy="afterInteractive"
        onReady={() => setLiquidReady(true)}
      />
    </>
  );
}
