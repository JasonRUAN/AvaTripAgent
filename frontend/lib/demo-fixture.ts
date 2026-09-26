import { CONTRACTS, isDeployed } from "./contracts";
import { addDays, formatNumber, toUnits } from "./format";
import { getDict, interpolate } from "./i18n";
import type { Locale } from "./i18n/config";
import { demoText, displayCity, preferenceDisplay } from "./i18n/dictionaries/demo";
import type {
  Address,
  AttractionOffer,
  DiningOffer,
  FlightOffer,
  HotelOffer,
  ItineraryDay,
  ItineraryItem,
  Quote,
  StreamEvent,
  TripRequest,
} from "./types";

/**
 * 离线兜底：预置的「上海 → 东京 5 天」演示行程。
 *
 * 现场网络差 / 后端未起 / LLM 超时时，前端直接播放这份流，
 * 保证「一句话 → 流式行程 → 报价单 → 支付 → 凭证」的完整故事能讲完。
 *
 * 所有展示文案（机场 / 酒店 / 景点 / 餐厅 / 每日主题 / 阶段提示）按 locale 生成，
 * 而 id、三字码、价格、时间两套语言保持一致，避免切换语言后报价对不上。
 */

/**
 * 演示用的服务商 Agent 地址。
 *
 * ⚠️ 合约已部署（`isDeployed`）时必须用链上真实注册的 Agent 地址：
 *    TripSettlement.createOrder 会逐个校验 `registry.isActiveAgent(provider)`，
 *    用假地址会直接 revert InactiveProvider；假地址还可能是非法长度，
 *    连 viem 的地址校验都过不去。
 * 未部署时才退回下面这组纯展示用的假地址。
 */
const MOCK_AGENTS = {
  flight: "0x1a4f0e8c6b3d5a7f9e2c4b6d8a0f1e3c5b7d9a2f",
  hotel: "0x2b5e1f9d7c4e6b8a0f3d5c7e9b1a3f5d7c9e0b2a",
  // 注意保持 40 位十六进制，多一位少一位都会被 viem 判为非法地址
  attraction: "0x3c6f2a0e8d5f7c9b1a4e6d8f0b2c4e6a8d0f1b3c",
  dining: "0x4d7a3b1f9e6a8c0d2b5f7e9a1c3d5f7b9e1a2c4e",
} as const;

export const DEMO_AGENTS = {
  flight: (isDeployed ? CONTRACTS.agents.flight : MOCK_AGENTS.flight) as Address,
  hotel: (isDeployed ? CONTRACTS.agents.hotel : MOCK_AGENTS.hotel) as Address,
  attraction: (isDeployed
    ? CONTRACTS.agents.attraction
    : MOCK_AGENTS.attraction) as Address,
  dining: (isDeployed ? CONTRACTS.agents.dining : MOCK_AGENTS.dining) as Address,
};

export const DEMO_AGENT_NAMES: Record<string, string> = {
  [DEMO_AGENTS.flight]: "AvaFlights Agent",
  [DEMO_AGENTS.hotel]: "AvaStays Agent",
  [DEMO_AGENTS.attraction]: "AvaTickets Agent",
  [DEMO_AGENTS.dining]: "AvaTables Agent",
};

/** 结构化字段（id / 三字码 / 价格 / 时间）不随语言变，只有展示文案换 */
function demoFlights(locale: Locale): FlightOffer[] {
  const text = demoText(locale);
  const base = {
    carrier: "ANA",
    aircraft: "Boeing 787-8",
    durationMinutes: 195,
    cabin: text.flight.cabin,
    seatsLeft: 7,
    pricePerPerson: 2380,
    currency: "USD",
    provider: DEMO_AGENTS.flight,
  };
  return [
    {
      ...base,
      id: "flt-nh959",
      flightNo: "NH959",
      from: { city: "上海", airport: text.airport.PVG, terminal: "T2", code: "PVG" },
      to: { city: "东京", airport: text.airport.HND, terminal: "T3", code: "HND" },
      departAt: "2026-10-01 09:25",
      arriveAt: "2026-10-01 13:40",
    },
    {
      ...base,
      id: "flt-nh960",
      flightNo: "NH960",
      durationMinutes: 205,
      from: { city: "东京", airport: text.airport.HND, terminal: "T3", code: "HND" },
      to: { city: "上海", airport: text.airport.PVG, terminal: "T2", code: "PVG" },
      departAt: "2026-10-05 18:10",
      arriveAt: "2026-10-05 20:55",
    },
  ];
}

