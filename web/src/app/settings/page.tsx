"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowRight,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api-client";
import type {
  AppSettings,
  BackendInfo,
  CustomBackendInfo,
  PromptOverrides,
  TaskType,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/components/providers/i18n-provider";
import { FadeIn } from "@/components/motion/fade-in";
import { PageIntro, PageIntroHeader, PageIntroStat, PageIntroStatGrid } from "@/components/shell/page-intro";

const EMPTY_SETTINGS: AppSettings = {
  analysis_defaults: {
    default_llm_backend: undefined,
    default_task: "full",
    default_top_k: 3,
    default_case_analyst: "",
    default_case_client: "",
    qa_temperature: 0.2,
    qa_max_tokens: 1200,
  },
  prompt_overrides: {
    stylometry: "",
    writing_process: "",
    computational: "",
    sociolinguistics: "",
    synthesis: "",
    qa: "",
  },
};

type SettingsTabValue = "general" | "prompts";

const TASK_OPTIONS: Array<{ value: TaskType; labelKey: string }> = [
  { value: "full", labelKey: "settings.task.full" },
  { value: "verification", labelKey: "settings.task.verification" },
  { value: "closed_set_id", labelKey: "settings.task.closed_set_id" },
  { value: "open_set_id", labelKey: "settings.task.open_set_id" },
  { value: "clustering", labelKey: "settings.task.clustering" },
  { value: "profiling", labelKey: "settings.task.profiling" },
  { value: "sockpuppet", labelKey: "settings.task.sockpuppet" },
];

const PROMPT_FIELDS: Array<{
  key: keyof PromptOverrides;
  titleKey: string;
  descriptionKey: string;
}> = [
  {
    key: "stylometry",
    titleKey: "settings.prompts.stylometry.title",
    descriptionKey: "settings.prompts.stylometry.desc",
  },
  {
    key: "writing_process",
    titleKey: "settings.prompts.writing_process.title",
    descriptionKey: "settings.prompts.writing_process.desc",
  },
  {
    key: "computational",
    titleKey: "settings.prompts.computational.title",
    descriptionKey: "settings.prompts.computational.desc",
  },
  {
    key: "sociolinguistics",
    titleKey: "settings.prompts.sociolinguistics.title",
    descriptionKey: "settings.prompts.sociolinguistics.desc",
  },
  {
    key: "synthesis",
    titleKey: "settings.prompts.synthesis.title",
    descriptionKey: "settings.prompts.synthesis.desc",
  },
  {
    key: "qa",
    titleKey: "settings.prompts.qa.title",
    descriptionKey: "settings.prompts.qa.desc",
  },
];

export default function SettingsPage() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<AppSettings>(EMPTY_SETTINGS);
  const [availableBackends, setAvailableBackends] = useState<BackendInfo[]>([]);
  const [customBackends, setCustomBackends] = useState<CustomBackendInfo[]>([]);
  const [activeTab, setActiveTab] = useState<SettingsTabValue>("general");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const [settingsRes, backendsRes, customBackendsRes] = await Promise.all([
          api.getSettings(),
          api.getBackends(),
          api.getCustomBackends(),
        ]);
        setSettings(settingsRes);
        setAvailableBackends(backendsRes.backends);
        setCustomBackends(customBackendsRes.backends);
      } catch (error) {
        const message = error instanceof Error ? error.message : t("settings.loadFailed");
        toast.error(t("settings.loadFailed"), { description: message });
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [t]);

  const readyBackends = useMemo(
    () => availableBackends.filter((item) => item.has_api_key),
    [availableBackends],
  );
  const promptOverrideCount = useMemo(
    () => Object.values(settings.prompt_overrides).filter((value) => value.trim().length > 0).length,
    [settings.prompt_overrides],
  );

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const saved = await api.updateSettings(settings);
      setSettings(saved);
      toast.success(t("settings.saved"));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.saveFailed");
      toast.error(t("settings.saveFailed"), { description: message });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <FadeIn>
      <div className="mx-auto max-w-6xl space-y-6">
        <PageIntro>
          <PageIntroHeader
            eyebrow={t("nav.settings")}
            title={t("settings.title")}
            description={t("settings.subtitle")}
          />
          <PageIntroStatGrid>
            <PageIntroStat
              label={t("settings.summary.ready")}
              value={readyBackends.length}
              accentClassName="border-emerald-500/30"
            />
            <PageIntroStat
              label={t("settings.summary.backends")}
              value={customBackends.length}
              accentClassName="border-sky-500/30"
            />
            <PageIntroStat
              label={t("settings.summary.prompts")}
              value={promptOverrideCount}
              accentClassName="border-amber-500/30"
            />
          </PageIntroStatGrid>
        </PageIntro>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as SettingsTabValue)}
        className="space-y-4"
      >
        <TabsList className="w-full justify-start overflow-x-auto overflow-y-hidden rounded-2xl border border-border/60 bg-card/74 p-1.5 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:w-fit">
          <TabsTrigger value="general">{t("settings.tab.general")}</TabsTrigger>
          <TabsTrigger value="prompts">{t("settings.tab.prompts")}</TabsTrigger>
          <Button asChild variant="ghost" size="sm" className="ml-1 gap-1 rounded-xl text-muted-foreground hover:text-foreground">
            <Link href="/settings/backends">
              {t("settings.tab.backends")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.general.title")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="setting-default-backend">{t("settings.general.defaultBackend")}</Label>
                <Select
                  value={settings.analysis_defaults.default_llm_backend ?? "__none__"}
                  onValueChange={(value) =>
                    setSettings((current) => ({
                      ...current,
                      analysis_defaults: {
                        ...current.analysis_defaults,
                        default_llm_backend: value === "__none__" ? undefined : value,
                      },
                    }))
                  }
                >
                    <SelectTrigger id="setting-default-backend">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t("settings.general.followSelection")}</SelectItem>
                      {readyBackends.map((backend) => (
                        <SelectItem key={backend.name} value={backend.name}>
                          {backend.name} · {backend.model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="setting-default-task">{t("settings.general.defaultTask")}</Label>
                <Select
                  value={settings.analysis_defaults.default_task}
                  onValueChange={(value) =>
                    setSettings((current) => ({
                      ...current,
                      analysis_defaults: {
                        ...current.analysis_defaults,
                        default_task: value as TaskType,
                      },
                    }))
                  }
                >
                  <SelectTrigger id="setting-default-task">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_OPTIONS.map((task) => (
                      <SelectItem key={task.value} value={task.value}>
                        {t(task.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="setting-default-top-k">{t("settings.general.defaultTopK")}</Label>
                <Input
                  id="setting-default-top-k"
                  type="number"
                  min={1}
                  max={20}
                  value={settings.analysis_defaults.default_top_k}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      analysis_defaults: {
                        ...current.analysis_defaults,
                        default_top_k: Math.min(
                          20,
                          Math.max(1, Number.parseInt(event.target.value || "3", 10) || 3),
                        ),
                      },
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="setting-qa-temperature">{t("settings.general.qaTemperature")}</Label>
                <Input
                  id="setting-qa-temperature"
                  type="number"
                  min={0}
                  max={1}
                  step="0.05"
                  value={settings.analysis_defaults.qa_temperature}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      analysis_defaults: {
                        ...current.analysis_defaults,
                        qa_temperature: Math.min(
                          1,
                          Math.max(0, Number.parseFloat(event.target.value || "0.2") || 0.2),
                        ),
                      },
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="setting-default-analyst">{t("settings.general.defaultAnalyst")}</Label>
                <Input
                  id="setting-default-analyst"
                  value={settings.analysis_defaults.default_case_analyst}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      analysis_defaults: {
                        ...current.analysis_defaults,
                        default_case_analyst: event.target.value,
                      },
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="setting-default-client">{t("settings.general.defaultClient")}</Label>
                <Input
                  id="setting-default-client"
                  value={settings.analysis_defaults.default_case_client}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      analysis_defaults: {
                        ...current.analysis_defaults,
                        default_case_client: event.target.value,
                      },
                    }))
                  }
                />
              </div>

              <div className="space-y-2 lg:col-span-2">
                <Label htmlFor="setting-qa-max-tokens">{t("settings.general.qaMaxTokens")}</Label>
                <Input
                  id="setting-qa-max-tokens"
                  type="number"
                  min={128}
                  max={8192}
                  value={settings.analysis_defaults.qa_max_tokens}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      analysis_defaults: {
                        ...current.analysis_defaults,
                        qa_max_tokens: Math.min(
                          8192,
                          Math.max(128, Number.parseInt(event.target.value || "1200", 10) || 1200),
                        ),
                      },
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">{t("settings.general.hint")}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prompts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.prompts.title")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 xl:grid-cols-2">
              {PROMPT_FIELDS.map((field) => (
                <div key={field.key} className="rounded-2xl border border-border/60 p-4">
                  <Label htmlFor={`setting-prompt-${field.key}`} className="text-sm font-semibold">{t(field.titleKey)}</Label>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{t(field.descriptionKey)}</p>
                  <Textarea
                    id={`setting-prompt-${field.key}`}
                    className="mt-3 min-h-32"
                    value={settings.prompt_overrides[field.key]}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        prompt_overrides: {
                          ...current.prompt_overrides,
                          [field.key]: event.target.value,
                        },
                      }))
                    }
                    placeholder={t("settings.prompts.placeholder")}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

        <div className="flex flex-col gap-3 rounded-3xl border border-border/60 surface-elevated p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{t("settings.saveHint")}</p>
          <Button onClick={handleSave} disabled={isSaving} className="sm:min-w-36">
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSaving ? t("settings.saving") : t("settings.save")}
          </Button>
        </div>
      </div>
    </FadeIn>
  );
}
