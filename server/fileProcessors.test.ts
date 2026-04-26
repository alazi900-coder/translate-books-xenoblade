import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  smartChunk,
  processTxtFile,
  processVttFile,
  processMarkdownFile,
  processHtmlFile,
  processCsvFile,
  processYamlFile,
  processEpubFile,
  rebuildEpubFile,
  rebuildHtml,
  extractHtmlTextNodes,
} from "./fileProcessors";

describe("smartChunk", () => {
  it("preserves trailing fragment without ending punctuation", () => {
    const result = smartChunk("Hello world. This has no period", 100);
    expect(result.length).toBeGreaterThan(0);
    expect(result.join(" ")).toContain("This has no period");
  });

  it("returns the whole string when no punctuation exists", () => {
    const result = smartChunk("just words no punctuation", 100);
    expect(result).toEqual(["just words no punctuation"]);
  });

  it("respects maxWords boundary", () => {
    const text = Array.from({ length: 12 }, (_, i) => `word${i}.`).join(" ");
    const result = smartChunk(text, 5);
    expect(result.length).toBeGreaterThan(1);
  });

  it("returns empty array for empty input", () => {
    expect(smartChunk("", 100)).toEqual([]);
    expect(smartChunk("   ", 100)).toEqual([]);
  });
});

describe("processTxtFile", () => {
  it("splits by paragraph when double newlines exist", async () => {
    const result = await processTxtFile("Para 1\n\nPara 2\n\nPara 3");
    expect(result.chunks).toEqual(["Para 1", "Para 2", "Para 3"]);
  });

  it("falls back to per-line splitting when only single newlines", async () => {
    const result = await processTxtFile("Line one\nLine two\nLine three");
    expect(result.chunks.length).toBe(3);
  });

  it("returns single chunk for single line", async () => {
    const result = await processTxtFile("Just one line");
    expect(result.chunks).toEqual(["Just one line"]);
  });
});

describe("processVttFile", () => {
  it("parses cues with optional identifiers", async () => {
    const vtt =
      "WEBVTT\n\nintro\n00:00:00.000 --> 00:00:02.000\nHello\n\n00:00:02.000 --> 00:00:04.000\nWorld";
    const result = await processVttFile(vtt);
    expect(result.chunks).toEqual(["Hello", "World"]);
    expect((result.metadata.cues as unknown[]).length).toBe(2);
  });
});

describe("processMarkdownFile", () => {
  it("treats fenced code blocks as untouchable segments", async () => {
    const md = "Hello\n\n```\ncode here\n```\n\nWorld";
    const result = await processMarkdownFile(md);
    // chunks should be ["Hello", "World"], not include the code block.
    expect(result.chunks).toContain("Hello");
    expect(result.chunks).toContain("World");
    expect(result.chunks.find(c => c.includes("code here"))).toBeUndefined();
  });
});

describe("processHtmlFile + rebuildHtml roundtrip", () => {
  it("extracts text and rebuilds in place", () => {
    const html = "<p>Hello <em>world</em></p>";
    const nodes = extractHtmlTextNodes(html);
    expect(nodes.length).toBeGreaterThan(0);
    const replacements = new Map<number, string>();
    nodes.forEach((_, i) => replacements.set(i, "X"));
    const out = rebuildHtml(html, nodes, replacements);
    expect(out).toContain("<p>");
    expect(out).toContain("</p>");
    expect(out).toContain("X");
    expect(out).not.toContain("Hello");
  });

  it("skips script/style content", async () => {
    const html =
      "<style>body{color:red}</style><p>Hello</p><script>x=1</script>";
    const result = await processHtmlFile(html);
    expect(result.chunks).toEqual(["Hello"]);
  });
});

describe("processCsvFile", () => {
  it("handles quoted fields with embedded commas", async () => {
    const csv = `a,b\n"hello, world",1\n"line\nbreak",2`;
    const result = await processCsvFile(csv);
    expect(result.chunks).toContain("a");
    expect(result.chunks).toContain("b");
    expect(result.chunks).toContain("hello, world");
    expect(result.chunks).toContain("line\nbreak");
  });

  it("skips numeric cells", async () => {
    const csv = "a,b\nfoo,42\nbar,3.14";
    const result = await processCsvFile(csv);
    expect(result.chunks).not.toContain("42");
    expect(result.chunks).not.toContain("3.14");
  });
});

describe("processYamlFile", () => {
  it("extracts every string leaf", async () => {
    const yml = "title: Hello\nlist:\n  - one\n  - two\nflag: true\n";
    const result = await processYamlFile(yml);
    expect(result.chunks).toContain("Hello");
    expect(result.chunks).toContain("one");
    expect(result.chunks).toContain("two");
  });
});

describe("EPUB roundtrip", () => {
  it("extracts text from a minimal EPUB and rebuilds it preserving structure", async () => {
    const zip = new JSZip();
    zip.file(
      "META-INF/container.xml",
      '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'
    );
    zip.file(
      "OEBPS/content.opf",
      `<?xml version="1.0"?><package version="3.0"><manifest>
        <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
      </manifest><spine>
        <itemref idref="ch1"/>
      </spine></package>`
    );
    zip.file(
      "OEBPS/ch1.xhtml",
      "<?xml version='1.0'?><html><body><p>Hello world</p><p>Second paragraph</p></body></html>"
    );
    const buf = (await zip.generateAsync({ type: "nodebuffer" })) as Buffer;

    const { chunks, metadata } = await processEpubFile(buf);
    expect(chunks).toContain("Hello world");
    expect(chunks).toContain("Second paragraph");

    const translated = chunks.map(c => `[T]${c}`);
    const rebuilt = await rebuildEpubFile(metadata, translated);

    const reread = await JSZip.loadAsync(rebuilt);
    const ch1File = reread.file("OEBPS/ch1.xhtml");
    expect(ch1File).not.toBeNull();
    if (ch1File) {
      const newHtml = await ch1File.async("string");
      expect(newHtml).toContain("[T]Hello world");
      expect(newHtml).toContain("<p>");
    }
  });
});