function demoHotel(locale: Locale): HotelOffer {
  const text = demoText(locale);
  return {
    id: "htl-gracery",
    name: text.hotel.name,
    stars: 4,
    area: text.hotel.area,
    address: text.hotel.address,
    checkIn: "2026-10-01 15:00",
    checkOut: "2026-10-05 11:00",
    roomType: text.hotel.roomType,
    rooms: 1,
    nights: 4,
    pricePerNight: 168,
    total: 672,
    provider: DEMO_AGENTS.hotel,
  };
}

function demoAttractions(locale: Locale): AttractionOffer[] {
  const text = demoText(locale);
  const provider = DEMO_AGENTS.attraction;
  return [
    {
      id: "att-teamlab",
      name: text.attraction["att-teamlab"]!.name,
      area: text.attraction["att-teamlab"]!.area,
      durationMinutes: 120,
      openHours: "10:00-19:00",
      needBooking: true,
      pricePerPerson: 32,
      provider,
    },
    {
      id: "att-sensoji",
      name: text.attraction["att-sensoji"]!.name,
      area: text.attraction["att-sensoji"]!.area,
      durationMinutes: 90,
      openHours: "06:00-17:00",
      needBooking: false,
      pricePerPerson: 0,
      provider,
    },
    {
      id: "att-shibuya-sky",
      name: text.attraction["att-shibuya-sky"]!.name,
      area: text.attraction["att-shibuya-sky"]!.area,
      durationMinutes: 75,
      openHours: "10:00-22:30",
      needBooking: true,
      pricePerPerson: 25,
      provider,
    },
  ];
}

function demoDinings(locale: Locale): DiningOffer[] {
  const text = demoText(locale);
  const provider = DEMO_AGENTS.dining;
  return [
    {
      id: "din-sushi-ue",
      name: text.dining["din-sushi-ue"]!.name,
      area: text.dining["din-sushi-ue"]!.area,
      cuisine: text.dining["din-sushi-ue"]!.cuisine,
      durationMinutes: 90,
      pricePerPerson: 180,
      provider,
    },
    {
      id: "din-tempura",
      name: text.dining["din-tempura"]!.name,
      area: text.dining["din-tempura"]!.area,
      cuisine: text.dining["din-tempura"]!.cuisine,
      durationMinutes: 75,
      pricePerPerson: 95,
      provider,
    },
  ];
}

export function getDemoOffers(locale: Locale) {
  return {
    flights: demoFlights(locale),
    hotels: [demoHotel(locale)],
    attractions: demoAttractions(locale),
    dinings: demoDinings(locale),
  };
}

/** 按 id 找回某个 offer，供逐日行程拼标题 / 备注 */
function offerIndex(locale: Locale) {
  const offers = getDemoOffers(locale);
  const map = new Map<string, { kind: string; offer: unknown }>();
  for (const flight of offers.flights) map.set(flight.id, { kind: "flight", offer: flight });
  for (const hotel of offers.hotels) map.set(hotel.id, { kind: "hotel", offer: hotel });
  for (const item of offers.attractions) map.set(item.id, { kind: "attraction", offer: item });
  for (const item of offers.dinings) map.set(item.id, { kind: "dining", offer: item });
  return map;
}

function day(
  index: number,
  date: string,
  theme: string,
  items: ItineraryItem[]
): ItineraryDay {
  return {
    index,
    date,
    theme,
    items,
    dayCost: items.reduce((sum, item) => sum + (item.price ?? 0), 0),
  };
}

