/**
 * 语言配置。
 *
 *  Locale 只有 zh / en 两种；cookie 是唯一持久化载体，
 *  服务端（app/layout.tsx）读它决定 <html lang> 与 metadata，
 *  客户端（LocaleProvider）读它决定渲染哪套字典，两端一致才不会首屏闪烁。
 */

export type Locale = "zh" | "en";

export const LOCALES: Locale[] = ["zh", "en"];

export const DEFAULT_LOCALE: Locale = "en";

/** 语言 cookie 名，沿用 avatrip.* 前缀 */
export const LOCALE_COOKIE_KEY = "avatrip.locale";

/** cookie 有效期：1 年 */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** <html lang> 取值 */
export const HTML_LANG: Record<Locale, string> = {
  zh: "zh-CN",
  en: "en",
};

/** Intl / toLocaleString 用的 BCP-47 tag */
export const INTL_TAG: Record<Locale, string> = {
  zh: "zh-CN",
  en: "en-US",
};

/** 切换器上显示的语言名（各自用自己的语言写，不发生意译） */
export const LOCALE_NAME: Record<Locale, string> = {
  zh: "中文",
  en: "English",
};

export function isLocale(value: unknown): value is Locale {
  return value === "zh" || value === "en";
}

export function parseLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
