import { SETTLEMENT_ABI } from "../shared/abis";
import { contractAddresses, orchestratorWallet, publicClient } from "../shared/clients";
import { CATEGORY_TO_KEY, hasChain } from "../shared/env";
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
    if (order[0] === "0x0000000000000000000000000000000000000000") return false;
    if (Number(order[5]) !== ORDER_STATUS_FUNDED) return false;
    const items = await publicClient.readContract({
      address: settlement,
      abi: SETTLEMENT_ABI,
      functionName: "getItems",
      args: [BigInt(orderId)],
    });
    return items.length === expectedItems;
  } catch {
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
        await sleep(400);
        step.txHash = simulateHash();
      }
      step.status = "paid";
      emit({ type: "settlement.step", step: { ...step } });

      const { title, details } = voucherContent(category, lineItem, offers, request, quote.tripId);
      const profile = profiles.find(
        (item) => item.address.toLowerCase() === lineItem.provider.toLowerCase()
      );
      if (!profile) throw new Error(`找不到服务商 endpoint: ${lineItem.provider}`);

      const issued = await issueViaProvider({
        endpoint: profile.endpoint,
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
      console.error(`[settlement] 第 ${index} 项失败:`, error);
      step.status = "failed";
      step.error = error instanceof Error ? error.message : "分账失败";
      emit({ type: "settlement.step", step: { ...step } });
    }
  }

  if (record) record.status = tokenIds.length > 0 ? "settled" : "failed";
  emit({ type: "settlement.done", orderId, tokenIds });
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
