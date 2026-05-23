import { describe, expect, it, vi } from "vitest";
import {
  applyXenoQualitySuggestions,
  enhanceXenoTranslations,
  extractXenoReviewEntries,
  scanXenoLineSplitQuality,
  scanXenoSymbolsAndLineBreaks,
} from "./xenobladeQuality";

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(async () => ({
    id: "mock",
    created: Date.now(),
    model: "mock",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content:
            '{"issues":[{"index":0,"suggestion":"ترجمة محسنة [XENO:wait]","reason":"صياغة أفضل","detail":"تحسين واضح","severity":"medium"}]}',
        },
        finish_reason: "stop",
      },
    ],
  })),
}));

describe("xenoblade quality tools", () => {
  it("extracts aligned original/translated review entries", () => {
    const original = JSON.stringify({ lines: [{ text: "Hello [XENO:wait]" }] });
    const translated = JSON.stringify({ lines: [{ text: "مرحبا [XENO:wait]" }] });
    const result = extractXenoReviewEntries(original, translated);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].path).toBe("root.lines[0].text");
  });

  it("flags missing tags and suggests restoration", () => {
    const issues = scanXenoSymbolsAndLineBreaks([
      {
        key: "text",
        path: "root.text",
        original: "Hello [XENO:wait]",
        translation: "مرحبا",
      },
    ]);
    expect(issues[0].kind).toBe("missing-tags");
    expect(issues[0].suggestion).toContain("[XENO:wait]");
  });

  it("uses Zelda-style line split quality without forcing comma splits", () => {
    const issues = scanXenoLineSplitQuality([
      {
        key: "text",
        path: "root.text",
        original: "First line\nSecond line",
        translation: "السطر الأول، ثم السطر الثاني",
      },
    ]);
    expect(issues[0]?.suggestion).not.toBe("السطر الأول،\nثم السطر الثاني");
  });

  it("applies selected suggestions by JSON path", () => {
    const out = applyXenoQualitySuggestions(
      { lines: [{ text: "قديم" }] },
      [{ path: "root.lines[0].text", suggestion: "جديد" }]
    ) as { lines: Array<{ text: string }> };
    expect(out.lines[0].text).toBe("جديد");
  });

  it("returns AI enhancement suggestions with protected tags", async () => {
    const issues = await enhanceXenoTranslations([
      {
        key: "text",
        path: "root.text",
        original: "Hello [XENO:wait]",
        translation: "مرحبا",
      },
    ]);
    expect(issues[0].kind).toBe("ai-enhance");
    expect(issues[0].suggestion).toContain("[XENO:wait]");
  });
});
