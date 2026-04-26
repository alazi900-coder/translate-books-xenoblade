import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, longtext, float } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// جدول الملفات المرفوعة
export const uploadedFiles = mysqlTable("uploaded_files", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileType: varchar("file_type", { length: 20 }).notNull(), // epub, docx, txt, srt
  fileSize: int("file_size").notNull(),
  fileKey: varchar("file_key", { length: 255 }).notNull(), // S3 key
  fileUrl: varchar("file_url", { length: 500 }).notNull(), // S3 URL
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type UploadedFile = typeof uploadedFiles.$inferSelect;
export type InsertUploadedFile = typeof uploadedFiles.$inferInsert;

// جدول الترجمات
export const translations = mysqlTable("translations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  uploadedFileId: int("uploaded_file_id").notNull(),
  sourceLanguage: varchar("source_language", { length: 50 }).notNull(),
  targetLanguage: varchar("target_language", { length: 50 }).notNull(),
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed", "paused"]).default("pending").notNull(),
  progress: float("progress").default(0).notNull(), // 0-100
  translatedFileKey: varchar("translated_file_key", { length: 255 }),
  translatedFileUrl: varchar("translated_file_url", { length: 500 }),
  errorMessage: text("error_message"),
  totalChunks: int("total_chunks").default(0),
  processedChunks: int("processed_chunks").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export type Translation = typeof translations.$inferSelect;
export type InsertTranslation = typeof translations.$inferInsert;

// قاموس مصطلحات الترجمة (Glossary) لكل مستخدم.
export const glossaryEntries = mysqlTable("glossary_entries", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  term: varchar("term", { length: 255 }).notNull(),
  translation: varchar("translation", { length: 500 }).notNull(),
  notes: text("notes"),
  sourceLanguage: varchar("source_language", { length: 50 }),
  targetLanguage: varchar("target_language", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type GlossaryEntry = typeof glossaryEntries.$inferSelect;
export type InsertGlossaryEntry = typeof glossaryEntries.$inferInsert;