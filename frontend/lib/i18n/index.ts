import type { Locale } from "./config";
import { DEFAULT_LOCALE } from "./config";
import { zh, type Dictionary } from "./dictionaries/zh";
import { en } from "./dictionaries/en";

export type { Dictionary };

export const DICTIONARIES: Record<Locale, Dictionary> = { zh, en };

export function getDict(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}

/**
 * 当前生效的语言（模块级镜像）。
 *
 * 异步回调（fetch 错误处理、轮询）里拿不到最新的闭包 locale，
 * 又不能靠 ref（渲染期读写 ref 会被 lint 拦），所以由 LocaleProvider 同步一份出来，
 * 供 lib / hooks 里的非渲染代码读取。
 */
let active: Locale = DEFAULT_LOCALE;

export function setActiveLocale(next: Locale): void {
  active = next;
}

export function activeLocale(): Locale {
  return active;
}

/** 递归展开字典的 dot path：`{ a: { b: "" } }` → `"a" | "a.b"` */
type PathOf<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${PathOf<T[K]>}`;
}[keyof T & string];

export type MessageKey = PathOf<Dictionary>;

export type MessageVars = Record<string, string | number>;

const PLACEHOLDER = /\{(\w+)\}/g;

/** 把 `{name}` 替换成 vars；没传的占位符原样保留，方便排查漏传 */
export function interpolate(
  template: string,
  vars?: MessageVars
): string {
  if (!vars) return template;
  return template.replace(PLACEHOLDER, (match, name: string) =>
    name in vars ? String(vars[name]) : match
  );
}

/** 按 key 取文案；key 不存在时返回 key 本身，页面上会直接看见错路径 */
export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: MessageVars
): string {
  let node: unknown = getDict(locale);
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return key;
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node !== "string") return key;
  return interpolate(node, vars);
}
