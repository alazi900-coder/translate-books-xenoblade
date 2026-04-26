import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  createTranslation,
  getUserTranslations,
  getTranslationById,
  updateTranslation,
  createUploadedFile,
  getUserUploadedFiles,
  getDb,
} from "./db";
import { storagePut, storageGetSignedUrl } from "./storage";
import { eq } from "drizzle-orm";
import { translations } from "../drizzle/schema";
import { runTranslationPipeline } from "./translationPipeline";

const xenobladeOptionsSchema = z
  .object({
    preserveXenoTags: z.boolean().optional(),
    preserveSystemTags: z.boolean().optional(),
    preserveMLTags: z.boolean().optional(),
    excludeJapanese: z.boolean().optional(),
    preserveFormatting: z.boolean().optional(),
  })
  .optional();

const MIME_BY_TYPE: Record<string, string> = {
  json: "application/json",
  json_xenoblade: "application/json",
  srt: "application/x-subrip",
  txt: "text/plain",
  epub: "application/epub+zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // Translations
  translation: router({
    // إنشاء ترجمة جديدة
    create: protectedProcedure
      .input(
        z.object({
          uploadedFileId: z.number(),
          sourceLanguage: z.string(),
          targetLanguage: z.string(),
          fileContent: z.string(),
          fileName: z.string(),
          fileType: z.string().optional(),
          chunkSize: z.number().int().positive().max(2000).optional(),
          xenoblade: xenobladeOptionsSchema,
        })
      )
      .mutation(async ({ input, ctx }) => {
        const translation = await createTranslation({
          userId: ctx.user.id,
          uploadedFileId: input.uploadedFileId,
          sourceLanguage: input.sourceLanguage,
          targetLanguage: input.targetLanguage,
          status: "processing",
          progress: 0,
          totalChunks: 0,
          processedChunks: 0,
        });

        try {
          const result = await runTranslationPipeline(input.fileContent, {
            sourceLanguage: input.sourceLanguage,
            targetLanguage: input.targetLanguage,
            fileName: input.fileName,
            fileType: input.fileType,
            chunkSize: input.chunkSize,
            xenoblade: input.xenoblade,
            onProgress: async (processed, total) => {
              const progress = total === 0 ? 100 : (processed / total) * 100;
              await updateTranslation(translation.id, {
                progress,
                processedChunks: processed,
                totalChunks: total,
              });
            },
          });

          const baseName = input.fileName.replace(/\.[^.]+$/, "");
          const ext = input.fileName.split(".").pop() || "txt";
          const translatedFileName = `${baseName}_${input.targetLanguage}.${ext}`;
          const mime = MIME_BY_TYPE[result.type] ?? "text/plain";
          const { url: translatedFileUrl, key: translatedFileKey } =
            await storagePut(
              `translations/${ctx.user.id}/${translatedFileName}`,
              result.output,
              mime
            );

          await updateTranslation(translation.id, {
            status: "completed",
            progress: 100,
            translatedFileUrl,
            translatedFileKey,
            totalChunks: result.totalChunks,
            processedChunks: result.processedChunks,
            completedAt: new Date(),
            errorMessage:
              result.failedChunks > 0
                ? `${result.failedChunks} جزء فشلت ترجمته واستُخدم النص الأصلي`
                : null,
          });

          return {
            id: translation.id,
            status: "completed",
            translatedFileUrl,
            totalChunks: result.totalChunks,
            failedChunks: result.failedChunks,
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "فشلت عملية الترجمة";
          console.error("Translation pipeline error:", error);
          await updateTranslation(translation.id, {
            status: "failed",
            errorMessage: message,
          });
          throw new Error(message);
        }
      }),

    // الحصول على قائمة الترجمات
    list: protectedProcedure.query(async ({ ctx }) => {
      const items = await getUserTranslations(ctx.user.id);
      return items.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }),

    // الحصول على تفاصيل ترجمة واحدة
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const translation = await getTranslationById(input.id);
        if (!translation || translation.userId !== ctx.user.id) {
          throw new Error("غير مصرح");
        }
        return translation;
      }),

    // الحصول على رابط التنزيل (signed URL مباشر إن أمكن)
    download: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const translation = await getTranslationById(input.id);
        if (!translation || translation.userId !== ctx.user.id) {
          throw new Error("غير مصرح");
        }
        if (!translation.translatedFileKey) {
          throw new Error("الملف المترجم غير متوفر");
        }
        try {
          const url = await storageGetSignedUrl(translation.translatedFileKey);
          return { url };
        } catch (error) {
          console.warn("Falling back to proxy URL:", error);
          return {
            url:
              translation.translatedFileUrl ??
              `/manus-storage/${translation.translatedFileKey}`,
          };
        }
      }),

    // إحصائيات الترجمات
    stats: protectedProcedure.query(async ({ ctx }) => {
      const items = await getUserTranslations(ctx.user.id);
      const counters = {
        total: items.length,
        completed: 0,
        processing: 0,
        failed: 0,
        pending: 0,
        paused: 0,
      };
      for (const t of items) {
        const key = t.status as keyof typeof counters;
        if (key in counters) counters[key] += 1;
      }
      return counters;
    }),

    // حذف ترجمة
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const translation = await getTranslationById(input.id);
        if (!translation || translation.userId !== ctx.user.id) {
          throw new Error("غير مصرح");
        }
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        await db.delete(translations).where(eq(translations.id, input.id));
        return { success: true };
      }),
  }),

  // Uploaded Files
  file: router({
    // رفع ملف جديد
    upload: protectedProcedure
      .input(
        z.object({
          fileName: z.string(),
          fileType: z.string(),
          fileContent: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        try {
          const { url: fileUrl, key: fileKey } = await storagePut(
            `uploads/${ctx.user.id}/${input.fileName}`,
            input.fileContent,
            "application/octet-stream"
          );
          const uploadedFile = await createUploadedFile({
            userId: ctx.user.id,
            fileName: input.fileName,
            fileType: input.fileType,
            fileSize: input.fileContent.length,
            fileKey,
            fileUrl,
          });
          return uploadedFile;
        } catch (error) {
          console.error("File upload error:", error);
          throw new Error("فشل رفع الملف");
        }
      }),

    // قائمة الملفات المرفوعة
    list: protectedProcedure.query(async ({ ctx }) => {
      return getUserUploadedFiles(ctx.user.id);
    }),
  }),
});

export type AppRouter = typeof appRouter;
