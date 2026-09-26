/**
 * 会话级缓存（sessionStorage + 模块级内存）。
 *
 * 顶部「规划行程 / 我的凭证 / 商户核销」是三个独立路由，切走时规划工作台
 * 整树卸载、组件内 useState 全部销毁。这里提供跨路由存活的缓存层：
 *   - 模块级内存：同一次页面会话内切路由，读写零开销且始终最新；
 *   - sessionStorage：页面整刷后仍可恢复（刷新后旧 SSE 消费者已死，
 *     由调用方决定如何定格快照）。
 */
import type { SettlementStep, VoucherDetail, VoucherMetadata } from "@/lib/types";

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

// ---------------------------------------------------------------- 凭证列表快照

/** 凭证列表按持有地址分开存，切钱包不会串数据 */
export const VOUCHER_LIST_PREFIX = "avatrip:vouchers:";
/** 链下明细按 tokenId 分开存，与持有者无关 */
export const VOUCHER_META_PREFIX = "avatrip:voucher-meta:";

/**
 * 列表新鲜期。
 *
 * 「我的凭证」每次进页面都要扫链：读 nextTokenId → multicall ownerOf 全量
 * tokenId → multicall getVoucher → 逐张拉链下明细。凭证状态（签发/核销/作废）
 * 变化很慢，这段时间内复用上次结果，页面就是秒开；过期后仍然先画缓存，
 * 再后台静默换上新数据。
 */
export const VOUCHER_LIST_TTL_MS = 60_000;

/** 链下明细一旦签发就不再变，可以放久一点（后端 tokenURI 已停用，取一次不容易） */
export const VOUCHER_META_TTL_MS = 30 * 60_000;

export interface VoucherListCache {
  address: string;
  savedAt: number;
  items: VoucherDetail[];
}

interface VoucherMetaCache {
  savedAt: number;
  metadata: VoucherMetadata;
}

const voucherListCache = new Map<string, VoucherListCache>();
const voucherMetaCache = new Map<string, VoucherMetaCache>();

function voucherKey(address: string): string {
  return address.toLowerCase();
}

export function loadVoucherList(address: string): VoucherListCache | null {
  const key = voucherKey(address);

  const memory = voucherListCache.get(key);
  if (memory) return memory;

  const parsed = readSession<VoucherListCache>(VOUCHER_LIST_PREFIX + key);
  // 存储可能被手改 / 跨版本残留，形状不对就当没缓存，绝不让脏数据进页面
  if (
    !parsed ||
    typeof parsed.savedAt !== "number" ||
    !Array.isArray(parsed.items)
  ) {
    return null;
  }

  const items = parsed.items.filter(
    (item): item is VoucherDetail =>
      Boolean(item) &&
      typeof item.tokenId === "string" &&
      typeof item.orderId === "string" &&
      typeof item.status === "string"
  );
  // 存了东西却没一条能认出来 = 结构对不上，宁可重读链上
  // （空列表是合法缓存：刚连上钱包还没有凭证时不用每次都扫一遍链）
  if (parsed.items.length > 0 && items.length === 0) return null;

  const entry: VoucherListCache = { address: key, savedAt: parsed.savedAt, items };
  voucherListCache.set(key, entry);
  return entry;
}

/** 缓存是否在新鲜期内（true = 这次访问可以直接复用，不必扫链） */
export function isVoucherListFresh(entry: VoucherListCache | null): boolean {
  return entry !== null && Date.now() - entry.savedAt < VOUCHER_LIST_TTL_MS;
}

export function saveVoucherList(address: string, items: VoucherDetail[]): void {
  const key = voucherKey(address);
  const entry: VoucherListCache = { address: key, savedAt: Date.now(), items };
  voucherListCache.set(key, entry);
  writeSession(VOUCHER_LIST_PREFIX + key, entry);
}

/**
 * 让缓存作废：发券、核销这类会改变链上状态的动作之后必须调一次，
 * 否则 60 秒新鲜期内用户看到的还是旧状态。
 * 不传 address 表示清空当前会话里所有地址的列表（发券时不一定知道持有者）。
 */
export function invalidateVoucherList(address?: string): void {
  if (address) {
    const key = voucherKey(address);
    voucherListCache.delete(key);
    removeSession(VOUCHER_LIST_PREFIX + key);
    return;
  }

  voucherListCache.clear();
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (key?.startsWith(VOUCHER_LIST_PREFIX)) keys.push(key);
    }
    for (const key of keys) window.sessionStorage.removeItem(key);
  } catch {
    // 隐私模式 / 存储不可用：内存已清，静默降级
  }
}

export function loadVoucherMetadata(tokenId: string): VoucherMetadata | null {
  const memory = voucherMetaCache.get(tokenId);
  if (memory && Date.now() - memory.savedAt < VOUCHER_META_TTL_MS) {
    return memory.metadata;
  }

  const parsed = readSession<VoucherMetaCache>(VOUCHER_META_PREFIX + tokenId);
  if (
    parsed?.metadata &&
    typeof parsed.metadata === "object" &&
    typeof parsed.metadata.details === "object" &&
    Date.now() - parsed.savedAt < VOUCHER_META_TTL_MS
  ) {
    voucherMetaCache.set(tokenId, parsed);
    return parsed.metadata;
  }

  if (memory) voucherMetaCache.delete(tokenId);
  return null;
}

export function saveVoucherMetadata(tokenId: string, metadata: VoucherMetadata): void {
  const entry: VoucherMetaCache = { savedAt: Date.now(), metadata };
  voucherMetaCache.set(tokenId, entry);
  writeSession(VOUCHER_META_PREFIX + tokenId, entry);
}
