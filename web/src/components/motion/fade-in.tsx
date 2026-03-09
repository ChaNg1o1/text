"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { useReducedMotionPreference } from "@/hooks/use-reduced-motion";
import {
  ENTER_FROM,
  ENTER_TO,
  EXIT_TO,
  TRANSITION_ENTER,
  TRANSITION_EXIT,
} from "@/lib/motion";

interface FadeInProps {
  children: ReactNode;
  delay?: number;
  className?: string;
  y?: number;
}

export function FadeIn({ children, delay = 0, className, y }: FadeInProps) {
  const reducedMotion = useReducedMotionPreference();

  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ ...ENTER_FROM, y: y ?? ENTER_FROM.y }}
      animate={{ ...ENTER_TO, transition: { ...TRANSITION_ENTER, delay } }}
      exit={{ ...EXIT_TO, transition: TRANSITION_EXIT }}
    >
      {children}
    </motion.div>
  );
}
