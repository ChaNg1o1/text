"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import type { TextEntry, TaskType } from "@/lib/types";
import { UploadZone } from "@/components/analysis/upload-zone";
import { ConfigForm } from "@/components/analysis/config-form";
import { StaggerContainer, StaggerItem } from "@/components/motion/stagger-container";
import { useI18n } from "@/components/providers/i18n-provider";

export default function NewAnalysisPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [texts, setTexts] = useState<TextEntry[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleUpload = (uploadedTexts: TextEntry[]) => {
    setTexts(uploadedTexts);
  };

  const handleSubmit = async (config: {
    task: TaskType;
    llm_backend: string;
    compare_groups?: string[][];
  }) => {
    setIsSubmitting(true);
    try {
      const result = await api.createAnalysis({
        texts,
        task: config.task,
        llm_backend: config.llm_backend,
        compare_groups: config.compare_groups,
      });
      toast.success(t("analysis.startSuccess"), {
        description: `ID: ${result.id}`,
      });
      router.push(`/analyses/detail?id=${encodeURIComponent(result.id)}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("analysis.startFailed");
      toast.error(t("analysis.startFailed"), { description: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <StaggerContainer className="mx-auto max-w-2xl space-y-6">
      <StaggerItem>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("analysis.newTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("analysis.newSubtitle")}</p>
        </div>
      </StaggerItem>

      <StaggerItem>
        <UploadZone onUpload={handleUpload} />
      </StaggerItem>

      <StaggerItem>
        <ConfigForm
          hasTexts={texts.length > 0}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
      </StaggerItem>
    </StaggerContainer>
  );
}
