import { describe, it, expect } from "vitest";
import { extractJsonStrings, reconstructJson } from "./jsonProcessor";

describe("extractJsonStrings", () => {
  it("extracts only translatable strings, skipping technical keys", () => {
    const data = {
      title: "Hello",
      id: "abc-123",
      url: "https://example.com",
      items: [{ name: "Sword", qty: 1 }],
    };
    const items = extractJsonStrings(data);
    const values = items.map(i => i.value).sort();
    expect(values).toContain("Hello");
    expect(values).toContain("Sword");
    expect(values).not.toContain("abc-123");
    expect(values).not.toContain("https://example.com");
  });

  it("returns empty for null/non-object input", () => {
    expect(extractJsonStrings(null as unknown as object)).toEqual([]);
    expect(extractJsonStrings(42 as unknown as object)).toEqual([]);
  });
});

describe("reconstructJson", () => {
  it("rebuilds JSON applying translations by path", () => {
    const data = { title: "Hi", note: "World" };
    const items = extractJsonStrings(data);
    const map = new Map<string, string>();
    for (const item of items) map.set(item.path, `tr:${item.value}`);
    const out = reconstructJson(data, map) as { title: string; note: string };
    expect(out.title).toBe("tr:Hi");
    expect(out.note).toBe("tr:World");
  });

  it("preserves original value when translation missing", () => {
    const data = { a: "keep" };
    const out = reconstructJson(data, new Map()) as { a: string };
    expect(out.a).toBe("keep");
  });
});
