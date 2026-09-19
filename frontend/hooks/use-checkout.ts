"use client";

import { useCallback, useMemo, useState } from "react";
import { keccak256, toHex } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { consumeSSE } from "@/lib/sse-client";
import { BACKEND_URL, CONTRACTS, SETTLEMENT_ABI, USDC_ABI, isDeployed } from "@/lib/contracts";
import type { Quote, SettlementEvent, SettlementStep } from "@/lib/types";

export type CheckoutStage =
  | "connect"
  | "faucet"
  | "approve"
  | "pay"
  | "settling"
  | "done";

/** 字符串 tripId → 合约需要的 uint256 */
function numericTripId(tripId: string): bigint {
  return BigInt(keccak256(toHex(tripId))) % 1_000_000n;
}

/** 从 createOrder 回执里取出 orderId（OrderCreated 的第一个 indexed 参数） */
function orderIdFromReceipt(receipt: { logs: readonly { topics: readonly string[] }[] }): string | null {
  for (const log of receipt.logs) {
    const orderId = log.topics[1];
    if (orderId) {
      try {
        return BigInt(orderId).toString();
      } catch {
        continue;
      }
    }
  }
  return null;
}

export function useCheckout(params: { quote?: Quote; runId?: string }) {
  const { quote } = params;
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [stage, setStage] = useState<CheckoutStage>("connect");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [payTxHash, setPayTxHash] = useState<`0x${string}` | null>(null);
  const [steps, setSteps] = useState<SettlementStep[]>([]);
  const [tokenIds, setTokenIds] = useState<string[]>([]);

  const total = useMemo(() => BigInt(quote?.total ?? "0"), [quote]);

  const faucet = useCallback(async () => {
    if (!isDeployed) return;
    setBusy("faucet");
    setError(null);
    try {
      const hash = await writeContractAsync({
        address: CONTRACTS.usdc,
        abi: USDC_ABI,
        functionName: "faucet",
      });
      await publicClient?.waitForTransactionReceipt({ hash });
      setStage("approve");
    } catch (err) {
      setError(err instanceof Error ? err.message : "领取失败");
    } finally {
      setBusy(null);
    }
  }, [publicClient, writeContractAsync]);

  const approve = useCallback(async () => {
    if (!isDeployed) return;
    setBusy("approve");
    setError(null);
    try {
      const hash = await writeContractAsync({
        address: CONTRACTS.usdc,
        abi: USDC_ABI,
        functionName: "approve",
        args: [CONTRACTS.tripSettlement, total],
      });
      await publicClient?.waitForTransactionReceipt({ hash });
      setStage("pay");
    } catch (err) {
      setError(err instanceof Error ? err.message : "授权失败");
    } finally {
      setBusy(null);
    }
  }, [publicClient, total, writeContractAsync]);

  /** 未部署合约时走模拟：直接登记订单，后端会用模拟分账 + 模拟发券 */
  const registerOrder = useCallback(
    async (orderIdValue: string, txHash?: `0x${string}`) => {
      await fetch(`${BACKEND_URL}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: params.runId,
          orderId: orderIdValue,
          traveler: address,
          txHash,
          total: quote?.total,
        }),
      });
    },
    [address, params.runId, quote?.total]
  );

  const watchSettlement = useCallback(async (orderIdValue: string) => {
    setStage("settling");

    await consumeSSE<SettlementEvent>(
      `${BACKEND_URL}/api/orders/${orderIdValue}/stream`,
      { method: "GET" },
      {
        onEvent: (event) => {
          if (event.type === "settlement.step") {
            setSteps((prev) => {
              const next = prev.filter((s) => s.key !== event.step.key);
              return [...next, event.step].sort((a, b) => a.category - b.category);
            });
          }
          if (event.type === "settlement.done") {
            setTokenIds(event.tokenIds);
            setStage("done");
          }
          if (event.type === "settlement.error") {
            setError(event.message);
          }
        },
      }
    );
  }, []);

  const pay = useCallback(async () => {
    if (!quote) return;
    setError(null);

    // 演示模式（合约未部署）：跳过链上交互，直接让后端模拟分账 + 发券
    if (!isDeployed || !isConnected) {
      const mockOrderId = String(Math.floor(Math.random() * 9000) + 1000);
      setOrderId(mockOrderId);
      await registerOrder(mockOrderId);
      await watchSettlement(mockOrderId);
      return;
    }

    setBusy("pay");
    try {
      const hash = await writeContractAsync({
        address: CONTRACTS.tripSettlement,
        abi: SETTLEMENT_ABI,
        functionName: "createOrder",
        args: [
          numericTripId(quote.tripId),
          quote.itineraryHash as `0x${string}`,
          quote.lineItems.map((item) => ({
            provider: item.provider,
            amount: BigInt(item.amount),
            category: item.category,
            itemHash: item.itemHash as `0x${string}`,
          })),
        ],
      });

      const receipt = await publicClient?.waitForTransactionReceipt({ hash });
      const parsed = receipt ? orderIdFromReceipt(receipt) : null;
      const finalOrderId = parsed ?? String(Date.now() % 100000);

      setPayTxHash(hash);
      setOrderId(finalOrderId);
      setBusy(null);

      await registerOrder(finalOrderId, hash);
      await watchSettlement(finalOrderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "支付失败");
      setBusy(null);
    }
  }, [isConnected, params.runId, publicClient, quote, registerOrder, watchSettlement, writeContractAsync]);

  /** 根据当前状态决定下一步该做什么 */
  const nextAction = useMemo(() => {
    if (stage === "settling" || stage === "done") return null;
    if (!isDeployed) return { label: "演示模式：模拟支付并分账", run: pay };
    if (!isConnected) return { label: "连接钱包", run: () => {} };
    return { label: "确认支付（approve + createOrder）", run: pay };
  }, [isConnected, pay, stage]);

  return {
    stage,
    busy,
    error,
    orderId,
    payTxHash,
    steps,
    tokenIds,
    total,
    isConnected,
    actions: { faucet, approve, pay },
    nextAction,
    requiresWallet: isDeployed && !isConnected,
  };
}
