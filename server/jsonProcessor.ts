/**
 * معالج JSON متقدم
 * يدعم استخراج النصوص مع الحفاظ على المفاتيح التقنية والبنية الأصلية
 */

interface JsonProcessingOptions {
  excludeKeys?: string[];
  preserveFormatTags?: boolean;
  nestedDepth?: number;
}

interface TranslatableContent {
  key: string;
  value: string;
  path: string;
  isTranslatable: boolean;
}

// قائمة المفاتيح التقنية التي لا تُترجم
const TECHNICAL_KEYS = new Set([
  "id",
  "key",
  "code",
  "type",
  "status",
  "version",
  "timestamp",
  "date",
  "url",
  "href",
  "src",
  "path",
  "hash",
  "uuid",
  "guid",
  "index",
  "count",
  "total",
  "value",
  "amount",
  "price",
  "cost",
  "quantity",
  "width",
  "height",
  "x",
  "y",
  "z",
  "color",
  "hex",
  "rgb",
  "rgba",
  "opacity",
  "alpha",
  "enabled",
  "disabled",
  "visible",
  "hidden",
  "active",
  "inactive",
  "default",
  "min",
  "max",
  "step",
  "scale",
  "rotation",
  "position",
  "size",
  "offset",
  "margin",
  "padding",
  "border",
  "shadow",
  "filter",
  "transform",
  "animation",
  "duration",
  "delay",
  "easing",
  "loop",
  "repeat",
  "speed",
  "fps",
  "quality",
  "format",
  "encoding",
  "compression",
  "resolution",
  "bitrate",
  "sample_rate",
  "channels",
  "volume",
  "pan",
  "equalizer",
  "effect",
  "plugin",
  "module",
  "component",
  "class",
  "interface",
  "enum",
  "constant",
  "variable",
  "function",
  "method",
  "property",
  "attribute",
  "element",
  "node",
  "parent",
  "child",
  "sibling",
  "namespace",
  "package",
  "import",
  "export",
  "require",
  "module_name",
  "class_name",
  "function_name",
  "variable_name",
  "event",
  "listener",
  "handler",
  "callback",
  "promise",
  "async",
  "await",
  "yield",
  "return",
  "throw",
  "try",
  "catch",
  "finally",
  "if",
  "else",
  "switch",
  "case",
  "default",
  "for",
  "while",
  "do",
  "break",
  "continue",
  "goto",
  "label",
  "operator",
  "operand",
  "expression",
  "statement",
  "block",
  "scope",
  "context",
  "this",
  "self",
  "super",
  "static",
  "final",
  "abstract",
  "interface",
  "extends",
  "implements",
  "instanceof",
  "typeof",
  "new",
  "delete",
  "void",
  "null",
  "undefined",
  "true",
  "false",
  "nan",
  "infinity",
]);

