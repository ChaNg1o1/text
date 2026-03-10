import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SectionEyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("text-[11px] uppercase tracking-[0.22em] text-muted-foreground", className)}>
      {children}
    </div>
  );
}
