/**
 * سجلّ في الذاكرة لإلغاء/إيقاف عمليات الترجمة الجارية على نفس المثيل.
 * ملاحظة: هذا ليس مستديماً عبر إعادة تشغيل الخادم.
 */

export interface ControlSlot {
  cancelled: boolean;
  paused: boolean;
}

const slots = new Map<number, ControlSlot>();

export function registerControl(translationId: number): ControlSlot {
  const slot: ControlSlot = { cancelled: false, paused: false };
  slots.set(translationId, slot);
  return slot;
}

export function getControl(translationId: number): ControlSlot | undefined {
  return slots.get(translationId);
}

export function disposeControl(translationId: number) {
  slots.delete(translationId);
}

export function cancelTranslation(translationId: number): boolean {
  const slot = slots.get(translationId);
  if (!slot) return false;
  slot.cancelled = true;
  slot.paused = false;
  return true;
}

export function pauseTranslation(translationId: number): boolean {
  const slot = slots.get(translationId);
  if (!slot) return false;
  slot.paused = true;
  return true;
}

export function resumeTranslation(translationId: number): boolean {
  const slot = slots.get(translationId);
  if (!slot) return false;
  slot.paused = false;
  return true;
}

export class CancelledError extends Error {
  constructor(message = "Cancelled") {
    super(message);
    this.name = "CancelledError";
  }
}

export async function waitWhilePaused(slot: ControlSlot): Promise<void> {
  while (slot.paused && !slot.cancelled) {
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (slot.cancelled) {
    throw new CancelledError("Translation cancelled");
  }
}
