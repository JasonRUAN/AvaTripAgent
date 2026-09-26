import { SETTLEMENT_ABI } from "../shared/abis";
import {
  contractAddresses,
  enqueueWalletSend,
  orchestratorWallet,
  publicClient,
} from "../shared/clients";
import { CATEGORY_TO_KEY, hasChain } from "../shared/env";
import { createLogger, startTimer } from "../shared/logger";
import { getOrderChannel, touch } from "../shared/sse";
import { offersByRun, orders, runs } from "../shared/store";
import type { CategoryCode, Quote, SettlementEvent, SettlementStep } from "../shared/types";
import { listAgentProfiles } from "./registry";
import { issueViaProvider } from "./voucher";

export interface SettleParams {
  orderId: string;
  runId: string;
  quote?: Quote;
  traveler: `0x${string}`;
}

const log = createLogger("settlement");
const ORDER_STATUS_FUNDED = 1;

async function orderIsOnChain(orderId: string, expectedItems: number): Promise<boolean> {
  try {
    const { settlement } = contractAddresses();
    const order = await publicClient.readContract({
      address: settlement,
      abi: SETTLEMENT_ABI,
      functionName: "getOrder",
      args: [BigInt(orderId)],
    });
    if (order[0] === "0x0000000000000000000000000000000000000000") {
      log.debug("订单不在链上", { orderId });
      return false;
    }
    if (Number(order[5]) !== ORDER_STATUS_FUNDED) {
      log.debug("订单状态不是 FUNDED，跳过真实分账", { orderId, status: Number(order[5]) });
      return false;
    }
    const items = await publicClient.readContract({
      address: settlement,
      abi: SETTLEMENT_ABI,
      functionName: "getItems",
      args: [BigInt(orderId)],
    });
    const matched = items.length === expectedItems;
    if (!matched) {
      log.warn("链上条目数与报价单不一致", { orderId, onChain: items.length, expected: expectedItems });
    }
    return matched;
  } catch (error) {
    log.warn("读取链上订单失败，按未上链处理", { orderId }, error);
    return false;
  }
}

export async function settleOrder(params: SettleParams): Promise<void> {
  const { orderId, runId, quote } = params;
  const elapsed = startTimer();
  const settleLog = log.child({ orderId, runId });
  const channel = getOrderChannel(orderId);
  const emit = (event: SettlementEvent) => {
    touch(orderId);
    channel.push(event);
  };

  if (!quote) {
    settleLog.error("分账中止：找不到报价单");
    emit({ type: "settlement.error", code: "QUOTE_MISSING", message: "找不到该订单对应的报价单" });
    return;
  }

  const record = orders.get(orderId);
  const request = runs.get(runId)?.request;
  const offers = offersByRun.get(runId);
  const now = Math.floor(Date.now() / 1000);
  const validTo = now + 90 * 24 * 3600;
  const profiles = await listAgentProfiles();

  emit({ type: "settlement.start", orderId, total: quote.total });

  const settleOnChain = hasChain ? await orderIsOnChain(orderId, quote.lineItems.length) : false;
  settleLog.info("开始分账", {
    total: quote.total,
    lineItems: quote.lineItems.length,
    traveler: params.traveler,
    mode: settleOnChain ? "onchain" : "simulated",
    hasChain,
  });
  if (!settleOnChain) {
    settleLog.warn("未走真实链上分账，交易哈希为模拟值", {
      hasChain,
      reason: hasChain ? "链上订单校验未通过" : "链上能力未启用",
    });
  }

  const issued = await Promise.all(
    quote.lineItems.map(async (lineItem, index) => {
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
      const stepLog = settleLog.child({ index, provider: lineItem.provider, category: lineItem.category });

      try {
        if (settleOnChain) {
          const wallet = orchestratorWallet();
          const { settlement } = contractAddresses();
          const txElapsed = startTimer();
          const hash = await enqueueWalletSend(wallet.account.address, () =>
            wallet.writeContract({
              address: settlement,
              abi: SETTLEMENT_ABI,
              functionName: "settle",
              args: [BigInt(orderId), [BigInt(index)]],
              chain: undefined,
            })
          );
          const receipt = await publicClient.waitForTransactionReceipt({ hash });
          if (receipt.status === "reverted") {
            // 逻辑上这里应该中断；先留痕，避免「reverted 却继续发券」无从察觉
            stepLog.error("分账交易已回滚", { txHash: hash, blockNumber: receipt.blockNumber });
          } else {
            stepLog.info("分账交易已确认", {
              txHash: hash,
              ms: txElapsed(),
              gasUsed: receipt.gasUsed?.toString(),
              blockNumber: receipt.blockNumber?.toString(),
            });
          }
          step.txHash = hash;
        } else {
          await sleep(400);
          step.txHash = simulateHash();
          stepLog.debug("已生成模拟分账哈希", { txHash: step.txHash });
        }
        step.status = "paid";
        emit({ type: "settlement.step", step: { ...step } });

        const { title, details } = voucherContent(category, lineItem, offers, request, quote.tripId);
        const profile = profiles.find(
          (item) => item.address.toLowerCase() === lineItem.provider.toLowerCase()
        );
        if (!profile) throw new Error(`找不到服务商 endpoint: ${lineItem.provider}`);

        const voucher = await issueViaProvider({
          endpoint: profile.endpoint,
          category,
          holder: params.traveler,
          orderId,
          title,
          details,
          validFrom: now,
          validTo,
        });
        step.voucherTxHash = voucher.txHash;
        step.tokenId = voucher.tokenId;
        step.voucherCode = voucher.detail.code;
        step.status = "issued";
        emit({ type: "settlement.step", step: { ...step } });
        stepLog.info("凭证签发完成", { tokenId: voucher.tokenId, voucherTxHash: voucher.txHash });
        return voucher.tokenId;
      } catch (error) {
        stepLog.error("分账条目失败", { label: lineItem.label }, error);
        step.status = "failed";
        step.error = error instanceof Error ? error.message : "分账失败";
        emit({ type: "settlement.step", step: { ...step } });
        return undefined;
      }
    })
  );
  const tokenIds = issued.filter((id): id is string => Boolean(id));
  const failed = issued.length - tokenIds.length;

  if (record) record.status = tokenIds.length > 0 ? "settled" : "failed";
  emit({ type: "settlement.done", orderId, tokenIds });

  if (failed > 0) {
    settleLog.error("分账完成但有条目失败", {
      ms: elapsed(),
      issued: tokenIds.length,
      failed,
      status: record?.status ?? "unknown",
    });
  } else {
    settleLog.info("分账完成", { ms: elapsed(), issued: tokenIds.length, status: record?.status ?? "unknown" });
  }
}

