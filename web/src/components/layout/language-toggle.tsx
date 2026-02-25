"use client";

import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/providers/i18n-provider";

export function LanguageToggle() {
  const { locale, toggleLocale, t } = useI18n();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="gap-1.5"
      onClick={toggleLocale}
      aria-label={t("language.toggle")}
    >
      <Languages className="h-4 w-4" />
      {locale === "zh" ? t("language.en") : t("language.zh")}
    </Button>
  );
}
