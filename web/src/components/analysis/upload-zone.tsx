"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, FileText, X, Loader2, FolderOpen } from "lucide-react";
import { api } from "@/lib/api-client";
import type { UploadResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/providers/i18n-provider";

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
    <Card className="border-border/70 bg-card/90 shadow-[0_18px_60px_-42px_rgba(15,23,42,0.6)]">
      <CardContent className="pt-6">
        {!selectionLabel ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            aria-label={t("upload.dropHint")}
            className={`group relative overflow-hidden rounded-[24px] border-2 border-dashed p-8 text-center transition-all duration-200 ${
              isDragging
                ? "border-primary bg-primary/10 shadow-sm"
                : "border-muted-foreground/25 bg-[linear-gradient(140deg,rgba(250,248,244,0.82),rgba(242,239,232,0.62))] hover:border-primary/45 hover:bg-primary/5 dark:bg-[linear-gradient(140deg,rgba(15,23,42,0.62),rgba(15,23,42,0.38))]"
            }`}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.14),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.1),transparent_36%)]" />
            <div className="relative flex flex-col items-center">
              <div className="mb-4 rounded-[22px] border border-border/60 bg-background/78 p-3 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.45)]">
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
              className="sr-only"
            />
            <input
              {...({ webkitdirectory: "", directory: "" } as DirectoryInputProps)}
              ref={folderInputRef}
              type="file"
              multiple
              accept=".csv,.json,.jsonl,.txt"
              onChange={handleInputChange}
              className="sr-only"
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-[24px] border border-border/60 bg-[linear-gradient(140deg,rgba(250,248,244,0.78),rgba(242,239,232,0.58))] p-4 shadow-[0_18px_60px_-42px_rgba(15,23,42,0.45)] dark:bg-[linear-gradient(140deg,rgba(15,23,42,0.62),rgba(15,23,42,0.42))]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="rounded-2xl border border-border/60 bg-background/80 p-2.5">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                      {t("upload.readyLabel")}
                    </div>
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
            {preview && (
              <div className="grid gap-3 md:grid-cols-[repeat(3,minmax(0,1fr))]">
                <div className="rounded-2xl border border-border/60 bg-background/45 p-4">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                    {t("upload.filesCount", { count: preview.fileCount })}
                  </div>
                  <div className="mt-2 text-2xl font-semibold">{preview.fileCount}</div>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/45 p-4">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                    {t("upload.textsCount", { count: preview.textCount })}
                  </div>
                  <div className="mt-2 text-2xl font-semibold">{preview.textCount}</div>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/45 p-4">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                    {t("upload.authorsCount", { count: preview.authorCount })}
                  </div>
                  <div className="mt-2 text-2xl font-semibold">{preview.authorCount}</div>
                </div>
              </div>
            )}
            {preview && preview.authors.length > 0 && (
              <div className="rounded-2xl border border-border/60 bg-background/35 p-4">
                <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                  {t("upload.authorRoster")}
                </div>
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
              </div>
            )}
          </div>
        )}
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
