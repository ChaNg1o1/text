"use client";

import { Children, type CSSProperties, type ReactNode } from "react";

interface StaggerContainerProps {
  children: ReactNode;
  className?: string;
  delayChildren?: number;
  staggerChildren?: number;
}

export function StaggerContainer({
  children,
  className,
  delayChildren = 0.06,
  staggerChildren = 0.05,
}: StaggerContainerProps) {
  return (
    <div className={className}>
      {Children.map(children, (child, i) => {
        if (!child) return child;
        const delay = delayChildren + i * staggerChildren;
        return (
          <div className="css-fade-in" style={{ animationDelay: `${delay}s` } as CSSProperties}>
            {child}
          </div>
        );
      })}
    </div>
  );
}

interface StaggerItemProps {
  children: ReactNode;
  className?: string;
}

export function StaggerItem({ children, className }: StaggerItemProps) {
  return <div className={className}>{children}</div>;
}
