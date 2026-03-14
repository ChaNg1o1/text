"use client";

import type { CSSProperties, ReactNode } from "react";

interface FadeInProps {
  children: ReactNode;
  delay?: number;
  className?: string;
  y?: number;
}

export function FadeIn({ children, delay = 0, className, y }: FadeInProps) {
  const style: CSSProperties | undefined =
    delay > 0 ? { animationDelay: `${delay}s` } : undefined;

  return (
    <div
      className={`css-fade-in ${className ?? ""}`}
      style={style}
      data-y={y}
    >
      {children}
    </div>
  );
}
