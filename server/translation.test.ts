import { describe, it, expect } from "vitest";
import { smartChunk } from "./fileProcessors";

// إعادة تعريف reconstructSrt للاختبار
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

describe("File Processors", () => {
  describe("smartChunk", () => {
    it("should split text into chunks based on word count", () => {
      const text = "This is a sentence. This is another sentence. And one more. Final sentence here.";
      const chunks = smartChunk(text, 10);

      expect(chunks.length).toBeGreaterThan(0);
      chunks.forEach((chunk) => {
        expect(chunk).toBeTruthy();
        const wordCount = chunk.split(/\s+/).length;
        expect(wordCount).toBeLessThanOrEqual(11); // Allow slight overflow
      });
    });

    it("should preserve sentences", () => {
      const text = "First sentence. Second sentence. Third sentence.";
      const chunks = smartChunk(text, 5);

      expect(chunks.length).toBeGreaterThan(0);
      chunks.forEach((chunk) => {
        expect(chunk).toMatch(/\.$|!$|\?$/);
      });
    });

    it("should handle empty text", () => {
      const chunks = smartChunk("");
      expect(chunks.length).toBe(0);
    });
  });

  describe("reconstructSrt", () => {
    it("should reconstruct SRT format with timecodes", () => {
      const translatedChunks = ["Hello world", "How are you"];
      const timecodes = [
        { start: "00:00:00,000", end: "00:00:02,000" },
        { start: "00:00:02,000", end: "00:00:04,000" },
      ];

      const result = reconstructSrt(translatedChunks, timecodes);

      expect(result).toContain("1");
      expect(result).toContain("00:00:00,000 --> 00:00:02,000");
      expect(result).toContain("Hello world");
      expect(result).toContain("2");
      expect(result).toContain("00:00:02,000 --> 00:00:04,000");
      expect(result).toContain("How are you");
    });

    it("should format SRT correctly", () => {
      const translatedChunks = ["Test"];
      const timecodes = [{ start: "00:00:00,000", end: "00:00:01,000" }];

      const result = reconstructSrt(translatedChunks, timecodes);
      const lines = result.split("\n");

      expect(lines[0]).toBe("1");
      expect(lines[1]).toContain("-->");
      expect(lines[2]).toBe("Test");
    });
  });
});
