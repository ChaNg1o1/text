"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api-client";
import type { BackendInfo, CaseMetadata, TaskParams, TaskType, TextEntry } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/components/providers/i18n-provider";

const TASK_OPTIONS: {
  value: TaskType;
  labelKey: string;
  descriptionKey: string;
}[] = [
  { value: "full", labelKey: "config.task.full.label", descriptionKey: "config.task.full.desc" },
  {
    value: "verification",
    labelKey: "config.task.verification.label",
    descriptionKey: "config.task.verification.desc",
  },
  {
    value: "closed_set_id",
    labelKey: "config.task.closed_set_id.label",
    descriptionKey: "config.task.closed_set_id.desc",
  },
  {
    value: "open_set_id",
    labelKey: "config.task.open_set_id.label",
    descriptionKey: "config.task.open_set_id.desc",
  },
  {
    value: "clustering",
    labelKey: "config.task.clustering.label",
    descriptionKey: "config.task.clustering.desc",
  },
  {
    value: "profiling",
    labelKey: "config.task.profiling.label",
    descriptionKey: "config.task.profiling.desc",
  },
  {
    value: "sockpuppet",
    labelKey: "config.task.sockpuppet.label",
    descriptionKey: "config.task.sockpuppet.desc",
  },
];

const formSchema = z.object({
  task: z.enum(
    [
      "full",
      "verification",
      "closed_set_id",
      "open_set_id",
      "clustering",
      "profiling",
      "sockpuppet",
    ] as const,
  ),
  llm_backend: z.string().min(1),
  questioned_text_ids: z.string().optional(),
  reference_author_ids: z.string().optional(),
  candidate_author_ids: z.string().optional(),
  cluster_text_ids: z.string().optional(),
  subject_ids: z.string().optional(),
  account_ids: z.string().optional(),
  top_k: z.string().optional(),
  case_id: z.string().optional(),
  client: z.string().optional(),
  analyst: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface ConfigFormProps {
  texts: TextEntry[];
  onSubmit: (values: {
    task: TaskType;
    llm_backend: string;
    task_params: TaskParams;
    case_metadata?: CaseMetadata;
  }) => void;
  isSubmitting: boolean;
}

function splitCsv(value?: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function ConfigForm({ texts, onSubmit, isSubmitting }: ConfigFormProps) {
  const { t } = useI18n();
  const [backends, setBackends] = useState<BackendInfo[]>([]);
  const textIds = useMemo(() => texts.map((text) => text.id), [texts]);
  const authors = useMemo(
    () => Array.from(new Set(texts.map((text) => text.author))).sort(),
    [texts],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      task: "full",
      llm_backend: "",
      questioned_text_ids: "",
      reference_author_ids: "",
      candidate_author_ids: "",
      cluster_text_ids: "",
      subject_ids: "",
      account_ids: "",
      top_k: "3",
      case_id: "",
      client: "",
      analyst: "",
      notes: "",
    },
  });

  useEffect(() => {
    Promise.allSettled([api.getBackends(), api.getSettings()]).then((results) => {
      const [backendsResult, settingsResult] = results;

      if (backendsResult.status === "fulfilled") {
        setBackends(backendsResult.value.backends);
      }

      const ready =
        backendsResult.status === "fulfilled"
          ? backendsResult.value.backends.filter((item) => item.has_api_key)
          : [];

      if (settingsResult.status === "fulfilled") {
        const defaultBackend =
          settingsResult.value.analysis_defaults.default_llm_backend ?? ready[0]?.name ?? "";
        if (defaultBackend) {
          form.setValue("llm_backend", defaultBackend, {
            shouldValidate: true,
            shouldDirty: false,
          });
        }
        form.setValue("task", settingsResult.value.analysis_defaults.default_task, {
          shouldValidate: true,
          shouldDirty: false,
        });
        form.setValue("top_k", String(settingsResult.value.analysis_defaults.default_top_k), {
          shouldValidate: false,
          shouldDirty: false,
        });
        form.setValue("analyst", settingsResult.value.analysis_defaults.default_case_analyst, {
          shouldValidate: false,
          shouldDirty: false,
        });
        form.setValue("client", settingsResult.value.analysis_defaults.default_case_client, {
          shouldValidate: false,
          shouldDirty: false,
        });
        return;
      }

      if (ready[0]?.name) {
        form.setValue("llm_backend", ready[0].name, {
          shouldValidate: true,
          shouldDirty: false,
        });
      }
    });
  }, [form]);

  const taskValue = useWatch({ control: form.control, name: "task" });
  const backendValue = useWatch({ control: form.control, name: "llm_backend" });

  const handleSubmit = (values: FormValues) => {
    const caseMetadata: CaseMetadata = {
      case_id: values.case_id?.trim() || undefined,
      client: values.client?.trim() || undefined,
      analyst: values.analyst?.trim() || undefined,
      notes: values.notes?.trim() || undefined,
    };
    onSubmit({
      task: values.task,
      llm_backend: values.llm_backend,
      task_params: {
        questioned_text_ids: splitCsv(values.questioned_text_ids),
        reference_author_ids: splitCsv(values.reference_author_ids),
        candidate_author_ids: splitCsv(values.candidate_author_ids),
        cluster_text_ids: splitCsv(values.cluster_text_ids),
        subject_ids: splitCsv(values.subject_ids),
        account_ids: splitCsv(values.account_ids),
        top_k: Math.min(20, Math.max(1, Number.parseInt(values.top_k || "3", 10) || 3)),
      },
      case_metadata:
        caseMetadata.case_id || caseMetadata.client || caseMetadata.analyst || caseMetadata.notes
          ? caseMetadata
          : undefined,
    });
  };

  const readyBackends = backends.filter((b) => b.has_api_key);
  const hasTexts = texts.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("config.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
            <div>{t("config.availableTextIds", { ids: textIds.join(", ") || "-" })}</div>
            <div className="mt-1">{t("config.availableAuthors", { authors: authors.join(", ") || "-" })}</div>
          </div>

          <div className="space-y-2">
            <Label>{t("config.taskType")}</Label>
            <Select
              value={taskValue}
              onValueChange={(v) => form.setValue("task", v as TaskType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div>
                      <div className="font-medium">{t(opt.labelKey)}</div>
                      <div className="text-xs text-muted-foreground">{t(opt.descriptionKey)}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("config.llmBackend")}</Label>
            <Select
              value={backendValue || ""}
              onValueChange={(v) => form.setValue("llm_backend", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {backends.map((b) => (
                  <SelectItem key={b.name} value={b.name} disabled={!b.has_api_key}>
                    <div className="flex items-center gap-2">
                      <span>{b.name}</span>
                      <span className="text-xs text-muted-foreground">{b.model}</span>
                      {!b.has_api_key && (
                        <span className="text-xs text-destructive">{t("config.noKey")}</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {readyBackends.length === 0 && (
              <p className="text-xs text-destructive">{t("config.noBackend")}</p>
            )}
          </div>

          {(taskValue === "verification" ||
            taskValue === "closed_set_id" ||
            taskValue === "open_set_id") && (
            <div className="space-y-2">
              <Label>{t("config.questionedTextIds")}</Label>
              <Input
                placeholder={t("config.questionedPlaceholder")}
                {...form.register("questioned_text_ids")}
              />
            </div>
          )}

          {taskValue === "verification" && (
            <div className="space-y-2">
              <Label>{t("config.referenceAuthors")}</Label>
              <Input
                placeholder={t("config.referenceAuthorsPlaceholder")}
                {...form.register("reference_author_ids")}
              />
            </div>
          )}

          {(taskValue === "closed_set_id" || taskValue === "open_set_id") && (
            <>
              <div className="space-y-2">
                <Label>{t("config.candidateAuthors")}</Label>
                <Input
                  placeholder={t("config.candidateAuthorsPlaceholder")}
                  {...form.register("candidate_author_ids")}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("config.topK")}</Label>
                <Input type="number" min={1} max={20} {...form.register("top_k")} />
              </div>
            </>
          )}

          {taskValue === "clustering" && (
            <div className="space-y-2">
              <Label>{t("config.clusterTextIds")}</Label>
              <Input
                placeholder={t("config.clusterTextIdsPlaceholder")}
                {...form.register("cluster_text_ids")}
              />
              <p className="text-xs text-muted-foreground">{t("config.optionalIdsHint")}</p>
            </div>
          )}

          {taskValue === "profiling" && (
            <div className="space-y-2">
              <Label>{t("config.subjectIds")}</Label>
              <Input
                placeholder={t("config.subjectIdsPlaceholder")}
                {...form.register("subject_ids")}
              />
              <p className="text-xs text-muted-foreground">{t("config.optionalIdsHint")}</p>
            </div>
          )}

          {taskValue === "sockpuppet" && (
            <div className="space-y-2">
              <Label>{t("config.accountIds")}</Label>
              <Input
                placeholder={t("config.accountIdsPlaceholder")}
                {...form.register("account_ids")}
              />
            </div>
          )}

          <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
            <div className="text-sm font-semibold">{t("config.caseMetadataTitle")}</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("config.caseId")}</Label>
                <Input placeholder="CASE-2026-001" {...form.register("case_id")} />
              </div>
              <div className="space-y-2">
                <Label>{t("config.caseClient")}</Label>
                <Input placeholder="Client / requester" {...form.register("client")} />
              </div>
              <div className="space-y-2">
                <Label>{t("config.caseAnalyst")}</Label>
                <Input placeholder="Analyst" {...form.register("analyst")} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{t("config.caseNotes")}</Label>
                <Input
                  placeholder={t("config.caseNotesPlaceholder")}
                  {...form.register("notes")}
                />
              </div>
            </div>
          </div>

          <Button
            type="submit"
            disabled={!hasTexts || isSubmitting || readyBackends.length === 0}
            className="w-full"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? t("config.starting") : t("config.start")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
