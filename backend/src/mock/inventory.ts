import { AGENT_ADDRESSES } from "../agents/addresses";
import type {
  AttractionOffer,
  DiningOffer,
  FlightOffer,
  HotelOffer,
  TripRequest,
} from "../types";
import {
  CITIES,
  DEFAULT_ORIGIN,
  ORIGIN_AIRPORTS,
  addDays,
  addMinutes,
  type CityCatalog,
  type DiningSeed,
} from "./catalog";
import {
  TIER_FACTOR,
  type Tier,
  createRng,
  jitter,
  pick,
  resolveTier,
  toolDelay,
} from "./seeded-random";

/**
 * Mock 询价工具。
 *
 * 每个工具都带 80~400ms 的人为延迟，让 SSE 流式过程有「节奏感」——
 * 这是演示时最抓眼球的部分：能看到 Agent 在一家家查航班、查酒店。
 */

function cityOf(name: string): CityCatalog {
  return CITIES[name] ?? CITIES["东京"]!;
}

function originAirport(origin: string) {
  return ORIGIN_AIRPORTS[origin] ?? ORIGIN_AIRPORTS[DEFAULT_ORIGIN]!;
}

function tierOf(request: TripRequest): Tier {
  return resolveTier(request.budget, request.days, request.pax);
}

// ------------------------------------------------------------------ 航班

export async function searchFlights(
  request: TripRequest,
  tripId: string
): Promise<{ items: FlightOffer[]; ms: number }> {
  const ms = toolDelay(createRng(`${tripId}:flights`));
  await delay(ms);

  const rng = createRng(`${tripId}:flights:body`);
  const city = cityOf(request.destination);
  const from = originAirport(request.origin);
  const to = city.airports[0]!;
  const factor = TIER_FACTOR[tierOf(request)];

  // 单程基准价：东京(195min) 经济舱 ≈ $180（往返 ≈ ¥2600），按飞行时长线性缩放
  // 例：深圳→新加坡(335min) 经济舱单程 ≈ $310，往返 ≈ ¥4400，符合真实市场价
  const base = 180 * (city.flightMinutes / 195) * factor;
  const depart = `${String(8 + Math.floor(rng() * 10)).padStart(2, "0")}:${
    ["05", "15", "25", "40", "55"][Math.floor(rng() * 5)]!
  }`;
  const arrive = addMinutes(depart, city.flightMinutes);
  const returnDepart = `${String(16 + Math.floor(rng() * 4)).padStart(2, "0")}:${
    ["00", "10", "25", "40"][Math.floor(rng() * 4)]!
  }`;

  const outbound: FlightOffer = {
    id: "flt-outbound",
    carrier: "ANA",
    flightNo: "NH959",
    aircraft: "Boeing 787-8",
    from: { city: request.origin, airport: from.name, terminal: from.terminal, code: from.code },
    to: { city: city.name, airport: to.name, terminal: to.terminal, code: to.code },
    departAt: `${request.startDate} ${depart}`,
    arriveAt: `${request.startDate} ${arrive}`,
    durationMinutes: city.flightMinutes,
    cabin: factor >= 1.8 ? "商务舱" : "经济舱",
    seatsLeft: 2 + Math.floor(rng() * 9),
    pricePerPerson: Math.round(jitter(rng, base)),
    currency: "USD",
    provider: AGENT_ADDRESSES.flight,
  };

  const endDate = addDays(request.startDate, request.days - 1);
  const inbound: FlightOffer = {
    ...outbound,
    id: "flt-inbound",
    flightNo: "NH960",
    from: { city: city.name, airport: to.name, terminal: to.terminal, code: to.code },
    to: { city: request.origin, airport: from.name, terminal: from.terminal, code: from.code },
    departAt: `${endDate} ${returnDepart}`,
    arriveAt: `${endDate} ${addMinutes(returnDepart, city.flightMinutes + 10)}`,
    durationMinutes: city.flightMinutes + 10,
    pricePerPerson: Math.round(jitter(rng, base)),
    provider: AGENT_ADDRESSES.flight,
  };

  return { items: [outbound, inbound], ms };
}

// ------------------------------------------------------------------ 酒店

/**
 * 档位 → 目标星级。
 *
 * 预算档位影响「选哪些酒店」，而不是把同一家酒店的价格整体放大/缩小——
 * 真实市场里莱佛士的房价不会因为游客预算低就打三折。
 */
function tierStarRange(tier: Tier): [number, number] {
  if (tier === "luxury") return [5, 5];
  if (tier === "economy") return [3, 4];
  return [4, 5];
}

