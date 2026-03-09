"use client";

import type { ReactNode } from "react";
import { useReducedMotionPreference } from "@/hooks/use-reduced-motion";

export function PageTransition({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotionPreference();

  if (reducedMotion) {
    return <>{children}</>;
  }

  return <div className="page-transition-enter">{children}</div>;
}
