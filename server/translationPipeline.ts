/**
 * موحّد خط أنابيب الترجمة
 * يختار المعالج المناسب بناءً على نوع الملف ويعيد بناء الملف الناتج بنفس الصيغة.
 */

import { invokeLLM } from "./_core/llm";
import {
  smartChunk,
  processTxtFile,
  processSrtFile,
  processEpubFile,
  processDocxFile,
} from "./fileProcessors";
import { extractJsonStrings, reconstructJson } from "./jsonProcessor";
import {
  extractXenobladeStrings,
  reconstructXenobladeJson,
} from "./xenobladeProcessor";

export type SupportedFileType =
  | "json"
  | "json_xenoblade"
  | "srt"
  | "txt"
  | "epub"
  | "docx";

export interface XenobladeOptions {
  preserveXenoTags?: boolean;
  preserveSystemTags?: boolean;
  preserveMLTags?: boolean;
  excludeJapanese?: boolean;
  preserveFormatting?: boolean;
}

export interface TranslationPipelineOptions {
  sourceLanguage: string;
  targetLanguage: string;
  fileName: string;
  fileType?: string;
  chunkSize?: number;
  maxConcurrency?: number;
  xenoblade?: XenobladeOptions;
  onProgress?: (processed: number, total: number) => void | Promise<void>;
}

export interface TranslationPipelineResult {
  type: SupportedFileType;
  output: string;
  totalChunks: number;
  processedChunks: number;
  failedChunks: number;
  metadata: Record<string, unknown>;
}

const XENOBLADE_KEY_PATTERN =
  /bdat-bin:|bdat_(common|menu_mes|trial|message)_ms/i;
const XENOBLADE_TAG_PATTERN = /\[XENO:|\[System:|\[ML:/;

export function detectFileType(
  fileName: string,
  fileContent: string,
  override?: string
): SupportedFileType {
  const ext = (override || fileName.split(".").pop() || "").toLowerCase();

  if (ext === "json") {
    if (
      XENOBLADE_KEY_PATTERN.test(fileContent) ||
      XENOBLADE_TAG_PATTERN.test(fileContent)
    ) {
      return "json_xenoblade";
    }
    return "json";
  }

  if (ext === "srt") return "srt";
  if (ext === "epub") return "epub";
  if (ext === "docx") return "docx";
  return "txt";
}

const SYSTEM_PROMPT = `You are a professional translator. Translate the user's text from {source} to {target}.
Rules:
- Preserve every placeholder, tag, code block, variable, and number exactly as in the source ({{var}}, $var, [tag], <tag>, [XENO:...], [System:...], [ML:...], \\[..\\], etc.).
- Keep line breaks, indentation, punctuation and any technical identifiers untouched.
- Do not add commentary, prefixes, suffixes, quotes, or notes; output only the translated text.
- If the input is empty or only whitespace, return it unchanged.
- Translate idioms naturally instead of word-by-word; keep proper nouns transliterated where appropriate.`;

interface TranslateChunkOptions {
  sourceLanguage: string;
  targetLanguage: string;
  attempts?: number;
}

export async function translateChunk(
  text: string,
  opts: TranslateChunkOptions
): Promise<{ text: string; ok: boolean; error?: string }> {
  if (!text || text.trim().length === 0) {
    return { text, ok: true };
  }

  const attempts = opts.attempts ?? 3;
  const systemPrompt = SYSTEM_PROMPT.replace(
    "{source}",
    opts.sourceLanguage
  ).replace("{target}", opts.targetLanguage);

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
      });

      const content = response.choices[0]?.message?.content;
      const translated =
        typeof content === "string"
          ? content
          : Array.isArray(content)
            ? content
                .map(part => (part.type === "text" ? part.text : ""))
                .join("")
            : "";

      if (!translated || translated.trim().length === 0) {
        throw new Error("Empty translation");
      }

      return { text: translated, ok: true };
    } catch (err) {
      lastError = err;
      if (attempt < attempts - 1) {
        const backoff = 250 * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }
  }

  return {
    text,
    ok: false,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  };
}

