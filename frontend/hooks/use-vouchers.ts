"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { fetchHolderVouchers } from "@/lib/chain-vouchers";
import { isDeployed } from "@/lib/contracts";
import type { VoucherDetail } from "@/lib/types";

const EMPTY: VoucherDetail[] = [];

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

  const stats = useMemo(
    () => ({
      issued: items.filter((v) => v.status === "Issued").length,
      redeemed: items.filter((v) => v.status === "Redeemed").length,
      voided: items.filter((v) => v.status === "Voided").length,
    }),
    [items]
  );

  return { address, items, grouped, stats, loading, error, refresh };
}
