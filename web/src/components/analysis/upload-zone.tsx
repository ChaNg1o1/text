"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, FileText, X, Loader2, FolderOpen } from "lucide-react";
import { api } from "@/lib/api-client";
import type { TextEntry } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/providers/i18n-provider";

interface UploadZoneProps {
  onUpload: (texts: TextEntry[]) => void;
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
        onUpload([]);
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
        onUpload(result.texts);
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
    onUpload([]);
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
    <Card>
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
            className={`group flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-all duration-200 ${
              isDragging
                ? "border-primary bg-primary/10 shadow-sm"
                : "border-muted-foreground/25 hover:border-primary/45 hover:bg-primary/5"
            }`}
          >
            <Upload className="mb-3 h-10 w-10 text-muted-foreground transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:scale-105" />
            <p className="mb-1 text-sm font-medium">{t("upload.dropHint")}</p>
            <p className="text-xs text-muted-foreground">{t("upload.supported")}</p>
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
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium text-sm">{selectionLabel}</span>
                {isUploading && <Loader2 className="h-4 w-4 animate-spin" />}
              </div>
              <Button variant="ghost" size="icon" aria-label={t("upload.clear")} onClick={handleClear}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {preview && (
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span>{t("upload.filesCount", { count: preview.fileCount })}</span>
                <span>{t("upload.textsCount", { count: preview.textCount })}</span>
                <span>{t("upload.authorsCount", { count: preview.authorCount })}</span>
                <div className="flex gap-1">
                  {preview.authors.slice(0, 5).map((author) => (
                    <Badge key={author} variant="secondary" className="text-xs">
                      {author}
                    </Badge>
                  ))}
                  {preview.authors.length > 5 && (
                    <Badge variant="secondary" className="text-xs">
                      +{preview.authors.length - 5}
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
