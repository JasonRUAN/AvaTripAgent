import {
  AGENT_KEYS,
  normalizeProviders,
  parseRecommendMode,
  toggleProvider,
  type AgentKey,
  type Address,
  type ProviderSelection,
  type RecommendMode,
} from "./types";

export const PROVIDERS_STORAGE_KEY = "avatrip.providers";
/** 「自动询价全部」开关，缺省为 1（自动） */
export const PROVIDERS_AUTO_STORAGE_KEY = "avatrip.providersAuto";
export const RECOMMEND_MODE_STORAGE_KEY = "avatrip.recommendMode";

function normalizeStored(raw: unknown): ProviderSelection {
  if (!raw || typeof raw !== "object") return {};
  const input: Record<string, unknown> = {};
  for (const key of AGENT_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === "string" && value.startsWith("0x")) {
      input[key] = [value as Address];
    } else if (Array.isArray(value)) {
      input[key] = value.filter((item): item is Address => typeof item === "string" && item.startsWith("0x"));
    }
  }
  return normalizeProviders(input);
}

export function readStoredProviders(): ProviderSelection {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PROVIDERS_STORAGE_KEY);
    if (!raw) return {};
    return normalizeStored(JSON.parse(raw));
  } catch {
    return {};
  }
}

/**
 * 写盘前只做地址过滤，保留显式的空数组：
 * 空数组 = 用户主动取消该品类的全部服务商，不能被默认值重新填满。
 */
function sanitizeForStorage(selection: ProviderSelection): ProviderSelection {
  const next: ProviderSelection = {};
  for (const key of AGENT_KEYS) {
    const raw = selection[key];
    if (!raw) continue;
    next[key] = raw.filter((item) => typeof item === "string" && item.startsWith("0x"));
  }
  return next;
}

export function writeStoredProviders(selection: ProviderSelection): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROVIDERS_STORAGE_KEY, JSON.stringify(sanitizeForStorage(selection)));
}

/** 回到「自动询价全部」：清掉手动选择，避免下次进入又被历史选择带偏 */
export function clearStoredProviders(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PROVIDERS_STORAGE_KEY);
}

/** 是否走「自动询价全部」，缺省 true */
export function readStoredAutoProviders(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(PROVIDERS_AUTO_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function writeStoredAutoProviders(auto: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROVIDERS_AUTO_STORAGE_KEY, auto ? "1" : "0");
}

/** 同类可增减多家；取消后该品类可以为空 */
export function patchStoredProvider(key: AgentKey, address: string): ProviderSelection {
  const next = toggleProvider(readStoredProviders(), key, address as Address);
  writeStoredProviders(next);
  // 在市场页手动勾选 = 放弃「自动询价全部」，工作台按手动选择询价
  writeStoredAutoProviders(false);
  return next;
}

export function readStoredRecommendMode(): RecommendMode {
  if (typeof window === "undefined") return parseRecommendMode(undefined);
  try {
    return parseRecommendMode(window.localStorage.getItem(RECOMMEND_MODE_STORAGE_KEY));
  } catch {
    return parseRecommendMode(undefined);
  }
}

export function writeStoredRecommendMode(mode: RecommendMode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RECOMMEND_MODE_STORAGE_KEY, mode);
}
