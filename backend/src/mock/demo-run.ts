import { keccak256, toHex } from "viem";
import { providerAddress, providerName } from "../agents/addresses";
import type {
  AttractionOffer,
  BudgetItem,
  CategoryCode,
  DiningOffer,
  FlightOffer,
  HotelOffer,
  ItineraryDay,
  ItineraryItem,
  Quote,
  QuoteLineItem,
  TripRequest,
} from "../types";
import { addDays } from "./catalog";

/**
 * 确定性行程构建。
 *
 * 关键原则：**不让模型做算术和地理计算**。
 * 编号 → 候选 → 价格/时刻的映射全部由这里的代码完成，
 * 模型只负责「选哪些编号」和「写叙述」。
 */

export interface PlanOffers {
  flights: FlightOffer[];
  hotels: HotelOffer[];
  attractions: AttractionOffer[];
  restaurants: DiningOffer[];
}

/** 候选编号 → 具体候选（F1/H2/A3/D4） */
export function resolvePick(
  code: string,
  offers: PlanOffers
): { category: CategoryCode; item: ItineraryItem } | null {
  const match = /^([FHAD])(\d+)$/i.exec(code.trim());
  if (!match) return null;

  const kind = match[1]!.toUpperCase();
  const index = Number(match[2]) - 1;

  if (kind === "F") {
    const flight = offers.flights[index];
    if (!flight) return null;
    return {
      category: 0,
      item: {
        time: flight.departAt.slice(11, 16),
        title: `${flight.flightNo} ${flight.from.code} → ${flight.to.code}`,
        offerId: flight.id,
        category: 0,
        note: `${flight.carrier} · ${flight.aircraft} · ${flight.durationMinutes} 分钟 · ${flight.cabin}`,
      },
    };
  }

  if (kind === "H") {
    const hotel = offers.hotels[index];
    if (!hotel) return null;
    return {
      category: 1,
      item: {
        time: "15:00",
        title: `入住 ${hotel.name}`,
        offerId: hotel.id,
        category: 1,
        area: hotel.area,
        note: `${hotel.stars} 星 · ${hotel.roomType} · ${hotel.nights} 晚 · ${hotel.address}`,
      },
    };
  }

  if (kind === "A") {
    const attraction = offers.attractions[index];
    if (!attraction) return null;
    return {
      category: 2,
      item: {
        time: "",
        title: attraction.name,
        offerId: attraction.id,
        category: 2,
        area: attraction.area,
        note: `${attraction.durationMinutes} 分钟 · ${attraction.openHours}${attraction.needBooking ? " · 需预约" : ""}`,
      },
    };
  }

  const dining = offers.restaurants[index];
  if (!dining) return null;
  return {
    category: 3,
    item: {
      time: "",
      title: dining.name,
      offerId: dining.id,
      category: 3,
      area: dining.area,
      note: `${dining.cuisine} · 约 ${dining.durationMinutes} 分钟`,
    },
  };
}

/** 按类别给默认时段，避免时刻全挤在一起 */
function slotFor(category: CategoryCode, order: number): string {
  if (category === 0) return "";
  if (category === 1) return "15:00";
  if (category === 2) return order === 0 ? "10:00" : "14:30";
  return order <= 1 ? "12:30" : "18:30";
}

/** 把一天的编号列表变成带时刻的行程条目（价格稍后统一回填） */
export function buildDay(
  index: number,
  date: string,
  theme: string,
  picks: string[],
  offers: PlanOffers
): ItineraryDay {
  const items: ItineraryItem[] = [];
  let attractionOrder = 0;
  let diningOrder = 0;

  for (const code of picks) {
    const resolved = resolvePick(code, offers);
    if (!resolved) continue;

    const item = { ...resolved.item };
    if (resolved.category === 2) {
      item.time = slotFor(2, attractionOrder);
      attractionOrder += 1;
    } else if (resolved.category === 3) {
      item.time = slotFor(3, diningOrder);
      diningOrder += 1;
    } else if (!item.time) {
      item.time = slotFor(resolved.category, 0);
    }

    items.push(item);
  }

  items.sort((a, b) => a.time.localeCompare(b.time));

  return { index, date, theme, items, dayCost: 0 };
}

/** 价格回填：完全由代码计算，模型不参与算术 */
export function fillPrices(day: ItineraryDay, offers: PlanOffers, pax: number): ItineraryDay {
  let dayCost = 0;

  const items = day.items.map((item) => {
    let price: number | undefined;

    if (item.category === 0) {
      const flight = offers.flights.find((f) => f.id === item.offerId);
      price = flight ? flight.pricePerPerson * pax : undefined;
    } else if (item.category === 2) {
      const attraction = offers.attractions.find((a) => a.id === item.offerId);
      price = attraction ? attraction.pricePerPerson * pax : undefined;
    } else if (item.category === 3) {
      const dining = offers.restaurants.find((d) => d.id === item.offerId);
      price = dining ? dining.pricePerPerson * pax : undefined;
    } else if (item.category === 1) {
      // 酒店总价只在入住当天计一次
      const hotel = offers.hotels.find((h) => h.id === item.offerId);
      price = day.index === 0 && hotel ? hotel.total : 0;
    }

    dayCost += price ?? 0;
    return { ...item, price };
  });

  return { ...day, items, dayCost: Math.round(dayCost * 100) / 100 };
}

