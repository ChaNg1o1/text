"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Loader2,
  Pencil,
  Trash2,
  FlaskConical,
  PlusCircle,
  Layers3,
  Server,
  ShieldCheck,
  RefreshCcw,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import type {
  CustomBackendInfo,
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
}

const EMPTY_FORM: BackendFormState = {
  name: "",
  provider: "openai_compatible",
  model: "",
  apiBase: "",
  apiKey: "",
};

export default function BackendSettingsPage() {
  const { t } = useI18n();
  const [customBackends, setCustomBackends] = useState<CustomBackendInfo[]>([]);
  const [customApiReady, setCustomApiReady] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeActionName, setActiveActionName] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [clearStoredKey, setClearStoredKey] = useState(false);
  const [form, setForm] = useState<BackendFormState>({ ...EMPTY_FORM });
  const hasLoadedOnceRef = useRef(false);

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
        // Keep previously loaded list when transient calls fail while analysis is busy.
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

  const resetForm = () => {
    setEditingName(null);
    setClearStoredKey(false);
    setForm({ ...EMPTY_FORM });
  };

  const editingBackend = useMemo(
    () => customBackends.find((item) => item.name === editingName) ?? null,
    [customBackends, editingName],
  );
  const readyCustomCount = useMemo(
    () => customBackends.filter((item) => item.has_api_key).length,
    [customBackends],
  );
  const providerKindCount = useMemo(
    () => new Set(customBackends.map((item) => item.provider)).size,
    [customBackends],
  );

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

  const keyStatusLabel = (item: { has_api_key: boolean }) => {
    if (item.has_api_key) {
      return t("settings.backends.key.ready");
    }
    return t("settings.backends.key.missing");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("settings.backends.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("settings.backends.subtitle")}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void load(true)}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCcw className="mr-2 h-4 w-4" />
          )}
          {t("settings.backends.refresh")}
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-3 py-4 sm:grid-cols-3">
          <div className="rounded-lg border border-border/70 bg-card/60 px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Server className="h-3.5 w-3.5" />
              {t("settings.backends.summary.custom")}
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">{customBackends.length}</div>
          </div>
          <div className="rounded-lg border border-border/70 bg-card/60 px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              {t("settings.backends.summary.ready")}
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">{readyCustomCount}</div>
          </div>
          <div className="rounded-lg border border-border/70 bg-card/60 px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Layers3 className="h-3.5 w-3.5" />
              {t("settings.backends.summary.providers")}
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">{providerKindCount}</div>
          </div>
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
                  <TableHead>{t("settings.backends.table.apiBase")}</TableHead>
                  <TableHead>{t("settings.backends.table.key")}</TableHead>
                  <TableHead>{t("settings.backends.table.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customBackends.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      {t("settings.backends.empty")}
                    </TableCell>
                  </TableRow>
                )}
                {customBackends.map((item) => (
                  <TableRow key={`custom-${item.name}`}>
                    <TableCell className="font-mono text-xs">{item.name}</TableCell>
                    <TableCell>{item.provider}</TableCell>
                    <TableCell className="font-mono text-xs">{item.model}</TableCell>
                    <TableCell className="max-w-56 truncate font-mono text-xs" title={item.api_base}>
                      {item.api_base}
                    </TableCell>
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

        <Card className="lg:sticky lg:top-20 lg:self-start">
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
                  placeholder={t("settings.backends.form.modelInputPlaceholder")}
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
