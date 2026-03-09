"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";

const HANDOFF_MIN_MS = 1100;
const EXIT_DURATION_MS = 360;

type Phase = "playing" | "handoff" | "exiting" | "done";

function hasForcedWelcomeFlag() {
  const value = new URLSearchParams(window.location.search).get("welcome");
  return value === "1" || value === "true" || value === "demo";
}

function subscribeToWelcomePreference(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const handleChange = () => onStoreChange();
  mediaQuery.addEventListener("change", handleChange);
  window.addEventListener("storage", handleChange);
  window.addEventListener("popstate", handleChange);

  return () => {
    mediaQuery.removeEventListener("change", handleChange);
    window.removeEventListener("storage", handleChange);
    window.removeEventListener("popstate", handleChange);
  };
}

function getWelcomePreferenceSnapshot() {
  return !(
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    || (!hasForcedWelcomeFlag() && sessionStorage.getItem("welcome-shown"))
  );
}

export function WelcomeScreen() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const seekingRef = useRef(false);
  const beamTimeoutRef = useRef<number>(0);
  const doneTimeoutRef = useRef<number>(0);
  const [hasConsumedWelcome, setHasConsumedWelcome] = useState(false);
  const shouldPlayWelcome = useSyncExternalStore(
    subscribeToWelcomePreference,
    getWelcomePreferenceSnapshot,
    () => false,
  );
  const [phase, setPhase] = useState<Phase>("done");
  const [nativeOk, setNativeOk] = useState(false);
  const [showFrozenFrame, setShowFrozenFrame] = useState(false);
  const [handoffSettled, setHandoffSettled] = useState(false);
  const [needsHomeGate, setNeedsHomeGate] = useState(false);
  const [homeReady, setHomeReady] = useState(true);
  const effectivePhase = phase === "handoff" || phase === "exiting"
    ? phase
    : shouldPlayWelcome && !hasConsumedWelcome
      ? "playing"
      : "done";

  const clearTimers = useCallback(() => {
    window.clearTimeout(beamTimeoutRef.current);
    window.clearTimeout(doneTimeoutRef.current);
  }, []);

  const markMediaReady = useCallback(() => {
    document.documentElement.dataset.welcomeMediaReady = "true";
  }, []);

  useEffect(() => {
    const root = document.documentElement;

    if (effectivePhase === "playing") {
      root.dataset.boot = "welcome";
      root.dataset.surfaceState = "dormant";
      root.dataset.welcomeMediaReady = "false";
    } else if (effectivePhase === "handoff") {
      root.dataset.boot = "handoff";
      root.dataset.surfaceState = handoffSettled ? "active" : "awakening";
    } else if (effectivePhase === "exiting") {
      root.dataset.boot = "app";
      root.dataset.surfaceState = "active";
      root.dataset.welcomeMediaReady = "true";
    } else {
      root.dataset.boot = "app";
      root.dataset.surfaceState = "active";
      root.dataset.welcomeMediaReady = "true";
    }

    return () => {
      if (phase === "done") {
        root.dataset.boot = "app";
        root.dataset.surfaceState = "active";
        root.dataset.welcomeMediaReady = "true";
      }
    };
  }, [effectivePhase, handoffSettled, phase]);

  useEffect(() => {
    if (effectivePhase !== "playing" && effectivePhase !== "handoff") return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [effectivePhase]);

  useEffect(() => {
    const root = document.documentElement;
    const syncHomeReady = () => {
      setNeedsHomeGate(root.dataset.homeGate === "true");
      setHomeReady(root.dataset.homeReady !== "false");
    };

    syncHomeReady();
    window.addEventListener("text:home-ready", syncHomeReady);

    return () => {
      window.removeEventListener("text:home-ready", syncHomeReady);
    };
  }, []);

  // Draw video's current frame to canvas (used for first-frame + seek loop)
  const drawFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return false;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return true;
  }, []);

  const dismiss = useCallback(() => {
    if (effectivePhase !== "playing") return;
    cancelAnimationFrame(rafRef.current);
    clearTimers();
    drawFrame();
    setShowFrozenFrame(true);
    markMediaReady();
    setHandoffSettled(false);
    videoRef.current?.pause();
    sessionStorage.setItem("welcome-shown", "1");
    setHasConsumedWelcome(true);
    setPhase("handoff");
    beamTimeoutRef.current = window.setTimeout(() => {
      setHandoffSettled(true);
    }, HANDOFF_MIN_MS);
  }, [clearTimers, drawFrame, effectivePhase, markMediaReady]);

  useEffect(() => {
    if (phase !== "handoff" || !handoffSettled) return;
    if (needsHomeGate && !homeReady) return;

    const rafId = window.requestAnimationFrame(() => {
      setPhase("exiting");
      doneTimeoutRef.current = window.setTimeout(() => {
        setPhase("done");
      }, EXIT_DURATION_MS);
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [handoffSettled, homeReady, needsHomeGate, phase]);

  // Ref callback — draw first frame ASAP, then try native play
  const setVideoRef = useCallback(
    (el: HTMLVideoElement | null) => {
      videoRef.current = el;
      if (!el) return;
      el.muted = true;
      setShowFrozenFrame(false);

      // Draw first frame as early as possible to avoid flash
      const onData = () => {
        if (drawFrame()) {
          markMediaReady();
        }
        el.removeEventListener("loadeddata", onData);
      };
      if (el.readyState >= 2) {
        if (drawFrame()) {
          markMediaReady();
        }
      } else {
        el.addEventListener("loadeddata", onData);
      }

      el.play()
        .then(() => {
          setNativeOk(true);
          markMediaReady();
        })
        .catch(() => {}); // canvas fallback handled by effect
    },
    [drawFrame, markMediaReady],
  );

  // Canvas fallback: seek through video and draw each frame
  useEffect(() => {
    if (nativeOk || effectivePhase !== "playing") return;

    const video = videoRef.current;
    if (!video) return;

    const onSeeked = () => {
      seekingRef.current = false;
      if (drawFrame()) {
        markMediaReady();
      }
    };

    video.addEventListener("seeked", onSeeked);

    const startLoop = () => {
      if (drawFrame()) {
        markMediaReady();
      }
      startTimeRef.current = performance.now();

      const tick = () => {
        const elapsed = (performance.now() - startTimeRef.current) / 1000;
        if (elapsed >= video.duration) {
          dismiss();
          return;
        }
        if (!seekingRef.current) {
          seekingRef.current = true;
          video.currentTime = elapsed;
        }
        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    };

    if (video.readyState >= 1) {
      startLoop();
    } else {
      video.addEventListener("loadedmetadata", startLoop, { once: true });
    }

    return () => {
      video.removeEventListener("seeked", onSeeked);
      cancelAnimationFrame(rafRef.current);
    };
  }, [nativeOk, effectivePhase, dismiss, drawFrame, markMediaReady]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  if (effectivePhase === "done") return null;

  return (
    <div
      className="welcome-screen fixed inset-0 z-[10000] flex items-center justify-center overflow-hidden"
      data-phase={effectivePhase}
      aria-hidden="true"
    >
      <div className="welcome-screen__backdrop" />

      <div className="welcome-screen__media">
        {/* Video data source — zero-size unless native playback works */}
        <video
          ref={setVideoRef}
          src="/welcome.mp4"
          autoPlay
          muted
          playsInline
          preload="auto"
          onEnded={dismiss}
          className="absolute inset-0 h-full w-full object-cover"
          style={
            nativeOk && !showFrozenFrame
              ? undefined
              : { position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }
          }
        />

        {/* Canvas handles fallback playback and freezes the last frame for exit. */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            opacity: !nativeOk || showFrozenFrame ? 1 : 0,
            transition: "opacity 180ms linear",
          }}
        />
      </div>

      <div className="welcome-screen__grain" />

      {/* Brand watermark — top left */}
      <div
        className="absolute top-6 left-8 z-10 transition-opacity duration-[1200ms] ease-out"
        style={{ opacity: effectivePhase === "playing" ? 0.35 : 0 }}
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
    </div>
  );
}
