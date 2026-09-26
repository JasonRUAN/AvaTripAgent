import { getDict } from "./i18n";
import type { Locale } from "./i18n/config";
import { KEY_TO_CATEGORY, type AgentKey, type CategoryCode } from "./types";

export type AgentHealth =
  | { status: "idle" }
  | { status: "checking" }
  | {
      status: "ok";
      service: string;
      address: string;
      categories: string[];
      chain: boolean;
    }
  | { status: "error"; message: string };

export function normalizeEndpoint(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

const ZH_CATEGORY: Record<string, CategoryCode> = {
  机票: 0,
  酒店: 1,
  门票: 2,
  餐饮: 3,
};

/** 把 /health 返回的 flight、0、机票 等解析成注册表单用的分类码 */
export function parseHealthCategories(raw: Array<string | number>): CategoryCode[] {
  const codes = new Set<CategoryCode>();
  for (const item of raw) {
    if (typeof item === "number" && item >= 0 && item <= 3) {
      codes.add(item as CategoryCode);
      continue;
    }
    const token = String(item).trim();
    const lower = token.toLowerCase();
    if (lower === "flight" || lower === "hotel" || lower === "attraction" || lower === "dining") {
      codes.add(KEY_TO_CATEGORY[lower as AgentKey]);
      continue;
    }
    if (lower === "0" || lower === "1" || lower === "2" || lower === "3") {
      codes.add(Number(lower) as CategoryCode);
      continue;
    }
    const fromZh = ZH_CATEGORY[token];
    if (fromZh !== undefined) codes.add(fromZh);
  }
  return [...codes].sort((a, b) => a - b);
}

export async function probeAgentHealth(
  endpoint: string,
  locale: Locale
): Promise<AgentHealth> {
  const health = getDict(locale).health;
  const base = normalizeEndpoint(endpoint);
  if (!base) return { status: "error", message: health.fillEndpoint };
  if (!isHttpUrl(base)) return { status: "error", message: health.needHttp };

  try {
    const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return { status: "error", message: `HTTP ${response.status}` };
    const data = (await response.json()) as {
      ok?: boolean;
      service?: string;
      address?: string;
      categories?: string[];
      category?: string;
      chain?: boolean;
    };
    if (!data.ok) return { status: "error", message: health.notOk };
    return {
      status: "ok",
      service: data.service ?? "unknown",
      address: data.address ?? "",
      categories: data.categories ?? (data.category ? [data.category] : []),
      chain: Boolean(data.chain),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : health.probeFailed;
    if (/abort|timeout/i.test(message)) return { status: "error", message: health.timeout };
    return { status: "error", message: health.unreachable };
  }
}