function voucherContent(
  category: CategoryCode,
  lineItem: { label: string; itemId?: string },
  offers: ReturnType<typeof offersByRun.get>,
  request?: { destination?: string; pax?: number; startDate?: string },
  tripId?: string
): { title: string; details: Record<string, string> } {
  const key = CATEGORY_TO_KEY[category];
  if (!offers) {
    return { title: lineItem.label, details: { ...(tripId ? { 行程: tripId } : {}), 说明: lineItem.label } };
  }
  if (key === "flight") {
    const flight =
      (lineItem.itemId && offers.flights.find((f) => f.id === lineItem.itemId)) ||
      offers.flights.find((f) => lineItem.label.includes(f.flightNo)) ||
      offers.flights[0];
    if (!flight) return { title: lineItem.label, details: { ...(tripId ? { 行程: tripId } : {}), 说明: lineItem.label } };
    return {
      title: `${flight.flightNo} ${flight.from.code} → ${flight.to.code}`,
      details: {
        ...(tripId ? { 行程: tripId } : {}),
        航司: flight.carrier,
        机型: flight.aircraft,
        航班: `${flight.flightNo} ${flight.from.airport}(${flight.from.code}) → ${flight.to.airport}(${flight.to.code})`,
        起飞: `${flight.departAt} 起飞`,
        到达: `${flight.arriveAt} 到达`,
        舱位: flight.cabin,
        乘客: `${request?.pax ?? 2} 人`,
      },
    };
  }
  if (key === "hotel") {
    const hotel =
      (lineItem.itemId && offers.hotels.find((h) => h.id === lineItem.itemId)) ||
      offers.hotels.find((h) => lineItem.label.includes(h.name)) ||
      offers.hotels[0];
    if (!hotel) return { title: lineItem.label, details: { ...(tripId ? { 行程: tripId } : {}), 说明: lineItem.label } };
    return {
      title: hotel.name,
      details: {
        ...(tripId ? { 行程: tripId } : {}),
        酒店: hotel.name,
        星级: `${hotel.stars} 星`,
        地址: hotel.address,
        房型: hotel.roomType,
        入住: hotel.checkIn,
        退房: hotel.checkOut,
      },
    };
  }
  if (key === "attraction") {
    const attraction =
      (lineItem.itemId && offers.attractions.find((a) => a.id === lineItem.itemId)) ||
      offers.attractions.find((a) => lineItem.label.includes(a.name)) ||
      offers.attractions[0];
    if (!attraction) return { title: lineItem.label, details: { ...(tripId ? { 行程: tripId } : {}), 说明: lineItem.label } };
    return {
      title: attraction.name,
      details: {
        ...(tripId ? { 行程: tripId } : {}),
        景点: attraction.name,
        区域: attraction.area,
        开放时间: attraction.openHours,
      },
    };
  }
  const dining =
    (lineItem.itemId && offers.restaurants.find((d) => d.id === lineItem.itemId)) ||
    offers.restaurants.find((d) => lineItem.label.includes(d.name)) ||
    offers.restaurants[0];
  if (!dining) return { title: lineItem.label, details: { ...(tripId ? { 行程: tripId } : {}), 说明: lineItem.label } };
  return {
    title: dining.name,
    details: {
      ...(tripId ? { 行程: tripId } : {}),
      餐厅: dining.name,
      区域: dining.area,
      菜系: dining.cuisine,
    },
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
