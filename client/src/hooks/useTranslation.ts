import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";

interface TranslationState {
  isLoading: boolean;
  progress: number;
  status: "idle" | "uploading" | "translating" | "completed" | "error";
  error: string | null;
  translatedFileUrl: string | null;
}

export function useTranslation() {
  const [state, setState] = useState<TranslationState>({
    isLoading: false,
    progress: 0,
    status: "idle",
    error: null,
    translatedFileUrl: null,
  });

  const uploadFileMutation = trpc.file.upload.useMutation();
  const createTranslationMutation = trpc.translation.create.useMutation();

  const translateFile = useCallback(
    async (
      file: File,
      sourceLanguage: string,
      targetLanguage: string
    ) => {
      try {
        setState({
          isLoading: true,
          progress: 0,
          status: "uploading",
          error: null,
          translatedFileUrl: null,
        });

        // قراءة محتوى الملف
        const fileContent = await file.text();
        const fileType = file.name.split(".").pop()?.toLowerCase() || "";

        // رفع الملف
        const uploadedFile = await uploadFileMutation.mutateAsync({
          fileName: file.name,
          fileType,
          fileContent,
        });

        setState((prev) => ({
          ...prev,
          progress: 30,
          status: "translating",
        }));

        // بدء الترجمة
        const translation = await createTranslationMutation.mutateAsync({
          uploadedFileId: uploadedFile.id,
          sourceLanguage,
          targetLanguage,
          fileContent,
          fileName: file.name,
        });

        setState({
          isLoading: false,
          progress: 100,
          status: "completed",
          error: null,
          translatedFileUrl: translation.translatedFileUrl,
        });

        return translation;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "حدث خطأ في الترجمة";

        setState({
          isLoading: false,
          progress: 0,
          status: "error",
          error: errorMessage,
          translatedFileUrl: null,
        });

        throw error;
      }
    },
    [uploadFileMutation, createTranslationMutation]
  );

  const reset = useCallback(() => {
    setState({
      isLoading: false,
      progress: 0,
      status: "idle",
      error: null,
      translatedFileUrl: null,
    });
  }, []);

  return {
    ...state,
    translateFile,
    reset,
  };
}
