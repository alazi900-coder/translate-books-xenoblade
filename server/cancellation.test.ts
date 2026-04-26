import { describe, it, expect } from "vitest";
import {
  registerControl,
  cancelTranslation,
  pauseTranslation,
  resumeTranslation,
  disposeControl,
  CancelledError,
  waitWhilePaused,
} from "./cancellation";

describe("cancellation registry", () => {
  it("registers and cancels a translation", () => {
    const slot = registerControl(101);
    expect(slot.cancelled).toBe(false);
    expect(cancelTranslation(101)).toBe(true);
    expect(slot.cancelled).toBe(true);
    disposeControl(101);
    expect(cancelTranslation(101)).toBe(false);
  });

  it("supports pause/resume cycle", async () => {
    const slot = registerControl(202);
    expect(pauseTranslation(202)).toBe(true);
    expect(slot.paused).toBe(true);
    setTimeout(() => resumeTranslation(202), 50);
    await waitWhilePaused(slot);
    expect(slot.paused).toBe(false);
    disposeControl(202);
  });

  it("waitWhilePaused throws CancelledError when cancelled", async () => {
    const slot = registerControl(303);
    pauseTranslation(303);
    setTimeout(() => cancelTranslation(303), 30);
    await expect(waitWhilePaused(slot)).rejects.toBeInstanceOf(CancelledError);
    disposeControl(303);
  });
});
