"use client";

import type { ForensicReport, TextAliasRecord } from "@/lib/types";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMemo } from "react";
import { useI18n } from "@/components/providers/i18n-provider";

interface NarrativeFlowProps {
  report: ForensicReport;
}

function replaceRawTextIds(text: string, aliases: TextAliasRecord[]): string {
  let next = text;
  for (const alias of aliases) {
    if (!alias.text_id || !alias.alias) continue;
    next = next.replaceAll(alias.text_id, alias.alias);
  }
  return next;
}

function renderAliasAwareText(text: string, aliasByAlias: Map<string, TextAliasRecord>) {
  const parts = text.split(/(\bT\d{2}\b)/g);
  return parts.map((part, index) => {
    const alias = aliasByAlias.get(part);
    if (!alias) {
      return <span key={`txt-${index}`}>{part}</span>;
    }
    return (
      <Tooltip key={`alias-${alias.alias}-${index}`}>
        <TooltipTrigger asChild>
          <span className="inline-flex rounded-md border border-border/60 bg-muted/20 px-1.5 py-0.5 font-mono text-xs text-foreground">
            {alias.alias}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="space-y-1">
            <div className="font-mono text-xs">{alias.text_id}</div>
            {alias.preview && <div className="text-xs leading-relaxed">{alias.preview}</div>}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  });
}

export function NarrativeFlow({ report }: NarrativeFlowProps) {
  const { t } = useI18n();
  const sections = report.narrative?.sections ?? [];
  const textAliases = useMemo(
    () => report.entity_aliases?.text_aliases ?? [],
    [report.entity_aliases],
  );
  const aliasByAlias = useMemo(
    () => new Map(textAliases.map((item) => [item.alias, item])),
    [textAliases],
  );

  if (sections.length === 0) {
    return (
      <div className="rounded-[22px] border border-border/60 bg-background/40 p-4 text-sm text-muted-foreground">
        {report.summary || t("report.narrativeEmpty")}
      </div>
    );
  }

  const defaultOpen = sections
    .filter((section) => section.default_expanded)
    .map((section) => section.key);

  return (
    <Accordion type="multiple" defaultValue={defaultOpen} className="rounded-[24px] border border-border/60 px-4">
      {sections.map((section) => {
        const normalizedSummary = replaceRawTextIds(section.summary, textAliases);
        const normalizedDetail = replaceRawTextIds(section.detail, textAliases);
        return (
          <AccordionItem key={section.key} value={section.key}>
            <AccordionTrigger className="text-sm font-semibold">
              {section.title || t(`report.narrativeSection.${section.key}`)}
            </AccordionTrigger>
            <AccordionContent className="space-y-3">
              <p className="text-sm leading-6 text-foreground/90">
                {renderAliasAwareText(normalizedSummary, aliasByAlias)}
              </p>
              {normalizedDetail && (
                <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                  {renderAliasAwareText(normalizedDetail, aliasByAlias)}
                </p>
              )}
              {(section.evidence_ids.length > 0 || section.result_keys.length > 0) && (
                <div className="flex flex-wrap gap-2">
                  {section.evidence_ids.map((evidenceId) => (
                    <Badge key={`${section.key}-e-${evidenceId}`} variant="outline">
                      {evidenceId}
                    </Badge>
                  ))}
                  {section.result_keys.map((resultKey) => (
                    <Badge key={`${section.key}-r-${resultKey}`} variant="secondary">
                      {resultKey}
                    </Badge>
                  ))}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
