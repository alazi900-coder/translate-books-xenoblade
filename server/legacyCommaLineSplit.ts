/**
 * المسار القديم لتقسيم الأسطر عند الفواصل محفوظ هنا فقط حتى يمكن الرجوع إليه.
 * لا يُستخدم في خط الترجمة الحالي؛ أداة زيلدا الجديدة هي المسؤولة عن التقسيم.
 */
export function legacySplitLinesAfterCommas(text: string): string {
  return text
    .replace(/([,،])\s+/g, "$1\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
