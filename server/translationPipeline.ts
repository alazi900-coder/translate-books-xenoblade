/**
 * موحّد خط أنابيب الترجمة
 * يختار المعالج المناسب بناءً على نوع الملف ويعيد بناء الملف الناتج بنفس الصيغة.
 */

import yaml from "js-yaml";
import { invokeLLM } from "./_core/llm";
import {
  smartChunk,
  processTxtFile,
  processSrtFile,
  processVttFile,
  processMarkdownFile,
  processHtmlFile,
  processCsvFile,
  processYamlFile,
  processEpubFile,
  processDocxFile,
  rebuildEpubFile,
  rebuildHtml,
} from "./fileProcessors";
import { extractJsonStrings, reconstructJson } from "./jsonProcessor";
import {
  extractXenobladeStrings,
  reconstructXenoText,
} from "./xenobladeProcessor";
import {
  CancelledError,
  type ControlSlot,
  waitWhilePaused,
} from "./cancellation";

export type SupportedFileType =
  | "json"
  | "json_xenoblade"
  | "srt"
  | "vtt"
  | "txt"
  | "md"
  | "html"
  | "csv"
  | "yaml"
  | "epub"
  | "docx";

export interface XenobladeOptions {
  preserveXenoTags?: boolean;
  preserveSystemTags?: boolean;
  preserveMLTags?: boolean;
  excludeJapanese?: boolean;
  preserveFormatting?: boolean;
}

export interface GlossaryEntry {
  term: string;
  translation: string;
  notes?: string;
}

export interface TranslationPipelineOptions {
  sourceLanguage: string;
  targetLanguage: string;
  fileName: string;
  fileType?: string;
  chunkSize?: number;
  maxConcurrency?: number;
  xenoblade?: XenobladeOptions;
  /** LLM model override (e.g. gemini-2.5-flash). */
  model?: string;
  /** Sampling temperature 0..2. Defaults to provider default. */
  temperature?: number;
  /** Optional glossary that's injected into the system prompt for every chunk. */
  glossary?: GlossaryEntry[];
  /** Cancellation/pause control slot from the cancellation registry. */
  control?: ControlSlot;
  onProgress?: (processed: number, total: number) => void | Promise<void>;
}

export interface TranslationPipelineResult {
  type: SupportedFileType;
  output: string;
  /** Buffer outputs (e.g. epub) require base64 encoding. */
  outputEncoding?: "utf8" | "base64";
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
  if (ext === "vtt") return "vtt";
  if (ext === "md" || ext === "markdown") return "md";
  if (ext === "html" || ext === "htm" || ext === "xhtml") return "html";
  if (ext === "csv") return "csv";
  if (ext === "yaml" || ext === "yml") return "yaml";
  if (ext === "epub") return "epub";
  if (ext === "docx") return "docx";
  return "txt";
}

const SYSTEM_PROMPT_BASE = `You are a professional translator. Translate the user's text from {source} to {target}.
Rules:
- Preserve every placeholder, tag, code block, variable, and number exactly as in the source ({{var}}, $var, [tag], <tag>, [XENO:...], [System:...], [ML:...], \\[..\\], etc.).
- Keep line breaks, indentation, punctuation and any technical identifiers untouched.
- Do not add commentary, prefixes, suffixes, quotes, or notes; output only the translated text.
- If the input is empty or only whitespace, return it unchanged.
- Translate idioms naturally instead of word-by-word; keep proper nouns transliterated where appropriate.`;

function buildSystemPrompt(
  sourceLanguage: string,
  targetLanguage: string,
  glossary?: GlossaryEntry[]
): string {
  let prompt = SYSTEM_PROMPT_BASE.replace("{source}", sourceLanguage).replace(
    "{target}",
    targetLanguage
  );
  if (glossary && glossary.length > 0) {
    const lines = glossary
      .filter(g => g.term && g.translation)
      .slice(0, 200) // Defensive cap to avoid prompt bloat.
      .map(g =>
        g.notes
          ? `- "${g.term}" -> "${g.translation}" (${g.notes})`
          : `- "${g.term}" -> "${g.translation}"`
      );
    if (lines.length > 0) {
      prompt += `\n\nGlossary (translate these terms exactly as specified):\n${lines.join(
        "\n"
      )}`;
    }
  }
  return prompt;
}

