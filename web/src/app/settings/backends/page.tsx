"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Loader2, Pencil, RefreshCw, Trash2, FlaskConical, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import type {
  BackendInfo,
  CustomBackendInfo,
  ProviderKeyStatus,
  UpsertCustomBackendRequest,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/components/providers/i18n-provider";

type ProviderKind = "openai_compatible" | "anthropic_compatible";

interface BackendFormState {
  name: string;
  provider: ProviderKind;
  model: string;
  apiBase: string;
  apiKey: string;
  apiKeyEnv: string;
}

const EMPTY_FORM: BackendFormState = {
  name: "",
  provider: "openai_compatible",
  model: "",
  apiBase: "",
  apiKey: "",
  apiKeyEnv: "",
};

export default function BackendSettingsPage() {
  const { t } = useI18n();
  const [runtimeBackends, setRuntimeBackends] = useState<BackendInfo[]>([]);
  const [customBackends, setCustomBackends] = useState<CustomBackendInfo[]>([]);
  const [providerKeys, setProviderKeys] = useState<ProviderKeyStatus[]>([]);
  const [providerKeyApiReady, setProviderKeyApiReady] = useState(true);
  const [customApiReady, setCustomApiReady] = useState(true);
  const [providerKeyInput, setProviderKeyInput] = useState<Record<ProviderKeyStatus["provider"], string>>({
    openai: "",
    anthropic: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeActionName, setActiveActionName] = useState<string | null>(null);
  const [activeProviderAction, setActiveProviderAction] = useState<ProviderKeyStatus["provider"] | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [clearStoredKey, setClearStoredKey] = useState(false);
  const [form, setForm] = useState<BackendFormState>({ ...EMPTY_FORM });

  const load = useCallback(async (showFailureToast: boolean) => {
    const [runtimeRes, customRes, providerRes] = await Promise.allSettled([
      api.getBackends(),
      api.getCustomBackends(),
      api.getProviderKeys(),
    ]);

    if (runtimeRes.status === "fulfilled") {
      setRuntimeBackends(runtimeRes.value.backends);
    }
    if (customRes.status === "fulfilled") {
      setCustomBackends(customRes.value.backends);
      setCustomApiReady(true);
    } else if (runtimeRes.status === "fulfilled") {
      const fallbackCustom = runtimeRes.value.backends
        .filter((item) => item.provider !== "built-in")
        .map<CustomBackendInfo>((item) => ({
          name: item.name,
          provider: item.provider,
          model: item.model,
          api_base: "",
          has_api_key: item.has_api_key,
        }));
      setCustomBackends(fallbackCustom);
      setCustomApiReady(false);
    } else {
      setCustomBackends([]);
      setCustomApiReady(false);
    }

    const hasOpenAi = runtimeRes.status === "fulfilled"
      ? runtimeRes.value.backends.some((item) => item.model.startsWith("openai/") && item.has_api_key)
      : false;
    const hasAnthropic = runtimeRes.status === "fulfilled"
      ? runtimeRes.value.backends.some((item) => item.model.startsWith("anthropic/") && item.has_api_key)
      : false;

    if (providerRes.status === "fulfilled") {
      setProviderKeys(providerRes.value.providers);
      setProviderKeyApiReady(true);
    } else {
      setProviderKeys([
        { provider: "openai", env_var: "OPENAI_API_KEY", has_api_key: hasOpenAi, source: hasOpenAi ? "stored" : "none" },
        { provider: "anthropic", env_var: "ANTHROPIC_API_KEY", has_api_key: hasAnthropic, source: hasAnthropic ? "stored" : "none" },
      ]);
      setProviderKeyApiReady(false);
    }

    if (runtimeRes.status === "rejected" && showFailureToast) {
      toast.error(t("settings.backends.loadFailed"));
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

  const resetForm = () => {
    setEditingName(null);
    setClearStoredKey(false);
    setForm({ ...EMPTY_FORM });
  };

  const editingBackend = useMemo(
    () => customBackends.find((item) => item.name === editingName) ?? null,
    [customBackends, editingName],
  );

  const refreshAll = async () => {
    setIsRefreshing(true);
    await load(true);
    setIsRefreshing(false);
  };

  const startEdit = (item: CustomBackendInfo) => {
    setEditingName(item.name);
    setClearStoredKey(false);
    setForm({
      name: item.name,
      provider:
        item.provider === "anthropic_compatible" ? "anthropic_compatible" : "openai_compatible",
      model: item.model,
      apiBase: item.api_base,
      apiKey: "",
      apiKeyEnv: item.api_key_env ?? "",
    });
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!customApiReady) {
      return;
    }

    const targetName = (editingName ?? form.name).trim();
    if (!targetName) {
      toast.error(t("settings.backends.invalidName"));
      return;
    }

    if (!form.provider || !form.model.trim() || !form.apiBase.trim()) {
      toast.error(t("settings.backends.invalidRequired"));
      return;
    }

    const payload: UpsertCustomBackendRequest = {
      provider: form.provider,
      model: form.model.trim(),
      api_base: form.apiBase.trim(),
      clear_api_key: false,
    };

    const apiKey = form.apiKey.trim();
    if (apiKey) {
      payload.api_key = apiKey;
    } else if (clearStoredKey) {
      payload.clear_api_key = true;
    }

    const apiKeyEnv = form.apiKeyEnv.trim();
    payload.api_key_env = apiKeyEnv || undefined;

    setIsSaving(true);
    try {
      const saved = await api.upsertCustomBackend(targetName, payload);
      toast.success(t("settings.backends.saved"), { description: saved.name });
      await load(false);
      setEditingName(saved.name);
      setClearStoredKey(false);
      setForm((prev) => ({ ...prev, name: saved.name, apiKey: "" }));
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : undefined;
      toast.error(t("settings.backends.saveFailed"), { description: detail });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!customApiReady) {
      return;
    }
    if (!window.confirm(t("settings.backends.deleteConfirm", { name }))) {
      return;
    }

    setActiveActionName(name);
    try {
      await api.deleteCustomBackend(name);
      toast.success(t("settings.backends.deleted"), { description: name });
      await load(false);
      if (editingName === name) {
        resetForm();
      }
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : undefined;
      toast.error(t("settings.backends.deleteFailed"), { description: detail });
    } finally {
      setActiveActionName(null);
    }
  };

  const handleTest = async (name: string) => {
    setActiveActionName(name);
    try {
      const result = await api.testBackend(name);
      const detail = `${result.detail}${result.latency_ms != null ? ` (${result.latency_ms}ms)` : ""}`;
      if (result.success) {
        toast.success(t("settings.backends.testSuccess"), { description: detail });
      } else {
        toast.error(t("settings.backends.testFailed"), { description: detail });
      }
      await load(false);
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : undefined;
      toast.error(t("settings.backends.testFailed"), { description: detail });
    } finally {
      setActiveActionName(null);
    }
  };

  const keyStatusLabel = (item: { has_api_key: boolean; api_key_env?: string; name?: string }) => {
    if (item.has_api_key) {
      return t("settings.backends.key.ready");
    }
    if (item.name === "local") {
      return t("settings.backends.key.unavailable");
    }
    if (item.api_key_env) {
      return t("settings.backends.key.envMissing", { env: item.api_key_env });
    }
    return t("settings.backends.key.missing");
  };

  const getProviderLabel = (provider: ProviderKeyStatus["provider"]) =>
    provider === "openai" ? t("settings.backends.provider.openai") : t("settings.backends.provider.anthropic");

  const getProviderSourceLabel = (source: ProviderKeyStatus["source"]) => {
    if (source === "env") return t("settings.backends.keyStatus.env");
    if (source === "stored") return t("settings.backends.keyStatus.stored");
    return t("settings.backends.keyStatus.none");
  };

  const saveProviderKey = async (provider: ProviderKeyStatus["provider"]) => {
    const apiKey = providerKeyInput[provider].trim();
    if (!apiKey) {
      toast.error(t("settings.backends.keyInputRequired"));
      return;
    }

    setActiveProviderAction(provider);
    try {
      await api.updateProviderKey(provider, { api_key: apiKey });
      setProviderKeyInput((prev) => ({ ...prev, [provider]: "" }));
      toast.success(t("settings.backends.keySaved"), { description: getProviderLabel(provider) });
      await load(false);
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : undefined;
      toast.error(t("settings.backends.keySaveFailed"), { description: detail });
    } finally {
      setActiveProviderAction(null);
    }
  };

  const clearProviderKey = async (provider: ProviderKeyStatus["provider"]) => {
    setActiveProviderAction(provider);
    try {
      await api.updateProviderKey(provider, { clear: true });
      setProviderKeyInput((prev) => ({ ...prev, [provider]: "" }));
      toast.success(t("settings.backends.keyCleared"), { description: getProviderLabel(provider) });
      await load(false);
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : undefined;
      toast.error(t("settings.backends.keyClearFailed"), { description: detail });
    } finally {
      setActiveProviderAction(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("settings.backends.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("settings.backends.subtitle")}</p>
        </div>
        <Button variant="outline" onClick={refreshAll} disabled={isRefreshing || isLoading}>
          {isRefreshing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {t("settings.backends.refresh")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("settings.backends.runtimeTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("settings.backends.table.name")}</TableHead>
                <TableHead>{t("settings.backends.table.provider")}</TableHead>
                <TableHead>{t("settings.backends.table.model")}</TableHead>
                <TableHead>{t("settings.backends.table.key")}</TableHead>
                <TableHead>{t("settings.backends.table.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runtimeBackends.map((item) => (
                <TableRow key={`runtime-${item.name}`}>
                  <TableCell className="font-mono text-xs">{item.name}</TableCell>
                  <TableCell>{item.provider}</TableCell>
                  <TableCell className="font-mono text-xs">{item.model}</TableCell>
                  <TableCell>
                    <Badge variant={item.has_api_key ? "default" : "secondary"}>
                      {keyStatusLabel(item)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleTest(item.name)}
                      disabled={activeActionName === item.name}
                    >
                      {activeActionName === item.name ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FlaskConical className="mr-1 h-3.5 w-3.5" />
                      )}
                      {t("settings.backends.testAction")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("settings.backends.keysTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("settings.backends.keysHint")}</p>
          {!providerKeyApiReady && (
            <p className="text-sm text-destructive">{t("settings.backends.keysApiUnavailable")}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {providerKeys.map((item) => (
            <div
              key={`provider-key-${item.provider}`}
              className="rounded-lg border p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="font-medium">{getProviderLabel(item.provider)}</div>
                <Badge variant={item.has_api_key ? "default" : "secondary"}>
                  {getProviderSourceLabel(item.source)}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  autoComplete="new-password"
                  placeholder={t("settings.backends.keyInputPlaceholder")}
                  value={providerKeyInput[item.provider]}
                  onChange={(event) =>
                    setProviderKeyInput((prev) => ({ ...prev, [item.provider]: event.target.value }))
                  }
                />
                <Button
                  type="button"
                  onClick={() => saveProviderKey(item.provider)}
                  disabled={!providerKeyApiReady || activeProviderAction === item.provider}
                >
                  {activeProviderAction === item.provider ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {t("settings.backends.keySetAction")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => clearProviderKey(item.provider)}
                  disabled={!providerKeyApiReady || activeProviderAction === item.provider}
                >
                  {t("settings.backends.keyClearAction")}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("settings.backends.customTitle")}</CardTitle>
            {!customApiReady && (
              <p className="text-sm text-destructive">{t("settings.backends.customApiUnavailable")}</p>
            )}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("settings.backends.table.name")}</TableHead>
                  <TableHead>{t("settings.backends.table.provider")}</TableHead>
                  <TableHead>{t("settings.backends.table.model")}</TableHead>
                  <TableHead>{t("settings.backends.table.key")}</TableHead>
                  <TableHead>{t("settings.backends.table.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customBackends.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      {t("settings.backends.empty")}
                    </TableCell>
                  </TableRow>
                )}
                {customBackends.map((item) => (
                  <TableRow key={`custom-${item.name}`}>
                    <TableCell className="font-mono text-xs">{item.name}</TableCell>
                    <TableCell>{item.provider}</TableCell>
                    <TableCell className="font-mono text-xs">{item.model}</TableCell>
                    <TableCell>
                      <Badge variant={item.has_api_key ? "default" : "secondary"}>
                        {keyStatusLabel(item)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEdit(item)}
                          disabled={!customApiReady}
                        >
                          <Pencil className="mr-1 h-3.5 w-3.5" />
                          {t("settings.backends.editAction")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleTest(item.name)}
                          disabled={activeActionName === item.name}
                        >
                          {activeActionName === item.name ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <FlaskConical className="mr-1 h-3.5 w-3.5" />
                          )}
                          {t("settings.backends.testAction")}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(item.name)}
                          disabled={!customApiReady || activeActionName === item.name}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          {t("settings.backends.deleteAction")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">{t("settings.backends.form.save")}</CardTitle>
            <Button type="button" variant="outline" onClick={resetForm} disabled={!customApiReady}>
              <PlusCircle className="mr-2 h-4 w-4" />
              {t("settings.backends.createNew")}
            </Button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label>{t("settings.backends.form.name")}</Label>
                <Input
                  value={form.name}
                  disabled={!customApiReady || Boolean(editingName)}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                />
                {editingName && (
                  <p className="text-xs text-muted-foreground">
                    {t("settings.backends.form.editingHint")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>{t("settings.backends.form.provider")}</Label>
                <Select
                  value={form.provider}
                  disabled={!customApiReady}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, provider: value as ProviderKind }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai_compatible">openai_compatible</SelectItem>
                    <SelectItem value="anthropic_compatible">anthropic_compatible</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("settings.backends.form.model")}</Label>
                <Input
                  value={form.model}
                  disabled={!customApiReady}
                  onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>{t("settings.backends.form.apiBase")}</Label>
                <Input
                  value={form.apiBase}
                  disabled={!customApiReady}
                  onChange={(event) => setForm((prev) => ({ ...prev, apiBase: event.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>{t("settings.backends.form.apiKey")}</Label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={form.apiKey}
                  disabled={!customApiReady}
                  onChange={(event) => setForm((prev) => ({ ...prev, apiKey: event.target.value }))}
                  placeholder="••••••••"
                />
                <p className="text-xs text-muted-foreground">{t("settings.backends.form.keyHint")}</p>
                {editingBackend?.has_api_key && (
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

              <div className="space-y-2">
                <Label>{t("settings.backends.form.apiKeyEnv")}</Label>
                <Input
                  value={form.apiKeyEnv}
                  disabled={!customApiReady}
                  onChange={(event) => setForm((prev) => ({ ...prev, apiKeyEnv: event.target.value }))}
                  placeholder="OPENAI_API_KEY"
                />
              </div>

              <Button type="submit" className="w-full" disabled={!customApiReady || isSaving || isLoading}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("settings.backends.form.save")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