export async function searchHotels(
  request: TripRequest,
  tripId: string
): Promise<{ items: HotelOffer[]; ms: number }> {
  const ms = toolDelay(createRng(`${tripId}:hotels`));
  await delay(ms);

  const rng = createRng(`${tripId}:hotels:body`);
  const city = cityOf(request.destination);
  const nights = Math.max(1, request.days - 1);
  const [minStar, maxStar] = tierStarRange(tierOf(request));
  const endDate = addDays(request.startDate, request.days - 1);

  // 优先在档次匹配的子集里挑，候选不足时退回全量
  const matched = city.hotels.filter((h) => h.stars >= minStar && h.stars <= maxStar);
  const pool = matched.length >= 3 ? matched : city.hotels;

  const items = pick(rng, pool, 3).map<HotelOffer>((seed) => {
    const pricePerNight = Math.round(jitter(rng, seed.basePrice));
    return {
      id: seed.id,
      name: seed.name,
      stars: seed.stars,
      area: seed.area,
      address: seed.address,
      checkIn: `${request.startDate} 15:00`,
      checkOut: `${endDate} 11:00`,
      roomType: seed.roomType,
      rooms: request.rooms,
      nights,
      pricePerNight,
      total: pricePerNight * nights * request.rooms,
      provider: AGENT_ADDRESSES.hotel,
    };
  });

  return { items: items.sort((a, b) => a.total - b.total), ms };
}

// ------------------------------------------------------------------ 景点

export async function searchAttractions(
  request: TripRequest,
  tripId: string
): Promise<{ items: AttractionOffer[]; ms: number }> {
  const ms = toolDelay(createRng(`${tripId}:attractions`));
  await delay(ms);

  const rng = createRng(`${tripId}:attractions:body`);
  const city = cityOf(request.destination);

  const items = pick(rng, city.attractions, 6).map<AttractionOffer>((seed) => ({
    id: seed.id,
    name: seed.name,
    area: seed.area,
    durationMinutes: seed.durationMinutes,
    openHours: seed.openHours,
    needBooking: seed.needBooking,
    pricePerPerson: Math.round(jitter(rng, seed.basePrice, 0.05)),
    provider: AGENT_ADDRESSES.attraction,
  }));

  return { items, ms };
}

// ------------------------------------------------------------------ 餐厅

/** 档位 → 候选价位带（按人均价排序后取半） */
function tierDiningPool(tier: Tier, list: readonly DiningSeed[]): readonly DiningSeed[] {
  const sorted = [...list].sort((a, b) => a.basePrice - b.basePrice);
  const half = Math.max(3, Math.ceil(sorted.length / 2));
  if (tier === "economy") return sorted.slice(0, half);
  if (tier === "luxury") return sorted.slice(-half);
  return sorted;
}

export async function searchRestaurants(
  request: TripRequest,
  tripId: string
): Promise<{ items: DiningOffer[]; ms: number }> {
  const ms = toolDelay(createRng(`${tripId}:restaurants`));
  await delay(ms);

  const rng = createRng(`${tripId}:restaurants:body`);
  const city = cityOf(request.destination);
  const tier = tierOf(request);

  // 档位决定「去什么价位带吃饭」：经济档吃平价、奢华档吃精致 dining。
  // 人均价不再乘档位系数——海南鸡饭不会因为游客有钱就卖到 $21。
  const items = pick(rng, tierDiningPool(tier, city.restaurants), 5).map<DiningOffer>(
    (seed) => ({
      id: seed.id,
      name: seed.name,
      area: seed.area,
      cuisine: seed.cuisine,
      durationMinutes: seed.durationMinutes,
      pricePerPerson: Math.round(jitter(rng, seed.basePrice)),
      provider: AGENT_ADDRESSES.dining,
    })
  );

  return { items, ms };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 把候选压缩成给 LLM 看的编号清单（骨架阶段只需要编号，不需要完整明细） */
export function compressOffers(input: {
  flights: FlightOffer[];
  hotels: HotelOffer[];
  attractions: AttractionOffer[];
  restaurants: DiningOffer[];
}): string {
  const lines: string[] = [];

  lines.push("航班（F）:");
  input.flights.forEach((f, i) =>
    lines.push(
      `F${i + 1} ${f.flightNo} ${f.from.code}→${f.to.code} ${f.departAt} 抵达 ${f.arriveAt} · ${f.durationMinutes}分钟 · $${f.pricePerPerson}/人`
    )
  );

  lines.push("酒店（H）:");
  input.hotels.forEach((h, i) =>
    lines.push(
      `H${i + 1} ${h.name} ${h.stars}星 · ${h.area} · ${h.roomType} · ${h.nights}晚 · 共 $${h.total}`
    )
  );

  lines.push("景点（A）:");
  input.attractions.forEach((a, i) =>
    lines.push(
      `A${i + 1} ${a.name} · ${a.area} · ${a.durationMinutes}分钟 · ${a.openHours} · $${a.pricePerPerson}/人${a.needBooking ? " · 需预约" : ""}`
    )
  );

  lines.push("餐厅（D）:");
  input.restaurants.forEach((d, i) =>
    lines.push(
      `D${i + 1} ${d.name} · ${d.area} · ${d.cuisine} · $${d.pricePerPerson}/人`
    )
  );

  return lines.join("\n");
}