interface TranslateChunkOptions {
  sourceLanguage: string;
  targetLanguage: string;
  attempts?: number;
  model?: string;
  temperature?: number;
  glossary?: GlossaryEntry[];
  signal?: AbortSignal;
}

export async function translateChunk(
  text: string,
  opts: TranslateChunkOptions
): Promise<{ text: string; ok: boolean; error?: string }> {
  if (!text || text.trim().length === 0) {
    return { text, ok: true };
  }

  const attempts = opts.attempts ?? 3;
  const systemPrompt = buildSystemPrompt(
    opts.sourceLanguage,
    opts.targetLanguage,
    opts.glossary
  );

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await invokeLLM({
        model: opts.model,
        temperature: opts.temperature,
        signal: opts.signal,
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
      if (opts.control) {
        await waitWhilePaused(opts.control);
      }
      const i = nextIndex;
      nextIndex += 1;
      if (i >= chunks.length) return;
      const result = await translateChunk(chunks[i], {
        sourceLanguage: opts.sourceLanguage,
        targetLanguage: opts.targetLanguage,
        model: opts.model,
        temperature: opts.temperature,
        glossary: opts.glossary,
      });
      translated[i] = result.text;
      if (!result.ok) failed += 1;
      completed += 1;
      if (opts.onProgress) {
        await opts.onProgress(completed, chunks.length);
      }
    }
  }

  const workerCount = Math.min(concurrency, chunks.length);
  if (workerCount === 0) {
    return { translated, failed };
  }
  await Promise.all(
    Array.from({ length: workerCount }, () => worker())
  );

  return { translated, failed };
}

function reconstructSrtWithTimecodes(
  translatedChunks: string[],
  timecodes: Array<{ start: string; end: string; index?: string }>
): string {
  const lines: string[] = [];
  for (let i = 0; i < translatedChunks.length; i++) {
    const tc = timecodes[i];
    if (!tc) continue;
    lines.push(tc.index ?? String(i + 1));
    lines.push(`${tc.start} --> ${tc.end}`);
    lines.push(translatedChunks[i]);
    lines.push("");
  }
  return lines.join("\n");
}

function reconstructVtt(
  translatedChunks: string[],
  meta: {
    header: string;
    cues: Array<{
      start: string;
      end: string;
      settings?: string;
      identifier?: string;
    }>;
  }
): string {
  const out: string[] = [meta.header, ""];
  for (let i = 0; i < translatedChunks.length; i++) {
    const cue = meta.cues[i];
    if (!cue) continue;
    if (cue.identifier) out.push(cue.identifier);
    out.push(
      cue.settings ? `${cue.start} --> ${cue.end}  ${cue.settings}` : `${cue.start} --> ${cue.end}`
    );
    out.push(translatedChunks[i]);
    out.push("");
  }
  return out.join("\n");
}

