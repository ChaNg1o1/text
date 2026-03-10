"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api-client";
import type {
  ActivityEvent,
  ArtifactRecord,
  CaseMetadata,
  InteractionEdge,
  TaskParams,
  TaskType,
  TextEntry,
  UploadResponse,
} from "@/lib/types";
import { UploadZone } from "@/components/analysis/upload-zone";
import { ConfigForm } from "@/components/analysis/config-form";
import { StaggerContainer, StaggerItem } from "@/components/motion/stagger-container";
import { useI18n } from "@/components/providers/i18n-provider";
import { PageIntro, PageIntroHeader, PageIntroStat, PageIntroStatGrid } from "@/components/shell/page-intro";

export default function NewAnalysisPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [texts, setTexts] = useState<TextEntry[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([]);
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const [interactionEdges, setInteractionEdges] = useState<InteractionEdge[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const authorCount = useMemo(
    () => Array.from(new Set(texts.map((text) => text.author))).length,
    [texts],
  );

  const handleUpload = (payload: UploadResponse) => {
    setTexts(payload.texts);
    setArtifacts(payload.artifacts);
    setActivityEvents(payload.activity_events);
    setInteractionEdges(payload.interaction_edges);
  };

  const handleSubmit = async (config: {
    task: TaskType;
    llm_backend: string;
    task_params: TaskParams;
    case_metadata?: CaseMetadata;
  }) => {
    setIsSubmitting(true);
    try {
      const result = await api.createAnalysis({
        texts,
        artifacts,
        task: config.task,
        llm_backend: config.llm_backend,
        task_params: config.task_params,
        case_metadata: config.case_metadata,
        activity_events: activityEvents,
        interaction_edges: interactionEdges,
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
    <StaggerContainer className="mx-auto max-w-5xl space-y-6">
      <StaggerItem>
        <PageIntro>
          <PageIntroHeader
            eyebrow={t("analysis.newEyebrow")}
            title={t("analysis.newTitle")}
            description={t("analysis.newSubtitle")}
          />
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.22em]">{t("analysis.newStepUpload")}</Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.22em]">{t("analysis.newStepStrategy")}</Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.22em]">{t("analysis.newStepMetadata")}</Badge>
          </div>

          <PageIntroStatGrid>
            <PageIntroStat
              label={t("upload.filesCount", { count: artifacts.length || 0 })}
              value={artifacts.length}
            />
            <PageIntroStat
              label={t("upload.textsCount", { count: texts.length })}
              value={texts.length}
            />
            <PageIntroStat
              label={t("upload.authorsCount", { count: authorCount })}
              value={authorCount}
            />
          </PageIntroStatGrid>
        </PageIntro>
      </StaggerItem>

      <StaggerItem>
        <UploadZone onUpload={handleUpload} />
      </StaggerItem>

      <StaggerItem>
        <ConfigForm
          texts={texts}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
      </StaggerItem>
    </StaggerContainer>
  );
}
