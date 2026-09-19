"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { BACKEND_URL } from "@/lib/contracts";
import { buildDemoVouchers } from "@/lib/demo-fixture";
import type { VoucherDetail } from "@/lib/types";

const EMPTY: VoucherDetail[] = [];

/**
 * 凭证列表。
 *
 * 后端是凭证明细的唯一来源（链上只存 hash）；
 * 后端不可达或未连接钱包时退回演示凭证，保证页面永远有内容。
 */
export function useVouchers() {
  const { address } = useAccount();
  /** 后端返回的真实凭证明细；未连接钱包时视为空 */
  const [fetched, setFetched] = useState<VoucherDetail[]>([]);
  const [loading, setLoading] = useState(false);
  /** true = 后端网络不可达；后端可达但列表为空不算 offline */
  const [offline, setOffline] = useState(false);
  /** true = 当前展示的是演示数据（后端无真实记录或不可达） */
  const [demo, setDemo] = useState(false);

  // 未连接钱包时直接推导为空列表，避免在 effect 里同步 setState
  const items = address ? fetched : EMPTY;

  useEffect(() => {
    if (!address) return;

    let cancelled = false;

    // 放入微任务，避免在 effect 内同步 setState 触发级联渲染
    Promise.resolve().then(async () => {
      if (cancelled) return;
      setLoading(true);

      try {
        const response = await fetch(`${BACKEND_URL}/api/vouchers?address=${address}`);
        if (!response.ok) throw new Error(String(response.status));
        const payload = (await response.json()) as { vouchers: VoucherDetail[] };
        if (cancelled) return;

        setOffline(false);
        if (payload.vouchers.length > 0) {
          setFetched(payload.vouchers);
          setDemo(false);
        } else {
          // 后端可达但无记录（如发券后后端重启，内存明细已清空），
          // 退回演示数据但不提示"未连接"。
          setFetched(buildDemoVouchers(address));
          setDemo(true);
        }
      } catch {
        if (cancelled) return;
        setFetched(buildDemoVouchers(address));
        setOffline(true);
        setDemo(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [address]);

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

  return { address, items, grouped, stats, loading, offline, demo };
}
