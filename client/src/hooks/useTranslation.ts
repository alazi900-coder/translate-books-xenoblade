import { useCallback, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import type { TranslationSettings } from "@/components/XenobladeSettings";

interface TranslationState {
  isLoading: boolean;
  progress: number;
  status: "idle" | "uploading" | "translating" | "completed" | "error";
  error: string | null;
  translatedFileUrl: string | null;
  translationId: number | null;
  failedChunks: number;
  totalChunks: number;
}

const INITIAL_STATE: TranslationState = {
  isLoading: false,
  progress: 0,
  status: "idle",
  error: null,
  translatedFileUrl: null,
  translationId: null,
  failedChunks: 0,
  totalChunks: 0,
};

const BINARY_EXTS = new Set(["epub", "docx"]);

async function readFileAsBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, Math.min(i + chunkSize, bytes.length)) as unknown as number[]
    );
  }
  return btoa(binary);
}

export function useTranslation() {
  const [state, setState] = useState<TranslationState>(INITIAL_STATE);
  const utils = trpc.useUtils();
  const activeTranslationId = useRef<number | null>(null);

  const uploadFileMutation = trpc.file.upload.useMutation();
  const createTranslationMutation = trpc.translation.create.useMutation();
  const cancelMutation = trpc.translation.cancel.useMutation();
  const pauseMutation = trpc.translation.pause.useMutation();
  const resumeMutation = trpc.translation.resume.useMutation();

  const translateFile = useCallback(
    async (
      file: File,
      sourceLanguage: string,
      targetLanguage: string,
      settings?: TranslationSettings
    ) => {
      try {
        setState({
          ...INITIAL_STATE,
          isLoading: true,
          status: "uploading",
          progress: 5,
        });

        const fileType = file.name.split(".").pop()?.toLowerCase() || "";
        const isBinary = BINARY_EXTS.has(fileType);
        const fileContent = isBinary
          ? await readFileAsBase64(file)
          : await file.text();

        const uploadedFile = await uploadFileMutation.mutateAsync({
          fileName: file.name,
          fileType,
          fileContent,
        });

        setState(prev => ({
          ...prev,
          progress: 15,
          status: "translating",
        }));

        let pollTimer: ReturnType<typeof setInterval> | null = null;

        const translatePromise = createTranslationMutation
          .mutateAsync({
            uploadedFileId: uploadedFile.id,
            sourceLanguage,
            targetLanguage,
            fileContent,
            fileName: file.name,
            fileType,
            chunkSize: settings?.chunkSize,
            model: settings?.model,
            temperature: settings?.temperature,
            useGlossary: settings?.useGlossary !== false,
            xenoblade: settings
              ? {
                  preserveXenoTags: settings.preserveXenoTags,
                  preserveSystemTags: settings.preserveSystemTags,
                  preserveMLTags: settings.preserveMLTags,
                  excludeJapanese: settings.excludeJapanese,
                  preserveFormatting: settings.preserveFormatting,
                }
              : undefined,
          })
          .finally(() => {
            if (pollTimer) clearInterval(pollTimer);
            activeTranslationId.current = null;
          });

        // Track in-progress row so we can show progress + offer cancel.
        pollTimer = setInterval(async () => {
          try {
            const list = await utils.translation.list.fetch();
            const inProgress = list.find(
              t =>
                (t.status === "processing" || t.status === "paused") &&
                t.uploadedFileId === uploadedFile.id
            );
            if (inProgress) {
              activeTranslationId.current = inProgress.id;
              setState(prev => ({
                ...prev,
                translationId: inProgress.id,
                progress: Math.max(
                  prev.progress,
                  Math.round(inProgress.progress) || 15
                ),
                totalChunks: inProgress.totalChunks ?? 0,
              }));
            }
          } catch {
            /* ignore polling errors */
          }
        }, 1500);

        const translation = await translatePromise;

        setState({
          isLoading: false,
          progress: 100,
          status: "completed",
          error: null,
          translatedFileUrl: translation.translatedFileUrl,
          translationId: translation.id,
          failedChunks: translation.failedChunks ?? 0,
          totalChunks: translation.totalChunks ?? 0,
        });

        utils.translation.list.invalidate();
        utils.translation.stats.invalidate();

        return translation;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "حدث خطأ في الترجمة";
        setState({
          ...INITIAL_STATE,
          status: "error",
          error: errorMessage,
        });
        throw error;
      }
    },
    [uploadFileMutation, createTranslationMutation, utils]
  );

  const cancelActive = useCallback(async () => {
    if (activeTranslationId.current === null) return;
    try {
      await cancelMutation.mutateAsync({ id: activeTranslationId.current });
    } catch (err) {
      console.warn("Cancel failed:", err);
    }
  }, [cancelMutation]);

  const pauseActive = useCallback(async () => {
    if (activeTranslationId.current === null) return;
    try {
      await pauseMutation.mutateAsync({ id: activeTranslationId.current });
    } catch (err) {
      console.warn("Pause failed:", err);
    }
  }, [pauseMutation]);

  const resumeActive = useCallback(async () => {
    if (activeTranslationId.current === null) return;
    try {
      await resumeMutation.mutateAsync({ id: activeTranslationId.current });
    } catch (err) {
      console.warn("Resume failed:", err);
    }
  }, [resumeMutation]);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return {
    ...state,
    translateFile,
    cancelActive,
    pauseActive,
    resumeActive,
    reset,
  };
}
