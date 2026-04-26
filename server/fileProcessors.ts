/**
 * معالجات الملفات لأنواع مختلفة
 * تتعامل مع استخراج النصوص والحفاظ على التنسيق
 */

import JSZip from "jszip";
import mammoth from "mammoth";
import yaml from "js-yaml";

interface ChunkResult {
  chunks: string[];
  metadata: Record<string, unknown>;
}

// دالة مساعدة لاستخراج النصوص من JSON
function extractJsonStrings(
  obj: unknown,
  chunks: string[],
  keys: string[],
  prefix = ""
): void {
  if (obj === null || obj === undefined) return;

  if (typeof obj === "string" && obj.trim().length > 0) {
    chunks.push(obj);
    keys.push(prefix);
  } else if (typeof obj === "object") {
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        extractJsonStrings(item, chunks, keys, `${prefix}[${index}]`);
      });
    } else {
      Object.entries(obj as Record<string, unknown>).forEach(([key, value]) => {
        const newPrefix = prefix ? `${prefix}.${key}` : key;
        extractJsonStrings(value, chunks, keys, newPrefix);
      });
    }
  }
}

/**
 * معالج JSON مع الحفاظ على المفاتيح التقنية
 */
export async function processJsonFile(content: string): Promise<ChunkResult> {
  try {
    const json = JSON.parse(content);
    const chunks: string[] = [];
    const keys: string[] = [];

    extractJsonStrings(json, chunks, keys);

    return {
      chunks,
      metadata: {
        type: "json",
        totalStrings: chunks.length,
        keys,
        note: "معالجة JSON مع الحفاظ على المفاتيح التقنية",
      },
    };
  } catch (error) {
    console.error("Error processing JSON:", error);
    return {
      chunks: [],
      metadata: {
        type: "json",
        error: true,
      },
    };
  }
}

/**
 * معالج TXT البسيط — يتعامل مع الأسطر المفردة والفقرات.
 * إن لم تحتوي ملف على أسطر مزدوجة نتعامل مع كل سطر كفقرة.
 */
export async function processTxtFile(content: string): Promise<ChunkResult> {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  let paragraphs = normalized.split(/\n\n+/).filter(p => p.trim().length > 0);
  if (paragraphs.length <= 1 && normalized.includes("\n")) {
    paragraphs = normalized.split(/\n/).filter(p => p.trim().length > 0);
  }
  if (paragraphs.length === 0 && normalized.trim().length > 0) {
    paragraphs = [normalized.trim()];
  }
  return {
    chunks: paragraphs,
    metadata: {
      type: "txt",
      totalParagraphs: paragraphs.length,
    },
  };
}

/**
 * معالج SRT مع الحفاظ على التوقيتات
 */
export async function processSrtFile(content: string): Promise<ChunkResult> {
  const subtitles = content
    .replace(/\r\n/g, "\n")
    .split(/\n\n+/)
    .filter(s => s.trim());
  const chunks: string[] = [];
  const timecodes: Array<{ start: string; end: string; index?: string }> = [];

  for (const subtitle of subtitles) {
    const lines = subtitle.split("\n");
    if (lines.length >= 2) {
      // Optional numeric index on the first line.
      const hasIndex = /^\d+\s*$/.test(lines[0] ?? "");
      const tcLine = hasIndex ? lines[1] : lines[0];
      const textLines = hasIndex ? lines.slice(2) : lines.slice(1);
      if (tcLine && tcLine.includes("-->")) {
        const [start, end] = tcLine.split("-->").map(t => t.trim());
        chunks.push(textLines.join("\n"));
        timecodes.push({
          start,
          end,
          index: hasIndex ? lines[0]?.trim() : undefined,
        });
      }
    }
  }

  return {
    chunks,
    metadata: {
      type: "srt",
      timecodes,
      totalSubtitles: chunks.length,
    },
  };
}

/**
 * معالج WebVTT — مماثل لـ SRT مع رأس "WEBVTT" واستخدام النقاط بدل الفواصل.
 */
