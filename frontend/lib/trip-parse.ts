/**
 * 「说出你的旅行」的自然语言解析（中英文）。
 *
 * 独立成模块是为了不掺 React：`lib` 下的纯函数与脚本都能直接测。
 */

import { CITY_ALIASES, canonicalCity, demoText } from "./i18n/dictionaries/demo";
import type { Locale } from "./i18n/config";
import type { TripRequest } from "./types";

/** 城市名（中英文）→ 正则片段，长的排前面避免 "Hong Kong" 被 "Hong" 截断 */
const CITY_PATTERN = [...Object.keys(CITY_ALIASES), ...Object.values(CITY_ALIASES)]
  .sort((a, b) => b.length - a.length)
  .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

const CN_NUM: Record<string, number> = {
  一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

/** 英文人数写法：couple / solo / family of N / N people */
export function parseEnglishPax(text: string): number | undefined {
  const family = /family of\s+(\d+)/i.exec(text);
  if (family) return clamp(Number(family[1]), 1, 12);
  if (/\bcouple\b/i.test(text)) return 2;
  if (/\bsolo\b|\balone\b/i.test(text)) return 1;
  const numeric = /(\d+)\s*(?:people|persons?|pax|travelers?|travellers?|guests?|adults?)/i.exec(text);
  if (numeric) return clamp(Number(numeric[1]), 1, 12);
  return undefined;
}

/**
 * 只在对应字段能匹配到时才返回该字段，避免覆盖用户已填内容。
 * 城市一律归一成中文规范名（后端目录就是中文），展示层再按语言翻译。
 *
 *   zh: 「北京出发曼谷 6 天、两人、预算 6000、爱逛夜市」
 *   en: "Bangkok 6 days from Beijing, 2 people, budget 6000, night markets"
 */
export function parseTripText(text: string, locale: Locale): Partial<TripRequest> {
  const demo = demoText(locale);
  const result: Partial<TripRequest> = {};

  // —— 出发地 / 目的地 ——
  let origin: string | undefined;
  let destination: string | undefined;

  if (locale === "zh") {
    const route = text.match(/([\u4e00-\u9fa5]{2,4})(?:出发|飞|去)([\u4e00-\u9fa5]{2,5})/);
    if (route) {
      const from = canonicalCity(route[1]!);
      if (demo.origins.includes(from)) origin = from;
      destination = canonicalCity(route[2]!);
    }
  } else {
    const fromTo = new RegExp(
      `from\\s+(${CITY_PATTERN})\\s*(?:to|→|->)\\s*(${CITY_PATTERN})`,
      "i"
    ).exec(text);
    const arrow = new RegExp(
      `(${CITY_PATTERN})\\s*(?:to|→|->)\\s*(${CITY_PATTERN})`,
      "i"
    ).exec(text);
    // "Tokyo 5 days from Shanghai" —— 目的地在前
    const trailing = new RegExp(
      `(${CITY_PATTERN})[^\\n]{0,40}?\\bfrom\\s+(${CITY_PATTERN})`,
      "i"
    ).exec(text);

    if (fromTo) {
      origin = canonicalCity(fromTo[1]!);
      destination = canonicalCity(fromTo[2]!);
    } else if (arrow) {
      origin = canonicalCity(arrow[1]!);
      destination = canonicalCity(arrow[2]!);
    } else if (trailing) {
      destination = canonicalCity(trailing[1]!);
      origin = canonicalCity(trailing[2]!);
    }
    if (origin && !demo.origins.includes(origin)) origin = undefined;
  }

  if (origin) result.origin = origin;
  if (destination) result.destination = destination;

  // —— 天数 ——
  const days =
    locale === "zh"
      ? text.match(/(\d+)\s*天/)
      : /(\d+)\s*(?:day|days)\b/i.exec(text);
  if (days) result.days = clamp(Number(days[1]), 1, 14);

  // —— 人数 ——
  if (locale === "zh") {
    if (/一家三口|两大一小|三口/.test(text)) {
      result.pax = 3;
    } else {
      const cnPax = text.match(/([\u4e00-\u9fa5])\s*人/);
      const numPax = text.match(/(\d+)\s*人/);
      if (numPax) result.pax = clamp(Number(numPax[1]), 1, 12);
      else if (cnPax && CN_NUM[cnPax[1]!]) result.pax = CN_NUM[cnPax[1]!];
    }
  } else {
    const pax = parseEnglishPax(text);
    if (pax !== undefined) result.pax = pax;
  }

  // —— 预算 ——
  const budget =
    locale === "zh"
      ? text.match(/预算\s*([\d,]+)/)
      : /budget\s*(?:of\s*)?([\d,]+)/i.exec(text) ??
        /([\d,]+)\s*(?:usd|\$)/i.exec(text);
  if (budget) result.budget = Number(budget[1]!.replace(/,/g, "")) || result.budget;

  // —— 偏好 ——
  const prefs = demo.preferenceKeywords
    .filter(([re]) => re.test(text))
    .map(([, pref]) => pref);
  // 完整需求句（含出发地/目的地）出现时整体重置偏好，避免残留上一条的偏好
  if (prefs.length || origin || destination) result.preferences = prefs;

  return result;
}
