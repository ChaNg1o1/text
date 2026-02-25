"use client";

import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api-client";
import type { BackendInfo, TaskType } from "@/lib/types";
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
  {
    value: "full",
    labelKey: "config.task.full.label",
    descriptionKey: "config.task.full.desc",
  },
  {
    value: "attribution",
    labelKey: "config.task.attribution.label",
    descriptionKey: "config.task.attribution.desc",
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
  task: z.enum(["full", "attribution", "profiling", "sockpuppet"] as const),
  llm_backend: z.string().min(1),
  compare_groups: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface ConfigFormProps {
  hasTexts: boolean;
  onSubmit: (values: { task: TaskType; llm_backend: string; compare_groups?: string[][] }) => void;
  isSubmitting: boolean;
}

export function ConfigForm({ hasTexts, onSubmit, isSubmitting }: ConfigFormProps) {
  const { t } = useI18n();
  const [backends, setBackends] = useState<BackendInfo[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      task: "full",
      llm_backend: "",
      compare_groups: "",
    },
  });

  useEffect(() => {
    api
      .getBackends()
      .then((res) => {
        setBackends(res.backends);
        const ready = res.backends.filter((item) => item.has_api_key);
        const defaultBackend = ready[0]?.name ?? "";
        if (defaultBackend) {
          form.setValue("llm_backend", defaultBackend, {
            shouldValidate: true,
            shouldDirty: false,
          });
        }
      })
      .catch(() => {});
  }, [form]);

  const taskValue = useWatch({ control: form.control, name: "task" });
  const backendValue = useWatch({ control: form.control, name: "llm_backend" });

  const handleSubmit = (values: FormValues) => {
    const groups = values.compare_groups
      ? values.compare_groups
          .split(";")
          .map((g) => g.split(",").map((s) => s.trim()).filter(Boolean))
          .filter((g) => g.length > 0)
      : undefined;
    onSubmit({
      task: values.task,
      llm_backend: values.llm_backend,
      compare_groups: groups,
    });
  };

  const readyBackends = backends.filter((b) => b.has_api_key);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("config.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          {/* Task Type */}
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

          {/* LLM Backend */}
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
                        <span className="text-xs text-destructive">
                          {t("config.noKey")}
                        </span>
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

          {/* Compare Groups (only for attribution) */}
          {taskValue === "attribution" && (
            <div className="space-y-2">
              <Label>{t("config.compareGroups")}</Label>
              <Input
                placeholder={t("config.comparePlaceholder")}
                {...form.register("compare_groups")}
              />
              <p className="text-xs text-muted-foreground">
                {t("config.compareHint")}
              </p>
            </div>
          )}

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
