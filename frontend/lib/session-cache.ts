/**
 * 会话级缓存（sessionStorage + 模块级内存）。
 *
 * 顶部「规划行程 / 我的凭证 / 商户核销」是三个独立路由，切走时规划工作台
 * 整树卸载、组件内 useState 全部销毁。这里提供跨路由存活的缓存层：
 *   - 模块级内存：同一次页面会话内切路由，读写零开销且始终最新；
 *   - sessionStorage：页面整刷后仍可恢复（刷新后旧 SSE 消费者已死，
 *     由调用方决定如何定格快照）。
 */
import type { SettlementStep } from "@/lib/types";

export const PLAN_CACHE_KEY = "avatrip:plan-run";
export const CHECKOUT_CACHE_KEY = "avatrip:checkout";

// ---------------------------------------------------------------- 基础读写

export function readSession<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeSession(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存储满 / 隐私模式等场景静默降级为不缓存
  }
}

export function removeSession(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------- 结算进度快照

export interface CheckoutSnapshot {
  runId?: string;
  phase: "idle" | "settling" | "done";
  orderId: string | null;
  payTxHash: string | null;
  steps: SettlementStep[];
  tokenIds: string[];
}

let checkoutCache: CheckoutSnapshot | null = null;

/**
 * 读取与 runId 匹配的结算快照。必须带 runId 且与快照一致才恢复，
 * 防止重新规划后串到旧订单的状态。
 */
export function loadCheckoutSnapshot(runId?: string): CheckoutSnapshot | null {
  if (!runId) return null;
  if (checkoutCache) {
    return checkoutCache.runId === runId ? checkoutCache : null;
  }
  const parsed = readSession<CheckoutSnapshot>(CHECKOUT_CACHE_KEY);
  if (parsed?.runId === runId && Array.isArray(parsed.steps)) {
    checkoutCache = parsed;
    return parsed;
  }
  return null;
}

export function saveCheckoutSnapshot(snapshot: CheckoutSnapshot): void {
  checkoutCache = snapshot;
  writeSession(CHECKOUT_CACHE_KEY, snapshot);
}

/** 用户主动「重新规划」时清空结算缓存 */
export function clearCheckoutSnapshot(): void {
  checkoutCache = null;
  removeSession(CHECKOUT_CACHE_KEY);
}