/**
 * 确定性骨架：LLM 不可用时用它兜底，保证演示一定能出完整行程。
 * 策略：首日去程+酒店，末日返程，中间每天一个景点 + 一餐。
 */
export function deterministicOutline(request: TripRequest, offers: PlanOffers) {
  const days = Math.max(1, request.days);
  const codes: string[][] = [];

  for (let i = 0; i < days; i++) {
    if (i === 0) {
      codes.push(["F1", "H1", offers.restaurants.length > 0 ? "D2" : "A1"]);
    } else if (i === days - 1) {
      codes.push(["F2", offers.attractions.length > 0 ? "A1" : "D1"]);
    } else {
      const attraction = `A${(i % Math.max(1, offers.attractions.length)) + 1}`;
      const dining = `D${(i % Math.max(1, offers.restaurants.length)) + 1}`;
      codes.push([attraction, dining]);
    }
  }

  const themes = [
    "抵达 · 落脚与周边",
    "城市核心 · 经典地标",
    "慢节奏 · 街区与美食",
    "自然与艺术 · 半日漫游",
    "购物与夜景 · 收尾",
    "近郊一日 · 换个节奏",
    "博物馆与咖啡 · 松弛日",
  ];

  return {
    days: codes.map((picks, index) => ({
      index,
      theme: themes[index % themes.length]!,
      picks,
      tips: "",
    })),
  };
}

export function dayDate(request: TripRequest, index: number): string {
  return addDays(request.startDate, index);
}

/**
 * 汇总报价单：按服务商 Agent 归集，每项对应一个 chain 上的 lineItem。
 *
 * 关键规则：**每个实际条目一条 lineItem**——
 * 往返两个航段是两张机票券、多家酒店各一张、每个景点/餐厅各一张，
 * 而不是把整个品类合并成一条（合并会导致每个品类只能发一张凭证）。
 */
export function buildQuote(params: {
  runId: string;
  tripId: string;
  request: TripRequest;
  offers: PlanOffers;
  days: ItineraryDay[];
}): { quote: Quote; budgetItems: BudgetItem[] } {
  const { runId, tripId, request, offers, days } = params;

  const usedAttractions = new Set<string>();
  const usedDining = new Set<string>();
  for (const day of days) {
    for (const item of day.items) {
      if (item.category === 2 && item.offerId) usedAttractions.add(item.offerId);
      if (item.category === 3 && item.offerId) usedDining.add(item.offerId);
    }
  }

  /** 一个条目 → 一条 lineItem */
  const lineItems: QuoteLineItem[] = [];

  const push = (
    category: CategoryCode,
    itemId: string,
    label: string,
    amountUsd: number
  ) => {
    if (amountUsd <= 0) return;
    lineItems.push({
      provider: providerAddress(category),
      providerName: providerName(category),
      category,
      amount: toUnits(round2(amountUsd)).toString(),
      itemHash: keccak256(toHex(`${tripId}:${category}:${itemId}`)),
      label,
      itemId,
    });
  };

  // 机票：每个航段一条（往返 = 两张机票凭证）
  for (const flight of offers.flights) {
    push(
      0,
      flight.id,
      `${flight.flightNo} ${flight.from.code} → ${flight.to.code} ×${request.pax} 人`,
      flight.pricePerPerson * request.pax
    );
  }

  // 酒店：每家酒店一条（多段住宿可发多张）
  for (const hotel of offers.hotels) {
    push(
      1,
      hotel.id,
      `${hotel.name} ${hotel.roomType} ×${hotel.nights} 晚`,
      hotel.total
    );
  }

  // 门票：行程里用到的每个景点一条
  for (const attraction of offers.attractions) {
    if (!usedAttractions.has(attraction.id)) continue;
    push(
      2,
      attraction.id,
      `${attraction.name} ×${request.pax} 人`,
      attraction.pricePerPerson * request.pax
    );
  }

  // 餐饮：行程里用到的每家餐厅一条
  for (const dining of offers.restaurants) {
    if (!usedDining.has(dining.id)) continue;
    push(
      3,
      dining.id,
      `${dining.name} ×${request.pax} 人`,
      dining.pricePerPerson * request.pax
    );
  }

  const totalUsd = round2(
    lineItems.reduce((sum, item) => sum + Number(item.amount) / 1_000_000, 0)
  );

  const itineraryHash = keccak256(
    toHex(JSON.stringify({ tripId, days: days.map((d) => d.items.map((i) => i.title)) }))
  );

  const budgetState: Quote["budgetState"] =
    totalUsd <= request.budget * 0.9
      ? "comfortable"
      : totalUsd <= request.budget
        ? "within"
        : "over";

  const budgetItems: BudgetItem[] = lineItems.map((item) => ({
    label: item.label,
    category: item.category,
    amount: Number(item.amount) / 1_000_000,
  }));

  return {
    quote: {
      runId,
      tripId,
      total: toUnits(totalUsd).toString(),
      itineraryHash,
      lineItems,
      totalUsd,
      budgetState,
    },
    budgetItems,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** USD → 最小单位（6 decimals），走字符串避免浮点误差 */
export function toUnits(value: number): bigint {
  const [intPart = "0", fracPart = ""] = value.toFixed(2).split(".");
  const frac = (fracPart + "000000").slice(0, 6);
  return BigInt(intPart) * BigInt(1_000_000) + BigInt(frac || "0");
}
