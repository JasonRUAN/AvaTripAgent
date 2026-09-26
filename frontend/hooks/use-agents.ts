"use client";

import { useCallback, useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { BACKEND_URL, CONTRACTS, REGISTRY_ABI, REVIEW_ABI, isDeployed, isReviewDeployed } from "@/lib/contracts";
import { activeLocale, getDict } from "@/lib/i18n";
import type { AgentProfile, CategoryCode, OnchainReview } from "@/lib/types";

export function useAgents() {
  const publicClient = usePublicClient();
  // 语言读模块级镜像：refresh 不该因为切语言就重新拉一次链
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${BACKEND_URL}/api/agents`);
      if (response.ok) {
        const payload = (await response.json()) as { agents?: AgentProfile[] };
        setAgents(payload.agents ?? []);
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    } catch {
      if (!isDeployed || !publicClient) {
        setAgents([]);
        setError(getDict(activeLocale()).errors.agentListFailed);
        return;
      }
      try {
        const addresses = await publicClient.readContract({
          address: CONTRACTS.agentRegistry,
          abi: REGISTRY_ABI,
          functionName: "getAgents",
        });
        const profiles: AgentProfile[] = [];
        for (const address of addresses) {
          const info = await publicClient.readContract({
            address: CONTRACTS.agentRegistry,
            abi: REGISTRY_ABI,
            functionName: "getAgent",
            args: [address],
          });
          let ratingAvgX100 = 0;
          let ratingCount = 0;
          if (isReviewDeployed) {
            try {
              const score = await publicClient.readContract({
                address: CONTRACTS.agentReview,
                abi: REVIEW_ABI,
                functionName: "getScore",
                args: [address],
              });
              ratingCount = Number(score[1]);
              ratingAvgX100 = Number(score[2]);
            } catch {
              // 旧部署没有 AgentReview
            }
          }
          profiles.push({
            address,
            name: info.name,
            category: Number(info.category) as CategoryCode,
            categories: [Number(info.category) as CategoryCode],
            categoryMask: 1 << Number(info.category),
            endpoint: info.endpoint,
            active: info.active,
            ratingAvg: ratingCount ? ratingAvgX100 / 100 : 0,
            ratingCount,
            ratingAvgX100,
            description: info.description ?? "",
            website: info.website ?? "",
          });
          try {
            const mask = await publicClient.readContract({
              address: CONTRACTS.agentRegistry,
              abi: REGISTRY_ABI,
              functionName: "getCategoryMask",
              args: [address],
            });
            const categoryMask = Number(mask);
            if (categoryMask > 0) {
              const last = profiles[profiles.length - 1];
              last.categoryMask = categoryMask;
              last.categories = ([0, 1, 2, 3] as CategoryCode[]).filter(
                (code) => (categoryMask & (1 << code)) !== 0
              );
            }
          } catch {
            // 旧部署
          }
        }
        setAgents(profiles);
      } catch (chainError) {
        // viem 的报错只有英文原文，直接展示会和界面语言打架：控制台留原文，界面走字典
        console.error("[agents] 读取链上服务商失败:", chainError);
        setError(getDict(activeLocale()).errors.chainReadFailed);
        setAgents([]);
      }
    } finally {
      setLoading(false);
    }
  }, [publicClient]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { agents, loading, error, refresh };
}

export function useAgentReviews(address?: `0x${string}`) {
  const [reviews, setReviews] = useState<OnchainReview[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) {
      setReviews([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`${BACKEND_URL}/api/agents/${address}/reviews`)
      .then((response) => (response.ok ? response.json() : { reviews: [] }))
      .then((payload: { reviews?: OnchainReview[] }) => {
        if (!cancelled) setReviews(payload.reviews ?? []);
      })
      .catch(() => {
        if (!cancelled) setReviews([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  return { reviews, loading };
}
