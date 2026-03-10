"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { FadeIn } from "@/components/motion/fade-in";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";

interface PageIntroProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

interface PageIntroHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
}

interface PageIntroStatProps {
  label: ReactNode;
  value: ReactNode;
  description?: ReactNode;
  accentClassName?: string;
  className?: string;
  valueClassName?: string;
}

export function PageIntro({ children, className, contentClassName }: PageIntroProps) {
  return (
    <FadeIn>
      <section
        className={cn(
          "rounded-3xl border border-border/60 surface-elevated",
          className,
        )}
      >
        <div className={cn("flex flex-col gap-5 p-6", contentClassName)}>{children}</div>
      </section>
    </FadeIn>
  );
}

export function PageIntroHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  bodyClassName,
}: PageIntroHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between", className)}>
      <div className={cn("max-w-3xl space-y-2", bodyClassName)}>
        {eyebrow ? <SectionEyebrow>{eyebrow}</SectionEyebrow> : null}
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

export function PageIntroStatGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("grid gap-3 md:grid-cols-3", className)}>{children}</div>;
}

export function PageIntroStat({
  label,
  value,
  description,
  accentClassName,
  className,
  valueClassName,
}: PageIntroStatProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/60 bg-background/42 p-4",
        accentClassName,
        className,
      )}
    >
      <SectionEyebrow>{label}</SectionEyebrow>
      <div className={cn("mt-3 text-2xl font-semibold", valueClassName)}>{value}</div>
      {description ? <p className="mt-2 text-xs text-muted-foreground">{description}</p> : null}
    </div>
  );
}

export { SectionEyebrow } from "@/components/ui/section-eyebrow";
