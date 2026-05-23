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
    expect(detectFileType("file.unknownext", "hello")).toBe("txt");
  });

  it("detects markdown, vtt, html, csv, yaml extensions", () => {
    expect(detectFileType("notes.md", "hello")).toBe("md");
    expect(detectFileType("subs.vtt", "WEBVTT")).toBe("vtt");
    expect(detectFileType("page.html", "<p>x</p>")).toBe("html");
    expect(detectFileType("data.csv", "a,b")).toBe("csv");
    expect(detectFileType("conf.yaml", "k: v")).toBe("yaml");
    expect(detectFileType("conf.yml", "k: v")).toBe("yaml");
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

  it("translates Markdown preserving fenced code blocks", async () => {
    const md = "# Title\n\nHello world.\n\n```js\nconst x = 1;\n```\n\nEnd.";
    const result = await runTranslationPipeline(md, {
      fileName: "notes.md",
      sourceLanguage: "en",
      targetLanguage: "ar",
    });
    expect(result.type).toBe("md");
    expect(result.output).toContain("```js");
    expect(result.output).toContain("const x = 1;");
    expect(result.output).toContain("[T]Hello world.");
  });

  it("translates HTML without touching script/style tags", async () => {
    const html =
      "<!doctype html><html><body><p>Hello</p><script>const x=1;</script></body></html>";
    const result = await runTranslationPipeline(html, {
      fileName: "page.html",
      sourceLanguage: "en",
      targetLanguage: "ar",
    });
    expect(result.type).toBe("html");
    expect(result.output).toContain("<script>const x=1;</script>");
    expect(result.output).toContain("[T]Hello");
  });

  it("translates CSV preserving headers and numeric cells", async () => {
    const csv = "name,age\nAlice,30\nBob,25";
    const result = await runTranslationPipeline(csv, {
      fileName: "data.csv",
      sourceLanguage: "en",
      targetLanguage: "ar",
    });
    expect(result.type).toBe("csv");
    const lines = result.output.split("\n");
    expect(lines[0]).toContain("[T]name");
    expect(lines[1]).toContain("30"); // numeric untouched
  });

  it("translates VTT preserving cue timecodes", async () => {
    const vtt =
      "WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nHello\n\n2\n00:00:02.000 --> 00:00:04.000\nWorld\n";
    const result = await runTranslationPipeline(vtt, {
      fileName: "subs.vtt",
      sourceLanguage: "en",
      targetLanguage: "ar",
    });
    expect(result.type).toBe("vtt");
    expect(result.output).toContain("WEBVTT");
    expect(result.output).toContain("00:00:00.000 --> 00:00:02.000");
    expect(result.output).toContain("[T]Hello");
  });

  it("translates YAML preserving structure", async () => {
    const ymlSrc = "title: Hello world\nid: abc-123\n";
    const result = await runTranslationPipeline(ymlSrc, {
      fileName: "config.yml",
      sourceLanguage: "en",
      targetLanguage: "ar",
    });
    expect(result.type).toBe("yaml");
    expect(result.output).toContain("[T]Hello world");
    expect(result.output).toContain("[T]abc-123"); // YAML treats every string as a string
  });

  it("injects glossary into the system prompt", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const result = await runTranslationPipeline("Shulk is the hero.", {
      fileName: "a.txt",
      sourceLanguage: "en",
      targetLanguage: "ar",
      glossary: [{ term: "Shulk", translation: "شولك" }],
    });
    expect(result.type).toBe("txt");
    const calls = (invokeLLM as unknown as { mock: { calls: unknown[][] } })
      .mock.calls;
    const systemMsg = (calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    }).messages.find(m => m.role === "system");
    expect(systemMsg?.content).toContain("Glossary");
    expect(systemMsg?.content).toContain("Shulk");
  });

  it("forwards model and temperature to the LLM", async () => {
    const { invokeLLM } = await import("./_core/llm");
    await runTranslationPipeline("Hello", {
      fileName: "a.txt",
      sourceLanguage: "en",
      targetLanguage: "ar",
      model: "gpt-4o-mini",
      temperature: 0.7,
    });
    const calls = (invokeLLM as unknown as { mock: { calls: unknown[][] } })
      .mock.calls;
    const last = calls[calls.length - 1][0] as {
      model?: string;
      temperature?: number;
    };
    expect(last.model).toBe("gpt-4o-mini");
    expect(last.temperature).toBeCloseTo(0.7, 5);
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

  it("restores Xenoblade line breaks without legacy comma splitting", async () => {
    const json = JSON.stringify({
      line: "First part[XENO:n ]\nSecond part",
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
    const out = JSON.parse(result.output);
    expect(out.line).toContain("[XENO:n ]");
    expect(out.line.split("\n")).toHaveLength(2);
    expect(out.line).not.toContain("part,\n");
  });
});
