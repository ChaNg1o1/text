"use client";

import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Upload, FileText, X, Loader2, FolderOpen } from "lucide-react";
import { api } from "@/lib/api-client";
import type { UploadResponse } from "@/lib/types";
import { FADE_VARIANTS, TRANSITION_ENTER } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/providers/i18n-provider";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";

interface UploadZoneProps {
  onUpload: (payload: UploadResponse) => void;
}

const SUPPORTED_EXTENSIONS = [".csv", ".json", ".jsonl", ".txt"];

type DirectoryInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  webkitdirectory?: string;
  directory?: string;
};

function isSupportedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function deriveSelectionLabel(
  files: File[],
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (files.length === 1) return files[0].name;

  const relativePaths = files
    .map((f) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || "")
    .filter(Boolean);

  if (relativePaths.length > 0) {
    const root = relativePaths[0].split("/")[0];
    if (root) {
      return t("upload.folderLabel", { name: root, count: files.length });
    }
  }

  return t("upload.filesLabel", { count: files.length });
}

export function UploadZone({ onUpload }: UploadZoneProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectionLabel, setSelectionLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    fileCount: number;
    textCount: number;
    authorCount: number;
    authors: string[];
  } | null>(null);

  const handleFiles = useCallback(
    async (incoming: File[]) => {
      const files = incoming.filter(isSupportedFile);

      if (files.length === 0) {
        setError(t("upload.unsupportedFiles"));
        setSelectionLabel(null);
        setPreview(null);
        onUpload({
          texts: [],
          artifacts: [],
          activity_events: [],
          interaction_edges: [],
          text_count: 0,
          author_count: 0,
          authors: [],
        });
        return;
      }

      setError(null);
      setIsUploading(true);
      setSelectionLabel(deriveSelectionLabel(files, t));

      try {
        const result = await api.uploadFiles(files);
        setPreview({
          fileCount: files.length,
          textCount: result.text_count,
          authorCount: result.author_count,
          authors: result.authors,
        });
        onUpload(result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : t("upload.failed");
        setError(message);
        setSelectionLabel(null);
        setPreview(null);
      } finally {
        setIsUploading(false);
      }
    },
    [onUpload, t],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) void handleFiles(files);
    },
    [handleFiles],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : [];
      if (files.length > 0) void handleFiles(files);
    },
    [handleFiles],
  );

  const handleClear = () => {
    setSelectionLabel(null);
    setPreview(null);
    setError(null);
    onUpload({
      texts: [],
      artifacts: [],
      activity_events: [],
      interaction_edges: [],
      text_count: 0,
      author_count: 0,
      authors: [],
    });
    if (inputRef.current) inputRef.current.value = "";
    if (folderInputRef.current) folderInputRef.current.value = "";
  };

  const openFilePicker = () => {
    inputRef.current?.click();
  };

  const openFolderPicker = () => {
    folderInputRef.current?.click();
  };

  return (
    <Card className="border-border/70 bg-card/95 shadow-sm">
      <CardContent className="pt-6">
        {!selectionLabel ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            role="region"
            aria-label={t("upload.dropHint")}
            className={`group relative overflow-hidden rounded-3xl border-2 border-dashed p-8 text-center transition-all duration-200 ${
              isDragging
                ? "scale-[1.005] border-primary bg-primary/10 shadow-sm ring-2 ring-primary/20 ring-offset-2"
                : "border-muted-foreground/25 bg-background/40 hover:border-primary/45 hover:bg-primary/5"
            }`}
          >
            <div className="relative flex flex-col items-center">
              <div className="mb-4 rounded-2xl bg-background/78 p-3">
                <Upload className="h-8 w-8 text-muted-foreground transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:scale-105" />
              </div>
              <p className="mb-1 text-base font-semibold">{t("upload.dropHint")}</p>
              <p className="max-w-xl text-sm leading-6 text-muted-foreground">{t("upload.supported")}</p>
            </div>
            <div className="relative mt-4 flex flex-wrap justify-center gap-2">
              {SUPPORTED_EXTENSIONS.map((extension) => (
                <Badge key={extension} variant="secondary" className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.22em]">
                  {extension.replace(".", "")}
                </Badge>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={openFilePicker}>
                {t("upload.chooseFile")}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={openFolderPicker}>
                <FolderOpen className="h-4 w-4" />
                {t("upload.chooseFolder")}
              </Button>
            </div>

            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".csv,.json,.jsonl,.txt"
              onChange={handleInputChange}
              aria-label={t("upload.chooseFileAria")}
              className="sr-only"
            />
            <input
              {...({ webkitdirectory: "", directory: "" } as DirectoryInputProps)}
              ref={folderInputRef}
              type="file"
              multiple
              accept=".csv,.json,.jsonl,.txt"
              onChange={handleInputChange}
              aria-label={t("upload.chooseFolderAria")}
              className="sr-only"
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-3xl bg-background/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="rounded-2xl bg-background/80 p-2.5">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <SectionEyebrow>
                      {t("upload.readyLabel")}
                    </SectionEyebrow>
                    <div className="mt-1 truncate text-sm font-semibold">{selectionLabel}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isUploading && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Button variant="ghost" size="icon" aria-label={t("upload.clear")} onClick={handleClear}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            <AnimatePresence>
              {preview && (
                <motion.div
                  key="stat-cards"
                  variants={FADE_VARIANTS}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={TRANSITION_ENTER}
                  className="grid gap-3 md:grid-cols-[repeat(3,minmax(0,1fr))]"
                >
                  {[
                    { label: t("upload.filesCount", { count: preview.fileCount }), value: preview.fileCount },
                    { label: t("upload.textsCount", { count: preview.textCount }), value: preview.textCount },
                    { label: t("upload.authorsCount", { count: preview.authorCount }), value: preview.authorCount },
                  ].map((card, index) => (
                    <motion.div
                      key={card.label}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ ...TRANSITION_ENTER, delay: index * 0.04 }}
                      className="rounded-2xl bg-background/45 p-4"
                    >
                      <SectionEyebrow>
                        {card.label}
                      </SectionEyebrow>
                      <div className="mt-2 text-2xl font-semibold">{card.value}</div>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {preview && preview.authors.length > 0 && (
                <motion.div
                  key="author-roster"
                  variants={FADE_VARIANTS}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={TRANSITION_ENTER}
                  className="rounded-2xl bg-background/35 p-4"
                >
                  <SectionEyebrow>
                    {t("upload.authorRoster")}
                  </SectionEyebrow>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {preview.authors.slice(0, 8).map((author) => (
                      <Badge key={author} variant="secondary" className="rounded-full text-xs">
                        {author}
                      </Badge>
                    ))}
                    {preview.authors.length > 8 && (
                      <Badge variant="secondary" className="rounded-full text-xs">
                        +{preview.authors.length - 8}
                      </Badge>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
