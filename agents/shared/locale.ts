/**
 * 规划语言检测。
 *
 * 以用户提交的规划需求原文（rawText）为准：
 * 原文里没有任何 CJK 字符且包含拉丁字母 → 英文；否则中文。
 *
 * 中英混写（如「东京5天想去teamLab」）按中文处理——
 * 英文单词常常只是品牌名/地标名，误判成英文会整份行程变英文。
 */

export type Locale = "zh" | "en";

export function detectLocale(text: string): Locale {
  if (!text) return "zh";
  const hasCJK = /[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(text);
  if (hasCJK) return "zh";
  return /[A-Za-z]/.test(text) ? "en" : "zh";
}

/** 按语言挑值：pick(locale, "中文", "English") */
export function pick<T>(locale: Locale, zh: T, en: T): T {
  return locale === "zh" ? zh : en;
}
