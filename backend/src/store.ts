import type { PlanOffers } from "./mock/demo-run";
import type { Quote, TripRequest, VoucherDetail } from "./types";

/**
 * 进程内状态。
 *
 * 演示规模下不需要数据库：重启即清空，反而方便反复演示。
 * 生产化时把这几张表换成 Postgres 即可，接口不变。
 */

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
/** tokenId → 凭证明细（链下部分） */
export const vouchers = new Map<string, VoucherDetail>();
/** holder(小写) → tokenId[] */
export const vouchersByHolder = new Map<string, string[]>();

export function indexVoucher(voucher: VoucherDetail): void {
  vouchers.set(voucher.tokenId, voucher);
  const key = voucher.holder.toLowerCase();
  const list = vouchersByHolder.get(key) ?? [];
  if (!list.includes(voucher.tokenId)) list.push(voucher.tokenId);
  vouchersByHolder.set(key, list);
}

export function listVouchersByHolder(holder: string): VoucherDetail[] {
  const ids = vouchersByHolder.get(holder.toLowerCase()) ?? [];
  return ids
    .map((id) => vouchers.get(id))
    .filter((v): v is VoucherDetail => Boolean(v));
}
