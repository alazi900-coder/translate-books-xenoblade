import { describe, it, expect } from "vitest";
import {
  extractXenoTags,
  cleanXenoText,
  reconstructXenoText,
  isJapaneseText,
  extractXenobladeStrings,
} from "./xenobladeProcessor";

describe("extractXenoTags", () => {
  it("detects XENO/System/ML tags with positions", () => {
    const text = "Hello [XENO:wait] world [System:Color] [ML:icon]";
    const tags = extractXenoTags(text);
    expect(tags.map(t => t.type).sort()).toEqual(["ML", "System", "XENO"]);
  });
});

describe("cleanXenoText", () => {
  it("strips all known tag types", () => {
    const text = "[XENO:wait]Hello[System:End][ML:icon]";
    expect(cleanXenoText(text)).toBe("Hello");
  });
});

describe("reconstructXenoText", () => {
  it("re-adds tags back to a translated string", () => {
    const tags = extractXenoTags("Hello [XENO:wait] world");
    const out = reconstructXenoText(
      "Hello [XENO:wait] world",
      "مرحبا عالم",
      tags
    );
    expect(out).toContain("[XENO:wait]");
  });
});

describe("isJapaneseText", () => {
  it("flags Japanese hiragana/katakana/kanji", () => {
    expect(isJapaneseText("こんにちは")).toBe(true);
    expect(isJapaneseText("Hello")).toBe(false);
  });
});

describe("extractXenobladeStrings", () => {
  it("collects translatable strings with paths and tags", () => {
    const data = {
      messages: [{ text: "Welcome traveler [XENO:wait]" }, { text: "" }],
    };
    const items = extractXenobladeStrings(data, {
      preserveXenoTags: true,
      preserveSystemTags: true,
      preserveMLTags: true,
      excludeJapanese: false,
    });
    expect(items.length).toBe(1);
    expect(items[0].cleanText.trim()).toBe("Welcome traveler");
    expect(items[0].tags.map(t => t.type)).toContain("XENO");
    expect(items[0].path).toBe("root.messages[0].text");
  });

  it("excludes Japanese text when option enabled", () => {
    const data = { greeting: "こんにちは", farewell: "Goodbye" };
    const items = extractXenobladeStrings(data, { excludeJapanese: true });
    expect(items.find(i => i.cleanText === "Goodbye")).toBeDefined();
    expect(items.find(i => i.cleanText === "こんにちは")).toBeUndefined();
  });
});