/** 生成一份与给定需求匹配的演示行程（天数不足 5 天时自动截断） */
export function buildDemoDays(request: TripRequest, locale: Locale): ItineraryDay[] {
  const text = demoText(locale);
  const units = getDict(locale).units;
  const start = request.startDate;
  const pax = request.pax;
  const index = offerIndex(locale);

  const hotel = demoHotel(locale);

  /** 备注模板里能用到的变量 */
  const noteVars = (offer: unknown, kind: string): Record<string, string | number> => {
    if (kind === "flight") {
      const item = offer as FlightOffer;
      return {
        carrier: item.carrier,
        aircraft: item.aircraft,
        duration: interpolate(units.minutes, { n: item.durationMinutes }),
        checkOut: hotel.checkOut,
      };
    }
    if (kind === "hotel") {
      const item = offer as HotelOffer;
      return {
        hotelName: item.name,
        roomType: item.roomType,
        nights: interpolate(units.nights, { n: item.nights }),
        checkOut: item.checkOut,
      };
    }
    if (kind === "attraction") {
      const item = offer as AttractionOffer;
      return {
        openHours: item.openHours,
        booking: text.words.booking,
        free: text.words.free,
        sunset: text.words.sunset,
        checkOut: hotel.checkOut,
      };
    }
    if (kind === "dining") {
      const item = offer as DiningOffer;
      return {
        cuisine: item.cuisine,
        walk: text.words.walk,
        reserve: text.words.reserve,
        checkOut: hotel.checkOut,
      };
    }
    // 自定义条目只可能用到退房时间
    return { checkOut: hotel.checkOut };
  };

  /** 标题模板变量（目前只有酒店的 `{hotelName}`） */
  const titleVars = (): Record<string, string | number> => ({
    hotelName: hotel.name,
  });

  const buildItem = (
    spec: (typeof text.days)[number]["items"][number]
  ): ItineraryItem => {
    const found = spec.offerRef ? index.get(spec.offerRef) : undefined;
    const kind = found?.kind ?? spec.kind;

    let title = spec.title;
    if (!title && spec.titleTpl) {
      title = interpolate(spec.titleTpl, titleVars());
    }
    if (!title && found) {
      const offer = found.offer as { name?: string; flightNo?: string };
      if (kind === "flight") {
        const item = found.offer as FlightOffer;
        title = `${item.flightNo} ${item.from.code} → ${item.to.code}`;
      } else {
        title = offer.name ?? "";
      }
    }

    let note = spec.note;
    if (!note && spec.noteTpl) {
      note = interpolate(spec.noteTpl, noteVars(found?.offer ?? hotel, kind));
    }

    let price: number | undefined;
    if (found) {
      const offer = found.offer as {
        pricePerPerson?: number;
        total?: number;
      };
      if (kind === "hotel") price = offer.total;
      else price = (offer.pricePerPerson ?? 0) * pax;
    } else if (spec.pricePerPax !== undefined) {
      price = spec.pricePerPax * pax;
    }

    return {
      time: spec.time,
      title: title ?? "",
      offerId: spec.offerRef,
      category: spec.category,
      area: spec.area,
      note,
      price,
    };
  };

  const all: ItineraryDay[] = text.days.map((spec, dayIndex) =>
    day(
      dayIndex,
      dayIndex === 0 ? start : addDays(start, dayIndex),
      spec.theme,
      spec.items.map(buildItem)
    )
  );

  return all.slice(0, Math.max(1, Math.min(request.days, all.length)));
}

function hashLabel(input: string): `0x${string}` {
  // 演示环境不需要真 keccak，用一个稳定的伪 hash 即可（后端会用真 keccak）
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `0x${h.toString(16).padStart(8, "0").repeat(8)}` as `0x${string}`;
}