export async function processVttFile(content: string): Promise<ChunkResult> {
  const normalized = content.replace(/\r\n/g, "\n");
  const blocks = normalized.split(/\n\n+/).filter(b => b.trim().length > 0);
  const chunks: string[] = [];
  const cues: Array<{
    start: string;
    end: string;
    settings?: string;
    identifier?: string;
  }> = [];
  let header = "WEBVTT";

  for (const block of blocks) {
    if (block.trim().toUpperCase().startsWith("WEBVTT")) {
      header = block.trim();
      continue;
    }
    const lines = block.split("\n").filter(l => l.length > 0);
    let identifier: string | undefined;
    let tcLineIndex = 0;
    if (lines[0] && !lines[0].includes("-->")) {
      identifier = lines[0];
      tcLineIndex = 1;
    }
    const tcLine = lines[tcLineIndex];
    if (!tcLine || !tcLine.includes("-->")) continue;
    const [tcRaw, settings] = tcLine.split(/\s+/, 2).length > 1
      ? [tcLine.split(/\s{2,}/)[0], tcLine.split(/\s{2,}/).slice(1).join(" ")]
      : [tcLine, undefined];
    const [start, end] = tcRaw.split("-->").map(t => t.trim());
    chunks.push(lines.slice(tcLineIndex + 1).join("\n"));
    cues.push({ start, end, settings: settings || undefined, identifier });
  }

  return {
    chunks,
    metadata: {
      type: "vtt",
      header,
      cues,
      totalCues: chunks.length,
    },
  };
}

/**
 * معالج Markdown — يحافظ على كتل الكود وروابط/صور وعناوين بدون ترجمتها.
 */
export async function processMarkdownFile(
  content: string
): Promise<ChunkResult> {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const segments: Array<{ kind: "text" | "code" | "blank"; value: string }> =
    [];
  let inCode = false;
  let buffer: string[] = [];
  const flushBuffer = (kind: "text") => {
    if (buffer.length === 0) return;
    segments.push({ kind, value: buffer.join("\n") });
    buffer = [];
  };

  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      flushBuffer("text");
      segments.push({ kind: "code", value: line });
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      segments.push({ kind: "code", value: line });
      continue;
    }
    if (line.trim().length === 0) {
      flushBuffer("text");
      segments.push({ kind: "blank", value: "" });
      continue;
    }
    buffer.push(line);
  }
  flushBuffer("text");

  const chunks: string[] = [];
  const segmentMap: Array<{ kind: string; chunkIndex?: number }> = [];
  for (const seg of segments) {
    if (seg.kind === "text") {
      segmentMap.push({ kind: "text", chunkIndex: chunks.length });
      chunks.push(seg.value);
    } else {
      segmentMap.push({ kind: seg.kind });
    }
  }

  return {
    chunks,
    metadata: {
      type: "md",
      segments,
      segmentMap,
      totalChunks: chunks.length,
    },
  };
}

const HTML_SKIP_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "code",
  "pre",
  "kbd",
  "samp",
  "var",
]);

/**
 * معالج HTML — يستخرج النص من العناصر دون لمس script/style/code.
 * نحتفظ بالشظايا غير النصية (وسوم/فراغات) في الميتاداتا لإعادة البناء.
 */
export async function processHtmlFile(content: string): Promise<ChunkResult> {
  const tokens: Array<{ kind: "tag" | "text"; value: string; chunk?: number }> =
    [];
  const chunks: string[] = [];
  const skipStack: string[] = [];
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9-]*)[^>]*>|<!--[\s\S]*?-->/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(content)) !== null) {
    const between = content.slice(lastIndex, match.index);
    if (between.length > 0) {
      const skipping = skipStack.length > 0;
      if (skipping || between.trim().length === 0) {
        tokens.push({ kind: "text", value: between });
      } else {
        tokens.push({ kind: "text", value: between, chunk: chunks.length });
        chunks.push(between);
      }
    }
    const tag = match[0];
    tokens.push({ kind: "tag", value: tag });
    const name = (match[1] || "").toLowerCase();
    if (name) {
      const isClose = tag.startsWith("</");
      const selfClosing = tag.endsWith("/>");
      if (HTML_SKIP_TAGS.has(name)) {
        if (isClose) {
          if (skipStack[skipStack.length - 1] === name) skipStack.pop();
        } else if (!selfClosing) {
          skipStack.push(name);
        }
      }
    }
    lastIndex = tagRegex.lastIndex;
  }
  const tail = content.slice(lastIndex);
  if (tail.length > 0) {
    if (tail.trim().length === 0 || skipStack.length > 0) {
      tokens.push({ kind: "text", value: tail });
    } else {
      tokens.push({ kind: "text", value: tail, chunk: chunks.length });
      chunks.push(tail);
    }
  }

  return {
    chunks,
    metadata: {
      type: "html",
      tokens,
      totalChunks: chunks.length,
    },
  };
}

