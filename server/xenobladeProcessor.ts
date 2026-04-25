/**
 * معالج متخصص لملفات Xenoblade Chronicles
 * يدعم علامات XENO الخاصة والحفاظ على البنية التقنية
 */

interface XenobladeTranslationOptions {
  preserveXenoTags?: boolean;
  preserveSystemTags?: boolean;
  preserveMLTags?: boolean;
  excludeJapanese?: boolean;
  customExclusions?: string[];
}

interface XenobladeContent {
  key: string;
  originalText: string;
  cleanText: string;
  tags: XenoTag[];
  isTranslatable: boolean;
}

interface XenoTag {
  type: "XENO" | "System" | "ML";
  name: string;
  attributes: Record<string, string>;
  fullTag: string;
  position: number;
}

/**
 * أنماط علامات Xenoblade الخاصة
 */
const XENO_TAG_PATTERNS = {
  // [XENO:wait wait=key ]
  xeno: /\[XENO:([a-zA-Z_]+)(?:\s+([^\]]*))?\s*\]/g,
  // [System:Color name=arts_sp ]
  system: /\[System:([a-zA-Z_]+)(?:\s+([^\]]*))?\s*\]/g,
  // [ML:icon icon=enh37 ]
  ml: /\[ML:([a-zA-Z_]+)(?:\s+([^\]]*))?\s*\]/g,
  // [/System:Color]
  closingTag: /\[\/([a-zA-Z_:]+)\]/g,
};

/**
 * مفاتيح Xenoblade التقنية التي لا تُترجم
 */
const XENOBLADE_TECHNICAL_KEYS = new Set([
  "bdat-bin",
  "bdat_common_ms",
  "bdat_menu_mes_ms",
  "bdat_trial_ms",
  "caption_ms",
  "script_msg_ms",
  "pc_arts_ms",
  "trial_main_ms",
  "vs20200100_ms",
  "vs20540100_ms",
  "vs20560100_ms",
  "MNU_sysmes_ms",
  "MNU_buff_ms",
  "0301e3_ms",
  "0301e4_ms",
  "0301e5_ms",
]);

/**
 * استخراج علامات XENO من النص
 */
function extractXenoTags(text: string): XenoTag[] {
  const tags: XenoTag[] = [];

  // استخراج علامات XENO
  const xenoMatches = Array.from(text.matchAll(XENO_TAG_PATTERNS.xeno));
  xenoMatches.forEach((match) => {
    tags.push({
      type: "XENO",
      name: match[1],
      attributes: parseAttributes(match[2] || ""),
      fullTag: match[0],
      position: match.index || 0,
    });
  });

  // استخراج علامات System
  const systemMatches = Array.from(text.matchAll(XENO_TAG_PATTERNS.system));
  systemMatches.forEach((match) => {
    tags.push({
      type: "System",
      name: match[1],
      attributes: parseAttributes(match[2] || ""),
      fullTag: match[0],
      position: match.index || 0,
    });
  });

  // استخراج علامات ML
  const mlMatches = Array.from(text.matchAll(XENO_TAG_PATTERNS.ml));
  mlMatches.forEach((match) => {
    tags.push({
      type: "ML",
      name: match[1],
      attributes: parseAttributes(match[2] || ""),
      fullTag: match[0],
      position: match.index || 0,
    });
  });

  // استخراج علامات الإغلاق
  const closingMatches = Array.from(text.matchAll(XENO_TAG_PATTERNS.closingTag));
  closingMatches.forEach((match) => {
    tags.push({
      type: "System",
      name: `/${match[1]}`,
      attributes: {},
      fullTag: match[0],
      position: match.index || 0,
    });
  });

  return tags.sort((a, b) => a.position - b.position);
}

/**
 * تحليل خصائص العلامة
 */
function parseAttributes(attrString: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attrRegex = /(\w+)=([^\s]+)/g;
  let match;

  while ((match = attrRegex.exec(attrString)) !== null) {
    attributes[match[1]] = match[2];
  }

  return attributes;
}

/**
 * تنظيف النص من العلامات مع الحفاظ على المعلومات
 */
