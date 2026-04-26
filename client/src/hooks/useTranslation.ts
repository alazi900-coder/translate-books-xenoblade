import { useCallback, useState } from "react";
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
}

const INITIAL_STATE: TranslationState = {
  isLoading: false,
  progress: 0,
  status: "idle",
  error: null,
  translatedFileUrl: null,
  translationId: null,
  failedChunks: 0,
};

export function useTranslation() {
  const [state, setState] = useState<TranslationState>(INITIAL_STATE);
  const utils = trpc.useUtils();

  const uploadFileMutation = trpc.file.upload.useMutation();
  const createTranslationMutation = trpc.translation.create.useMutation();

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

        const fileContent = await file.text();
        const fileType = file.name.split(".").pop()?.toLowerCase() || "";

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

        // Poll the translation row while the mutation is in-flight to surface
        // server-side progress to the UI.
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
          });

        // We don't have the translation id yet — list-poll for the latest pending one.
        pollTimer = setInterval(async () => {
          try {
            const list = await utils.translation.list.fetch();
            const inProgress = list.find(
              t =>
                t.status === "processing" &&
                t.uploadedFileId === uploadedFile.id
            );
            if (inProgress) {
              setState(prev => ({
                ...prev,
                progress: Math.max(
                  prev.progress,
                  Math.round(inProgress.progress) || 15
                ),
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

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return {
    ...state,
    translateFile,
    reset,
  };
}
