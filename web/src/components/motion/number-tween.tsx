"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotionPreference } from "@/hooks/use-reduced-motion";

interface NumberTweenProps {
  value: number;
  duration?: number;
  decimals?: number;
  suffix?: string;
  className?: string;
}

export function NumberTween({
  value,
  duration = 0.45,
  decimals = 0,
  suffix = "",
  className,
}: NumberTweenProps) {
  const reducedMotion = useReducedMotionPreference();
  const previous = useRef(0);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (reducedMotion || duration <= 0) {
      previous.current = value;
      const immediateFrame = window.requestAnimationFrame(() => setDisplay(value));
      return () => window.cancelAnimationFrame(immediateFrame);
    }

    const start = performance.now();
    const from = previous.current;
    const delta = value - from;
    const totalMs = duration * 1000;
    let frameId = 0;

    const step = (now: number) => {
      const elapsed = now - start;
      const raw = Math.min(elapsed / totalMs, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - raw, 3);
      setDisplay(from + delta * eased);

      if (raw < 1) {
        frameId = window.requestAnimationFrame(step);
      } else {
        previous.current = value;
      }
    };

    frameId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frameId);
  }, [value, duration, reducedMotion]);

  return <span className={className}>{display.toFixed(decimals)}{suffix}</span>;
}