function cleanXenoText(text: string): string {
  let cleaned = text;

  // إزالة علامات XENO
  cleaned = cleaned.replace(XENO_TAG_PATTERNS.xeno, "");

  // إزالة علامات System
  cleaned = cleaned.replace(XENO_TAG_PATTERNS.system, "");

  // إزالة علامات ML
  cleaned = cleaned.replace(XENO_TAG_PATTERNS.ml, "");

  // إزالة علامات الإغلاق
  cleaned = cleaned.replace(XENO_TAG_PATTERNS.closingTag, "");

  // تنظيف المسافات الزائدة
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned;
}

/**
 * استخراج محتوى قابل للترجمة من JSON مع دعم Xenoblade
 */
export function extractXenobladeStrings(
  json: any,
  options: XenobladeTranslationOptions = {}
): XenobladeContent[] {
  const {
    preserveXenoTags = true,
    preserveSystemTags = true,
    preserveMLTags = true,
    excludeJapanese = true,
    customExclusions = [],
  } = options;

  const result: XenobladeContent[] = [];
  const excludeSet = new Set<string>();
  XENOBLADE_TECHNICAL_KEYS.forEach((key) => excludeSet.add(key));
  customExclusions.forEach((key) => excludeSet.add(key));

  function traverse(obj: any, path: string, depth: number = 0): void {
    if (depth > 10 || obj === null || obj === undefined) return;

    if (typeof obj === "string") {
      // تحقق من أن النص ليس فارغاً
      if (obj.trim().length === 0) return;

      // استبعد النصوص اليابانية إذا كان مطلوباً
      if (excludeJapanese && /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(obj)) {
        return;
      }

      // استبعد النصوص التقنية (أرقام فقط أو مسافات)
      if (/^[\d\s\[\]]*$/.test(obj)) return;

      const tags = extractXenoTags(obj);
      const cleanText = cleanXenoText(obj);

      // تحقق من أن النص النظيف ليس فارغاً
      if (cleanText.length > 0) {
        result.push({
          key: path.split(".").pop() || "value",
          originalText: obj,
          cleanText,
          tags,
          isTranslatable: true,
        });
      }
    } else if (typeof obj === "object" && obj !== null) {
      if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
          traverse(item, `${path}[${index}]`, depth + 1);
        });
      } else {
        Object.entries(obj).forEach(([key, value]) => {
          const newPath = `${path}.${key}`;
          const isExcluded = excludeSet.has(key.toLowerCase());

          if (!isExcluded) {
            traverse(value, newPath, depth + 1);
          }
        });
      }
    }
  }

  traverse(json, "root");
  return result;
}

/**
 * إعادة بناء النص مع الحفاظ على العلامات
 */
export function reconstructXenoText(
  originalText: string,
  translatedText: string,
  tags: XenoTag[]
): string {
  if (tags.length === 0) {
    return translatedText;
  }

  // إعادة إدراج العلامات في النص المترجم
  let result = translatedText;

  // إضافة العلامات في نهاية النص إذا لم تكن موجودة
  const tagStrings = tags.map((tag) => tag.fullTag);
  const uniqueTagsSet = new Set(tagStrings);
  const uniqueTags: string[] = [];
  uniqueTagsSet.forEach((tag) => uniqueTags.push(tag));

  for (const tag of uniqueTags) {
    if (!result.includes(tag)) {
      result += ` ${tag}`;
    }
  }

  return result;
}

/**
 * إعادة بناء JSON من محتوى مترجم
 */
export function reconstructXenobladeJson(
  originalJson: any,
  translatedContent: Map<string, { text: string; tags: XenoTag[] }>
): any {
  const result = JSON.parse(JSON.stringify(originalJson));

  function traverse(obj: any, path: string): any {
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === "string") {
      const translated = translatedContent.get(path);
      if (translated) {
        return reconstructXenoText(obj, translated.text, translated.tags);
      }
      return obj;
    } else if (typeof obj === "object") {
      if (Array.isArray(obj)) {
        return obj.map((item, index) => {
          return traverse(item, `${path}[${index}]`);
        });
      } else {
        const entries = Object.entries(obj);
        entries.forEach(([key, value]) => {
          const newPath = `${path}.${key}`;
          obj[key] = traverse(value, newPath);
        });
        return obj;
      }
    }

    return obj;
  }

  return traverse(result, "root");
}