/**
 * معالج CSV بسيط — يفترض الفاصلة فاصلاً ويترجم الخلايا غير الرقمية،
 * يتعامل مع علامات اقتباس مزدوجة وفواصل داخل القيمة.
 */
export async function processCsvFile(content: string): Promise<ChunkResult> {
  const rows: string[][] = [];
  let i = 0;
  let cell = "";
  let row: string[] = [];
  let inQuotes = false;
  while (i < content.length) {
    const c = content[i];
    if (inQuotes) {
      if (c === '"' && content[i + 1] === '"') {
        cell += '"';
        i += 2;
        continue;
      }
      if (c === '"') {
        inQuotes = false;
        i++;
        continue;
      }
      cell += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(cell);
      cell = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(cell);
      rows.push(row);
      cell = "";
      row = [];
      i++;
      continue;
    }
    cell += c;
    i++;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const chunks: string[] = [];
  const cellMap: Array<Array<number | null>> = [];
  rows.forEach(rowVals => {
    const mapRow: Array<number | null> = [];
    rowVals.forEach(value => {
      if (value.trim().length === 0 || /^-?\d+(\.\d+)?$/.test(value.trim())) {
        mapRow.push(null);
      } else {
        mapRow.push(chunks.length);
        chunks.push(value);
      }
    });
    cellMap.push(mapRow);
  });

  return {
    chunks,
    metadata: {
      type: "csv",
      rows,
      cellMap,
      totalCells: chunks.length,
    },
  };
}

/**
 * معالج YAML — يحوّل لأي بنية ثم يستخدم خوارزمية شبيهة بـ JSON لاستخراج النصوص.
 */
export async function processYamlFile(content: string): Promise<ChunkResult> {
  try {
    const data = yaml.load(content);
    const chunks: string[] = [];
    const keys: string[] = [];
    extractJsonStrings(data, chunks, keys);
    return {
      chunks,
      metadata: {
        type: "yaml",
        totalStrings: chunks.length,
        keys,
        original: data,
      },
    };
  } catch (error) {
    console.error("Error processing YAML:", error);
    return {
      chunks: [],
      metadata: { type: "yaml", error: true },
    };
  }
}

/**
 * معالج DOCX حقيقي عبر mammoth — يستخرج فقرات HTML ثم يحوّلها لنصوص.
 */
export async function processDocxFile(buffer: Buffer): Promise<ChunkResult> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value || "";
    const paragraphs = text
      .replace(/\r\n/g, "\n")
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
    return {
      chunks: paragraphs,
      metadata: {
        type: "docx",
        chunkCount: paragraphs.length,
        warnings: result.messages?.length ?? 0,
      },
    };
  } catch (error) {
    console.error("Error processing DOCX:", error);
    throw new Error(
      `فشل قراءة ملف DOCX: ${error instanceof Error ? error.message : "unknown"}`
    );
  }
}

interface EpubChapter {
  href: string;
  mediaType: string;
  /** Texts extracted in original order with their start offsets in the chapter HTML. */
  textNodes: Array<{ start: number; end: number; text: string }>;
  /** Full chapter HTML for re-emission. */
  html: string;
}

interface EpubMetadata {
  containerXml: string;
  opfPath: string;
  opfXml: string;
  opfDir: string;
  manifest: Record<string, { href: string; mediaType: string }>;
  spine: string[];
  chapters: EpubChapter[];
  /** Absolute paths inside the zip for every entry, with their original binary content for non-chapter files. */
  passthrough: Array<{ name: string; data: Uint8Array }>;
}

