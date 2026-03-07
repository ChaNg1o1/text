"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
        <div className="relative overflow-hidden rounded-[28px] border border-border/60 bg-[linear-gradient(140deg,rgba(250,248,244,0.98),rgba(242,239,232,0.9))] shadow-[0_24px_80px_-40px_rgba(36,32,24,0.32)] dark:bg-[linear-gradient(140deg,rgba(17,24,39,0.9),rgba(6,78,59,0.2),rgba(15,23,42,0.88))]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.16),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.1),transparent_36%)]" />
          <div className="relative space-y-5 p-6">
            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                {t("analysis.newEyebrow")}
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">{t("analysis.newTitle")}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t("analysis.newSubtitle")}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="rounded-full px-3 py-1 text-xs uppercase tracking-[0.18em]">{t("analysis.newStepUpload")}</Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1 text-xs uppercase tracking-[0.18em]">{t("analysis.newStepStrategy")}</Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1 text-xs uppercase tracking-[0.18em]">{t("analysis.newStepMetadata")}</Badge>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <Card className="border-border/70 bg-background/82 shadow-[0_18px_60px_-44px_rgba(15,23,42,0.55)]">
                <CardContent className="pt-5">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                    {t("upload.filesCount", { count: artifacts.length || 0 })}
                  </div>
                  <div className="mt-2 text-2xl font-semibold">{artifacts.length}</div>
                </CardContent>
              </Card>
              <Card className="border-border/70 bg-background/82 shadow-[0_18px_60px_-44px_rgba(15,23,42,0.55)]">
                <CardContent className="pt-5">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                    {t("upload.textsCount", { count: texts.length })}
                  </div>
                  <div className="mt-2 text-2xl font-semibold">{texts.length}</div>
                </CardContent>
              </Card>
              <Card className="border-border/70 bg-background/82 shadow-[0_18px_60px_-44px_rgba(15,23,42,0.55)]">
                <CardContent className="pt-5">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                    {t("upload.authorsCount", { count: authorCount })}
                  </div>
                  <div className="mt-2 text-2xl font-semibold">{authorCount}</div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
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
