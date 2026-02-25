"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { useReducedMotionPreference } from "@/hooks/use-reduced-motion";

interface FadeInProps {
  children: ReactNode;
  delay?: number;
  className?: string;
  y?: number;
}

export function FadeIn({ children, delay = 0, className, y = 10 }: FadeInProps) {
  const reducedMotion = useReducedMotionPreference();

  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut", delay }}
    >
      {children}
    </motion.div>
  );
}
