"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/components/providers/i18n-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AutoCollapseProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  fadeClassName?: string;
  buttonClassName?: string;
  collapsedHeight?: number;
  contentKey?: string | number;
}

export function AutoCollapse({
  contentKey,
  ...props
}: AutoCollapseProps) {
  return <AutoCollapseInner key={String(contentKey ?? "__auto-collapse")} {...props} />;
}

function AutoCollapseInner({
  children,
  className,
  contentClassName,
  fadeClassName,
  buttonClassName,
  collapsedHeight = 220,
}: AutoCollapseProps) {
  const { t } = useI18n();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [collapsible, setCollapsible] = useState(false);

  useEffect(() => {
    const node = contentRef.current;
    if (!node) return;

    const update = () => {
      setCollapsible(node.scrollHeight > collapsedHeight + 12);
    };

    update();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => update());
    observer.observe(node);
    return () => observer.disconnect();
  }, [children, collapsedHeight]);

  return (
    <div className={className}>
      <div className="relative">
        <div
          ref={contentRef}
          className={cn("overflow-hidden transition-[max-height] duration-200 ease-out", contentClassName)}
          style={!expanded && collapsible ? { maxHeight: collapsedHeight } : undefined}
        >
          {children}
        </div>
        {!expanded && collapsible && (
          <div
            className={cn(
              "pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background via-background/90 to-transparent",
              fadeClassName,
            )}
            aria-hidden="true"
          />
        )}
      </div>

      {collapsible && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("mt-2 h-8 px-2 text-xs", buttonClassName)}
          onClick={() => setExpanded((current) => !current)}
        >
          {t(expanded ? "common.showLess" : "common.showMore")}
        </Button>
      )}
    </div>
  );
}
