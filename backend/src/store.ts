import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PlanOffers } from "./mock/demo-run";
import type { Quote, TripRequest, VoucherDetail } from "./types";

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

export interface RunRecord {
  runId: string;
  tripId: string;
  request: TripRequest;
  quote?: Quote;
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

export const runs = new Map<string, RunRecord>();
export const quotes = new Map<string, Quote>();
/** runId → 询价结果（发券时需要原始明细） */
export const offersByRun = new Map<string, PlanOffers>();
export const orders = new Map<string, OrderRecord>();
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

function loadPersistedVouchers(): [string, VoucherDetail][] {
  try {
    const raw = readFileSync(VOUCHERS_FILE, "utf8");
    const parsed = JSON.parse(raw) as VoucherDetail[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v) => v && typeof v.tokenId === "string")
      .map((v) => [v.tokenId, v]);
  } catch {
    // 文件不存在或损坏时从空状态开始，不阻塞启动
    return [];
  }
}

function persistVouchers(): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(VOUCHERS_FILE, JSON.stringify([...vouchers.values()]), "utf8");
  } catch (error) {
    console.error("[store] 凭证明细落盘失败:", error);
  }
}

export function indexVoucher(voucher: VoucherDetail): void {
  vouchers.set(voucher.tokenId, voucher);
  const key = voucher.holder.toLowerCase();
  const list = vouchersByHolder.get(key) ?? [];
  if (!list.includes(voucher.tokenId)) list.push(voucher.tokenId);
  vouchersByHolder.set(key, list);
  persistVouchers();
}

export function listVouchersByHolder(holder: string): VoucherDetail[] {
  const ids = vouchersByHolder.get(holder.toLowerCase()) ?? [];
  return ids
    .map((id) => vouchers.get(id))
    .filter((v): v is VoucherDetail => Boolean(v));
}
