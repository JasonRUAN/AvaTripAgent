"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAccount, usePublicClient } from "wagmi";
import { enrichVoucherMetadata, fetchHolderVouchers } from "@/lib/chain-vouchers";
import { isDeployed } from "@/lib/contracts";
import { formatDate } from "@/lib/format";
import { getDict, interpolate } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import {
  invalidateVoucherList,
  isVoucherListFresh,
  loadVoucherList,
  saveVoucherList,
} from "@/lib/session-cache";
import { useT } from "@/lib/i18n/context";
import type { CategoryCode, VoucherDetail } from "@/lib/types";

const EMPTY: VoucherDetail[] = [];

/**
 * 缓存补水必须发生在浏览器绘制之前，否则会先闪一帧空态 / 骨架屏。
 * 服务端没有 layout effect，退回普通 effect 免得 React 告警。
 */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

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

/**
 * 行程标题：优先用明细里的「行程」字段，兜底用订单号尾号。
 * 明细 key 是链上/后端写死的，中文「行程」与英文 "Trip" 都认。
 */
function tripTitle(
  group: VoucherDetail[],
  orderId: string,
  locale: Locale
): string {
  for (const voucher of group) {
    const details = voucher.metadata?.details ?? {};
    const trip = details["行程"] ?? details["Trip"];
    if (trip) return trip;
  }
  return interpolate(getDict(locale).errors.tripTitle, {
    id: orderId.slice(-6),
  });
}

/**
 * 凭证列表。
 *
 * 唯一数据源是 Fuji 上的 `TravelVoucher` 合约（前端直读链上），
 * 不再提供任何演示 / mock 兜底：读不到就是空列表或可读的错误提示。
 *
 * 读取策略（缓存优先 + 后台静默更新）：
 *   1. 进页面先用上次读到的列表铺满（内存 / sessionStorage），首屏不闪空态；
 *   2. 缓存还在新鲜期内就到此为止，一次 RPC 都不打；
 *   3. 过期则在已有卡片背后重新扫链，读到了才整体换掉。
 * 发券、核销这类会改链上状态的动作会主动作废缓存（见 invalidateVoucherList）。
 */
export function useVouchers() {
  const { address } = useAccount();
  const client = usePublicClient();
  const clientRef = useRef(client);
  clientRef.current = client;
  const { locale } = useT();

  const [fetched, setFetched] = useState<VoucherDetail[]>(EMPTY);
  const [loading, setLoading] = useState(false);
  /** 有缓存打底、正在后台换新：不盖骨架屏，列表照常可点 */
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 当前这份列表的读取时间（缓存则是缓存写入时间） */
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // 未连接钱包时直接推导为空列表，避免在 effect 里同步 setState
  const items = address ? fetched : EMPTY;

  // 只跟「有没有 client」走，不跟 client 对象引用走。
  // wagmi 的 usePublicClient() 经常换新实例，跟进引用会反复取消请求、一直「读取中」。
  const hasClient = Boolean(client);

  useIsomorphicLayoutEffect(() => {
    const publicClient = clientRef.current;
    if (!address || !publicClient) return;

    let cancelled = false;

    // —— 同步阶段（绘制前）：先用缓存铺满，避免闪空态 / 骨架屏 ——
    const cached = loadVoucherList(address);
    if (cached) {
      setFetched(cached.items);
      setUpdatedAt(cached.savedAt);
    }

    // 缓存还在新鲜期：这次访问直接复用，一次 RPC 都不打
    if (isVoucherListFresh(cached)) {
      setLoading(false);
      setRefreshing(false);
      return () => {
        cancelled = true;
      };
    }

    // 有缓存就静默换新，没缓存才走完整加载（骨架屏）
    setLoading(!cached);
    setRefreshing(Boolean(cached));
    setError(null);

    // 放入微任务，避免在 effect 内同步 setState 触发级联渲染
    Promise.resolve().then(async () => {
      if (cancelled) return;

      if (!isDeployed) {
        setFetched(EMPTY);
        setLoading(false);
        setRefreshing(false);
        setError(getDict(locale).errors.contractNotDeployed);
        return;
      }

      try {
        const list = await fetchHolderVouchers(publicClient, address, locale);
        if (cancelled) return;
        setFetched(list);
        setUpdatedAt(Date.now());
        setLoading(false);
        setError(null);
        saveVoucherList(address, list);

        // 链下明细后补：失败/超时不影响已经画出的卡片
        const enriched = await enrichVoucherMetadata(list);
        if (cancelled) return;
        setFetched(enriched);
        saveVoucherList(address, enriched);
        setRefreshing(false);
      } catch (cause) {
        if (cancelled) return;
        setLoading(false);
        setRefreshing(false);
        // 链上读失败只会抛 viem 英文原文：控制台留原文，界面按当前语言走字典
        console.error("[vouchers] 读取链上凭证失败:", cause);
        setError(getDict(locale).errors.voucherReadFailed);
        // 后台更新失败时保留已经画出来的缓存列表，不让页面塌成空态
        if (!cached) setFetched(EMPTY);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [address, hasClient, reloadKey, locale]);

  /** 手动刷新：先把缓存作废，否则新鲜期内会被直接复用、等于没刷 */
  const refresh = useCallback(() => {
    if (address) invalidateVoucherList(address);
    setUpdatedAt(null);
    setReloadKey((key) => key + 1);
  }, [address]);

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
        title: tripTitle(vouchers, orderId, locale),
        dateLabel: Number.isFinite(start) ? formatDate(start, locale) : null,
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
  }, [items, locale]);

  const stats = useMemo(
    () => ({
      issued: items.filter((v) => v.status === "Issued").length,
      redeemed: items.filter((v) => v.status === "Redeemed").length,
      voided: items.filter((v) => v.status === "Voided").length,
    }),
    [items]
  );

  return {
    address,
    items,
    grouped,
    trips,
    stats,
    loading,
    refreshing,
    updatedAt,
    error,
    refresh,
  };
}
