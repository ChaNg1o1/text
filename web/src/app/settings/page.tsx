"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowRight,
  BookCopy,
  Bot,
  Loader2,
  MessageSquareQuote,
  Settings2,
  ShieldCheck,
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
import { cn } from "@/lib/utils";

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

const TASK_OPTIONS: Array<{ value: TaskType; label: string }> = [
  { value: "full", label: "Full" },
  { value: "verification", label: "Verification" },
  { value: "closed_set_id", label: "Closed-set ID" },
  { value: "open_set_id", label: "Open-set ID" },
  { value: "clustering", label: "Clustering" },
  { value: "profiling", label: "Profiling" },
  { value: "sockpuppet", label: "Sockpuppet" },
];

const PROMPT_FIELDS: Array<{
  key: keyof PromptOverrides;
  title: string;
  description: string;
}> = [
  {
    key: "stylometry",
    title: "Stylometry",
    description: "用于文体学 agent 的附加指令，适合强调证据风格、输出边界或术语习惯。",
  },
  {
    key: "writing_process",
    title: "Writing Process",
    description: "用于翻译腔、机器润色、模板腔与风格伪装的附加约束。",
  },
  {
    key: "computational",
    title: "Computational",
    description: "用于统计解释层，适合强调分数措辞、校准边界和对照要求。",
  },
  {
    key: "sociolinguistics",
    title: "Sociolinguistics",
    description: "用于可观察语体、代码切换和社群语言线索的附加说明。",
  },
  {
    key: "synthesis",
    title: "Synthesis",
    description: "用于最终报告摘要，适合要求特定模板、段落结构或限制语句。",
  },
  {
    key: "qa",
    title: "QA",
    description: "用于报告问答系统，适合指定回答风格、引用习惯或答复长度。",
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
  const overviewSections = useMemo(
    () => [
      {
        value: "general" as const,
        icon: Settings2,
        title: t("settings.tab.general"),
        description: t("settings.overview.general"),
      },
      {
        value: "prompts" as const,
        icon: MessageSquareQuote,
        title: t("settings.tab.prompts"),
        description: t("settings.overview.prompts"),
      },
      {
        value: "backends" as const,
        icon: Bot,
        title: t("settings.tab.backends"),
        description: t("settings.overview.backends"),
      },
    ],
    [t],
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
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_340px]">
        <div className="relative overflow-hidden rounded-[28px] border border-border/60 bg-[linear-gradient(140deg,rgba(250,248,244,0.98),rgba(242,239,232,0.9))] shadow-[0_24px_80px_-40px_rgba(36,32,24,0.32)] dark:bg-[linear-gradient(140deg,rgba(17,24,39,0.9),rgba(6,78,59,0.2),rgba(15,23,42,0.88))]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.16),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.12),transparent_38%)]" />
          <div className="relative space-y-6 p-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                <Settings2 className="h-3.5 w-3.5" />
                {t("nav.settings")}
              </div>
              <div className="max-w-3xl space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight">{t("settings.title")}</h1>
                <p className="text-sm leading-6 text-muted-foreground">{t("settings.subtitle")}</p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {overviewSections.map((section, index) => {
                const Icon = section.icon;
                const isBackends = section.value === "backends";
                const isActive = !isBackends && activeTab === section.value;
                return (
                  <div
                    key={section.value}
                    className={cn(
                      "rounded-[22px] border p-4 text-left transition-all",
                      isActive
                        ? "border-foreground/15 bg-background/92 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.7)]"
                        : "border-border/60 bg-background/55 hover:bg-background/72",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="rounded-2xl border border-border/60 bg-background/70 p-2.5">
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <div className="mt-4">
                      <div className="text-sm font-semibold">{section.title}</div>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {section.description}
                      </p>
                    </div>
                    <div className="mt-4">
                      {isBackends ? (
                        <Button asChild variant="outline" size="sm" className="rounded-full">
                          <Link href="/settings/backends">
                            {t("settings.manageBackends")}
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setActiveTab(section.value)}
                          aria-pressed={isActive}
                          className="inline-flex items-center gap-1 text-xs font-medium text-foreground/80"
                        >
                          {isActive ? t("settings.overviewActive") : t("settings.overviewOpen")}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
          <Card className="border-border/70 bg-card/88 shadow-[0_18px_60px_-42px_rgba(15,23,42,0.65)]">
            <CardContent className="flex items-center gap-3 pt-5">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("settings.summary.ready")}
                </div>
                <div className="text-xl font-semibold">{readyBackends.length}</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-card/88 shadow-[0_18px_60px_-42px_rgba(15,23,42,0.65)]">
            <CardContent className="flex items-center gap-3 pt-5">
              <Bot className="h-5 w-5 text-blue-600" />
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("settings.summary.backends")}
                </div>
                <div className="text-xl font-semibold">{customBackends.length}</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-card/88 shadow-[0_18px_60px_-42px_rgba(15,23,42,0.65)]">
            <CardContent className="flex items-center gap-3 pt-5">
              <BookCopy className="h-5 w-5 text-amber-600" />
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("settings.summary.prompts")}
                </div>
                <div className="text-xl font-semibold">{promptOverrideCount}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as SettingsTabValue)}
        className="space-y-4"
      >
        <TabsList className="w-full justify-start overflow-x-auto overflow-y-hidden rounded-2xl border border-border/60 bg-card/74 p-1.5 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:w-fit">
          <TabsTrigger value="general">{t("settings.tab.general")}</TabsTrigger>
          <TabsTrigger value="prompts">{t("settings.tab.prompts")}</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.general.title")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("settings.general.defaultBackend")}</Label>
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
                    <SelectTrigger>
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
                <Label>{t("settings.general.defaultTask")}</Label>
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
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_OPTIONS.map((task) => (
                      <SelectItem key={task.value} value={task.value}>
                        {task.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("settings.general.defaultTopK")}</Label>
                <Input
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
                <Label>{t("settings.general.qaTemperature")}</Label>
                <Input
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
                <Label>{t("settings.general.defaultAnalyst")}</Label>
                <Input
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
                <Label>{t("settings.general.defaultClient")}</Label>
                <Input
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
                <Label>{t("settings.general.qaMaxTokens")}</Label>
                <Input
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
                  <div className="flex items-center gap-2">
                    <MessageSquareQuote className="h-4 w-4 text-muted-foreground" />
                    <div className="text-sm font-semibold">{field.title}</div>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{field.description}</p>
                  <Textarea
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

      <Card className="border-border/70 bg-card/88 shadow-[0_18px_60px_-42px_rgba(15,23,42,0.65)]">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-sky-600" />
              {t("settings.tab.backends")}
            </CardTitle>
            <p className="text-sm leading-6 text-muted-foreground">
              {t("settings.backendsDedicatedHint")}
            </p>
          </div>
          <Button asChild variant="outline" className="rounded-full sm:self-center">
            <Link href="/settings/backends">
              {t("settings.manageBackends")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-border/60 bg-background/50 p-4">
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              {t("settings.summary.ready")}
            </div>
            <div className="mt-2 text-2xl font-semibold">{readyBackends.length}</div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/50 p-4">
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              {t("settings.summary.backends")}
            </div>
            <div className="mt-2 text-2xl font-semibold">{customBackends.length}</div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/50 p-4">
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              {t("settings.summary.prompts")}
            </div>
            <div className="mt-2 text-2xl font-semibold">{promptOverrideCount}</div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 rounded-[24px] border border-border/60 bg-card/72 p-4 shadow-[0_18px_60px_-42px_rgba(15,23,42,0.6)] sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{t("settings.saveHint")}</p>
        <Button onClick={handleSave} disabled={isSaving} className="sm:min-w-36">
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSaving ? t("settings.saving") : t("settings.save")}
        </Button>
      </div>
    </div>
  );
}
