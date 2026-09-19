"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { BACKEND_URL } from "@/lib/contracts";
import { buildDemoVouchers } from "@/lib/demo-fixture";
import type { VoucherDetail } from "@/lib/types";

/**
 * 凭证列表。
 *
 * 后端是凭证明细的唯一来源（链上只存 hash）；
 * 后端不可达或未连接钱包时退回演示凭证，保证页面永远有内容。
 */
export function useVouchers() {
  const { address } = useAccount();
  const [items, setItems] = useState<VoucherDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!address) {
      setItems([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`${BACKEND_URL}/api/vouchers?address=${address}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((payload: { vouchers: VoucherDetail[] }) => {
        if (cancelled) return;
        if (payload.vouchers.length > 0) {
          setItems(payload.vouchers);
          setOffline(false);
        } else {
          setItems(buildDemoVouchers(address));
          setOffline(true);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setItems(buildDemoVouchers(address));
        setOffline(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
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

  return { address, items, grouped, stats, loading, offline };
}
