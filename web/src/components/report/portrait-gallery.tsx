"use client";

import type { ForensicReport } from "@/lib/types";
import { WritingPortraitCard } from "@/components/report/writing-portrait-card";
import { StaggerContainer, StaggerItem } from "@/components/motion/stagger-container";
import { ReportSectionIntro } from "@/components/report/report-primitives";
import { useI18n } from "@/components/providers/i18n-provider";

interface PortraitGalleryProps {
  report: ForensicReport;
}

export function PortraitGallery({ report }: PortraitGalleryProps) {
  const { t } = useI18n();
  if (report.writing_profiles.length === 0) {
    return null;
  }

  const aliases = report.entity_aliases?.text_aliases ?? [];

  return (
    <section className="space-y-6">
      <ReportSectionIntro
        kicker={t("report.portraitGallery.kicker")}
        title={t("report.portraitGallery.title")}
        description={t("report.portraitGallery.description")}
      />
      <StaggerContainer className="grid gap-6" delayChildren={0.06} staggerChildren={0.08}>
        {report.writing_profiles.map((profile) => (
          <StaggerItem key={profile.subject}>
            <WritingPortraitCard
              profile={profile}
              aliases={aliases}
            />
          </StaggerItem>
        ))}
      </StaggerContainer>
    </section>
  );
}
