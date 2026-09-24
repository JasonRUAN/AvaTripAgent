import { KEY_TO_CATEGORY, type AgentKey } from "../shared/env";
import type {
  AttractionOffer,
  DiningOffer,
  FlightOffer,
  HotelOffer,
  TripRequest,
} from "../shared/types";
import { expandRfqTargets, type AgentProfile } from "./registry";

export async function rfqCategory(
  profile: AgentProfile,
  request: TripRequest,
  tripId: string,
  key: AgentKey
): Promise<{ items: unknown[]; ms: number }> {
  const started = Date.now();
  const response = await fetch(`${profile.endpoint.replace(/\/+$/, "")}/v1/rfq`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tripId,
      request,
      category: KEY_TO_CATEGORY[key],
    }),
  });
  if (!response.ok) {
    throw new Error(`${key} 询价失败 (${profile.name}): HTTP ${response.status}`);
  }
  const payload = (await response.json()) as { items?: unknown[]; ms?: number };
  return { items: payload.items ?? [], ms: payload.ms ?? Date.now() - started };
}

function bucketOf(key: AgentKey) {
  if (key === "flight") return "flights" as const;
  if (key === "hotel") return "hotels" as const;
  if (key === "attraction") return "attractions" as const;
  return "restaurants" as const;
}

export async function rfqAll(
  selected: Record<AgentKey, AgentProfile>,
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
    if (bucket === "flights") flights.push(...(result.items as FlightOffer[]));
    else if (bucket === "hotels") hotels.push(...(result.items as HotelOffer[]));
    else if (bucket === "attractions") attractions.push(...(result.items as AttractionOffer[]));
    else restaurants.push(...(result.items as DiningOffer[]));
  }

  return { flights, hotels, attractions, restaurants, timings, queried };
}
