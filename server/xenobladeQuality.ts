import { invokeLLM } from "./_core/llm";
import {
  extractXenobladeStrings,
  extractXenoTags,
  restoreXenoTagsAndLineBreaks,
} from "./xenobladeProcessor";
import { diagnoseLineSplit, proposeBetterSplit } from "./lineSplitQuality";

export type XenoQualityIssueKind =
  | "missing-tags"
  | "extra-tags"
  | "line-breaks"
  | "line-split"
  | "ai-enhance";

export type XenoQualitySeverity = "high" | "medium" | "low";

export interface XenoQualityEntry {
  key: string;
  path: string;
  original: string;
  translation: string;
}

export interface XenoQualityIssue {
  id: string;
  key: string;
  path: string;
  original: string;
  translation: string;
  suggestion: string;
  kind: XenoQualityIssueKind;
  severity: XenoQualitySeverity;
  reason: string;
  detail: string;
}

interface EnhanceOptions {
  model?: string;
  temperature?: number;
  glossary?: Array<{ term: string; translation: string; notes?: string }>;
}

function pathParts(path: string): string[] {
  return path.replace(/^root\.?/, "").match(/[^.[\]]+|\[(\d+)\]/g) ?? [];
}

function readPath(obj: unknown, path: string): unknown {
  let current: unknown = obj;
  for (const raw of pathParts(path)) {
    if (current === null || current === undefined) return undefined;
    const indexMatch = raw.match(/^\[(\d+)\]$/);
    if (indexMatch) {
      if (!Array.isArray(current)) return undefined;
      current = current[Number(indexMatch[1])];
    } else if (typeof current === "object") {
      current = (current as Record<string, unknown>)[raw];
    } else {
      return undefined;
    }
  }
  return current;
}

function writePath(obj: unknown, path: string, value: string): void {
  const parts = pathParts(path);
  if (parts.length === 0) return;
  let current: unknown = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const raw = parts[i];
    const indexMatch = raw.match(/^\[(\d+)\]$/);
    current = indexMatch
      ? (current as unknown[])[Number(indexMatch[1])]
      : (current as Record<string, unknown>)[raw];
  }
  const last = parts[parts.length - 1];
  const indexMatch = last.match(/^\[(\d+)\]$/);
  if (indexMatch) (current as unknown[])[Number(indexMatch[1])] = value;
  else (current as Record<string, unknown>)[last] = value;
}

export function extractXenoReviewEntries(
  originalContent: string,
  translatedContent: string
): { originalJson: unknown; translatedJson: unknown; entries: XenoQualityEntry[] } {
  const originalJson = JSON.parse(originalContent);
  const translatedJson = JSON.parse(translatedContent);
  const originalItems = extractXenobladeStrings(originalJson, {
    preserveXenoTags: true,
    preserveSystemTags: true,
    preserveMLTags: true,
    excludeJapanese: false,
  });
  const entries: XenoQualityEntry[] = [];
  for (const item of originalItems) {
    const translated = readPath(translatedJson, item.path);
    if (typeof translated !== "string" || translated.trim().length === 0) continue;
    entries.push({
      key: item.key,
      path: item.path,
      original: item.originalText,
      translation: translated,
    });
  }
  return { originalJson, translatedJson, entries };
}

export function applyXenoQualitySuggestions(
  translatedJson: unknown,
  suggestions: Array<{ path: string; suggestion: string }>
): unknown {
  const out = JSON.parse(JSON.stringify(translatedJson));
  for (const item of suggestions) {
    if (item.path && typeof item.suggestion === "string") {
      writePath(out, item.path, item.suggestion);
    }
  }
  return out;
}

function normalizeBreaks(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
}

function countLines(text: string): number {
  return normalizeBreaks(text).split("\n").length;
}

function tagSignature(text: string): string[] {
  return extractXenoTags(text).map(tag => tag.fullTag);
}

function sameTagMultiset(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const counts = new Map<string, number>();
  for (const tag of a) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  for (const tag of b) {
    const next = (counts.get(tag) ?? 0) - 1;
    if (next < 0) return false;
    if (next === 0) counts.delete(tag);
    else counts.set(tag, next);
  }
  return counts.size === 0;
}

function safeSuggestion(original: string, translation: string, suggestion: string): string {
  return restoreXenoTagsAndLineBreaks(original, suggestion || translation);
}

