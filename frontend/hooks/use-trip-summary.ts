"use client";

import { useCallback, useState } from "react";
import { BACKEND_URL } from "@/lib/contracts";
import type { TripGroup } from "./use-vouchers";

/**
 * AI 行程总结。
 *
 * 把某趟行程聚合好的凭证明细发给后端（POST /api/ai/trip-summary），
 * 由后端 LLM 生成总结。结果按订单号缓存在模块级 Map 里：
 * 折叠再展开、切换页面回来都不会重复请求。
 */

export interface TripSummary {
  summary: string;
  highlights: string[];
  tips: string[];
  /** llm = 真实模型；offline = 后端未配置 LLM 时的规则兜底 */
  source?: "llm" | "offline";
}

const CATEGORY_LABELS: Record<number, string> = {
  0: "机票",
  1: "酒店",
  2: "门票",
  3: "餐饮",
};

const cache = new Map<string, TripSummary>();

export function getCachedTripSummary(orderId: string): TripSummary | null {
  return cache.get(orderId) ?? null;
}

function buildPayload(trip: TripGroup) {
  return {
    tripId: trip.title,
    dateLabel: trip.dateLabel,
    vouchers: trip.vouchers.map((voucher) => ({
      title: voucher.metadata?.name ?? voucher.title,
      categoryLabel: CATEGORY_LABELS[voucher.category] ?? "其他",
      details: voucher.metadata?.details ?? {},
    })),
  };
}

export function useTripSummary(trip: TripGroup) {
  const [summary, setSummary] = useState<TripSummary | null>(
    () => cache.get(trip.orderId) ?? null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${BACKEND_URL}/api/ai/trip-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(trip)),
      });

      if (!response.ok) {
        const payload = (await response
          .json()
          .catch(() => null)) as { message?: string } | null;
        throw new Error(
          payload?.message ?? `行程总结生成失败（HTTP ${response.status}）`
        );
      }

      const data = (await response.json()) as TripSummary;
      cache.set(trip.orderId, data);
      setSummary(data);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "AI 行程总结生成失败，请稍后重试"
      );
    } finally {
      setLoading(false);
    }
  }, [trip, loading]);

  return { summary, loading, error, generate };
}
