"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { FeatureVector } from "@/lib/types";
import { useI18n } from "@/components/providers/i18n-provider";

interface FeatureDataViewerProps {
  features: FeatureVector[];
  authorMap: Record<string, string>;
  selectedAuthors: string[];
  selectedTextIds?: string[];
}

export function FeatureDataViewer({
  features,
  authorMap,
  selectedAuthors,
  selectedTextIds = [],
}: FeatureDataViewerProps) {
  const { t } = useI18n();
  const [manualOpenItems, setManualOpenItems] = useState<string[]>([]);

  const filtered = useMemo(() => {
    if (selectedAuthors.length === 0) return features;
    return features.filter((fv) => selectedAuthors.includes(authorMap[fv.text_id] ?? "unknown"));
  }, [features, authorMap, selectedAuthors]);

  useEffect(() => {
    if (selectedTextIds.length === 0) return;
    const firstId = selectedTextIds[0];
    const node = document.querySelector(`[data-text-id=\"${firstId}\"]`);
    if (node instanceof HTMLElement) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selectedTextIds]);

  const openItems = useMemo(
    () => [...new Set([...manualOpenItems, ...selectedTextIds])],
    [manualOpenItems, selectedTextIds],
  );

  if (filtered.length === 0) {
    return (
      <Card className="border-border/70 bg-card/96 shadow-none">
        <CardHeader className="border-b border-border/50">
          <CardTitle className="text-lg">{t("viewer.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("viewer.empty")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/70 bg-card/96 shadow-none">
      <CardHeader className="border-b border-border/50">
        <CardTitle className="text-lg">{t("viewer.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion
          type="multiple"
          value={openItems}
          onValueChange={(next) => setManualOpenItems(next as string[])}
          className="w-full"
        >
          {filtered.map((fv) => {
            const author = authorMap[fv.text_id] ?? "unknown";
            const highlighted = selectedTextIds.includes(fv.text_id);

            return (
              <AccordionItem
                key={fv.text_id}
                value={fv.text_id}
                data-text-id={fv.text_id}
                className={highlighted ? "rounded-md border-primary/55 bg-primary/5 px-2" : ""}
              >
                <AccordionTrigger>
                  <div className="text-left">
                    <div className="font-mono text-xs">{fv.text_id}</div>
                    <div className="text-xs text-muted-foreground">{t("viewer.group", { author })}</div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">{t("viewer.rust")}</h4>
                      <ScrollArea className="h-64 rounded-md border p-3">
                        <pre className="text-xs leading-relaxed whitespace-pre-wrap break-all">
                          {JSON.stringify(fv.rust_features, null, 2)}
                        </pre>
                      </ScrollArea>
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">{t("viewer.nlp")}</h4>
                      <ScrollArea className="h-64 rounded-md border p-3">
                        <pre className="text-xs leading-relaxed whitespace-pre-wrap break-all">
                          {JSON.stringify(fv.nlp_features, null, 2)}
                        </pre>
                      </ScrollArea>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}