/** 组装演示报价单 */
export function buildDemoQuote(request: TripRequest, locale: Locale): Quote {
  const text = demoText(locale);
  const units = getDict(locale).units;
  const pax = request.pax;

  const flights = demoFlights(locale);
  const flight = flights[0]!;
  const flightBack = flights[1]!;
  const hotel = demoHotel(locale);
  const attractions = demoAttractions(locale);
  const dinings = demoDinings(locale);

  const flightTotal = (flight.pricePerPerson + flightBack.pricePerPerson) * pax;
  const attractionTotal =
    (attractions[0]!.pricePerPerson + attractions[2]!.pricePerPerson) * pax;
  const diningTotal =
    (dinings[0]!.pricePerPerson + dinings[1]!.pricePerPerson) * pax + 167 * pax;
  const hotelTotal = hotel.total;

  const paxSuffix = interpolate(units.paxSuffix, { n: pax });
  const nightsSuffix = interpolate(units.nightsSuffix, { n: hotel.nights });

  const lineItems = [
    // 机票：每个航段一条（往返 = 两张机票凭证）
    {
      provider: DEMO_AGENTS.flight,
      providerName: DEMO_AGENT_NAMES[DEMO_AGENTS.flight],
      category: 0 as const,
      amount: toUnits(flight.pricePerPerson * pax).toString(),
      itemHash: hashLabel(`flight:${flight.id}`),
      label: `${flight.flightNo} ${flight.from.code} → ${flight.to.code} ${paxSuffix}`,
      itemId: flight.id,
    },
    {
      provider: DEMO_AGENTS.flight,
      providerName: DEMO_AGENT_NAMES[DEMO_AGENTS.flight],
      category: 0 as const,
      amount: toUnits(flightBack.pricePerPerson * pax).toString(),
      itemHash: hashLabel(`flight:${flightBack.id}`),
      label: `${flightBack.flightNo} ${flightBack.from.code} → ${flightBack.to.code} ${paxSuffix}`,
      itemId: flightBack.id,
    },
    // 酒店：每家一条
    {
      provider: DEMO_AGENTS.hotel,
      providerName: DEMO_AGENT_NAMES[DEMO_AGENTS.hotel],
      category: 1 as const,
      amount: toUnits(hotelTotal).toString(),
      itemHash: hashLabel(`hotel:${hotel.id}`),
      label: `${hotel.name} ${hotel.roomType} ${nightsSuffix}`,
      itemId: hotel.id,
    },
    // 门票：每个景点一条
    {
      provider: DEMO_AGENTS.attraction,
      providerName: DEMO_AGENT_NAMES[DEMO_AGENTS.attraction],
      category: 2 as const,
      amount: toUnits(attractions[0]!.pricePerPerson * pax).toString(),
      itemHash: hashLabel(`attraction:${attractions[0]!.id}`),
      label: `${attractions[0]!.name} ${paxSuffix}`,
      itemId: attractions[0]!.id,
    },
    {
      provider: DEMO_AGENTS.attraction,
      providerName: DEMO_AGENT_NAMES[DEMO_AGENTS.attraction],
      category: 2 as const,
      amount: toUnits(attractions[2]!.pricePerPerson * pax).toString(),
      itemHash: hashLabel(`attraction:${attractions[2]!.id}`),
      label: `${attractions[2]!.name} ${paxSuffix}`,
      itemId: attractions[2]!.id,
    },
    // 餐饮：每家一条
    {
      provider: DEMO_AGENTS.dining,
      providerName: DEMO_AGENT_NAMES[DEMO_AGENTS.dining],
      category: 3 as const,
      amount: toUnits(dinings[0]!.pricePerPerson * pax).toString(),
      itemHash: hashLabel(`dining:${dinings[0]!.id}`),
      label: `${dinings[0]!.name} ${paxSuffix}`,
      itemId: dinings[0]!.id,
    },
    {
      provider: DEMO_AGENTS.dining,
      providerName: DEMO_AGENT_NAMES[DEMO_AGENTS.dining],
      category: 3 as const,
      amount: toUnits(dinings[1]!.pricePerPerson * pax).toString(),
      itemHash: hashLabel(`dining:${dinings[1]!.id}`),
      label: `${dinings[1]!.name} ${paxSuffix}`,
      itemId: dinings[1]!.id,
    },
    {
      provider: DEMO_AGENTS.dining,
      providerName: DEMO_AGENT_NAMES[DEMO_AGENTS.dining],
      category: 3 as const,
      amount: toUnits(167 * pax).toString(),
      itemHash: hashLabel(`dining:street:${pax}`),
      label: `${text.streetFood} ${paxSuffix}`,
    },
  ];

  const totalUsd = flightTotal + hotelTotal + attractionTotal + diningTotal;
  const budgetState: Quote["budgetState"] =
    totalUsd <= request.budget * 0.9
      ? "comfortable"
      : totalUsd <= request.budget
        ? "within"
        : "over";

  return {
    runId: "demo-run",
    tripId: "demo-trip",
    total: toUnits(totalUsd).toString(),
    itineraryHash: hashLabel(`itinerary:${request.destination}:${request.days}`),
    lineItems,
    totalUsd,
    budgetState,
  };
}

