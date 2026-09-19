"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { fetchHolderVouchers } from "@/lib/chain-vouchers";
import { isDeployed } from "@/lib/contracts";
import { formatDate } from "@/lib/format";
import type { CategoryCode, VoucherDetail } from "@/lib/types";

const EMPTY: VoucherDetail[] = [];

/** 同一趟行程（一次结算订单）的全部凭证 */
export interface TripGroup {
  /** 结算订单号：同一趟行程所有凭证共享 */
  orderId: string;
  /** 行程标识：优先取凭证明细里的「行程」，否则用订单号尾号 */
  title: string;
  /** 出行日期（取凭证里最早的有效期起） */
  dateLabel: string | null;
  vouchers: VoucherDetail[];
  /** 按品类再分组，保持 0-3 顺序 */
  categories: { category: CategoryCode; list: VoucherDetail[] }[];
}

/** 行程标题：优先用明细里的「行程」字段，兜底用订单号尾号 */
function tripTitle(group: VoucherDetail[], orderId: string): string {
  for (const voucher of group) {
    const trip = voucher.metadata?.details?.["行程"];
    if (trip) return trip;
  }
  return `行程 #${orderId.slice(-6)}`;
}

/**
 * 凭证列表。
 *
 * 唯一数据源是 Fuji 上的 `TravelVoucher` 合约（前端直读链上），
 * 不再提供任何演示 / mock 兜底：读不到就是空列表或可读的错误提示。
 */
export function useVouchers() {
  const { address } = useAccount();
  const client = usePublicClient();

  const [fetched, setFetched] = useState<VoucherDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // 未连接钱包时直接推导为空列表，避免在 effect 里同步 setState
  const items = address ? fetched : EMPTY;

  useEffect(() => {
    if (!address || !client) return;

    let cancelled = false;

    // 放入微任务，避免在 effect 内同步 setState 触发级联渲染
    Promise.resolve().then(async () => {
      if (cancelled) return;

      if (!isDeployed) {
        setFetched(EMPTY);
        setLoading(false);
        setError("合约尚未部署，无法读取链上凭证");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const list = await fetchHolderVouchers(client, address);
        if (cancelled) return;
        setFetched(list);
      } catch (cause) {
        if (cancelled) return;
        setFetched(EMPTY);
        setError(
          cause instanceof Error ? cause.message : "链上凭证读取失败，请稍后重试"
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [address, client, reloadKey]);

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  const grouped = useMemo(() => {
    const groups: Record<number, VoucherDetail[]> = { 0: [], 1: [], 2: [], 3: [] };
    for (const item of items) {
      (groups[item.category] ??= []).push(item);
    }
    return groups;
  }, [items]);

  /** 按行程（结算订单）聚合：同一趟行程的所有凭证共享 orderId */
  const trips = useMemo<TripGroup[]>(() => {
    const byOrder = new Map<string, VoucherDetail[]>();
    for (const item of items) {
      const list = byOrder.get(item.orderId) ?? [];
      list.push(item);
      byOrder.set(item.orderId, list);
    }

    const groups: TripGroup[] = [];
    for (const [orderId, vouchers] of byOrder) {
      vouchers.sort(
        (a, b) =>
          a.category - b.category || Number(a.tokenId) - Number(b.tokenId)
      );

      const categories: TripGroup["categories"] = [];
      for (const category of [0, 1, 2, 3] as CategoryCode[]) {
        const list = vouchers.filter((v) => v.category === category);
        if (list.length > 0) categories.push({ category, list });
      }

      const start = vouchers.reduce(
        (min, v) => Math.min(min, v.validFrom),
        Number.POSITIVE_INFINITY
      );

      groups.push({
        orderId,
        title: tripTitle(vouchers, orderId),
        dateLabel: Number.isFinite(start) ? formatDate(start) : null,
        vouchers,
        categories,
      });
    }

    // 最近的行程排在最前
    groups.sort((a, b) => {
      const ta = Math.min(...a.vouchers.map((v) => v.validFrom));
      const tb = Math.min(...b.vouchers.map((v) => v.validFrom));
      return tb - ta;
    });

    return groups;
  }, [items]);

  const stats = useMemo(
    () => ({
      issued: items.filter((v) => v.status === "Issued").length,
      redeemed: items.filter((v) => v.status === "Redeemed").length,
      voided: items.filter((v) => v.status === "Voided").length,
    }),
    [items]
  );

  return { address, items, grouped, trips, stats, loading, error, refresh };
}