async function translateChunksWithProgress(
  chunks: string[],
  opts: TranslationPipelineOptions
): Promise<{ translated: string[]; failed: number }> {
  const concurrency = Math.max(1, Math.min(opts.maxConcurrency ?? 4, 8));
  const translated = new Array<string>(chunks.length);
  let failed = 0;
  let nextIndex = 0;
  let completed = 0;

  async function worker() {
    while (true) {
      const i = nextIndex;
      nextIndex += 1;
      if (i >= chunks.length) return;
      const result = await translateChunk(chunks[i], {
        sourceLanguage: opts.sourceLanguage,
        targetLanguage: opts.targetLanguage,
      });
      translated[i] = result.text;
      if (!result.ok) failed += 1;
      completed += 1;
      if (opts.onProgress) {
        await opts.onProgress(completed, chunks.length);
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, chunks.length) },
    () => worker()
  );
  await Promise.all(workers);

  return { translated, failed };
}

function reconstructSrtWithTimecodes(
  translatedChunks: string[],
  timecodes: Array<{ start: string; end: string }>
): string {
  const lines: string[] = [];
  for (let i = 0; i < translatedChunks.length; i++) {
    const tc = timecodes[i];
    if (!tc) continue;
    lines.push(String(i + 1));
    lines.push(`${tc.start} --> ${tc.end}`);
    lines.push(translatedChunks[i]);
    lines.push("");
  }
  return lines.join("\n");
}

export async function runTranslationPipeline(
  fileContent: string,
  opts: TranslationPipelineOptions
): Promise<TranslationPipelineResult> {
  const type = detectFileType(opts.fileName, fileContent, opts.fileType);

  if (type === "json_xenoblade") {
    return translateXenobladeJson(fileContent, opts);
  }
  if (type === "json") {
    return translateGenericJson(fileContent, opts);
  }
  if (type === "srt") {
    return translateSrt(fileContent, opts);
  }
  if (type === "epub") {
    return translateBuffer(fileContent, opts, "epub");
  }
  if (type === "docx") {
    return translateBuffer(fileContent, opts, "docx");
  }
  return translateTxt(fileContent, opts);
}

async function translateGenericJson(
  fileContent: string,
  opts: TranslationPipelineOptions
): Promise<TranslationPipelineResult> {
  let json: unknown;
  try {
    json = JSON.parse(fileContent);
  } catch (err) {
    throw new Error(
      `JSON غير صالح: ${err instanceof Error ? err.message : "unknown"}`
    );
  }

  const items = extractJsonStrings(json);
  const chunks = items.map(item => item.value);
  const { translated, failed } = await translateChunksWithProgress(
    chunks,
    opts
  );

  const mapping = new Map<string, string>();
  items.forEach((item, idx) => {
    mapping.set(item.path, translated[idx] ?? item.value);
  });

  const out = reconstructJson(json, mapping);
  return {
    type: "json",
    output: JSON.stringify(out, null, 2),
    totalChunks: chunks.length,
    processedChunks: chunks.length - failed,
    failedChunks: failed,
    metadata: { totalStrings: chunks.length },
  };
}