/**
 * 生成完整的演示事件序列。
 * 播放时由 `lib/sse-client.ts` 的打字机节奏逐条吐出，模拟真实 SSE 流的观感。
 */
export function buildDemoEvents(request: TripRequest, locale: Locale): StreamEvent[] {
  const text = demoText(locale);
  const days = buildDemoDays(request, locale);
  const quote = buildDemoQuote(request, locale);
  const offers = getDemoOffers(locale);

  const events: StreamEvent[] = [
    { type: "run.start", runId: "demo-run", request },
    {
      type: "agent.status",
      phase: "understanding",
      label: text.status.understanding,
    },
    {
      type: "agent.delta",
      text: interpolate(text.deltaIntro, {
        origin: displayCity(request.origin, locale),
        destination: displayCity(request.destination, locale),
        days: request.days,
        pax: request.pax,
        budget: request.budget,
        preferences: request.preferences
          .map((pref) => preferenceDisplay(pref, locale))
          .join(text.listSeparator),
      }),
    },
    {
      type: "agent.status",
      phase: "sourcing",
      label: text.status.sourcing,
    },
    {
      type: "tool.call",
      name: "search_flights",
      args: {
        from: displayCity(request.origin, locale),
        to: displayCity(request.destination, locale),
        pax: request.pax,
      },
    },
    { type: "tool.result", name: "search_flights", data: { count: offers.flights.length }, ms: 320 },
    { type: "offer.flight", items: offers.flights },
    {
      type: "tool.call",
      name: "search_hotels",
      args: { city: displayCity(request.destination, locale), rooms: request.rooms },
    },
    { type: "tool.result", name: "search_hotels", data: { count: offers.hotels.length }, ms: 240 },
    { type: "offer.hotel", items: offers.hotels },
    {
      type: "tool.call",
      name: "search_attractions",
      args: {
        city: displayCity(request.destination, locale),
        styles: request.preferences.map((pref) => preferenceDisplay(pref, locale)),
      },
    },
    { type: "tool.result", name: "search_attractions", data: { count: offers.attractions.length }, ms: 280 },
    { type: "offer.attraction", items: offers.attractions },
    {
      type: "tool.call",
      name: "search_restaurants",
      args: { city: displayCity(request.destination, locale), styles: [text.preferences[0] ?? ""] },
    },
    { type: "tool.result", name: "search_restaurants", data: { count: offers.dinings.length }, ms: 190 },
    { type: "offer.dining", items: offers.dinings },
    {
      type: "agent.status",
      phase: "planning",
      label: text.status.planning,
    },
  ];

  for (const d of days) {
    events.push({ type: "day.start", index: d.index, date: d.date, theme: d.theme });
    events.push({
      type: "day.delta",
      index: d.index,
      text: d.items.map((item) => `${item.time} ${item.title}`).join(text.daySeparator),
    });
    events.push({ type: "day.done", index: d.index, day: d });
  }

  events.push({ type: "agent.status", phase: "budgeting", label: text.status.budgeting });
  events.push({
    type: "budget.update",
    total: quote.totalUsd,
    items: quote.lineItems.map((item) => ({
      label: item.label,
      category: item.category,
      amount: Number(BigInt(item.amount) / BigInt(1_000_000)),
    })),
    budget: request.budget,
  });
  events.push({
    type: "agent.status",
    phase: "done",
    label: interpolate(text.status.done, {
      days: days.length,
      total: formatNumber(quote.totalUsd, locale),
    }),
  });
  events.push({ type: "quote.ready", quote });
  events.push({ type: "run.done" });

  return events;
}
