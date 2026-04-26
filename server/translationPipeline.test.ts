import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { detectFileType, runTranslationPipeline } from "./translationPipeline";

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(
    async ({
      messages,
    }: {
      messages: Array<{ role: string; content: string }>;
    }) => {
      const userMsg = messages.find(m => m.role === "user");
      const text = typeof userMsg?.content === "string" ? userMsg.content : "";
      return {
        id: "mock",
        created: Date.now(),
        model: "mock",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: `[T]${text}` },
            finish_reason: "stop",
          },
        ],
      };
    }
  ),
}));

beforeEach(() => {
  process.env.OPENAI_API_KEY = "test";
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("detectFileType", () => {
  it("detects plain JSON by extension", () => {
    expect(detectFileType("data.json", "{}")).toBe("json");
  });

  it("detects Xenoblade JSON via XENO tag in content", () => {
    expect(detectFileType("x.json", '{"line":"Hello [XENO:wait] world"}')).toBe(
      "json_xenoblade"
    );
  });

  it("detects Xenoblade JSON via bdat key prefix", () => {
    expect(
      detectFileType("msg.json", '{"bdat-bin:bdat_common_ms": {"label": "x"}}')
    ).toBe("json_xenoblade");
  });

  it("falls back to txt for unknown extensions", () => {
    expect(detectFileType("notes.md", "hello")).toBe("txt");
  });

  it("respects explicit override", () => {
    expect(detectFileType("file.bin", "{}", "json")).toBe("json");
  });
});

describe("runTranslationPipeline", () => {
  it("translates plain text and joins paragraphs", async () => {
    const result = await runTranslationPipeline(
      "Hello world.\n\nSecond line.",
      {
        fileName: "a.txt",
        sourceLanguage: "en",
        targetLanguage: "ar",
      }
    );
    expect(result.type).toBe("txt");
    expect(result.totalChunks).toBeGreaterThan(0);
    expect(result.failedChunks).toBe(0);
    expect(result.output).toContain("[T]");
  });

  it("translates SRT preserving timecodes", async () => {
    const srt = `1\n00:00:00,000 --> 00:00:02,000\nHello\n\n2\n00:00:02,000 --> 00:00:04,000\nWorld\n`;
    const result = await runTranslationPipeline(srt, {
      fileName: "subs.srt",
      sourceLanguage: "en",
      targetLanguage: "ar",
    });
    expect(result.type).toBe("srt");
    expect(result.output).toContain("00:00:00,000 --> 00:00:02,000");
    expect(result.output).toContain("[T]Hello");
    expect(result.output).toContain("[T]World");
  });

  it("translates JSON preserving structure and untouched keys", async () => {
    const json = JSON.stringify({
      title: "Hello world",
      id: "abc-123",
      items: [{ name: "First item", qty: 2 }],
    });
    const result = await runTranslationPipeline(json, {
      fileName: "data.json",
      sourceLanguage: "en",
      targetLanguage: "ar",
    });
    expect(result.type).toBe("json");
    const out = JSON.parse(result.output);
    expect(out.title).toBe("[T]Hello world");
    expect(out.id).toBe("abc-123"); // technical key untouched
    expect(out.items[0].name).toBe("[T]First item");
    expect(out.items[0].qty).toBe(2);
  });

  it("translates Xenoblade JSON and reinserts tags", async () => {
    const json = JSON.stringify({
      lines: [
        { text: "Welcome [XENO:wait]" },
        { text: "Game over [System:End]" },
      ],
    });
    const result = await runTranslationPipeline(json, {
      fileName: "messages.json",
      sourceLanguage: "en",
      targetLanguage: "ar",
      xenoblade: {
        preserveXenoTags: true,
        preserveSystemTags: true,
        preserveMLTags: true,
        excludeJapanese: false,
      },
    });
    expect(result.type).toBe("json_xenoblade");
    const out = JSON.parse(result.output);
    expect(out.lines[0].text).toContain("[XENO:wait]");
    expect(out.lines[0].text).toContain("[T]");
    expect(out.lines[1].text).toContain("[System:End]");
  });
});