export function scanXenoSymbolsAndLineBreaks(entries: XenoQualityEntry[]): XenoQualityIssue[] {
  const issues: XenoQualityIssue[] = [];
  for (const entry of entries) {
    if (!entry.translation.trim()) continue;

    const originalTags = tagSignature(entry.original);
    const translationTags = tagSignature(entry.translation);
    const restored = restoreXenoTagsAndLineBreaks(entry.original, entry.translation);
    const normalizedTranslation = normalizeBreaks(entry.translation);
    const originalLineCount = countLines(entry.original);
    const translationLineCount = countLines(entry.translation);

    if (originalTags.length > translationTags.length) {
      issues.push({
        ...entry,
        id: `${entry.path}:missing-tags`,
        suggestion: restored,
        kind: "missing-tags",
        severity: "high",
        reason: "علامات تقنية مفقودة",
        detail: `الأصل يحتوي ${originalTags.length} علامة Xenoblade، والترجمة تحتوي ${translationTags.length}.`,
      });
      continue;
    }

    if (translationTags.length > originalTags.length || !sameTagMultiset(originalTags, translationTags)) {
      issues.push({
        ...entry,
        id: `${entry.path}:extra-tags`,
        suggestion: restored,
        kind: "extra-tags",
        severity: "medium",
        reason: "علامات تقنية زائدة أو مختلفة",
        detail: "الترجمة غيّرت مجموعة علامات Xenoblade مقارنة بالنص الأصلي.",
      });
      continue;
    }

    if (restored !== normalizedTranslation && originalLineCount !== translationLineCount) {
      issues.push({
        ...entry,
        id: `${entry.path}:line-breaks`,
        suggestion: restored,
        kind: "line-breaks",
        severity: "medium",
        reason: "فواصل أسطر ناقصة",
        detail: `الأصل ${originalLineCount} أسطر، والترجمة ${translationLineCount} أسطر.`,
      });
    }
  }
  return issues;
}

export function scanXenoLineSplitQuality(entries: XenoQualityEntry[]): XenoQualityIssue[] {
  const issues: XenoQualityIssue[] = [];
  for (const entry of entries) {
    if (!entry.translation.trim()) continue;
    const diagnosis = diagnoseLineSplit(entry.original, entry.translation);
    if (diagnosis.score >= 75) continue;
    const proposed = proposeBetterSplit(entry.original, entry.translation);
    if (!proposed || proposed === entry.translation) continue;
    issues.push({
      ...entry,
      id: `${entry.path}:line-split`,
      suggestion: safeSuggestion(entry.original, entry.translation, proposed),
      kind: "line-split",
      severity: diagnosis.score < 45 ? "high" : "medium",
      reason: "تقسيم الأسطر يحتاج مراجعة",
      detail: diagnosis.reasons.join("؛ ") || `درجة التقسيم ${diagnosis.score}/100.`,
    });
  }
  return issues;
}

function buildEnhancePrompt(entries: XenoQualityEntry[], glossary?: EnhanceOptions["glossary"]): string {
  const glossaryText = glossary?.length
    ? glossary
        .slice(0, 120)
        .map(g => (g.notes ? `- ${g.term} = ${g.translation} (${g.notes})` : `- ${g.term} = ${g.translation}`))
        .join("\n")
    : "";

  return `راجع ترجمات عربية لملفات Xenoblade Chronicles. اقترح إصلاحاً فقط عند وجود خطأ واضح في المعنى، الركاكة الشديدة، مصطلح مخالف، أو مشكلة إملاء/ترقيم مؤثرة.

قواعد صارمة:
- لا تغيّر أو تحذف علامات [XENO:...] أو [System:...] أو [ML:...] أو علامات الإغلاق.
- حافظ على فواصل الأسطر قدر الإمكان.
- لا تقسّم الأسطر بعد الفاصلة تلقائياً؛ اقترح تقسيم الأسطر فقط إذا كان أفضل منطقياً مثل أداة زيلدا.
- لا تقترح تعديلاً ذوقياً إذا كانت الترجمة مفهومة.
- أعد JSON فقط بالشكل: {"issues":[{"index":0,"suggestion":"النص المقترح","reason":"سبب قصير","detail":"شرح مختصر","severity":"high|medium|low"}]}

${glossaryText ? `القاموس:\n${glossaryText}\n\n` : ""}النصوص:
${entries.map((e, i) => `[${i}] الأصل:\n${e.original}\nالترجمة:\n${e.translation}`).join("\n\n")}`;
}

export async function enhanceXenoTranslations(
  entries: XenoQualityEntry[],
  options: EnhanceOptions = {}
): Promise<XenoQualityIssue[]> {
  if (entries.length === 0) return [];
  const response = await invokeLLM({
    model: options.model,
    temperature: options.temperature ?? 0.2,
    messages: [
      {
        role: "system",
        content:
          "أنت مراجع ترجمة ألعاب عربي متخصص. أجب دائماً بـ JSON صالح فقط.",
      },
      { role: "user", content: buildEnhancePrompt(entries, options.glossary) },
    ],
  });
  const content = response.choices[0]?.message?.content;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map(part => (part.type === "text" ? part.text : "")).join("")
        : "";

  let parsed: {
    issues?: Array<{
      index?: number;
      suggestion?: string;
      reason?: string;
      detail?: string;
      severity?: XenoQualitySeverity;
    }>;
  } = {};
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
  const raw = (jsonMatch[1] || text).trim();
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch) parsed = JSON.parse(objMatch[0]);

  const out: XenoQualityIssue[] = [];
  for (const issue of parsed.issues ?? []) {
      const source = entries[issue.index ?? -1];
      if (!source || !issue.suggestion?.trim()) continue;
      const suggestion = safeSuggestion(source.original, source.translation, issue.suggestion);
      if (suggestion === source.translation) continue;
      out.push({
        ...source,
        id: `${source.path}:ai-enhance`,
        suggestion,
        kind: "ai-enhance" as const,
        severity: issue.severity ?? "medium",
        reason: issue.reason || "اقتراح تحسين",
        detail: issue.detail || "اقتراح من مراجعة الذكاء الاصطناعي.",
      });
  }
  return out;
}
