"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatUnits, keccak256, toHex } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { consumeSSE } from "@/lib/sse-client";
import { BACKEND_URL, CONTRACTS, SETTLEMENT_ABI, USDC_ABI, isDeployed } from "@/lib/contracts";
import {
  loadCheckoutSnapshot,
  saveCheckoutSnapshot,
} from "@/lib/session-cache";
import type { Quote, SettlementEvent, SettlementStep } from "@/lib/types";

export type CheckoutStage =
  | "connect"
  | "faucet"
  | "approve"
  | "pay"
  | "settling"
  | "done";

/** 结算进度快照里的 phase */
type CheckoutSnapshotPhase = "idle" | "settling" | "done";

/** 字符串 tripId → 合约需要的 uint256 */
function numericTripId(tripId: string): bigint {
  return BigInt(keccak256(toHex(tripId))) % 1_000_000n;
}

/** OrderCreated(uint256 indexed orderId, address indexed traveler, uint256 total, bytes32 itineraryHash) 的 topic0 */
const ORDER_CREATED_TOPIC = keccak256(
  toHex("OrderCreated(uint256,address,uint256,bytes32)")
);

/**
 * 从 createOrder 回执里取出 orderId（OrderCreated 的第一个 indexed 参数）。
 *
 * 必须同时按「结算合约地址 + OrderCreated 的 topic0」过滤：
 * createOrder 内部先执行 usdc.transferFrom，回执里 USDC 的 Transfer 事件
 * 排在 OrderCreated 之前，无脑取任意日志的 topics[1] 会拿到用户地址而非订单号。
 */
function orderIdFromReceipt(receipt: {
  logs: readonly { address: string; topics: readonly string[] }[];
}): string | null {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== CONTRACTS.tripSettlement.toLowerCase()) continue;
    if (log.topics[0]?.toLowerCase() !== ORDER_CREATED_TOPIC) continue;

    const orderId = log.topics[1];
    if (!orderId) continue;
    try {
      return BigInt(orderId).toString();
    } catch {
      continue;
    }
  }
  return null;
}