// أنماط النصوص التقنية التي يجب الحفاظ عليها
const TECHNICAL_PATTERNS = [
  /\{[a-zA-Z_][a-zA-Z0-9_]*\}/g, // {variable}
  /\$[a-zA-Z_][a-zA-Z0-9_]*/g, // $variable
  /\[[a-zA-Z_][a-zA-Z0-9_]*\]/g, // [index]
  /<[a-zA-Z][a-zA-Z0-9]*>/g, // <tag>
  /`[^`]*`/g, // `code`
  /\[code\].*?\[\/code\]/gi, // [code]...[/code]
  /\[b\].*?\[\/b\]/gi, // [b]...[/b]
  /\[i\].*?\[\/i\]/gi, // [i]...[/i]
  /\[u\].*?\[\/u\]/gi, // [u]...[/u]
  /\[color[^\]]*\].*?\[\/color\]/gi, // [color]...[/color]
  /\[size[^\]]*\].*?\[\/size\]/gi, // [size]...[/size]
  /\[font[^\]]*\].*?\[\/font\]/gi, // [font]...[/font]
  /\n/g, // newlines
  /\t/g, // tabs
];

/**
 * استخراج النصوص القابلة للترجمة من JSON
 */
export function extractJsonStrings(
  json: any,
  options: JsonProcessingOptions = {},
  path: string = "root"
): TranslatableContent[] {
  const {
    excludeKeys = [],
    preserveFormatTags = true,
    nestedDepth = 10,
  } = options;

  const result: TranslatableContent[] = [];
  const excludeSet = new Set<string>();
  excludeKeys.forEach((key) => excludeSet.add(key));
  TECHNICAL_KEYS.forEach((key) => excludeSet.add(key));

  function traverse(obj: any, currentPath: string, depth: number): void {
    if (depth > nestedDepth) return;
    if (obj === null || obj === undefined) return;

    if (typeof obj === "string") {
      // تحقق من أن النص ليس فارغاً وليس رقماً فقط
      if (obj.trim().length > 0 && !/^\d+$/.test(obj)) {
        result.push({
          key: currentPath.split(".").pop() || "value",
          value: obj,
          path: currentPath,
          isTranslatable: true,
        });
      }
    } else if (typeof obj === "object" && obj !== null) {
      if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
          traverse(item, `${currentPath}[${index}]`, depth + 1);
        });
      } else {
        Object.entries(obj).forEach(([key, value]) => {
          const newPath = `${currentPath}.${key}`;
          const isExcluded = excludeSet.has(key.toLowerCase());

          if (!isExcluded) {
            traverse(value, newPath, depth + 1);
          }
        });
      }
    }
  }

  traverse(json, path, 0);
  return result;
}

/**
 * إعادة بناء JSON من النصوص المترجمة
 */
export function reconstructJson(
  originalJson: any,
  translatedStrings: Map<string, string>
): any {
  const result = JSON.parse(JSON.stringify(originalJson)); // Deep clone

  function traverse(obj: any, path: string): any {
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === "string") {
      const translated = translatedStrings.get(path);
      if (translated) {
        return translated;
      }
      return obj;
    } else if (typeof obj === "object") {
      if (Array.isArray(obj)) {
        return obj.map((item, index) => {
          return traverse(item, `${path}[${index}]`);
        });
      } else {
        Object.entries(obj).forEach(([key, value]) => {
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
 * معالجة ملف JSON كاملة
 */
export async function processJsonFile(
  content: string,
  options: JsonProcessingOptions = {}
): Promise<{
  chunks: string[];
  metadata: Record<string, unknown>;
  mapping: Map<string, string>;
}> {
  try {
    const json = JSON.parse(content);
    const translatableContent = extractJsonStrings(json, options);

    // إنشاء خريطة من المسارات إلى النصوص
    const mapping = new Map<string, string>();
    const chunks: string[] = [];

    for (const item of translatableContent) {
      mapping.set(item.path, item.value);
      chunks.push(item.value);
    }

    return {
      chunks,
      metadata: {
        type: "json",
        totalStrings: chunks.length,
        structure: {
          keys: Object.keys(json),
          depth: calculateJsonDepth(json),
        },
      },
      mapping,
    };
  } catch (error) {
    console.error("Error processing JSON:", error);
    return {
      chunks: [],
      metadata: {
        type: "json",
        error: true,
        message: "Failed to parse JSON file",
      },
      mapping: new Map(),
    };
  }
}

/**
 * حساب عمق JSON
 */
function calculateJsonDepth(obj: any, currentDepth: number = 0): number {
  if (obj === null || obj === undefined) return currentDepth;
  if (typeof obj !== "object") return currentDepth;

  let maxDepth = currentDepth;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const depth = calculateJsonDepth(item, currentDepth + 1);
      maxDepth = Math.max(maxDepth, depth);
    }
  } else {
    for (const value of Object.values(obj)) {
      const depth = calculateJsonDepth(value, currentDepth + 1);
      maxDepth = Math.max(maxDepth, depth);
    }
  }

  return maxDepth;
}

/**
 * الحفاظ على علامات التنسيق في النص
 */
export function preserveFormatTags(text: string): {
  text: string;
  tags: Array<{ pattern: string; index: number }>;
} {
  const tags: Array<{ pattern: string; index: number }> = [];
  let processedText = text;

  TECHNICAL_PATTERNS.forEach((pattern) => {
    const matches = Array.from(text.matchAll(pattern));
    matches.forEach((match) => {
      if (match[0]) {
        tags.push({
          pattern: match[0],
          index: match.index || 0,
        });
      }
    });
  });

  return { text: processedText, tags };
}

/**
 * استعادة علامات التنسيق بعد الترجمة
 */
export function restoreFormatTags(
  translatedText: string,
  tags: Array<{ pattern: string; index: number }>
): string {
  let result = translatedText;

  // إعادة إدراج العلامات التقنية إن أمكن
  tags.forEach((tag) => {
    if (!result.includes(tag.pattern)) {
      result += ` ${tag.pattern}`;
    }
  });

  return result;
}

/**
 * تحويل JSON إلى صيغة قابلة للترجمة (CSV-like)
 */
export function jsonToTranslatableFormat(
  json: any,
  options: JsonProcessingOptions = {}
): string {
  const content = extractJsonStrings(json, options);

  const lines = [
    "path\tsource_text",
    ...content.map((item) => `${item.path}\t${item.value}`),
  ];

  return lines.join("\n");
}

/**
 * تحويل من صيغة قابلة للترجمة إلى JSON
 */
export function translatableFormatToJson(
  originalJson: any,
  translatableContent: string
): any {
  const lines = translatableContent.split("\n").slice(1); // Skip header
  const mapping = new Map<string, string>();

  for (const line of lines) {
    const [path, translatedText] = line.split("\t");
    if (path && translatedText) {
      mapping.set(path, translatedText);
    }
  }

  return reconstructJson(originalJson, mapping);
}

/**
 * التحقق من صحة JSON
 */
export function validateJson(content: string): { valid: boolean; error?: string } {
  try {
    JSON.parse(content);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Invalid JSON",
    };
  }
}
