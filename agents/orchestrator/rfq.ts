import { KEY_TO_CATEGORY, type AgentKey } from "../shared/env";
import { createLogger, startTimer } from "../shared/logger";
import type {
  Address,
  AttractionOffer,
  DiningOffer,
  FlightOffer,
  HotelOffer,
  TripRequest,
} from "../shared/types";
import { expandRfqTargets, type AgentProfile } from "./registry";

const log = createLogger("rfq");

function namespaceOfferId(address: Address, id: string): string {
  const prefix = `${address.slice(2, 8).toLowerCase()}:`;
  return id.toLowerCase().startsWith(prefix) ? id : `${prefix}${id}`;
}

function stampItems<T extends { id: string; provider?: Address }>(items: T[], profile: AgentProfile): T[] {
  return items.map((item) => ({
    ...item,
    id: namespaceOfferId(profile.address, item.id),
    provider: item.provider ?? profile.address,
  }));
}

export async function rfqCategory(
  profile: AgentProfile,
  request: TripRequest,
  tripId: string,
  key: AgentKey
): Promise<{ items: unknown[]; ms: number }> {
  const elapsed = startTimer();
  const agentLog = log.child({ agent: profile.name, category: key, endpoint: profile.endpoint });
  const url = `${profile.endpoint.replace(/\/+$/, "")}/v1/rfq`;

  agentLog.debug("询价请求发出", { tripId, url });
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tripId,
        request,
        category: KEY_TO_CATEGORY[key],
      }),
    });
  } catch (error) {
    // 最常见的原因：某个子 Agent 进程没起来 / 端口写错
    agentLog.error("询价请求无法送达（子 Agent 未启动或地址不可达）", { ms: elapsed() }, error);
    throw error;
  }

  if (!response.ok) {
    agentLog.error("询价失败", { status: response.status, ms: elapsed() });
    throw new Error(`${key} 询价失败 (${profile.name}): HTTP ${response.status}`);
  }
  const payload = (await response.json()) as { items?: unknown[]; ms?: number };
  const items = payload.items ?? [];
  agentLog.info("询价完成", { items: items.length, ms: payload.ms ?? elapsed() });
  return { items, ms: payload.ms ?? elapsed() };
}

function bucketOf(key: AgentKey) {
  if (key === "flight") return "flights" as const;
  if (key === "hotel") return "hotels" as const;
  if (key === "attraction") return "attractions" as const;
  return "restaurants" as const;
}

export async function rfqAll(
  selected: Record<AgentKey, AgentProfile[]>,
  request: TripRequest,
  tripId: string
): Promise<{
  flights: FlightOffer[];
  hotels: HotelOffer[];
  attractions: AttractionOffer[];
  restaurants: DiningOffer[];
  timings: Record<AgentKey, number>;
  queried: Record<AgentKey, string[]>;
}> {
  const jobs = expandRfqTargets(selected);
  const flights: FlightOffer[] = [];
  const hotels: HotelOffer[] = [];
  const attractions: AttractionOffer[] = [];
  const restaurants: DiningOffer[] = [];
  const timings: Record<AgentKey, number> = { flight: 0, hotel: 0, attraction: 0, dining: 0 };
  const queried: Record<AgentKey, string[]> = { flight: [], hotel: [], attraction: [], dining: [] };

  const elapsed = startTimer();
  log.info("并发询价开始", {
    jobs: jobs.length,
    targets: jobs.map((job) => `${job.key}:${job.profile.name}`),
  });

  const results = await Promise.all(
    jobs.map(async (job) => {
      const result = await rfqCategory(job.profile, request, tripId, job.key);
      return { ...job, result };
    })
  );

  for (const { key, profile, result } of results) {
    timings[key] = Math.max(timings[key], result.ms);
    queried[key].push(profile.name);
    const bucket = bucketOf(key);
    if (bucket === "flights") flights.push(...stampItems(result.items as FlightOffer[], profile));
    else if (bucket === "hotels") hotels.push(...stampItems(result.items as HotelOffer[], profile));
    else if (bucket === "attractions") attractions.push(...stampItems(result.items as AttractionOffer[], profile));
    else restaurants.push(...stampItems(result.items as DiningOffer[], profile));
  }

  const counts = {
    flight: flights.length,
    hotel: hotels.length,
    attraction: attractions.length,
    dining: restaurants.length,
  };
  log.info("询价汇总完成", { ms: elapsed(), counts, timings, queried });
  for (const [key, count] of Object.entries(counts)) {
    // 0 条意味着该类目后面必然降级/占位，早一步定位比等行程空了再查快得多
    if (count === 0) log.warn("该类目没有拿到任何报价", { category: key, agents: queried[key as AgentKey] });
  }

  return { flights, hotels, attractions, restaurants, timings, queried };
}