export function useCheckout(params: { quote?: Quote; runId?: string }) {
  const { quote } = params;
  const runId = params.runId;
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  /**
   * 结算进度按 runId 缓存（内存 + sessionStorage）：
   * 切到「我的凭证 / 商户核销」再回来时能恢复，直到用户主动重新规划。
   */
  const snapshot = useMemo(() => loadCheckoutSnapshot(runId), [runId]);

  /** 支付之后的阶段；支付前的步骤（连接 / 领币 / 授权 / 支付）由链上状态实时推导 */
  const [phase, setPhase] = useState<CheckoutSnapshotPhase>(snapshot?.phase ?? "idle");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(snapshot?.orderId ?? null);
  const [payTxHash, setPayTxHash] = useState<`0x${string}` | null>(
    (snapshot?.payTxHash as `0x${string}` | undefined) ?? null
  );
  const [steps, setSteps] = useState<SettlementStep[]>(snapshot?.steps ?? []);
  const [tokenIds, setTokenIds] = useState<string[]>(snapshot?.tokenIds ?? []);

  /** 同一挂载实例内防止重复连结算流 */
  const watchingRef = useRef<string | null>(null);

  // 重新规划（runId 变化）时丢弃旧订单的结算状态
  const prevRunIdRef = useRef(runId);
  useEffect(() => {
    if (prevRunIdRef.current !== runId) {
      prevRunIdRef.current = runId;
      watchingRef.current = null;
      setPhase("idle");
      setOrderId(null);
      setPayTxHash(null);
      setSteps([]);
      setTokenIds([]);
      setError(null);
    }
  }, [runId]);

  // 结算进度持久化：切走再切回来可恢复；runId 变化后旧快照不再写入
  useEffect(() => {
    if (!runId) return;
    if (phase === "idle" && steps.length === 0 && !orderId) return;
    saveCheckoutSnapshot({ runId, phase, orderId, payTxHash, steps, tokenIds });
  }, [runId, phase, orderId, payTxHash, steps, tokenIds]);

  const total = useMemo(() => BigInt(quote?.total ?? "0"), [quote]);

  /**
   * 链上余额 / 授权额度直接挂在 react-query 上：
   * 打开页面自动读一次，每笔交易后再 refetch，步骤条就是靠它推导的。
   */
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: CONTRACTS.usdc,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: isDeployed && Boolean(address) },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: CONTRACTS.usdc,
    abi: USDC_ABI,
    functionName: "allowance",
    args: address ? [address, CONTRACTS.tripSettlement] : undefined,
    query: { enabled: isDeployed && Boolean(address) },
  });

  const readBalance = useCallback(
    async () => (await refetchBalance()).data ?? 0n,
    [refetchBalance]
  );

  const readAllowance = useCallback(
    async () => (await refetchAllowance()).data ?? 0n,
    [refetchAllowance]
  );

  /** 交易上链后重读余额 / 授权 */
  const refreshFunds = useCallback(async () => {
    if (!isDeployed || !address) return;
    await Promise.all([refetchBalance(), refetchAllowance()]);
  }, [address, refetchAllowance, refetchBalance]);

  /**
   * 当前步骤：连接钱包 → 领 tUSDC → 授权 → 支付。
   *
   * 完全由链上真实状态推导（是否连接 / 余额够不够 / 额度够不够），
   * 所以不管用户是点步骤里的按钮，还是直接点「确认支付」让 pay() 内部
   * 自动补领、补授权，左侧步骤条都会同步前进。
   */
  const stage: CheckoutStage = useMemo(() => {
    if (phase === "settling") return "settling";
    if (phase === "done") return "done";
    if (!isConnected || !address) return "connect";
    if (!isDeployed) return "faucet";
    // 链上状态还没读到时先停在「领 tUSDC」，下一步就是校验余额
    if (balance === undefined || balance < total) return "faucet";
    if (allowance === undefined || allowance < total) return "approve";
    return "pay";
  }, [address, allowance, balance, isConnected, phase, total]);

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
      await refreshFunds();
    } catch (err) {
      setError(err instanceof Error ? err.message : "领取失败");
    } finally {
      setBusy(null);
    }
  }, [publicClient, refreshFunds, writeContractAsync]);

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
      await refreshFunds();
    } catch (err) {
      setError(err instanceof Error ? err.message : "授权失败");
    } finally {
      setBusy(null);
    }
  }, [publicClient, refreshFunds, total, writeContractAsync]);

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
    watchingRef.current = orderIdValue;
    setPhase("settling");

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
            setPhase("done");
          }
          if (event.type === "settlement.error") {
            setError(event.message);
          }
        },
      }
    );
  }, []);

  /**
   * 从其他分类页切回来、且恢复出的快照还停在「结算中」时，重新挂上 SSE。
   * 后端 EventChannel 对新订阅者会先回放历史事件（frontend 按 step.key 去重、
   * settlement.done 幂等），所以重连是安全的。
   */
  useEffect(() => {
    if (phase === "settling" && orderId && watchingRef.current !== orderId) {
      void watchSettlement(orderId);
    }
  }, [phase, orderId, watchSettlement]);

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

    if (!address) {
      setError("钱包未连接");
      return;
    }

    // 合约里 provider 不能等于 msg.sender（ProviderIsTraveler），否则
    // estimateGas 就会 revert，前端拿到的是一个解不开的自定义 error。
    // 演示时很容易误把服务商 Agent 的钱包当成旅客钱包连上，这里提前拦下。
    const selfDealing = quote.lineItems.find(
      (item) => item.provider.toLowerCase() === address.toLowerCase()
    );
    if (selfDealing) {
      setError(
        `当前钱包就是服务商「${selfDealing.providerName}」的地址，` +
          `合约不允许服务商给自己付款（ProviderIsTraveler）。请切换到旅客钱包后重试。`
      );
      return;
    }

    setBusy("prepare");
    try {
      // createOrder 内部会 usdc.transferFrom，余额不足会被 tUSDC 以
      // InsufficientBalance(0xf4d678b8) revert。水龙头可重复领取，
      // 余额不够时自动补领（每单上限 5 次，防止死循环烧 gas）。
      // 每一步都同步 busy，左侧步骤条就能跟着钱包操作一步步走。
      let balance = await readBalance();
      let faucetCount = 0;

      while (balance < total && faucetCount < 5) {
        setBusy("faucet");
        const faucetHash = await writeContractAsync({
          address: CONTRACTS.usdc,
          abi: USDC_ABI,
          functionName: "faucet",
        });
        await publicClient?.waitForTransactionReceipt({ hash: faucetHash });
        balance = await readBalance();
        faucetCount += 1;
      }

      if (balance < total) {
        throw new Error(
          `tUSDC 余额不足：当前 ${formatUnits(balance, 6)}，本单需要 ${formatUnits(total, 6)}`
        );
      }

      // 授权不足会被 tUSDC 以 InsufficientAllowance(0x13be252b) revert，
      // 所以支付前先确保额度够
      let allowance = await readAllowance();

      if (allowance < total) {
        setBusy("approve");
        const approveHash = await writeContractAsync({
          address: CONTRACTS.usdc,
          abi: USDC_ABI,
          functionName: "approve",
          args: [CONTRACTS.tripSettlement, total],
        });
        await publicClient?.waitForTransactionReceipt({ hash: approveHash });
        allowance = await readAllowance();
      }

      setBusy("pay");
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
      setPayTxHash(hash);

      // 解析不出订单号时不能造一个假的发给后端：后端拿到不存在的 orderId
      // 会让 settle 直接 revert UnknownOrder，整条发券链路全废。
      const finalOrderId = receipt ? orderIdFromReceipt(receipt) : null;
      if (!finalOrderId) {
        throw new Error("没能从交易回执里解析出订单号（缺少 OrderCreated 事件）");
      }

      setOrderId(finalOrderId);
      setBusy(null);
      await refreshFunds();

      await registerOrder(finalOrderId, hash);
      await watchSettlement(finalOrderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "支付失败");
      setBusy(null);
      await refreshFunds();
    }
  }, [
    address,
    isConnected,
    publicClient,
    quote,
    readAllowance,
    readBalance,
    refreshFunds,
    registerOrder,
    total,
    watchSettlement,
    writeContractAsync,
  ]);

  /** 根据当前状态决定下一步该做什么 */
  const nextAction = useMemo(() => {
    if (phase === "settling" || phase === "done") return null;
    if (!isDeployed) return { label: "演示模式：模拟支付并分账", run: pay };
    if (!isConnected) return { label: "连接钱包", run: () => {} };
    return { label: "确认支付（approve + createOrder）", run: pay };
  }, [isConnected, pay, phase]);

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
