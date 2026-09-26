import { formatUnits } from "viem";
import { getDict, interpolate } from "./i18n";
import { INTL_TAG, type Locale } from "./i18n/config";
import type { Address, Hex } from "./types";

/** atUSDC 精度 */
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

/**
 * Fuji C-Chain NFT 集合页链接。
 *
 * 注意：Avalanche 官方 Explorer（subnets-test.avax.network）**没有单个 NFT 实例的路由**，
 * `/c-chain/token/{合约}/instance/{tokenId}` 会直接渲染 404 页（那是 Etherscan / 旧 Snowtrace 的格式）。
 * 实测只有合约级的 Token Details 页可用，凭证本身要在页内 Transfers 表里按 TOKEN ID 定位。
 */
export function explorerToken(contract?: string): string {
  if (!contract) return "https://subnets-test.avax.network/c-chain";
  return `https://subnets-test.avax.network/c-chain/token/${contract}`;
}

/** 分钟数 → "3h15m" */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}

/** 毫秒时间戳 → "14:05"（缓存/更新时间用） */
export function formatClock(timestamp: number, locale: Locale): string {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleTimeString(INTL_TAG[locale], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 秒级时间戳 → 本地化日期（zh: 2026/10/01，en: 10/01/2026） */
export function formatDate(seconds: number, locale: Locale): string {
  if (!seconds) return "—";
  return new Date(seconds * 1000).toLocaleDateString(INTL_TAG[locale], {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** 千分位数字（USD 金额、天数等） */
export function formatNumber(value: number, locale: Locale): string {
  return value.toLocaleString(INTL_TAG[locale]);
}

/** "2026-10-01" + n 天 → "2026-10-02" */
export function addDays(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** 日期 → zh: "10月01日 周四" / en: "Oct 01, Thu" */
export function formatDayLabel(date: string, locale: Locale): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "—";

  const dict = getDict(locale);
  // zh 用数字月（模板里补「月/日」），en 用 Intl 的短月份名
  const month =
    locale === "en"
      ? d.toLocaleDateString(INTL_TAG.en, { month: "short", timeZone: "UTC" })
      : String(d.getUTCMonth() + 1);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const weekday = dict.weekdays.split(",")[d.getUTCDay()] ?? "";

  return interpolate(dict.monthDayFormat, { m: month, d: day, w: weekday });
}
