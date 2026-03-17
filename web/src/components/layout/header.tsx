"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, PlusCircle, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/providers/i18n-provider";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const NAV_HOVER_MS = 180;
const NAV_HOVER_STYLE = { "--nav-hover-ms": `${NAV_HOVER_MS}ms` } as CSSProperties;

export function Header() {
  const pathname = usePathname();
  const { t } = useI18n();
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const updateScrollState = () => {
      setIsScrolled(window.scrollY > 8);
    };

    updateScrollState();
    window.addEventListener("scroll", updateScrollState, { passive: true });
    return () => window.removeEventListener("scroll", updateScrollState);
  }, []);

  const navItems = [
    {
      href: "/analyses",
      label: t("nav.history"),
      icon: History,
      match: (path: string) => path.startsWith("/analyses") && path !== "/analyses/new",
    },
    {
      href: "/analyses/new",
      label: t("nav.newAnalysis"),
      icon: PlusCircle,
      match: (path: string) => path === "/analyses/new",
    },
    {
      href: "/settings",
      label: t("nav.settings"),
      icon: SlidersHorizontal,
      match: (path: string) => path.startsWith("/settings"),
    },
  ];

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-[background-color,border-color,box-shadow,backdrop-filter] duration-200",
        isScrolled
          ? "border-b border-border/55 bg-background/82 shadow-[0_16px_42px_-30px_rgba(0,0,0,0.82)] backdrop-blur-md supports-[backdrop-filter]:bg-background/36 dark:border-white/8"
          : "border-b border-transparent bg-transparent shadow-none backdrop-blur-0 supports-[backdrop-filter]:bg-transparent",
      )}
    >
      <div className="container flex h-14 items-center px-6">
        <Link href="/" className="mr-8 flex h-9 items-center">
          <Image
            src="/text-logo-trimmed.png"
            alt={t("app.name")}
            width={1130}
            height={322}
            className="h-7 w-auto max-w-[124px] select-none object-contain object-left dark:invert"
            priority
            unoptimized
          />
          <span className="sr-only">{t("app.name")}</span>
        </Link>
        <nav className="flex items-center gap-1" aria-label={t("nav.mainAria")}>
          {navItems.map((item) => {
            const active = item.match(pathname);
            return (
              <Button
                key={item.href}
                asChild
                variant="ghost"
                size="sm"
                style={NAV_HOVER_STYLE}
                className={cn(
                  "group/nav header-nav-link relative gap-1.5 bg-transparent shadow-none",
                  "hover:bg-transparent focus-visible:bg-transparent hover:text-foreground",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  data-active={active ? "true" : undefined}
                >
                  <span className="relative z-10 inline-flex items-center gap-1.5">
                    <item.icon
                      className="header-nav-icon h-4 w-4"
                      aria-hidden="true"
                    />
                    <span
                      className={cn(
                        "header-nav-label",
                        !active && "group-hover/nav:text-foreground",
                      )}
                    >
                      {item.label}
                    </span>
                  </span>
                </Link>
              </Button>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
