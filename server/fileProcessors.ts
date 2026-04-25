/**
 * معالجات الملفات لأنواع مختلفة
 * تتعامل مع استخراج النصوص والحفاظ على التنسيق
 */

interface ChunkResult {
  chunks: string[];
  metadata: Record<string, unknown>;
}

// دالة مساعدة لاستخراج النصوص من JSON
function extractJsonStrings(obj: any, chunks: string[], keys: string[], prefix = ""): void {
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
      Object.entries(obj).forEach(([key, value]) => {
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
 * معالج TXT البسيط
 */
export async function processTxtFile(content: string): Promise<ChunkResult> {
  // تقسيم النص إلى فقرات
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim());
  
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
  const subtitles = content.split(/\n\n+/).filter(s => s.trim());
  const chunks: string[] = [];
  const timecodes: Array<{ start: string; end: string }> = [];

  for (const subtitle of subtitles) {
    const lines = subtitle.split("\n");
    if (lines.length >= 3) {
      const timecode = lines[1];
      const text = lines.slice(2).join("\n");
      
      if (timecode.includes("-->")) {
        const [start, end] = timecode.split("-->").map(t => t.trim());
        chunks.push(text);
        timecodes.push({ start, end });
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
 * معالج DOCX (يتطلب مكتبة خارجية)
 * هذا مثال على الهيكل الأساسي
 */
export async function processDocxFile(buffer: Buffer): Promise<ChunkResult> {
  try {
    // استخراج النص من الملف (DOCX هو ZIP يحتوي على XML)
    const text = buffer.toString("utf-8", 0, Math.min(50000, buffer.length));
    
    // إزالة علامات XML
    const cleanText = text
      .replace(/<[^>]*>/g, "")
      .replace(/&[^;]+;/g, "")
      .split(/\n\n+/)
      .filter((p) => p.trim().length > 0);

    return {
      chunks: cleanText,
      metadata: {
        type: "docx",
        chunkCount: cleanText.length,
        note: "معالجة مبسطة - استخدم مكتبة متقدمة للإنتاج",
      },
    };
  } catch (error) {
    console.error("Error processing DOCX:", error);
    return {
      chunks: ["فشل معالجة ملف DOCX"],
      metadata: {
        type: "docx",
        error: true,
      },
    };
  }
}

/**
 * معالج EPUB مع الحفاظ على البنية
 */
export async function processEpubFile(buffer: Buffer): Promise<ChunkResult> {
  try {
    // استخراج النص من الملف (EPUB هو ZIP يحتوي على XML/HTML)
    const text = buffer.toString("utf-8", 0, Math.min(50000, buffer.length));
    
    // إزالة علامات HTML/XML
    const cleanText = text
      .replace(/<[^>]*>/g, "")
      .replace(/&[^;]+;/g, "")
      .split(/\n\n+/)
      .filter((p) => p.trim().length > 0);

    return {
      chunks: cleanText,
      metadata: {
        type: "epub",
        chunkCount: cleanText.length,
        note: "معالجة مبسطة - استخدم مكتبة متقدمة للإنتاج",
      },
    };
  } catch (error) {
    console.error("Error processing EPUB:", error);
    return {
      chunks: ["فشل معالجة ملف EPUB"],
      metadata: {
        type: "epub",
        error: true,
      },
    };
  }
}

/**
 * تقسيم ذكي للنص مع الحفاظ على السياق
 * يقسم النص إلى أجزاء معقولة بناءً على عدد الكلمات
 */
export function smartChunk(
  text: string,
  maxWordsPerChunk: number = 500
): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks: string[] = [];
  let currentChunk = "";
  let wordCount = 0;

  for (const sentence of sentences) {
    const sentenceWordCount = sentence.split(/\s+/).length;
    
    if (wordCount + sentenceWordCount > maxWordsPerChunk && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
      wordCount = sentenceWordCount;
    } else {
      currentChunk += sentence;
      wordCount += sentenceWordCount;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * إعادة بناء النص من أجزاء مترجمة
 */
export function reconstructText(
  originalChunks: string[],
  translatedChunks: string[],
  metadata: Record<string, unknown>
): string {
  if (metadata.type === "srt") {
    return reconstructSrt(translatedChunks, metadata.timecodes as Array<{ start: string; end: string }>);
  }

  return translatedChunks.join("\n\n");
}

/**
 * إعادة بناء ملف SRT مع التوقيتات
 */
function reconstructSrt(
  translatedChunks: string[],
  timecodes: Array<{ start: string; end: string }>
): string {
  const srtLines: string[] = [];

  for (let i = 0; i < translatedChunks.length; i++) {
    srtLines.push(String(i + 1));
    srtLines.push(`${timecodes[i].start} --> ${timecodes[i].end}`);
    srtLines.push(translatedChunks[i]);
    srtLines.push("");
  }

  return srtLines.join("\n");
}
