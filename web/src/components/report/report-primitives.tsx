import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ReportSectionIntro({
  kicker,
  title,
  description,
  actions,
  className,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0 space-y-1.5">
        {kicker ? (
          <div className="text-sm font-medium text-muted-foreground">{kicker}</div>
        ) : null}
        <h3 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h3>
        {description ? (
          <p className="max-w-3xl text-sm leading-7 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

export function ReportMetaLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("text-xs font-medium text-muted-foreground", className)}>
      {children}
    </div>
  );
}
