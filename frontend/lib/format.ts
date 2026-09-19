import { formatUnits } from "viem";
import type { Address, Hex } from "./types";

/** tUSDC 精度 */
export const USDC_DECIMALS = 6;

/** 最小单位 → 人类可读数字（不格式化千分位） */
export function fromUnits(value: bigint | string | number): number {
  return Number(formatUnits(BigInt(value ?? 0), USDC_DECIMALS));
}

/** 最小单位 → "1,234.56" */
export function formatUsd(value: bigint | string | number): string {
  const n = fromUnits(value);
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** 人类可读数字 → 最小单位 bigint（避免浮点误差：先按字符串转） */
export function toUnits(value: number | string): bigint {
  const [intPart = "0", fracPart = ""] = String(value).split(".");
  const frac = (fracPart + "000000").slice(0, USDC_DECIMALS);
  return (
    BigInt(intPart) * BigInt(10) ** BigInt(USDC_DECIMALS) + BigInt(frac || "0")
  );
}

/** 地址脱敏：0x1234…abcd */
export function maskAddress(address?: string, keep = 4): string {
  if (!address) return "—";
  if (address.length <= keep * 2 + 2) return address;
  return `${address.slice(0, 2 + keep)}…${address.slice(-keep)}`;
}

/** 交易 hash 短码 */
export function shortHash(hash?: Hex | string, keep = 6): string {
  if (!hash) return "—";
  if (hash.length <= keep * 2 + 2) return hash;
  return `${hash.slice(0, 2 + keep)}…${hash.slice(-keep)}`;
}

/** Fuji C-Chain 交易链接 */
export function explorerTx(hash?: Hex | string): string {
  if (!hash) return "https://subnets-test.avax.network/c-chain";
  return `https://subnets-test.avax.network/c-chain/tx/${hash}`;
}

/** Fuji C-Chain 地址链接 */
export function explorerAddress(address?: Address | string): string {
  if (!address) return "https://subnets-test.avax.network/c-chain";
  return `https://subnets-test.avax.network/c-chain/address/${address}`;
}

/** Fuji C-Chain NFT 链接 */
export function explorerToken(contract?: string, tokenId?: string): string {
  if (!contract || !tokenId) return "https://subnets-test.avax.network/c-chain";
  return `https://subnets-test.avax.network/c-chain/token/${contract}/instance/${tokenId}`;
}

/** 分钟数 → "3h15m" */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}

/** 秒级时间戳 → "2026-10-01" */
export function formatDate(seconds: number): string {
  if (!seconds) return "—";
  return new Date(seconds * 1000).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** "2026-10-01" + n 天 → "2026-10-02" */
export function addDays(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** 日期 → "10月01日 周四" */
export function formatDayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][
    d.getUTCDay()
  ];
  return `${d.getUTCMonth() + 1}月${String(d.getUTCDate()).padStart(2, "0")}日 ${weekday}`;
}