function dirname(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx === -1 ? "" : p.slice(0, idx);
}

function joinPath(base: string, rel: string): string {
  if (!base) return rel;
  if (rel.startsWith("/")) return rel.slice(1);
  const parts = `${base}/${rel}`.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join("/");
}

/**
 * معالج EPUB حقيقي — يفك ضغط ZIP، يقرأ container.xml ثم OPF، ثم يستخرج النصوص من فصول xhtml/html.
 */
export async function processEpubFile(buffer: Buffer): Promise<ChunkResult> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const containerEntry = zip.file("META-INF/container.xml");
    if (!containerEntry) {
      throw new Error("EPUB غير صالح: ينقصه META-INF/container.xml");
    }
    const containerXml = await containerEntry.async("string");
    const opfPathMatch = containerXml.match(
      /<rootfile[^>]+full-path="([^"]+)"/
    );
    if (!opfPathMatch) {
      throw new Error("EPUB غير صالح: لا يوجد مسار OPF في container.xml");
    }
    const opfPath = opfPathMatch[1];
    const opfEntry = zip.file(opfPath);
    if (!opfEntry) {
      throw new Error(`EPUB غير صالح: ملف OPF مفقود: ${opfPath}`);
    }
    const opfXml = await opfEntry.async("string");
    const opfDir = dirname(opfPath);

    const manifest: Record<string, { href: string; mediaType: string }> = {};
    const itemRegex =
      /<item[^>]+id="([^"]+)"[^>]+href="([^"]+)"[^>]+media-type="([^"]+)"[^>]*\/?>(?:<\/item>)?/g;
    let m: RegExpExecArray | null;
    while ((m = itemRegex.exec(opfXml)) !== null) {
      manifest[m[1]] = { href: m[2], mediaType: m[3] };
    }

    const spine: string[] = [];
    const itemRefRegex = /<itemref[^>]+idref="([^"]+)"[^>]*\/?>(?:<\/itemref>)?/g;
    while ((m = itemRefRegex.exec(opfXml)) !== null) {
      spine.push(m[1]);
    }

    const chapters: EpubChapter[] = [];
    const passthrough: EpubMetadata["passthrough"] = [];

    for (const id of spine) {
      const item = manifest[id];
      if (!item) continue;
      const path = joinPath(opfDir, item.href);
      const entry = zip.file(path);
      if (!entry) continue;
      if (
        item.mediaType.includes("html") ||
        item.mediaType.includes("xml") && /xhtml/.test(item.mediaType)
      ) {
        const html = await entry.async("string");
        const textNodes = extractHtmlTextNodes(html);
        chapters.push({
          href: path,
          mediaType: item.mediaType,
          textNodes,
          html,
        });
      }
    }

    // Save every other entry verbatim so we can rebuild the EPUB later.
    for (const [name, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      if (chapters.some(c => c.href === name)) continue;
      const data = await file.async("uint8array");
      passthrough.push({ name, data });
    }

    const chunks: string[] = [];
    const chunkOwners: Array<{ chapter: number; node: number }> = [];
    chapters.forEach((chapter, ci) => {
      chapter.textNodes.forEach((node, ni) => {
        if (node.text.trim().length === 0) return;
        chunkOwners.push({ chapter: ci, node: ni });
        chunks.push(node.text);
      });
    });

    const metadata: EpubMetadata & {
      chunkOwners: typeof chunkOwners;
    } = {
      containerXml,
      opfPath,
      opfXml,
      opfDir,
      manifest,
      spine,
      chapters,
      passthrough,
      chunkOwners,
    };

    return {
      chunks,
      metadata: metadata as unknown as Record<string, unknown>,
    };
  } catch (error) {
    console.error("Error processing EPUB:", error);
    throw new Error(
      `فشل قراءة ملف EPUB: ${error instanceof Error ? error.message : "unknown"}`
    );
  }
}

/**
 * استخراج عقد النص من HTML/XHTML بالحفاظ على المواقع الأصلية.
 */
