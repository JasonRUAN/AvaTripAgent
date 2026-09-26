/**
 * 后端错误 → 本地化文案。
 *
 * 设计约定：服务端（agents/orchestrator）只负责给出**稳定的错误码**与
 * **语言无关的技术细节**（address / 数量 / 原始异常），
 * 面向用户的文字一律在前端字典里（`errors.codes.*`）。
 *
 * 这样带来两个好处：
 *   1. 同一个错误在 zh / en 下都正确，切语言不需要重跑请求；
 *   2. 服务端日志与前端 UI 解耦，不会因为后端写死中文而在英文界面露出中文。
 *
 * 未收录的 code 回退服务端 message（新错误码在旧前端上仍能显示，不会只剩一个码）。
 */
import { getDict } from "./i18n";
import type { Locale } from "./i18n/config";

export interface BackendErrorPayload {
  code?: string;
  message?: string;
  /** 语言无关的技术细节，非空时原样追加在本地化文案之后 */
  details?: string;
}

/** 按 code 取本地化模板；未收录返回 null */
function codeTemplate(locale: Locale, code?: string): string | null {
  if (!code) return null;
  const codes = getDict(locale).errors.codes as Record<string, string | undefined>;
  return codes[code] ?? null;
}

/**
 * 解析展示文案：`errors.codes[code]` > 服务端 message > null（调用方用自己的兜底文案）。
 * `details` 会以括号追加，且括号样式跟随语言。
 */
export function backendErrorText(
  locale: Locale,
  payload: BackendErrorPayload
): string | null {
  const base = codeTemplate(locale, payload.code) ?? payload.message;
  if (!base) return null;
  if (!payload.details) return base;
  return locale === "zh" ? `${base}（${payload.details}）` : `${base} (${payload.details})`;
}
