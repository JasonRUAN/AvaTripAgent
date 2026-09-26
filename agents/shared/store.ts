import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger } from "./logger";
import type { PlanOffers } from "./demo-run";
import type { ItineraryDay, Quote, TripRequest, VoucherDetail } from "./types";

const log = createLogger("store");

/**
 * 进程内状态。
 *
 * 演示规模下不需要数据库，但凭证的链下明细（details）链上只有哈希、
 * 无法重建，所以 vouchers 必须落盘持久化：后端重启后 tokenURI / 凭证
 * 查询仍能拿到完整明细，而不是退化为「从链上状态重建」的空壳。
 * 生产化时把这几张表换成 Postgres 即可，接口不变。
 */

/** 数据文件锚定在本模块目录下，避免受启动时 cwd 影响 */
const DATA_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".data"
);
const VOUCHERS_FILE = path.join(DATA_DIR, "vouchers.json");
const ITINERARIES_FILE = path.join(DATA_DIR, "itineraries.json");

export interface RunRecord {
  runId: string;
  tripId: string;
  request: TripRequest;
  quote?: Quote;
  days?: ItineraryDay[];
  selectedOfferIds?: string[];
  createdAt: number;
}

export interface OrderRecord {
  orderId: string;
  runId: string;
  tripId: string;
  traveler: `0x${string}`;
  total: string;
  createTxHash?: `0x${string}`;
  status: "funded" | "settling" | "settled" | "failed";
  createdAt: number;
}

export interface OrderItinerary {
  orderId: string;
  runId: string;
  days: ItineraryDay[];
  quote?: Quote;
  request?: TripRequest;
}

export const runs = new Map<string, RunRecord>();
export const quotes = new Map<string, Quote>();
/** runId → 询价结果（发券时需要原始明细） */
export const offersByRun = new Map<string, PlanOffers>();
export const orders = new Map<string, OrderRecord>();
export const itineraries = new Map<string, OrderItinerary>(loadPersistedItineraries());
/** tokenId → 凭证明细（链下部分，持久化到 .data/vouchers.json） */
export const vouchers = new Map<string, VoucherDetail>(
  loadPersistedVouchers()
);
/** holder(小写) → tokenId[] */
export const vouchersByHolder = new Map<string, string[]>();

// 启动时按持有人重建二级索引（索引本身不落盘）
for (const voucher of vouchers.values()) {
  const key = voucher.holder.toLowerCase();
  const list = vouchersByHolder.get(key) ?? [];
  if (!list.includes(voucher.tokenId)) list.push(voucher.tokenId);
  vouchersByHolder.set(key, list);
}

log.info("本地状态已恢复", {
  vouchers: vouchers.size,
  holders: vouchersByHolder.size,
  itineraries: itineraries.size,
});

function loadPersistedVouchers(): [string, VoucherDetail][] {
  try {
    const raw = readFileSync(VOUCHERS_FILE, "utf8");
    const parsed = JSON.parse(raw) as VoucherDetail[];
    if (!Array.isArray(parsed)) {
      log.warn("凭证明细文件格式异常，按空状态启动", { file: VOUCHERS_FILE });
      return [];
    }
    const rows = parsed
      .filter((v) => v && typeof v.tokenId === "string")
      .map((v) => [v.tokenId, v] as [string, VoucherDetail]);
    log.info("已加载凭证明细", {
      file: VOUCHERS_FILE,
      count: rows.length,
      dropped: parsed.length - rows.length,
    });
    return rows;
  } catch (error) {
    // 文件不存在属正常首次启动；解析失败则意味着链下明细真的丢了，必须报警
    const reason = (error as Error).message;
    if (reason.includes("ENOENT")) log.info("未找到凭证明细文件，从空状态启动", { file: VOUCHERS_FILE });
    else log.error("凭证明细加载失败（链下明细可能已丢失）", { file: VOUCHERS_FILE }, error);
    return [];
  }
}

function persistVouchers(): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const payload = JSON.stringify([...vouchers.values()]);
    writeFileSync(VOUCHERS_FILE, payload, "utf8");
    log.debug("凭证明细已落盘", { count: vouchers.size, bytes: payload.length });
  } catch (error) {
    log.error("凭证明细落盘失败", { file: VOUCHERS_FILE }, error);
  }
}

export function indexVoucher(voucher: VoucherDetail): void {
  vouchers.set(voucher.tokenId, voucher);
  const key = voucher.holder.toLowerCase();
  const list = vouchersByHolder.get(key) ?? [];
  if (!list.includes(voucher.tokenId)) list.push(voucher.tokenId);
  vouchersByHolder.set(key, list);
  log.debug("凭证已索引", {
    tokenId: voucher.tokenId,
    holder: voucher.holder,
    category: voucher.category,
    status: voucher.status,
  });
  persistVouchers();
}

function loadPersistedItineraries(): [string, OrderItinerary][] {
  try {
    const raw = readFileSync(ITINERARIES_FILE, "utf8");
    const parsed = JSON.parse(raw) as OrderItinerary[];
    if (!Array.isArray(parsed)) {
      log.warn("行程单文件格式异常，按空状态启动", { file: ITINERARIES_FILE });
      return [];
    }
    return parsed
      .filter((item) => item && typeof item.orderId === "string")
      .map((item) => [item.orderId, item]);
  } catch (error) {
    const reason = (error as Error).message;
    if (!reason.includes("ENOENT")) {
      log.error("行程单加载失败", { file: ITINERARIES_FILE }, error);
    }
    return [];
  }
}

function persistItineraries(): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const payload = JSON.stringify([...itineraries.values()]);
    writeFileSync(ITINERARIES_FILE, payload, "utf8");
    log.debug("行程单已落盘", { count: itineraries.size, bytes: payload.length });
  } catch (error) {
    log.error("行程单落盘失败", { file: ITINERARIES_FILE }, error);
  }
}

export function saveItinerary(snapshot: OrderItinerary): void {
  itineraries.set(snapshot.orderId, snapshot);
  log.debug("保存行程单", { orderId: snapshot.orderId, runId: snapshot.runId, days: snapshot.days.length });
  persistItineraries();
}

export function getItinerary(orderId: string): OrderItinerary | undefined {
  return itineraries.get(orderId);
}

export function listVouchersByHolder(holder: string): VoucherDetail[] {
  const ids = vouchersByHolder.get(holder.toLowerCase()) ?? [];
  return ids
    .map((id) => vouchers.get(id))
    .filter((v): v is VoucherDetail => Boolean(v));
}
