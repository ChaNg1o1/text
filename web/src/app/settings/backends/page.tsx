"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  FlaskConical,
  Loader2,
  PlusCircle,
  RefreshCcw,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import type { CustomBackendInfo, UpsertCustomBackendRequest } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/components/providers/i18n-provider";
import { AnimatePresence } from "framer-motion";
import { FadeIn } from "@/components/motion/fade-in";
import { cn } from "@/lib/utils";
import { PageIntro, PageIntroHeader, PageIntroStat, PageIntroStatGrid } from "@/components/shell/page-intro";

type ProviderKind = "openai_compatible" | "anthropic_compatible";

interface BackendFormState {
  name: string;
  provider: ProviderKind;
  modelsText: string;
  apiBase: string;
  apiKey: string;
  apiKeyEnv: string;
}

interface BackendGroup {
  groupId: string;
  rootName: string;
  primary: CustomBackendInfo;
  backends: CustomBackendInfo[];
}

const BACKEND_GROUP_SEPARATOR = "__";
const MAX_BACKEND_NAME_LEN = 64;
const EMPTY_FORM: BackendFormState = {
  name: "",
  provider: "openai_compatible",
  modelsText: "",
  apiBase: "",
  apiKey: "",
  apiKeyEnv: "",
};

function toBackendGroupRoot(name: string): string {
  const idx = name.indexOf(BACKEND_GROUP_SEPARATOR);
  return idx === -1 ? name : name.slice(0, idx);
}

function toManagedGroupId(name: string, knownNames: Set<string>): string {
  const root = toBackendGroupRoot(name);
  if (name !== root && knownNames.has(root)) {
    return root;
  }
  return name;
}

function pickPrimaryBackend(backends: CustomBackendInfo[], groupId: string): CustomBackendInfo {
  const sorted = [...backends].sort((a, b) => a.name.localeCompare(b.name));
  return (
    sorted.find((item) => item.has_api_key && item.name === groupId) ??
    sorted.find((item) => item.name === groupId) ??
    sorted.find((item) => item.has_api_key) ??
    sorted[0]
  );
}

function getSharedApiKeyEnv(backends: CustomBackendInfo[]): string {
  const envs = Array.from(
    new Set(
      backends
        .map((item) => item.api_key_env?.trim() ?? "")
        .filter(Boolean),
    ),
  );
  return envs.length === 1 ? envs[0] : "";
}

function normalizeModelList(raw: string): string[] {
  const lines = raw
    .split(/[\n,]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(lines));
}

function buildModelBackendName(root: string, model: string, used: Set<string>, fallback: number): string {
  const prefix = `${root}${BACKEND_GROUP_SEPARATOR}`;
  const maxSuffixLen = Math.max(1, MAX_BACKEND_NAME_LEN - prefix.length);
  const sanitized = model
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxSuffixLen);
  const seed = sanitized || `model-${fallback}`;

  let suffix = seed;
  let candidate = `${prefix}${suffix}`.slice(0, MAX_BACKEND_NAME_LEN);
  let n = 2;
  while (used.has(candidate)) {
    const tail = `-${n}`;
    const trimmedSeed = seed.slice(0, Math.max(1, maxSuffixLen - tail.length));
    suffix = `${trimmedSeed}${tail}`;
    candidate = `${prefix}${suffix}`.slice(0, MAX_BACKEND_NAME_LEN);
    n += 1;
  }
  used.add(candidate);
  return candidate;
}

interface BackendManagerProps {
  embedded?: boolean;
}

