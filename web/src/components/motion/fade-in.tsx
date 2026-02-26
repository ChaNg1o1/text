"use client";

import type { ReactNode } from "react";

interface FadeInProps {
  children: ReactNode;
  delay?: number;
  className?: string;
  y?: number;
}

export function FadeIn({ children, delay = 0, className }: FadeInProps) {
  return (
    <div
      className={className}
      style={{
        opacity: 1,
        transition: `opacity 0.2s ease-out ${delay}s, transform 0.2s ease-out ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}