export async function runTranslationPipeline(
  fileContent: string,
  opts: TranslationPipelineOptions
): Promise<TranslationPipelineResult> {
  const type = detectFileType(opts.fileName, fileContent, opts.fileType);

  try {
    if (opts.control?.cancelled) {
      throw new CancelledError("Translation cancelled before start");
    }
    if (type === "json_xenoblade") return await translateXenobladeJson(fileContent, opts);
    if (type === "json") return await translateGenericJson(fileContent, opts);
    if (type === "srt") return await translateSrt(fileContent, opts);
    if (type === "vtt") return await translateVtt(fileContent, opts);
    if (type === "md") return await translateMarkdown(fileContent, opts);
    if (type === "html") return await translateHtml(fileContent, opts);
    if (type === "csv") return await translateCsv(fileContent, opts);
    if (type === "yaml") return await translateYaml(fileContent, opts);
    if (type === "epub") return await translateEpub(fileContent, opts);
    if (type === "docx") return await translateDocx(fileContent, opts);
    return await translateTxt(fileContent, opts);
  } catch (error) {
    if (error instanceof CancelledError) throw error;
    throw error;
  }
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
  const { translated, failed } = await translateChunksWithProgress(chunks, opts);

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

  const chunks = items.map(it => it.cleanText || it.originalText);
  const { translated, failed } = await translateChunksWithProgress(chunks, opts);

  const byPath = new Map<
    string,
    { originalText: string; text: string; tags: (typeof items)[number]["tags"] }
  >();
  items.forEach((item, idx) => {
    byPath.set(item.path, {
      originalText: item.originalText,
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
  byPath: Map<
    string,
    {
      originalText: string;
      text: string;
      tags: ReturnType<typeof extractXenobladeStrings>[number]["tags"];
    }
  >,
  preserveTags: boolean
): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") {
    const found = byPath.get(path);
    if (!found) return obj;
    if (!preserveTags || found.tags.length === 0) return found.text;
    return reconstructXenoText(found.originalText, found.text, found.tags);
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
    (metadata.timecodes as Array<{
      start: string;
      end: string;
      index?: string;
    }>) ?? [];
  const { translated, failed } = await translateChunksWithProgress(chunks, opts);
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

async function translateVtt(
  fileContent: string,
  opts: TranslationPipelineOptions
): Promise<TranslationPipelineResult> {
  const { chunks, metadata } = await processVttFile(fileContent);
  const { translated, failed } = await translateChunksWithProgress(chunks, opts);
  const output = reconstructVtt(translated, {
    header: (metadata.header as string) || "WEBVTT",
    cues: (metadata.cues as Array<{
      start: string;
      end: string;
      settings?: string;
      identifier?: string;
    }>) ?? [],
  });
  return {
    type: "vtt",
    output,
    totalChunks: chunks.length,
    processedChunks: chunks.length - failed,
    failedChunks: failed,
    metadata,
  };
}

async function translateMarkdown(
  fileContent: string,
  opts: TranslationPipelineOptions
): Promise<TranslationPipelineResult> {
  const { chunks, metadata } = await processMarkdownFile(fileContent);
  const { translated, failed } = await translateChunksWithProgress(chunks, opts);
  const segments = metadata.segments as Array<{
    kind: "text" | "code" | "blank";
    value: string;
  }>;
  const segmentMap = metadata.segmentMap as Array<{
    kind: string;
    chunkIndex?: number;
  }>;
  const lines: string[] = [];
  segmentMap.forEach((entry, i) => {
    const seg = segments[i];
    if (entry.kind === "text" && entry.chunkIndex !== undefined) {
      lines.push(translated[entry.chunkIndex] ?? seg.value);
    } else {
      lines.push(seg.value);
    }
  });
  return {
    type: "md",
    output: lines.join("\n"),
    totalChunks: chunks.length,
    processedChunks: chunks.length - failed,
    failedChunks: failed,
    metadata,
  };
}

async function translateHtml(
  fileContent: string,
  opts: TranslationPipelineOptions
): Promise<TranslationPipelineResult> {
  const { chunks, metadata } = await processHtmlFile(fileContent);
  const { translated, failed } = await translateChunksWithProgress(chunks, opts);
  const tokens = metadata.tokens as Array<{
    kind: "tag" | "text";
    value: string;
    chunk?: number;
  }>;
  const out = tokens
    .map(token => {
      if (token.kind === "text" && token.chunk !== undefined) {
        return translated[token.chunk] ?? token.value;
      }
      return token.value;
    })
    .join("");
  return {
    type: "html",
    output: out,
    totalChunks: chunks.length,
    processedChunks: chunks.length - failed,
    failedChunks: failed,
    metadata,
  };
}

async function translateCsv(
  fileContent: string,
  opts: TranslationPipelineOptions
): Promise<TranslationPipelineResult> {
  const { chunks, metadata } = await processCsvFile(fileContent);
  const { translated, failed } = await translateChunksWithProgress(chunks, opts);
  const rows = metadata.rows as string[][];
  const cellMap = metadata.cellMap as Array<Array<number | null>>;
  const escapeCell = (value: string) => {
    if (/[",\n]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };
  const lines = rows.map((row, ri) =>
    row
      .map((value, ci) => {
        const idx = cellMap[ri]?.[ci];
        const v = idx == null ? value : translated[idx] ?? value;
        return escapeCell(v);
      })
      .join(",")
  );
  return {
    type: "csv",
    output: lines.join("\n"),
    totalChunks: chunks.length,
    processedChunks: chunks.length - failed,
    failedChunks: failed,
    metadata,
  };
}

async function translateYaml(
  fileContent: string,
  opts: TranslationPipelineOptions
): Promise<TranslationPipelineResult> {
  const { chunks, metadata } = await processYamlFile(fileContent);
  const { translated, failed } = await translateChunksWithProgress(chunks, opts);
  const original = metadata.original;
  const mapping = new Map<string, string>();
  const keys = (metadata.keys as string[]) ?? [];
  keys.forEach((key, idx) => {
    mapping.set(key, translated[idx] ?? chunks[idx]);
  });
  const replaced = applyYamlMapping(original, mapping, "");
  return {
    type: "yaml",
    output: yaml.dump(replaced, { lineWidth: -1, noRefs: true }),
    totalChunks: chunks.length,
    processedChunks: chunks.length - failed,
    failedChunks: failed,
    metadata: { totalStrings: chunks.length },
  };
}

function applyYamlMapping(
  obj: unknown,
  mapping: Map<string, string>,
  path: string
): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") {
    return mapping.get(path) ?? obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item, i) =>
      applyYamlMapping(item, mapping, `${path}[${i}]`)
    );
  }
  if (typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const newPath = path ? `${path}.${k}` : k;
      out[k] = applyYamlMapping(v, mapping, newPath);
    }
    return out;
  }
  return obj;
}

async function translateTxt(
  fileContent: string,
  opts: TranslationPipelineOptions
): Promise<TranslationPipelineResult> {
  const { chunks: paragraphs } = await processTxtFile(fileContent);
  const chunkSize = opts.chunkSize ?? 500;
  const chunks: string[] = [];
  for (const p of paragraphs) {
    if (p.split(/\s+/).length <= chunkSize) {
      chunks.push(p);
    } else {
      chunks.push(...smartChunk(p, chunkSize));
    }
  }
  const { translated, failed } = await translateChunksWithProgress(chunks, opts);
  return {
    type: "txt",
    output: translated.join("\n\n"),
    totalChunks: chunks.length,
    processedChunks: chunks.length - failed,
    failedChunks: failed,
    metadata: { totalParagraphs: paragraphs.length },
  };
}

async function translateDocx(
  fileContent: string,
  opts: TranslationPipelineOptions
): Promise<TranslationPipelineResult> {
  const buf = Buffer.from(fileContent, "base64");
  const { chunks, metadata } = await processDocxFile(buf);
  const { translated, failed } = await translateChunksWithProgress(chunks, opts);
  // We currently re-emit DOCX content as a plain .txt-style stream because writing a real .docx
  // requires re-packaging the OOXML zip. The output extension is preserved but the content
  // is plain text. A future iteration may re-pack the OOXML.
  return {
    type: "docx",
    output: translated.join("\n\n"),
    outputEncoding: "utf8",
    totalChunks: chunks.length,
    processedChunks: chunks.length - failed,
    failedChunks: failed,
    metadata,
  };
}

async function translateEpub(
  fileContent: string,
  opts: TranslationPipelineOptions
): Promise<TranslationPipelineResult> {
  const buf = Buffer.from(fileContent, "base64");
  const { chunks, metadata } = await processEpubFile(buf);
  const { translated, failed } = await translateChunksWithProgress(chunks, opts);
  const out = await rebuildEpubFile(metadata, translated);
  return {
    type: "epub",
    output: out.toString("base64"),
    outputEncoding: "base64",
    totalChunks: chunks.length,
    processedChunks: chunks.length - failed,
    failedChunks: failed,
    metadata: { totalStrings: chunks.length },
  };
}

// Re-export to avoid unused import warnings while exposing helpers for tests.
export { rebuildHtml };
