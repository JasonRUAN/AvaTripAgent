import { AGENT_ADDRESSES, AGENT_NAMES, CATEGORY_TO_KEY } from "../agents/addresses";
import { hasChain } from "../env";
import { offersByRun, orders, runs } from "../store";
import { getOrderChannel, touch } from "../sse";
import type {
  CategoryCode,
  Quote,
  SettlementEvent,
  SettlementStep,
} from "../types";
import { SETTLEMENT_ABI } from "./abis";
import { contractAddresses, orchestratorWallet, publicClient } from "./clients";
import { issueVoucher } from "./voucher";

/**
 * 分账 —— 由后端 Orchestrator 私钥驱动，用户只需签 2 次（approve + createOrder）。
 *
 * 刻意拆成 N 笔独立交易：每笔都能在 Explorer 上单独查到，
 * 「Agent 给 Agent 付款」的叙事看得见摸得着。
 *
 * 触发方式：前端 createOrder 成功后 POST /api/orders，
 * 后端用 receipt 中的 ProviderPaid 事件驱动对应 Provider 立刻发券（进程内同步，最稳）。
 */

export interface SettleParams {
  orderId: string;
  runId: string;
  quote?: Quote;
  traveler: `0x${string}`;
}

/** OrderStatus.Funded —— 只有处于托管中的订单才允许分账 */
const ORDER_STATUS_FUNDED = 1;

/**
 * 校验订单是否真的托管在链上，且明细条数与报价单一致。
 *
 * 前端在「合约未部署」的兜底模式下会生成一个本地随机订单号，
 * 直接拿它去 settle 只会 revert UnknownOrder，导致后面「收款 → 发券」整条链路一笔都发不出来。
 * 这里先读链确认，读不到就降级为模拟分账，凭证照常签发。
 */
async function orderIsOnChain(orderId: string, expectedItems: number): Promise<boolean> {
  try {
    const { settlement } = contractAddresses();

    const order = await publicClient.readContract({
      address: settlement,
      abi: SETTLEMENT_ABI,
      functionName: "getOrder",
      args: [BigInt(orderId)],
    });

    const traveler = order[0];
    const status = order[5];
    if (traveler === "0x0000000000000000000000000000000000000000") return false;
    if (Number(status) !== ORDER_STATUS_FUNDED) return false;

    const items = await publicClient.readContract({
      address: settlement,
      abi: SETTLEMENT_ABI,
      functionName: "getItems",
      args: [BigInt(orderId)],
    });

    return items.length === expectedItems;
  } catch (error) {
    console.warn(`[settlement] 链上订单校验失败（订单 ${orderId}）:`, error);
    return false;
  }
}

