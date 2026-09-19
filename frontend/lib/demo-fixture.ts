import { addDays } from "./format";
import { toUnits } from "./format";
import type {
  Address,
  AttractionOffer,
  CategoryCode,
  DiningOffer,
  FlightOffer,
  HotelOffer,
  ItineraryDay,
  Quote,
  StreamEvent,
  TripRequest,
  VoucherDetail,
} from "./types";

/**
 * 离线兜底：预置的「上海 → 东京 5 天」演示行程。
 *
 * 现场网络差 / 后端未起 / LLM 超时时，前端直接播放这份流，
 * 保证「一句话 → 流式行程 → 报价单 → 支付 → 凭证」的完整故事能讲完。
 */

/** 演示用的服务商 Agent 地址（非真实链上地址，仅用于展示） */
export const DEMO_AGENTS = {
  flight: "0x1a4f0e8c6b3d5a7f9e2c4b6d8a0f1e3c5b7d9a2f" as const,
  hotel: "0x2b5e1f9d7c4e6b8a0f3d5c7e9b1a3f5d7c9e0b2a" as const,
  attraction: "0x3c6f2a0e8d5f7c9b1a4e6d8f0b2c4e6a8d0f1b3" as const,
  dining: "0x4d7a3b1f9e6a8c0d2b5f7e9a1c3d5f7b9e1a2c4e" as const,
};

export const DEMO_AGENT_NAMES: Record<string, string> = {
  [DEMO_AGENTS.flight]: "AvaFlights Agent",
  [DEMO_AGENTS.hotel]: "AvaStays Agent",
  [DEMO_AGENTS.attraction]: "AvaTickets Agent",
  [DEMO_AGENTS.dining]: "AvaTables Agent",
};

const flight: FlightOffer = {
  id: "flt-nh959",
  carrier: "ANA",
  flightNo: "NH959",
  aircraft: "Boeing 787-8",
  from: { city: "上海", airport: "浦东国际机场", terminal: "T2", code: "PVG" },
  to: { city: "东京", airport: "羽田机场", terminal: "T3", code: "HND" },
  departAt: "2026-10-01 09:25",
  arriveAt: "2026-10-01 13:40",
  durationMinutes: 195,
  cabin: "经济舱",
  seatsLeft: 7,
  pricePerPerson: 2380,
  currency: "USD",
  provider: DEMO_AGENTS.flight,
};

const flightBack: FlightOffer = {
  ...flight,
  id: "flt-nh960",
  flightNo: "NH960",
  from: { city: "东京", airport: "羽田机场", terminal: "T3", code: "HND" },
  to: { city: "上海", airport: "浦东国际机场", terminal: "T2", code: "PVG" },
  departAt: "2026-10-05 18:10",
  arriveAt: "2026-10-05 20:55",
  durationMinutes: 205,
  pricePerPerson: 2380,
};

const hotel: HotelOffer = {
  id: "htl-gracery",
  name: "新宿格拉斯丽酒店",
  stars: 4,
  area: "新宿",
  address: "东京都新宿区歌舞伎町1-19-1",
  checkIn: "2026-10-01 15:00",
  checkOut: "2026-10-05 11:00",
  roomType: "高级双床房 28㎡",
  rooms: 1,
  nights: 4,
  pricePerNight: 168,
  total: 672,
  provider: DEMO_AGENTS.hotel,
};

const attractions: AttractionOffer[] = [
  {
    id: "att-teamlab",
    name: "teamLab Planets TOKYO",
    area: "台场",
    durationMinutes: 120,
    openHours: "10:00-19:00",
    needBooking: true,
    pricePerPerson: 32,
    provider: DEMO_AGENTS.attraction,
  },
  {
    id: "att-sensoji",
    name: "浅草寺 & 仲见世通",
    area: "浅草",
    durationMinutes: 90,
    openHours: "06:00-17:00",
    needBooking: false,
    pricePerPerson: 0,
    provider: DEMO_AGENTS.attraction,
  },
  {
    id: "att-shibuya-sky",
    name: "SHIBUYA SKY 展望台",
    area: "涩谷",
    durationMinutes: 75,
    openHours: "10:00-22:30",
    needBooking: true,
    pricePerPerson: 25,
    provider: DEMO_AGENTS.attraction,
  },
];