export function BackendManager({ embedded = false }: BackendManagerProps) {
  const { t } = useI18n();
  const [customBackends, setCustomBackends] = useState<CustomBackendInfo[]>([]);
  const [customApiReady, setCustomApiReady] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeActionName, setActiveActionName] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [deleteTargetGroupId, setDeleteTargetGroupId] = useState<string | null>(null);
  const [clearStoredKey, setClearStoredKey] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [form, setForm] = useState<BackendFormState>({ ...EMPTY_FORM });
  const hasLoadedOnceRef = useRef(false);
  const hasAutoSelectedGroupRef = useRef(false);

  const load = useCallback(async (showFailureToast: boolean) => {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const custom = await api.getCustomBackends();
        setCustomBackends(custom.backends);
        setCustomApiReady(true);
        hasLoadedOnceRef.current = true;
        return;
      } catch {
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 250));
          continue;
        }
        if (!hasLoadedOnceRef.current) {
          setCustomBackends([]);
          setCustomApiReady(false);
        }
        if (showFailureToast) {
          toast.error(t("settings.backends.loadFailed"));
        }
      }
    }
  }, [t]);

  useEffect(() => {
    const bootstrap = async () => {
      setIsLoading(true);
      await load(true);
      setIsLoading(false);
    };
    void bootstrap();
  }, [load]);

  const resetForm = useCallback(() => {
    setEditingGroupId(null);
    setClearStoredKey(false);
    setForm({ ...EMPTY_FORM });
  }, []);

  const groupedBackends = useMemo<BackendGroup[]>(() => {
    const knownNames = new Set(customBackends.map((item) => item.name));
    const map = new Map<string, CustomBackendInfo[]>();
    for (const item of customBackends) {
      const groupId = toManagedGroupId(item.name, knownNames);
      const arr = map.get(groupId) ?? [];
      arr.push(item);
      map.set(groupId, arr);
    }

    const groups: BackendGroup[] = [];
    for (const [groupId, backends] of map) {
      const primary = pickPrimaryBackend(backends, groupId);
      groups.push({
        groupId,
        rootName: groupId,
        primary,
        backends,
      });
    }
    groups.sort((a, b) => a.rootName.localeCompare(b.rootName));
    return groups;
  }, [customBackends]);

  const readyCustomCount = useMemo(
    () => customBackends.filter((item) => item.has_api_key).length,
    [customBackends],
  );

  const providerKindCount = useMemo(
    () => new Set(customBackends.map((item) => item.provider)).size,
    [customBackends],
  );

  const filteredBackendGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return groupedBackends;

    return groupedBackends.filter((group) => {
      const content = [
        group.rootName,
        group.groupId,
        ...group.backends.map((item) => item.name),
        group.primary.provider,
        group.primary.api_base,
        ...group.backends.map((item) => item.model),
      ]
        .join(" ")
        .toLowerCase();
      return content.includes(q);
    });
  }, [groupedBackends, searchQuery]);

  const startEditGroup = useCallback((groupId: string) => {
    const group = groupedBackends.find((item) => item.groupId === groupId);
    if (!group) return;

    const models = Array.from(new Set(group.backends.map((item) => item.model).filter(Boolean)));
    setEditingGroupId(group.groupId);
    setClearStoredKey(false);
    setForm({
      name: group.rootName,
      provider:
        group.primary.provider === "anthropic_compatible" ? "anthropic_compatible" : "openai_compatible",
      modelsText: models.join("\n"),
      apiBase: group.primary.api_base,
      apiKey: "",
      apiKeyEnv: getSharedApiKeyEnv(group.backends),
    });
  }, [groupedBackends]);

  useEffect(() => {
    if (isLoading) return;
    if (groupedBackends.length === 0) {
      if (editingGroupId) resetForm();
      hasAutoSelectedGroupRef.current = false;
      return;
    }
    const hasEditingGroup = editingGroupId
      ? groupedBackends.some((group) => group.groupId === editingGroupId)
      : false;
    if (editingGroupId && !hasEditingGroup) {
      resetForm();
      return;
    }
    if (!editingGroupId && !hasAutoSelectedGroupRef.current) {
      startEditGroup(groupedBackends[0].groupId);
      hasAutoSelectedGroupRef.current = true;
    }
  }, [editingGroupId, groupedBackends, isLoading, resetForm, startEditGroup]);

  const editingRootName = useMemo(() => {
    const formName = form.name.trim();
    if (formName) return formName;
    if (editingGroupId) {
      const group = groupedBackends.find((item) => item.groupId === editingGroupId);
      if (group) return group.rootName;
    }
    return "";
  }, [editingGroupId, form.name, groupedBackends]);

  const editingGroup = useMemo(
    () => groupedBackends.find((group) => group.groupId === editingGroupId) ?? null,
    [editingGroupId, groupedBackends],
  );
  const deleteTargetGroup = useMemo(
    () => groupedBackends.find((group) => group.groupId === deleteTargetGroupId) ?? null,
    [deleteTargetGroupId, groupedBackends],
  );
  const isEditing = Boolean(editingGroup);
  const hasExistingKeyBinding = useMemo(
    () => (editingGroup?.backends ?? []).some((item) => Boolean(item.api_key_env?.trim()) || item.has_api_key),
    [editingGroup],
  );

  const providerLabel = useCallback((provider: string) => {
    if (provider === "anthropic_compatible") {
      return t("settings.backends.provider.anthropic");
    }
    if (provider === "openai_compatible") {
      return t("settings.backends.provider.openai");
    }
    return provider;
  }, [t]);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!customApiReady) return;

    const targetRootName = form.name.trim();
    const models = normalizeModelList(form.modelsText);
    const apiBase = form.apiBase.trim();
    const apiKey = form.apiKey.trim();
    const apiKeyEnv = form.apiKeyEnv.trim();
    const sharedApiKeyEnv = getSharedApiKeyEnv(editingGroup?.backends ?? []);
    const existingNames = new Set(editingGroup?.backends.map((item) => item.name) ?? []);
    const inheritFromName = !apiKey && !clearStoredKey
      ? (
        editingGroup?.backends.find((item) => item.has_api_key)?.name ??
        editingGroup?.primary.name ??
        null
      )
      : null;

    if (!targetRootName) {
      toast.error(t("settings.backends.invalidName"));
      return;
    }
    if (!isEditing && targetRootName.includes(BACKEND_GROUP_SEPARATOR)) {
      toast.error(t("settings.backends.invalidGroupedName"));
      return;
    }
    if (!form.provider || !apiBase || models.length === 0) {
      toast.error(t("settings.backends.invalidRequired"));
      return;
    }
    if (apiKey && apiKeyEnv) {
      toast.error(t("settings.backends.invalidAuthChoice"));
      return;
    }

    setIsSaving(true);
    try {
      const desiredNames: string[] = [];
      const usedNames = new Set<string>();
      usedNames.add(targetRootName);

      for (const [idx, model] of models.entries()) {
        const backendName = idx === 0
          ? targetRootName
          : buildModelBackendName(targetRootName, model, usedNames, idx + 1);

        const payload: UpsertCustomBackendRequest = {
          provider: form.provider,
          model,
          api_base: apiBase,
          clear_api_key: false,
        };

        if (apiKey) {
          payload.api_key = apiKey;
          payload.api_key_env = null;
        } else if (apiKeyEnv) {
          payload.api_key = null;
          payload.api_key_env = apiKeyEnv;
        } else if (clearStoredKey) {
          payload.clear_api_key = true;
          payload.api_key_env = null;
        } else if (sharedApiKeyEnv) {
          payload.api_key_env = sharedApiKeyEnv;
        } else if (inheritFromName && !existingNames.has(backendName)) {
          payload.inherit_api_key_from = inheritFromName;
        }

        await api.upsertCustomBackend(backendName, payload);
        desiredNames.push(backendName);
      }

      const staleNames = (editingGroup?.backends ?? [])
        .map((item) => item.name)
        .filter((name) => !desiredNames.includes(name));

      for (const staleName of staleNames) {
        await api.deleteCustomBackend(staleName);
      }

      toast.success(t("settings.backends.saved"), {
        description: `${targetRootName} (${t("settings.backends.modelsCount", { count: models.length })})`,
      });

      await load(false);
      setEditingGroupId(targetRootName);
      setClearStoredKey(false);
      setForm((prev) => ({
        ...prev,
        name: targetRootName,
        provider: form.provider,
        apiBase,
        modelsText: models.join("\n"),
        apiKey: "",
        apiKeyEnv,
      }));
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : undefined;
      toast.error(t("settings.backends.saveFailed"), { description: detail });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!customApiReady) return;
    const group = groupedBackends.find((item) => item.groupId === groupId);
    if (!group) return;
    const nextGroupId = groupedBackends.find((item) => item.groupId !== groupId)?.groupId ?? null;
    setActiveActionName(groupId);
    try {
      const targets = group.backends.map((item) => item.name);

      for (const name of targets) {
        await api.deleteCustomBackend(name);
      }

      toast.success(t("settings.backends.deleted"), { description: group.rootName });
      setDeleteTargetGroupId(null);
      await load(false);
      if (editingGroupId === groupId) {
        if (nextGroupId) {
          startEditGroup(nextGroupId);
        } else {
          resetForm();
        }
      }
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : undefined;
      toast.error(t("settings.backends.deleteFailed"), { description: detail });
    } finally {
      setActiveActionName(null);
    }
  };

  const handleTestGroup = async (groupId: string) => {
    const group = groupedBackends.find((item) => item.groupId === groupId);
    if (!group) return;
    const targets = [...group.backends].sort((a, b) => {
      if (a.name === group.groupId) return -1;
      if (b.name === group.groupId) return 1;
      return a.name.localeCompare(b.name);
    });

    setActiveActionName(groupId);
    try {
      const results: Array<{
        backend: CustomBackendInfo;
        success: boolean;
        detail: string;
        latency_ms?: number;
      }> = [];

      for (const target of targets) {
        try {
          const result = await api.testBackend(target.name);
          results.push({
            backend: target,
            success: result.success,
            detail: result.detail,
            latency_ms: result.latency_ms,
          });
        } catch (error: unknown) {
          results.push({
            backend: target,
            success: false,
            detail: error instanceof Error ? error.message : t("settings.backends.testFailed"),
          });
        }
      }

      const failures = results.filter((item) => !item.success);
      if (results.length === 1) {
        const [result] = results;
        const detail = `${result.detail}${result.latency_ms != null ? ` (${result.latency_ms}ms)` : ""}`;
        if (result.success) {
          toast.success(t("settings.backends.testSuccess"), { description: detail });
        } else {
          toast.error(t("settings.backends.testFailed"), { description: detail });
        }
      } else if (failures.length === 0) {
        toast.success(t("settings.backends.testSuccess"), {
          description: t("settings.backends.testSuccessMulti", {
            passed: results.length,
            total: results.length,
          }),
        });
      } else {
        const firstFailure = failures[0];
        toast.error(t("settings.backends.testFailed"), {
          description: t("settings.backends.testFailedMulti", {
            passed: results.length - failures.length,
            total: results.length,
            model: firstFailure.backend.model,
            detail: firstFailure.detail,
          }),
        });
      }
      await load(false);
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : undefined;
      toast.error(t("settings.backends.testFailed"), { description: detail });
    } finally {
      setActiveActionName(null);
    }
  };

  const keyStatusLabel = (hasApiKey: boolean) => {
    if (hasApiKey) return t("settings.backends.key.ready");
    return t("settings.backends.key.missing");
  };

  return (
    <div className={cn("space-y-6", embedded && "space-y-4")}>
      {!embedded && (
        <PageIntro>
          <PageIntroHeader
            title={t("settings.backends.title")}
            description={t("settings.backends.subtitle")}
            actions={(
              <Button
                type="button"
                variant="outline"
                onClick={() => void load(true)}
                disabled={isLoading}
                className="rounded-full bg-background/80"
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="mr-2 h-4 w-4" />
                )}
                {t("settings.backends.refresh")}
              </Button>
            )}
            bodyClassName="max-w-2xl"
          />
          <Button asChild variant="ghost" size="sm" className="-mt-2 w-fit rounded-full">
            <Link href="/settings">
              <ArrowLeft className="h-4 w-4" />
              {t("common.back")}
            </Link>
          </Button>
          <PageIntroStatGrid>
            <PageIntroStat
              label={t("settings.backends.summary.custom")}
              value={<span className="tabular-nums">{customBackends.length}</span>}
              accentClassName="border-sky-500/30"
            />
            <PageIntroStat
              label={t("settings.backends.summary.ready")}
              value={<span className="tabular-nums">{readyCustomCount}</span>}
              accentClassName="border-emerald-500/30"
            />
            <PageIntroStat
              label={t("settings.backends.summary.providers")}
              value={<span className="tabular-nums">{providerKindCount}</span>}
              accentClassName="border-amber-500/30"
            />
          </PageIntroStatGrid>
        </PageIntro>
      )}

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="border-border/60 bg-card/80 shadow-[0_18px_40px_-30px_rgba(0,0,0,0.5)] backdrop-blur-sm xl:sticky xl:top-20 xl:self-start">
          <CardHeader className="space-y-3 pb-3">
            <CardTitle className="text-base">{t("settings.backends.customTitle")}</CardTitle>
            <AnimatePresence>
            {!customApiReady && (
              <FadeIn key="api-warning">
              <p className="text-sm text-destructive">{t("settings.backends.customApiUnavailable")}</p>
              </FadeIn>
            )}
            </AnimatePresence>
            {embedded && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void load(true)}
                disabled={isLoading}
                className="w-fit"
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="mr-2 h-4 w-4" />
                )}
                {t("settings.backends.refresh")}
              </Button>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                aria-label={t("settings.backends.searchPlaceholder")}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("settings.backends.searchPlaceholder")}
                className="pl-9"
              />
            </div>
          </CardHeader>

          <CardContent className="space-y-3 pt-0">
            <Button type="button" className="w-full justify-start" variant="outline" onClick={resetForm}>
              <PlusCircle className="mr-2 h-4 w-4" />
              {t("settings.backends.createNew")}
            </Button>

            <div className="space-y-2 pr-1 xl:max-h-[32rem] xl:overflow-y-auto">
              {filteredBackendGroups.length === 0 && (
                <div className="rounded-lg border border-dashed border-border/80 px-3 py-4 text-sm text-muted-foreground">
                  {groupedBackends.length === 0
                    ? t("settings.backends.empty")
                    : t("settings.backends.noSearchResults")}
                </div>
              )}

              {filteredBackendGroups.map((group) => {
                const hasApiKey = group.backends.every((item) => item.has_api_key);
                const isActive = isEditing && editingGroupId === group.groupId;
                return (
                  <button
                    key={group.groupId}
                    type="button"
                    onClick={() => startEditGroup(group.groupId)}
                    className={cn(
                      "w-full rounded-2xl border px-3 py-3 text-left transition-colors",
                      isActive
                        ? "border-sky-500/35 bg-sky-500/8"
                        : "border-border/70 bg-card/50 hover:border-border hover:bg-background/60",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{group.rootName}</p>
                      <Badge variant={hasApiKey ? "default" : "secondary"}>
                        {keyStatusLabel(hasApiKey)}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{providerLabel(group.primary.provider)}</p>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span className="truncate">{t("settings.backends.modelsCount", { count: group.backends.length })}</span>
                      <span className="truncate font-mono" title={group.primary.api_base}>
                        {group.primary.api_base}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/80 shadow-[0_18px_40px_-30px_rgba(0,0,0,0.5)] backdrop-blur-sm">
          <CardHeader className="border-b border-border/60">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-lg">
                  {isEditing
                    ? t("settings.backends.editorTitleEdit", { name: editingRootName })
                    : t("settings.backends.editorTitleCreate")}
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isEditing ? t("settings.backends.form.editingHint") : t("settings.backends.editorHint")}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {isEditing && editingGroupId && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleTestGroup(editingGroupId)}
                    disabled={activeActionName === editingGroupId}
                  >
                    {activeActionName === editingGroupId ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <FlaskConical className="mr-2 h-4 w-4" />
                    )}
                    {t("settings.backends.testAction")}
                  </Button>
                )}
                {isEditing && editingGroupId && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setDeleteTargetGroupId(editingGroupId)}
                    disabled={!customApiReady || activeActionName === editingGroupId}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t("settings.backends.deleteAction")}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-6">
            <form onSubmit={handleSave} className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="backend-name">{t("settings.backends.form.name")}</Label>
                  <Input
                    id="backend-name"
                    value={form.name}
                    disabled={!customApiReady || isEditing}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  />
                  {!isEditing && (
                    <p className="text-xs text-muted-foreground">{t("settings.backends.form.nameHint")}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="backend-provider">{t("settings.backends.form.provider")}</Label>
                  <Select
                    value={form.provider}
                    disabled={!customApiReady}
                    onValueChange={(value) =>
                      setForm((prev) => ({ ...prev, provider: value as ProviderKind }))
                    }
                  >
                    <SelectTrigger id="backend-provider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai_compatible">{providerLabel("openai_compatible")}</SelectItem>
                      <SelectItem value="anthropic_compatible">{providerLabel("anthropic_compatible")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="backend-models">{t("settings.backends.form.models")}</Label>
                <Textarea
                  id="backend-models"
                  value={form.modelsText}
                  rows={6}
                  placeholder={t("settings.backends.form.modelsPlaceholder")}
                  disabled={!customApiReady}
                  onChange={(event) => setForm((prev) => ({ ...prev, modelsText: event.target.value }))}
                />
                <p className="text-xs text-muted-foreground">{t("settings.backends.form.modelsHint")}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="backend-api-base">{t("settings.backends.form.apiBase")}</Label>
                <Input
                  id="backend-api-base"
                  value={form.apiBase}
                  disabled={!customApiReady}
                  onChange={(event) => setForm((prev) => ({ ...prev, apiBase: event.target.value }))}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="backend-api-key">{t("settings.backends.form.apiKey")}</Label>
                  <Input
                    id="backend-api-key"
                    type="password"
                    autoComplete="new-password"
                    value={form.apiKey}
                    disabled={!customApiReady}
                    onChange={(event) => setForm((prev) => ({ ...prev, apiKey: event.target.value }))}
                    placeholder="••••••••"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="backend-api-key-env">{t("settings.backends.form.apiKeyEnv")}</Label>
                  <Input
                    id="backend-api-key-env"
                    value={form.apiKeyEnv}
                    disabled={!customApiReady}
                    onChange={(event) => setForm((prev) => ({ ...prev, apiKeyEnv: event.target.value }))}
                    placeholder={t("settings.backends.form.apiKeyEnvPlaceholder")}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{t("settings.backends.form.keyHint")}</p>
                {hasExistingKeyBinding && (
                  <Button
                    type="button"
                    variant={clearStoredKey ? "default" : "outline"}
                    disabled={!customApiReady}
                    onClick={() => setClearStoredKey((prev) => !prev)}
                  >
                    {t("settings.backends.form.clearStoredKey")}
                  </Button>
                )}
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={!customApiReady || isSaving || isLoading}>
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("settings.backends.form.save")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!deleteTargetGroupId} onOpenChange={() => setDeleteTargetGroupId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.backends.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("settings.backends.deleteConfirm", {
                name: deleteTargetGroup?.rootName ?? "",
                count: deleteTargetGroup?.backends.length ?? 0,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTargetGroupId(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTargetGroupId && void handleDeleteGroup(deleteTargetGroupId)}
              disabled={!deleteTargetGroupId || activeActionName === deleteTargetGroupId}
            >
              {activeActionName === deleteTargetGroupId && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function BackendSettingsPage() {
  return <BackendManager />;
}
