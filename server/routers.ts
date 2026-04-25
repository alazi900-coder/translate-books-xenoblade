import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { createTranslation, getUserTranslations, getTranslationById, updateTranslation, createUploadedFile, getUserUploadedFiles } from "./db";
    import { invokeLLM } from "./_core/llm";
    import { smartChunk, processJsonFile } from "./fileProcessors";
import { storagePut, storageGet } from "./storage";
import { eq } from "drizzle-orm";
import { translations } from "../drizzle/schema";
import { getDb } from "./db";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
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
        })
      )
      .mutation(async ({ input, ctx }) => {
        try {
          // إنشاء سجل الترجمة
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

          // تقسيم النص الذكي
          const chunks = smartChunk(input.fileContent, 500);
          
          // تحديث عدد الأجزاء
          await updateTranslation(translation.id, {
            totalChunks: chunks.length,
          });

          // بدء عملية الترجمة (يمكن جعلها async في المستقبل)
          const translatedChunks: string[] = [];

          for (let i = 0; i < chunks.length; i++) {
            try {
              const response = await invokeLLM({
                messages: [
                  {
                    role: "system",
                    content: `أنت مترجم احترافي. قم بترجمة النص التالي من ${input.sourceLanguage} إلى ${input.targetLanguage} مع الحفاظ على المعنى والأسلوب.` as any,
                  },
                  {
                    role: "user",
                    content: chunks[i] as any,
                  },
                ],
              });

              const translatedText = typeof response.choices[0]?.message?.content === 'string' ? response.choices[0].message.content : chunks[i];
              translatedChunks.push(translatedText);

              // تحديث التقدم
              const progress = ((i + 1) / chunks.length) * 100;
              await updateTranslation(translation.id, {
                progress,
                processedChunks: i + 1,
              });
            } catch (error) {
              console.error(`Error translating chunk ${i}:`, error);
              translatedChunks.push(chunks[i]); // استخدم النص الأصلي في حالة الخطأ
            }
          }

          // إعادة بناء النص المترجم
          const translatedContent = translatedChunks.join("\n\n");

          // حفظ الملف المترجم في S3
          const translatedFileName = `${input.fileName.replace(/\.[^.]+$/, "")}_${input.targetLanguage}.${input.fileName.split(".").pop()}`;
          const { url: translatedFileUrl, key: translatedFileKey } = await storagePut(
            `translations/${ctx.user.id}/${translatedFileName}`,
            translatedContent,
            "text/plain"
          );

          // تحديث سجل الترجمة
          await updateTranslation(translation.id, {
            status: "completed",
            progress: 100,
            translatedFileUrl,
            translatedFileKey,
            completedAt: new Date(),
          });

          return {
            id: translation.id,
            status: "completed",
            translatedFileUrl,
          };
        } catch (error) {
          console.error("Translation error:", error);
          throw new Error("فشلت عملية الترجمة");
        }
      }),

    // الحصول على قائمة الترجمات
    list: protectedProcedure.query(async ({ ctx }) => {
      return getUserTranslations(ctx.user.id);
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

    // الحصول على رابط التنزيل
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

        const { url } = await storageGet(translation.translatedFileKey);
        return { url };
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
          // حفظ الملف في S3
          const { url: fileUrl, key: fileKey } = await storagePut(
            `uploads/${ctx.user.id}/${input.fileName}`,
            input.fileContent,
            "application/octet-stream"
          );

          // حفظ معلومات الملف في قاعدة البيانات
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