const dinings: DiningOffer[] = [
  {
    id: "din-sushi-ue",
    name: "鮨 うえの（银座）",
    area: "银座",
    cuisine: "江户前寿司",
    durationMinutes: 90,
    pricePerPerson: 180,
    provider: DEMO_AGENTS.dining,
  },
  {
    id: "din-tempura",
    name: "天ぷら 天源（新宿）",
    area: "新宿",
    cuisine: "天妇罗",
    durationMinutes: 75,
    pricePerPerson: 95,
    provider: DEMO_AGENTS.dining,
  },
];

function day(
  index: number,
  date: string,
  theme: string,
  items: ItineraryDay["items"]
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
export function buildDemoDays(request: TripRequest): ItineraryDay[] {
  const start = request.startDate;
  const pax = request.pax;

  const all: ItineraryDay[] = [
    day(0, start, "抵达 · 新宿落脚", [
      {
        time: "09:25",
        title: `${flight.flightNo} ${flight.from.code} → ${flight.to.code}`,
        offerId: flight.id,
        category: 0,
        note: `${flight.carrier} · ${flight.aircraft} · ${flight.durationMinutes} 分钟`,
        price: flight.pricePerPerson * pax,
      },
      {
        time: "15:00",
        title: `入住 ${hotel.name}`,
        offerId: hotel.id,
        category: 1,
        area: hotel.area,
        note: `${hotel.roomType} · ${hotel.nights} 晚`,
        price: hotel.total,
      },
      {
        time: "19:30",
        title: dinings[1].name,
        offerId: dinings[1].id,
        category: 3,
        area: dinings[1].area,
        note: `${dinings[1].cuisine} · 步行 6 分钟`,
        price: dinings[1].pricePerPerson * pax,
      },
    ]),
    day(1, addDays(start, 1), "台场 · 数字艺术与海风", [
      {
        time: "10:30",
        title: attractions[0].name,
        offerId: attractions[0].id,
        category: 2,
        area: attractions[0].area,
        note: `需预约 · ${attractions[0].openHours}`,
        price: attractions[0].pricePerPerson * pax,
      },
      {
        time: "14:00",
        title: "台场海滨公园散步",
        note: "少走路方案：园内接驳车 + 室内展馆为主",
      },
      {
        time: "18:30",
        title: dinings[0].name,
        offerId: dinings[0].id,
        category: 3,
        area: dinings[0].area,
        note: `${dinings[0].cuisine} · 需提前订位`,
        price: dinings[0].pricePerPerson * pax,
      },
    ]),
    day(2, addDays(start, 2), "浅草 · 下町慢走", [
      {
        time: "09:30",
        title: attractions[1].name,
        offerId: attractions[1].id,
        category: 2,
        area: attractions[1].area,
        note: `免费参拜 · ${attractions[1].openHours}`,
        price: 0,
      },
      {
        time: "12:30",
        title: "合羽桥商店街觅食",
        note: "少走路方案：商店街集中在一条街上，边逛边吃",
        price: 40 * pax,
      },
      {
        time: "16:00",
        title: "隅田川游船",
        note: "坐船代替步行，从浅草直达滨离宫",
        price: 22 * pax,
      },
    ]),
    day(3, addDays(start, 3), "涩谷 · 黄昏与夜景", [
      {
        time: "11:00",
        title: "表参道 · 青山咖啡巡礼",
        note: "想逛就逛，累了随时钻进咖啡馆",
        price: 30 * pax,
      },
      {
        time: "16:30",
        title: attractions[2].name,
        offerId: attractions[2].id,
        category: 2,
        area: attractions[2].area,
        note: `日落时段入场 · ${attractions[2].openHours}`,
        price: attractions[2].pricePerPerson * pax,
      },
      {
        time: "19:30",
        title: "涩谷居酒屋一条街",
        category: 3,
        area: "涩谷",
        price: 70 * pax,
      },
    ]),
    day(4, addDays(start, 4), "返程 · 羽田直飞", [
      {
        time: "10:00",
        title: "新宿御苑晨间散步",
        note: "离酒店步行 12 分钟",
        price: 5 * pax,
      },
      {
        time: "11:00",
        title: "退房 · 寄存行李",
        category: 1,
        note: hotel.checkOut,
      },
      {
        time: "18:10",
        title: `${flightBack.flightNo} ${flightBack.from.code} → ${flightBack.to.code}`,
        offerId: flightBack.id,
        category: 0,
        note: "机场大巴直达，避免换乘搬行李",
        price: flightBack.pricePerPerson * pax,
      },
    ]),
  ];

  return all.slice(0, Math.max(1, Math.min(request.days, all.length)));
}

export const DEMO_OFFERS = {
  flights: [flight, flightBack],
  hotels: [hotel],
  attractions,
  dinings,
};

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
export function buildDemoQuote(request: TripRequest): Quote {
  const pax = request.pax;
  const flightTotal = (flight.pricePerPerson + flightBack.pricePerPerson) * pax;
  const attractionTotal =
    (attractions[0].pricePerPerson + attractions[2].pricePerPerson) * pax;
  const diningTotal =
    (dinings[0].pricePerPerson + dinings[1].pricePerPerson) * pax + 167 * pax;
  const hotelTotal = hotel.total;

  const lineItems = [
    {
      provider: DEMO_AGENTS.flight,
      providerName: DEMO_AGENT_NAMES[DEMO_AGENTS.flight],
      category: 0 as const,
      amount: toUnits(flightTotal).toString(),
      itemHash: hashLabel(`flight:${flight.flightNo}:${flightBack.flightNo}`),
      label: `${flight.flightNo} 上海浦东 → 东京羽田 / ${flightBack.flightNo} 返程 ×${pax} 人`,
    },
    {
      provider: DEMO_AGENTS.hotel,
      providerName: DEMO_AGENT_NAMES[DEMO_AGENTS.hotel],
      category: 1 as const,
      amount: toUnits(hotelTotal).toString(),
      itemHash: hashLabel(`hotel:${hotel.id}`),
      label: `${hotel.name} ${hotel.roomType} ×${hotel.nights} 晚`,
    },
    {
      provider: DEMO_AGENTS.attraction,
      providerName: DEMO_AGENT_NAMES[DEMO_AGENTS.attraction],
      category: 2 as const,
      amount: toUnits(attractionTotal).toString(),
      itemHash: hashLabel(`attraction:${attractions.map((a) => a.id).join(",")}`),
      label: `${attractions[0].name} + ${attractions[2].name} ×${pax} 人`,
    },
    {
      provider: DEMO_AGENTS.dining,
      providerName: DEMO_AGENT_NAMES[DEMO_AGENTS.dining],
      category: 3 as const,
      amount: toUnits(diningTotal).toString(),
      itemHash: hashLabel(`dining:${dinings.map((d) => d.id).join(",")}`),
      label: `${dinings[0].name} + ${dinings[1].name} 等 ×${pax} 人`,
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
 * 演示凭证：后端不可达（或尚未产生真实凭证）时，
 * 「我的凭证」页用它保证故事完整。
 */
export function buildDemoVouchers(holder: Address): VoucherDetail[] {
  const now = Math.floor(Date.now() / 1000);
  const validTo = now + 90 * 24 * 3600;

  const seeds: {
    category: CategoryCode;
    agent: Address;
    code: string;
    title: string;
    details: Record<string, string>;
  }[] = [
    {
      category: 0,
      agent: DEMO_AGENTS.flight,
      code: "PNR 7KQ2ZP",
      title: "NH959 上海浦东 → 东京羽田",
      details: {
        航司: "ANA 全日空",
        机型: "Boeing 787-8",
        去程: "NH959 PVG T2 → HND T3 · 2026-10-01 09:25 起飞",
        返程: "NH960 HND T3 → PVG T2 · 2026-10-05 18:10 起飞",
        舱位: "经济舱 · 2 人",
      },
    },
    {
      category: 1,
      agent: DEMO_AGENTS.hotel,
      code: "CONF HX-88213",
      title: "新宿格拉斯丽酒店",
      details: {
        星级: "4 星",
        地址: "东京都新宿区歌舞伎町1-19-1",
        房型: "高级双床房 28㎡",
        入住: "2026-10-01 15:00",
        退房: "2026-10-05 11:00",
      },
    },
    {
      category: 2,
      agent: DEMO_AGENTS.attraction,
      code: "TCK-9021",
      title: "teamLab Planets TOKYO",
      details: {
        场次: "2026-10-02 10:30 入场",
        开放: "10:00-19:00",
        时长: "约 120 分钟",
        人数: "2 人",
      },
    },
    {
      category: 3,
      agent: DEMO_AGENTS.dining,
      code: "RSV-4471",
      title: "鮨 うえの（银座）",
      details: {
        菜系: "江户前寿司",
        时间: "2026-10-02 18:30",
        人数: "2 人",
        备注: "吧台席，需提前 10 分钟到店",
      },
    },
  ];

  return seeds.map((seed, index) => ({
    tokenId: String(index + 1),
    orderId: "1",
    provider: seed.agent,
    providerName: DEMO_AGENT_NAMES[seed.agent],
    holder,
    category: seed.category,
    code: seed.code,
    title: seed.title,
    metadataHash: hashLabel(`demo-voucher-${index}`),
    validFrom: now,
    validTo,
    status: "Issued" as const,
    metadata: {
      name: seed.title,
      description: "AvaTrip 演示凭证（非真实可预订凭证）",
      image: "",
      attributes: [],
      details: seed.details,
    },
  }));
}

/**
 * 生成完整的演示事件序列。
 * 播放时由 `lib/sse-client.ts` 的打字机节奏逐条吐出，模拟真实 SSE 流的观感。
 */
export function buildDemoEvents(request: TripRequest): StreamEvent[] {
  const days = buildDemoDays(request);
  const quote = buildDemoQuote(request);

  const events: StreamEvent[] = [
    { type: "run.start", runId: "demo-run", request },
    {
      type: "agent.status",
      phase: "understanding",
      label: "正在理解你的需求…",
    },
    {
      type: "agent.delta",
      text: `收到：${request.origin} 出发去${request.destination}，${request.days} 天 ${request.pax} 人，预算 ${request.budget} 美元。偏好是「${request.preferences.join("、")}」，我会优先安排少走路、餐食质量高的方案。`,
    },
    {
      type: "agent.status",
      phase: "sourcing",
      label: "正在向 4 家服务商 Agent 询价…",
    },
    { type: "tool.call", name: "search_flights", args: { from: request.origin, to: request.destination, pax: request.pax } },
    { type: "tool.result", name: "search_flights", data: { count: DEMO_OFFERS.flights.length }, ms: 320 },
    { type: "offer.flight", items: DEMO_OFFERS.flights },
    { type: "tool.call", name: "search_hotels", args: { city: request.destination, rooms: request.rooms } },
    { type: "tool.result", name: "search_hotels", data: { count: DEMO_OFFERS.hotels.length }, ms: 240 },
    { type: "offer.hotel", items: DEMO_OFFERS.hotels },
    { type: "tool.call", name: "search_attractions", args: { city: request.destination, styles: request.preferences } },
    { type: "tool.result", name: "search_attractions", data: { count: attractions.length }, ms: 280 },
    { type: "offer.attraction", items: attractions },
    { type: "tool.call", name: "search_restaurants", args: { city: request.destination, styles: ["想吃好"] } },
    { type: "tool.result", name: "search_restaurants", data: { count: dinings.length }, ms: 190 },
    { type: "offer.dining", items: dinings },
    {
      type: "agent.status",
      phase: "planning",
      label: "正在编排逐日行程…",
    },
  ];

  for (const d of days) {
    events.push({ type: "day.start", index: d.index, date: d.date, theme: d.theme });
    events.push({
      type: "day.delta",
      index: d.index,
      text: d.items.map((item) => `${item.time} ${item.title}`).join("；"),
    });
    events.push({ type: "day.done", index: d.index, day: d });
  }

  events.push({ type: "agent.status", phase: "budgeting", label: "正在核算预算…" });
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
    label: `行程已就绪，共 ${days.length} 天，总价 ${quote.totalUsd} 美元`,
  });
  events.push({ type: "quote.ready", quote });
  events.push({ type: "run.done" });

  return events;
}