export async function settleOrder(params: SettleParams): Promise<void> {
  const { orderId, runId, quote } = params;
  const channel = getOrderChannel(orderId);
  const emit = (event: SettlementEvent) => {
    touch(orderId);
    channel.push(event);
  };

  if (!quote) {
    emit({
      type: "settlement.error",
      code: "QUOTE_MISSING",
      message: "找不到该订单对应的报价单",
    });
    return;
  }

  const record = orders.get(orderId);
  const request = runs.get(runId)?.request;
  const offers = offersByRun.get(runId);
  const now = Math.floor(Date.now() / 1000);
  const validTo = now + 90 * 24 * 3600;

  emit({ type: "settlement.start", orderId, total: quote.total });

  // 链上确实存在这笔托管订单才走真实 settle，否则退化为模拟（例如前端兜底模式生成的本地订单号）
  const settleOnChain = hasChain
    ? await orderIsOnChain(orderId, quote.lineItems.length)
    : false;

  if (hasChain && !settleOnChain) {
    console.warn(
      `[settlement] 订单 ${orderId} 不在链上或状态不是 Funded，本次分账退化为模拟，凭证仍会签发`
    );
  }

  const tokenIds: string[] = [];

  for (const [index, lineItem] of quote.lineItems.entries()) {
    const category = lineItem.category as CategoryCode;
    const step: SettlementStep = {
      key: `${orderId}-${index}`,
      provider: lineItem.provider,
      providerName: lineItem.providerName,
      category,
      label: lineItem.label,
      status: "settling",
    };
    emit({ type: "settlement.step", step });

    try {
      // ① 结算合约把钱打给服务商 Agent
      if (settleOnChain) {
        const { settlement } = contractAddresses();
        const hash = await orchestratorWallet().writeContract({
          address: settlement,
          abi: SETTLEMENT_ABI,
          functionName: "settle",
          args: [BigInt(orderId), [BigInt(index)]],
          chain: undefined,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        step.txHash = hash;
      } else {
        // 模拟模式：给一个看起来像 hash 的占位，UI 会标注为演示
        await sleep(900);
        step.txHash = simulateHash();
      }

      step.status = "paid";
      emit({ type: "settlement.step", step: { ...step } });

      // ② 服务商 Agent 收到款，立刻用自己的私钥发券
      const { title, details } = voucherContent(category, lineItem.label, offers, request);

      const issued = await issueVoucher({
        category,
        holder: params.traveler,
        orderId,
        title,
        details,
        validFrom: now,
        validTo,
      });

      step.voucherTxHash = issued.txHash;
      step.tokenId = issued.tokenId;
      step.voucherCode = issued.detail.code;
      step.status = "issued";
      tokenIds.push(issued.tokenId);
      emit({ type: "settlement.step", step: { ...step } });
    } catch (error) {
      console.error(`[settlement] 第 ${index} 项分账失败:`, error);
      step.status = "failed";
      step.error = error instanceof Error ? error.message : "分账失败";
      emit({ type: "settlement.step", step: { ...step } });
    }
  }

  if (record) record.status = tokenIds.length > 0 ? "settled" : "failed";
  emit({ type: "settlement.done", orderId, tokenIds });
}

/** 按品类拼出凭证标题与链下明细 */
function voucherContent(
  category: CategoryCode,
  fallbackLabel: string,
  offers: ReturnType<typeof offersByRun.get>,
  request?: { destination?: string; pax?: number; startDate?: string }
): { title: string; details: Record<string, string> } {
  const key = CATEGORY_TO_KEY[category];

  if (!offers) {
    return { title: fallbackLabel, details: { 说明: fallbackLabel } };
  }

  if (key === "flight") {
    const [outbound, inbound] = offers.flights;
    return {
      title: `${outbound?.flightNo ?? "航班"} ${outbound?.from.code ?? ""} → ${outbound?.to.code ?? ""}`,
      details: {
        航司: outbound?.carrier ?? "",
        机型: outbound?.aircraft ?? "",
        去程: outbound
          ? `${outbound.flightNo} ${outbound.from.airport}(${outbound.from.code}) ${outbound.from.terminal} → ${outbound.to.airport}(${outbound.to.code}) ${outbound.departAt} 起飞`
          : "",
        返程: inbound
          ? `${inbound.flightNo} ${inbound.from.airport}(${inbound.from.code}) → ${inbound.to.airport}(${inbound.to.code}) ${inbound.departAt} 起飞`
          : "",
        舱位: outbound?.cabin ?? "",
        乘客: `${request?.pax ?? 2} 人`,
        行李: "每人 1 件 23kg 托运 + 7kg 手提",
      },
    };
  }

  if (key === "hotel") {
    const hotel = offers.hotels[0];
    return {
      title: hotel?.name ?? fallbackLabel,
      details: {
        酒店: hotel?.name ?? "",
        星级: hotel ? `${hotel.stars} 星` : "",
        地址: hotel?.address ?? "",
        房型: hotel?.roomType ?? "",
        入住: hotel?.checkIn ?? "",
        退房: hotel?.checkOut ?? "",
        房间数: hotel ? `${hotel.rooms} 间 × ${hotel.nights} 晚` : "",
      },
    };
  }

  if (key === "attraction") {
    const items = offers.attractions.slice(0, 4);
    return {
      title: items.map((a) => a.name).join(" + ") || fallbackLabel,
      details: Object.fromEntries(
        items.map((a) => [
          a.name,
          `${a.area} · ${a.durationMinutes} 分钟 · ${a.openHours}${a.needBooking ? " · 需预约" : ""}`,
        ])
      ),
    };
  }

  const items = offers.restaurants.slice(0, 4);
  return {
    title: items.map((d) => d.name).join(" + ") || fallbackLabel,
    details: Object.fromEntries(
      items.map((d) => [d.name, `${d.area} · ${d.cuisine} · 约 ${d.durationMinutes} 分钟`])
    ),
  };
}

function simulateHash(): `0x${string}` {
  let out = "0x";
  const chars = "0123456789abcdef";
  for (let i = 0; i < 64; i++) out += chars[Math.floor(Math.random() * 16)];
  return out as `0x${string}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
