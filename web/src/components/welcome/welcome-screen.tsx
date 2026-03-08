"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useI18n } from "@/components/providers/i18n-provider";

const STORAGE_KEY = "text:welcome-seen";
const SKIP_REVEAL_MS = 1800;
const EXIT_DURATION_MS = 720;

type Phase = "loading" | "playing" | "exiting" | "done";

export function WelcomeScreen() {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [skipVisible, setSkipVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState<boolean | null>(null);

  // Check localStorage once on mount
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const seen = localStorage.getItem(STORAGE_KEY);
      if (seen) {
        setShouldRender(false);
      } else {
        setShouldRender(true);
        setPhase("playing");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Reveal skip button after a short delay
  useEffect(() => {
    if (phase !== "playing") return;
    const timer = setTimeout(() => setSkipVisible(true), SKIP_REVEAL_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  // Ensure autoplay kicks in (some webviews ignore the attribute)
  useEffect(() => {
    if (phase !== "playing") return;
    const video = videoRef.current;
    if (!video) return;
    video.play().catch(() => {});
  }, [phase]);

  // Sync video progress to the thin progress bar via rAF
  useEffect(() => {
    if (phase !== "playing") return;
    const video = videoRef.current;
    const bar = progressRef.current;
    if (!video || !bar) return;

    const tick = () => {
      if (video.duration && video.duration > 0) {
        const pct = (video.currentTime / video.duration) * 100;
        bar.style.transform = `scaleX(${pct / 100})`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase]);

  const dismiss = useCallback(() => {
    if (phase === "exiting" || phase === "done") return;
    localStorage.setItem(STORAGE_KEY, "1");
    cancelAnimationFrame(rafRef.current);
    setPhase("exiting");
    setTimeout(() => setPhase("done"), EXIT_DURATION_MS);
  }, [phase]);

  // Respect prefers-reduced-motion: skip entirely
  useEffect(() => {
    if (shouldRender && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const timer = window.setTimeout(() => {
        localStorage.setItem(STORAGE_KEY, "1");
        setShouldRender(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [shouldRender]);

  if (shouldRender === null || shouldRender === false || phase === "done") return null;

  const isExiting = phase === "exiting";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
      style={{
        backgroundColor: "#000",
        transform: isExiting ? "translateY(-100%)" : "translateY(0)",
        opacity: isExiting ? 0.6 : 1,
        transition: isExiting
          ? `transform ${EXIT_DURATION_MS}ms cubic-bezier(0.65, 0, 0.35, 1), opacity ${EXIT_DURATION_MS}ms ease-out`
          : "none",
      }}
      aria-hidden="true"
    >
      {/* Video */}
      <video
        ref={videoRef}
        src="/welcome.mp4"
        autoPlay
        muted
        playsInline
        onEnded={dismiss}
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Brand watermark — top left */}
      <div
        className="absolute top-6 left-8 z-10"
        style={{
          opacity: phase === "playing" ? 0.35 : 0,
          transition: "opacity 1.2s ease-out 0.4s",
        }}
      >
        <Image
          src="/text-logo-trimmed.png"
          alt=""
          width={565}
          height={161}
          className="h-5 w-auto select-none invert"
          priority
          unoptimized
        />
      </div>

      {/* Bottom bar: progress + skip */}
      <div className="absolute inset-x-0 bottom-0 z-10">
        {/* Progress track */}
        <div className="h-[2px] w-full bg-white/[0.08]">
          <div
            ref={progressRef}
            className="h-full origin-left bg-white/40"
            style={{ transform: "scaleX(0)", transition: "none" }}
          />
        </div>

        {/* Skip control */}
        <div className="flex justify-end px-8 py-4">
          <button
            onClick={dismiss}
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/40 hover:text-white/80 focus-visible:text-white/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30 rounded px-2 py-1"
            style={{
              opacity: skipVisible ? 1 : 0,
              transform: skipVisible ? "translateY(0)" : "translateY(4px)",
              transition: "opacity 0.6s ease-out, transform 0.6s ease-out",
              pointerEvents: skipVisible ? "auto" : "none",
            }}
          >
            {t("common.skip")}
          </button>
        </div>
      </div>
    </div>
  );
}