async function translateXenobladeJson(
  fileContent: string,
  opts: TranslationPipelineOptions
): Promise<TranslationPipelineResult> {
  let json: unknown;
  try {
    json = JSON.parse(fileContent);
  } catch (err) {
    throw new Error(
      `JSON غير صالح: ${err instanceof Error ? err.message : "unknown"}`
    );
  }

  const x = opts.xenoblade ?? {};
  const items = extractXenobladeStrings(json, {
    preserveXenoTags: x.preserveXenoTags ?? true,
    preserveSystemTags: x.preserveSystemTags ?? true,
    preserveMLTags: x.preserveMLTags ?? true,
    excludeJapanese: x.excludeJapanese ?? true,
  });

  // Translate the clean text (without tags) to keep tags intact, then re-merge.
  const chunks = items.map(it => it.cleanText || it.originalText);
  const { translated, failed } = await translateChunksWithProgress(
    chunks,
    opts
  );

  // Build path -> { text, tags } map (paths are emitted as `root.foo[0].bar`).
  const byPath = new Map<
    string,
    { text: string; tags: (typeof items)[number]["tags"] }
  >();
  items.forEach((item, idx) => {
    byPath.set(item.path, {
      text: translated[idx] ?? item.cleanText,
      tags: item.tags,
    });
  });

  const preserveTags =
    x.preserveXenoTags !== false ||
    x.preserveSystemTags !== false ||
    x.preserveMLTags !== false;
  const out = walkAndReplaceByPath(json, "root", byPath, preserveTags);

  return {
    type: "json_xenoblade",
    output: JSON.stringify(out, null, 2),
    totalChunks: chunks.length,
    processedChunks: chunks.length - failed,
    failedChunks: failed,
    metadata: {
      totalStrings: chunks.length,
      withTags: items.filter(i => i.tags.length > 0).length,
    },
  };
}

function walkAndReplaceByPath(
  obj: unknown,
  path: string,
  byPath: Map<string, { text: string; tags: { fullTag: string }[] }>,
  preserveTags: boolean
): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") {
    const found = byPath.get(path);
    if (!found) return obj;
    if (!preserveTags || found.tags.length === 0) return found.text;
    let result = found.text;
    for (const tag of found.tags) {
      if (!result.includes(tag.fullTag)) {
        result += tag.fullTag;
      }
    }
    return result;
  }
  if (Array.isArray(obj)) {
    return obj.map((item, i) =>
      walkAndReplaceByPath(item, `${path}[${i}]`, byPath, preserveTags)
    );
  }
  if (typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[k] = walkAndReplaceByPath(v, `${path}.${k}`, byPath, preserveTags);
    }
    return out;
  }
  return obj;
}

async function translateSrt(
  fileContent: string,
  opts: TranslationPipelineOptions
): Promise<TranslationPipelineResult> {
  const { chunks, metadata } = await processSrtFile(fileContent);
  const timecodes =
    (metadata.timecodes as Array<{ start: string; end: string }>) ?? [];
  const { translated, failed } = await translateChunksWithProgress(
    chunks,
    opts
  );
  const output = reconstructSrtWithTimecodes(translated, timecodes);
  return {
    type: "srt",
    output,
    totalChunks: chunks.length,
    processedChunks: chunks.length - failed,
    failedChunks: failed,
    metadata,
  };
}

async function translateTxt(
  fileContent: string,
  opts: TranslationPipelineOptions
): Promise<TranslationPipelineResult> {
  const { chunks: paragraphs } = await processTxtFile(fileContent);
  const chunkSize = opts.chunkSize ?? 500;
  // Re-chunk paragraphs to respect chunkSize while keeping paragraph boundaries.
  const chunks: string[] = [];
  for (const p of paragraphs) {
    if (p.split(/\s+/).length <= chunkSize) {
      chunks.push(p);
    } else {
      chunks.push(...smartChunk(p, chunkSize));
    }
  }
  const { translated, failed } = await translateChunksWithProgress(
    chunks,
    opts
  );
  return {
    type: "txt",
    output: translated.join("\n\n"),
    totalChunks: chunks.length,
    processedChunks: chunks.length - failed,
    failedChunks: failed,
    metadata: { totalParagraphs: paragraphs.length },
  };
}

async function translateBuffer(
  fileContent: string,
  opts: TranslationPipelineOptions,
  type: "epub" | "docx"
): Promise<TranslationPipelineResult> {
  const buf = Buffer.from(fileContent, "binary");
  const { chunks, metadata } =
    type === "epub" ? await processEpubFile(buf) : await processDocxFile(buf);
  const { translated, failed } = await translateChunksWithProgress(
    chunks,
    opts
  );
  return {
    type,
    output: translated.join("\n\n"),
    totalChunks: chunks.length,
    processedChunks: chunks.length - failed,
    failedChunks: failed,
    metadata,
  };
}