/**
 * معالجة ملف Xenoblade JSON كاملة
 */
export async function processXenobladeFile(
  content: string,
  options: XenobladeTranslationOptions = {}
): Promise<{
  chunks: Array<{
    id: string;
    text: string;
    cleanText: string;
    tags: XenoTag[];
  }>;
  metadata: Record<string, unknown>;
}> {
  try {
    const json = JSON.parse(content);
    const translatableContent = extractXenobladeStrings(json, options);

    const chunks = translatableContent.map((item, index) => ({
      id: `chunk_${index}`,
      text: item.originalText,
      cleanText: item.cleanText,
      tags: item.tags,
    }));

    return {
      chunks,
      metadata: {
        type: "xenoblade_json",
        totalStrings: chunks.length,
        hasXenoTags: chunks.some((c) => c.tags.length > 0),
        tagTypes: {
          xeno: chunks.filter((c) => c.tags.some((t) => t.type === "XENO")).length,
          system: chunks.filter((c) => c.tags.some((t) => t.type === "System")).length,
          ml: chunks.filter((c) => c.tags.some((t) => t.type === "ML")).length,
        },
        note: "معالجة متخصصة لملفات Xenoblade مع دعم علامات XENO",
      },
    };
  } catch (error) {
    console.error("Error processing Xenoblade file:", error);
    return {
      chunks: [],
      metadata: {
        type: "xenoblade_json",
        error: true,
        message: "Failed to parse Xenoblade JSON file",
      },
    };
  }
}

/**
 * إنشاء تقرير تفصيلي عن محتوى الملف
 */
export function generateXenobladeReport(
  chunks: Array<{
    id: string;
    text: string;
    cleanText: string;
    tags: XenoTag[];
  }>
): {
  summary: string;
  statistics: Record<string, unknown>;
  samples: Array<{ id: string; original: string; clean: string }>;
} {
  const totalChunks = chunks.length;
  const chunksWithTags = chunks.filter((c) => c.tags.length > 0).length;
  const avgTextLength =
    chunks.reduce((sum, c) => sum + c.cleanText.length, 0) / totalChunks || 0;

  const tagCounts: Record<string, number> = {};
  chunks.forEach((chunk) => {
    chunk.tags.forEach((tag) => {
      tagCounts[tag.type] = (tagCounts[tag.type] || 0) + 1;
    });
  });

  const samples = chunks.slice(0, 5).map((chunk) => ({
    id: chunk.id,
    original: chunk.text,
    clean: chunk.cleanText,
  }));

  return {
    summary: `تم استخراج ${totalChunks} نص قابل للترجمة، ${chunksWithTags} منها يحتوي على علامات XENO خاصة.`,
    statistics: {
      totalStrings: totalChunks,
      stringsWithTags: chunksWithTags,
      averageLength: Math.round(avgTextLength),
      tagCounts,
    },
    samples,
  };
}

/**
 * التحقق من صحة ملف Xenoblade JSON
 */
export function validateXenobladeJson(content: string): {
  valid: boolean;
  error?: string;
  warnings?: string[];
} {
  try {
    const json = JSON.parse(content);

    const warnings: string[] = [];

    // تحقق من وجود مفاتيح Xenoblade المعروفة
    const hasXenobladeKeys = Object.keys(json).some((key) =>
      key.includes("bdat-bin")
    );

    if (!hasXenobladeKeys) {
      warnings.push("لم يتم العثور على مفاتيح Xenoblade المعروفة");
    }

    // تحقق من وجود علامات XENO
    const hasXenoTags = JSON.stringify(json).includes("[XENO:");
    if (!hasXenoTags) {
      warnings.push("لم يتم العثور على علامات XENO");
    }

    return {
      valid: true,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Invalid JSON",
    };
  }
}
