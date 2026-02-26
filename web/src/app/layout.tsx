import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { I18nProvider } from "@/components/providers/i18n-provider";
import { Header } from "@/components/layout/header";
import { PageTransition } from "@/components/layout/page-transition";
import { RuntimeFlags } from "@/components/runtime/runtime-flags";
import "./globals.css";

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
  description: "Digital forensics text analysis with multi-agent collaboration",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background`}
      >
        <RuntimeFlags />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <I18nProvider>
            <TooltipProvider>
              <div className="app-surface-flow" aria-hidden="true" />
              <Header />
              <main className="container mx-auto px-6 py-6">
                <PageTransition>{children}</PageTransition>
              </main>
              <Toaster />
            </TooltipProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