export function extractHtmlTextNodes(
  html: string
): Array<{ start: number; end: number; text: string }> {
  const nodes: Array<{ start: number; end: number; text: string }> = [];
  const skipStack: string[] = [];
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9-]*)[^>]*>|<!--[\s\S]*?-->/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(html)) !== null) {
    const start = lastIndex;
    const end = match.index;
    if (end > start) {
      const text = html.slice(start, end);
      if (skipStack.length === 0 && text.trim().length > 0) {
        nodes.push({ start, end, text });
      }
    }
    const name = (match[1] || "").toLowerCase();
    if (name) {
      const isClose = match[0].startsWith("</");
      const selfClosing = match[0].endsWith("/>");
      if (HTML_SKIP_TAGS.has(name)) {
        if (isClose) {
          if (skipStack[skipStack.length - 1] === name) skipStack.pop();
        } else if (!selfClosing) {
          skipStack.push(name);
        }
      }
    }
    lastIndex = tagRegex.lastIndex;
  }
  if (lastIndex < html.length) {
    const text = html.slice(lastIndex);
    if (skipStack.length === 0 && text.trim().length > 0) {
      nodes.push({ start: lastIndex, end: html.length, text });
    }
  }
  return nodes;
}

/**
 * إعادة بناء HTML بعد استبدال نصوص عقد محددة.
 * `replacements` خريطة من فهرس العقدة إلى النص الجديد.
 */
export function rebuildHtml(
  html: string,
  textNodes: Array<{ start: number; end: number; text: string }>,
  replacements: Map<number, string>
): string {
  if (textNodes.length === 0) return html;
  let result = "";
  let cursor = 0;
  textNodes.forEach((node, idx) => {
    result += html.slice(cursor, node.start);
    const replacement = replacements.get(idx);
    result += replacement !== undefined ? replacement : node.text;
    cursor = node.end;
  });
  result += html.slice(cursor);
  return result;
}

/**
 * إعادة بناء ملف EPUB من نتيجة معالجة + الترجمات.
 */
export async function rebuildEpubFile(
  metadata: Record<string, unknown>,
  translatedChunks: string[]
): Promise<Buffer> {
  const meta = metadata as unknown as EpubMetadata & {
    chunkOwners: Array<{ chapter: number; node: number }>;
  };
  const zip = new JSZip();

  // Re-add untouched files first.
  for (const entry of meta.passthrough) {
    zip.file(entry.name, entry.data);
  }

  // For each chapter, build replacements map and write the new HTML.
  const perChapterReplacements = new Map<number, Map<number, string>>();
  meta.chunkOwners.forEach((owner, idx) => {
    let map = perChapterReplacements.get(owner.chapter);
    if (!map) {
      map = new Map();
      perChapterReplacements.set(owner.chapter, map);
    }
    map.set(owner.node, translatedChunks[idx] ?? "");
  });

  meta.chapters.forEach((chapter, ci) => {
    const replacements = perChapterReplacements.get(ci) ?? new Map();
    const newHtml = rebuildHtml(chapter.html, chapter.textNodes, replacements);
    zip.file(chapter.href, newHtml);
  });

  const out = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
  return out as Buffer;
}

/**
 * تقسيم ذكي للنص مع الحفاظ على السياق
 * يحافظ على أي شظية أخيرة ليست مغلقة بعلامات ترقيم.
 */
export function smartChunk(
  text: string,
  maxWordsPerChunk: number = 500
): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];

  // Capture both terminated sentences and any trailing fragment (e.g., text without ending punctuation).
  const terminated = trimmed.match(/[^.!?\n]+[.!?]+\s*/g) ?? [];
  const consumed = terminated.join("");
  const remainder = trimmed.slice(consumed.length).trim();
  const segments: string[] = [...terminated.map(s => s.trim())];
  if (remainder.length > 0) segments.push(remainder);
  if (segments.length === 0) segments.push(trimmed);

  const chunks: string[] = [];
  let currentChunk = "";
  let wordCount = 0;

  for (const sentence of segments) {
    const sentenceWordCount = sentence.split(/\s+/).filter(Boolean).length;
    if (wordCount + sentenceWordCount > maxWordsPerChunk && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
      wordCount = sentenceWordCount;
    } else {
      currentChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
      wordCount += sentenceWordCount;
    }
  }
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  return chunks;
}
