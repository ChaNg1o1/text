import type { Metadata } from "next";
import Image from "next/image";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { I18nProvider } from "@/components/providers/i18n-provider";
import { Header } from "@/components/layout/header";
import { PageTransition } from "@/components/layout/page-transition";
import { RuntimeFlags } from "@/components/runtime/runtime-flags";
import { BackendReadinessGuard } from "@/components/runtime/backend-readiness-guard";
import { WelcomeScreen } from "@/components/welcome/welcome-screen";
import "./globals.css";

const WELCOME_BOOTSTRAP_SCRIPT = `
(() => {
  try {
    const root = document.documentElement;
    const params = new URLSearchParams(window.location.search);
    const welcome = (params.get("welcome") || "").toLowerCase();
    const forced = welcome === "1" || welcome === "true" || welcome === "demo";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const shown = window.sessionStorage.getItem("welcome-shown");
    const path = window.location.pathname || "/";
    const needsHomeGate = path === "/" || path === "/analyses";
    const shouldPlayWelcome = !reduced && (forced || !shown);
    root.dataset.homeGate = needsHomeGate ? "true" : "false";
    root.dataset.homeReady = needsHomeGate ? "false" : "true";
    root.dataset.welcomeMediaReady = shouldPlayWelcome ? "false" : "true";
    if (shouldPlayWelcome) {
      root.dataset.boot = "welcome";
      root.dataset.surfaceState = "dormant";
      return;
    }
    root.dataset.boot = "app";
    root.dataset.surfaceState = "active";
    root.dataset.welcomeMediaReady = "true";
  } catch {}
})();
`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "text",
  description: "Clue-first text investigation with multi-agent collaboration",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hans" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} relative isolate antialiased min-h-screen bg-background`}
      >
        <script dangerouslySetInnerHTML={{ __html: WELCOME_BOOTSTRAP_SCRIPT }} />
        <div className="welcome-boot-fallback" aria-hidden="true">
          <Image
            src="/text-logo-trimmed.png"
            alt=""
            width={1130}
            height={322}
            className="welcome-boot-fallback__logo"
            priority
            unoptimized
          />
          <div className="welcome-boot-fallback__grain" />
        </div>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-lg focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:shadow-lg focus:ring-2 focus:ring-ring"
        >
          Skip to content
        </a>
        <RuntimeFlags />
        <BackendReadinessGuard>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <I18nProvider>
            <WelcomeScreen />
            <TooltipProvider>
              <div className="app-surface-flow" aria-hidden="true">
                <div className="app-surface-flow__beam" />
                <div className="app-surface-flow__flashlight" />
                <div className="app-surface-flow__glow" />
                <div className="app-surface-flow__mist app-surface-flow__mist--a" />
                <div className="app-surface-flow__mist app-surface-flow__mist--b" />
                <div className="app-surface-flow__mist app-surface-flow__mist--c" />
                <div className="app-surface-flow__veil" />
              </div>
              <div className="app-shell">
                <Header />
                <main id="main-content" className="container mx-auto px-6 py-6">
                  <PageTransition>{children}</PageTransition>
                </main>
                <Toaster />
              </div>
            </TooltipProvider>
          </I18nProvider>
        </ThemeProvider>
        </BackendReadinessGuard>
      </body>
    </html>
  );
}
