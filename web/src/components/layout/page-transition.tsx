"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useReducedMotionPreference } from "@/hooks/use-reduced-motion";

const PAGE_TRANSITION = {
  duration: 0.22,
  ease: [0.22, 1, 0.36, 1] as const,
};

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reducedMotion = useReducedMotionPreference();

  if (reducedMotion) {
    return <>{children}</>;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 8, filter: "blur(1.6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: -4, filter: "blur(1px)" }}
        transition={PAGE_TRANSITION}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
