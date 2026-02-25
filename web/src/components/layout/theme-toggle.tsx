"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/components/providers/i18n-provider";

function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const mounted = useMounted();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t("theme.label")}>
          {!mounted ? <Monitor /> : theme === "dark" ? <Moon /> : theme === "light" ? <Sun /> : <Monitor />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={theme ?? "system"}
          onValueChange={(value) => setTheme(value)}
        >
          <DropdownMenuRadioItem value="system">
            {t("theme.system")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light">
            {t("theme.light")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            {t("theme.dark")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
