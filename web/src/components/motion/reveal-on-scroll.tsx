"use client";

import { useRef, type ReactNode } from "react";
import { motion, useInView } from "framer-motion";
import { useReducedMotionPreference } from "@/hooks/use-reduced-motion";
import { REVEAL_VARIANTS, TRANSITION_REVEAL } from "@/lib/motion";

interface RevealOnScrollProps {
  children: ReactNode;
  className?: string;
  /** Vertical offset in px (default 16) */
  y?: number;
  /** Only animate once (default true) */
  once?: boolean;
  /** Fraction of element visible to trigger (default 0.15) */
  amount?: number;
  /** Additional delay in seconds */
  delay?: number;
}

export function RevealOnScroll({
  children,
  className,
  y = 16,
  once = true,
  amount = 0.15,
  delay = 0,
}: RevealOnScrollProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once, amount });
  const reducedMotion = useReducedMotionPreference();

  if (reducedMotion) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      variants={{
        ...REVEAL_VARIANTS,
        initial: { opacity: 0, y },
      }}
      initial="initial"
      animate={isInView ? "animate" : "initial"}
      transition={{ ...TRANSITION_REVEAL, delay }}
    >
      {children}
    </motion.div>
  );
}
