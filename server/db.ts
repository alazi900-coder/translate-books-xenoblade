import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  translations,
  uploadedFiles,
  Translation,
  InsertTranslation,
  UploadedFile,
  InsertUploadedFile,
  glossaryEntries,
  GlossaryEntry,
  InsertGlossaryEntry,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ترجمات
export async function createTranslation(data: InsertTranslation): Promise<Translation> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(translations).values(data);
  const id = result[0].insertId;
  
  const created = await db.select().from(translations).where(eq(translations.id, id as any)).limit(1);
  return created[0] as Translation;
}

export async function getTranslationById(id: number): Promise<Translation | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(translations).where(eq(translations.id, id)).limit(1);
  return result[0];
}

export async function getUserTranslations(userId: number): Promise<Translation[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(translations).where(eq(translations.userId, userId));
}

export async function updateTranslation(id: number, data: Partial<Translation>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  await db.update(translations).set(data).where(eq(translations.id, id));
}

// ملفات مرفوعة
export async function createUploadedFile(data: InsertUploadedFile): Promise<UploadedFile> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(uploadedFiles).values(data);
  const id = result[0].insertId;
  
  const created = await db.select().from(uploadedFiles).where(eq(uploadedFiles.id, id as any)).limit(1);
  return created[0] as UploadedFile;
}

export async function getUserUploadedFiles(userId: number): Promise<UploadedFile[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(uploadedFiles).where(eq(uploadedFiles.userId, userId));
}

// قاموس مصطلحات
export async function listGlossaryEntries(
  userId: number
): Promise<GlossaryEntry[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(glossaryEntries)
    .where(eq(glossaryEntries.userId, userId));
}

export async function createGlossaryEntry(
  data: InsertGlossaryEntry
): Promise<GlossaryEntry> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(glossaryEntries).values(data);
  const id = result[0].insertId;
  const created = await db
    .select()
    .from(glossaryEntries)
    .where(eq(glossaryEntries.id, id as unknown as number))
    .limit(1);
  return created[0] as GlossaryEntry;
}

export async function updateGlossaryEntry(
  id: number,
  data: Partial<InsertGlossaryEntry>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(glossaryEntries).set(data).where(eq(glossaryEntries.id, id));
}

export async function deleteGlossaryEntry(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(glossaryEntries).where(eq(glossaryEntries.id, id));
}

export async function getGlossaryEntryById(
  id: number
): Promise<GlossaryEntry | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(glossaryEntries)
    .where(eq(glossaryEntries.id, id))
    .limit(1);
  return rows[0];
}
