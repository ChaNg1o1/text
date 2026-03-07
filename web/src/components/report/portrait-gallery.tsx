"use client";

import type { ForensicReport } from "@/lib/types";
import { WritingPortraitCard } from "@/components/report/writing-portrait-card";

interface PortraitGalleryProps {
  report: ForensicReport;
}

export function PortraitGallery({ report }: PortraitGalleryProps) {
  if (report.writing_profiles.length === 0) {
    return null;
  }

  const aliases = report.entity_aliases?.text_aliases ?? [];

  return (
    <section className="space-y-6">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          Portrait Gallery
        </div>
        <h3 className="mt-1 text-2xl font-semibold">写作习惯画像</h3>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          这里展示每个主体最稳定的写作习惯、只可谨慎解读的过程线索，以及需要单独复核的异常点。
        </p>
      </div>
      <div className="grid gap-6">
        {report.writing_profiles.map((profile) => (
          <WritingPortraitCard
            key={profile.subject}
            profile={profile}
            aliases={aliases}
          />
        ))}
      </div>
    </section>
  );
}
