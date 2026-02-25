"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";
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
    const controls = animate(previous.current, value, {
      duration: reducedMotion ? 0 : duration,
      ease: "easeOut",
      onUpdate: (latest) => setDisplay(latest),
    });

    previous.current = value;
    return () => controls.stop();
  }, [value, duration, reducedMotion]);

  return <span className={className}>{display.toFixed(decimals)}{suffix}</span>;
}
