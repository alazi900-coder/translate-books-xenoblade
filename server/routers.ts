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
  listGlossaryEntries,
  createGlossaryEntry,
  updateGlossaryEntry,
  deleteGlossaryEntry,
  getGlossaryEntryById,
} from "./db";
import { storagePut, storageGetSignedUrl } from "./storage";
import { eq } from "drizzle-orm";
import { translations } from "../drizzle/schema";
import {
  runTranslationPipeline,
  type GlossaryEntry,
} from "./translationPipeline";
import {
  registerControl,
  disposeControl,
  cancelTranslation,
  pauseTranslation,
  resumeTranslation,
  CancelledError,
} from "./cancellation";

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
  vtt: "text/vtt",
  txt: "text/plain",
  md: "text/markdown",
  html: "text/html",
  csv: "text/csv",
  yaml: "text/yaml",
  epub: "application/epub+zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const MIME_BY_EXT: Record<string, string> = {
  json: "application/json",
  srt: "application/x-subrip",
  vtt: "text/vtt",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  html: "text/html",
  htm: "text/html",
  xhtml: "application/xhtml+xml",
  csv: "text/csv",
  yaml: "text/yaml",
  yml: "text/yaml",
  epub: "application/epub+zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function mimeForFileName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

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
          model: z.string().optional(),
          temperature: z.number().min(0).max(2).optional(),
          useGlossary: z.boolean().optional(),
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

        const control = registerControl(translation.id);

        let glossary: GlossaryEntry[] | undefined;
        if (input.useGlossary !== false) {
          try {
            const entries = await listGlossaryEntries(ctx.user.id);
            const filtered = entries.filter(e => {
              if (
                e.sourceLanguage &&
                e.sourceLanguage !== input.sourceLanguage
              )
                return false;
              if (
                e.targetLanguage &&
                e.targetLanguage !== input.targetLanguage
              )
                return false;
              return true;
            });
            glossary = filtered.map(e => ({
              term: e.term,
              translation: e.translation,
              notes: e.notes ?? undefined,
            }));
          } catch (err) {
            console.warn("Failed to load glossary:", err);
          }
        }

        try {
          const result = await runTranslationPipeline(input.fileContent, {
            sourceLanguage: input.sourceLanguage,
            targetLanguage: input.targetLanguage,
            fileName: input.fileName,
            fileType: input.fileType,
            chunkSize: input.chunkSize,
            xenoblade: input.xenoblade,
            model: input.model,
            temperature: input.temperature,
            glossary,
            control,
            onProgress: async (processed, total) => {
              const progress = total === 0 ? 100 : (processed / total) * 100;
              await updateTranslation(translation.id, {
                progress,
                processedChunks: processed,
                totalChunks: total,
                status: control.paused ? "paused" : "processing",
              });
            },
          });

          const baseName = input.fileName.replace(/\.[^.]+$/, "");
          const ext = input.fileName.split(".").pop() || "txt";
          const translatedFileName = `${baseName}_${input.targetLanguage}.${ext}`;
          const mime = MIME_BY_TYPE[result.type] ?? "text/plain";
          const body =
            result.outputEncoding === "base64"
              ? Buffer.from(result.output, "base64")
              : result.output;
          const { url: translatedFileUrl, key: translatedFileKey } =
            await storagePut(
              `translations/${ctx.user.id}/${translatedFileName}`,
              body,
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
          if (error instanceof CancelledError) {
            await updateTranslation(translation.id, {
              status: "failed",
              errorMessage: "تم إلغاء العملية",
            });
            throw new Error("تم إلغاء العملية");
          }
          const message =
            error instanceof Error ? error.message : "فشلت عملية الترجمة";
          console.error("Translation pipeline error:", error);
          await updateTranslation(translation.id, {
            status: "failed",
            errorMessage: message,
          });
          throw new Error(message);
        } finally {
          disposeControl(translation.id);
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

    // إلغاء عملية ترجمة جارية على نفس مثيل الخادم
    cancel: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const translation = await getTranslationById(input.id);
        if (!translation || translation.userId !== ctx.user.id) {
          throw new Error("غير مصرح");
        }
        const ok = cancelTranslation(input.id);
        if (!ok) {
          // No active control slot — best-effort: mark failed.
          await updateTranslation(input.id, {
            status: "failed",
            errorMessage: "تم إلغاء العملية يدوياً",
          });
        }
        return { success: true, hadActiveJob: ok };
      }),

    // إيقاف مؤقت
    pause: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const translation = await getTranslationById(input.id);
        if (!translation || translation.userId !== ctx.user.id) {
          throw new Error("غير مصرح");
        }
        const ok = pauseTranslation(input.id);
        if (ok) {
          await updateTranslation(input.id, { status: "paused" });
        }
        return { success: true, hadActiveJob: ok };
      }),

    // استئناف
    resume: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const translation = await getTranslationById(input.id);
        if (!translation || translation.userId !== ctx.user.id) {
          throw new Error("غير مصرح");
        }
        const ok = resumeTranslation(input.id);
        if (ok) {
          await updateTranslation(input.id, { status: "processing" });
        }
        return { success: true, hadActiveJob: ok };
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
          const mime = mimeForFileName(input.fileName);
          const { url: fileUrl, key: fileKey } = await storagePut(
            `uploads/${ctx.user.id}/${input.fileName}`,
            input.fileContent,
            mime
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

  // Glossary CRUD
  glossary: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return listGlossaryEntries(ctx.user.id);
    }),

    create: protectedProcedure
      .input(
        z.object({
          term: z.string().min(1).max(255),
          translation: z.string().min(1).max(500),
          notes: z.string().max(1000).optional(),
          sourceLanguage: z.string().max(50).optional(),
          targetLanguage: z.string().max(50).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        return createGlossaryEntry({
          userId: ctx.user.id,
          term: input.term,
          translation: input.translation,
          notes: input.notes ?? null,
          sourceLanguage: input.sourceLanguage ?? null,
          targetLanguage: input.targetLanguage ?? null,
        });
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          term: z.string().min(1).max(255).optional(),
          translation: z.string().min(1).max(500).optional(),
          notes: z.string().max(1000).nullable().optional(),
          sourceLanguage: z.string().max(50).nullable().optional(),
          targetLanguage: z.string().max(50).nullable().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const existing = await getGlossaryEntryById(input.id);
        if (!existing || existing.userId !== ctx.user.id) {
          throw new Error("غير مصرح");
        }
        const { id, ...rest } = input;
        await updateGlossaryEntry(id, rest);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const existing = await getGlossaryEntryById(input.id);
        if (!existing || existing.userId !== ctx.user.id) {
          throw new Error("غير مصرح");
        }
        await deleteGlossaryEntry(input.id);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
