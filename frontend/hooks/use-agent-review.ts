"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "viem/actions";
import { CONTRACTS, REVIEW_ABI, isReviewDeployed } from "@/lib/contracts";
import { useT } from "@/lib/i18n/context";
import { walletErrorText } from "@/lib/wallet-error";
import type { OnchainReview } from "@/lib/types";

export function useTokenReview(tokenId?: string) {
  const publicClient = usePublicClient();
  const [review, setReview] = useState<OnchainReview | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!tokenId || !isReviewDeployed || !publicClient) {
      setReview(null);
      return;
    }
    setLoading(true);
    try {
      const has = await publicClient.readContract({
        address: CONTRACTS.agentReview,
        abi: REVIEW_ABI,
        functionName: "hasReview",
        args: [BigInt(tokenId)],
      });
      if (!has) {
        setReview(null);
        return;
      }
      const row = await publicClient.readContract({
        address: CONTRACTS.agentReview,
        abi: REVIEW_ABI,
        functionName: "getReview",
        args: [BigInt(tokenId)],
      });
      setReview({
        tokenId: row.tokenId.toString(),
        reviewer: row.reviewer,
        provider: row.provider,
        score: Number(row.score),
        comment: row.comment,
        timestamp: Number(row.timestamp),
      });
    } catch {
      setReview(null);
    } finally {
      setLoading(false);
    }
  }, [publicClient, tokenId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { review, loading, refresh };
}

export function useSubmitReview(tokenId: string) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync, isPending } = useWriteContract();
  const { t, locale } = useT();
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (score: number, comment: string) => {
      setError(null);
      if (!isReviewDeployed) {
        setError(t("errors.reviewNotDeployed"));
        return false;
      }
      if (!address) {
        setError(t("errors.connectWalletFirst"));
        return false;
      }
      try {
        const hash = await writeContractAsync({
          address: CONTRACTS.agentReview,
          abi: REVIEW_ABI,
          functionName: "submitReview",
          args: [BigInt(tokenId), score, comment],
        });
        if (publicClient) {
          await waitForTransactionReceipt(publicClient, { hash });
        }
        return true;
      } catch (submitError) {
        setError(walletErrorText(locale, submitError, t("errors.submitFailed")));
        return false;
      }
    },
    [address, publicClient, t, locale, tokenId, writeContractAsync]
  );

  return { submit, isPending, error, address };
}
