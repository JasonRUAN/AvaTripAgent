/**
 * 询价后的 offer 推荐。规则需与 `agents/shared/recommend.ts` 保持一致。
 */

import type {
  Address,
  AgentProfile,
  AttractionOffer,
  DiningOffer,
  FlightOffer,
  HotelOffer,
  RecommendMode,
  TripRequest,
} from "./types";

export interface ProviderScore {
  ratingAvg: number;
  ratingCount: number;
  ratingAvgX100: number;
  name?: string;
}

export type ProviderScoreMap = Record<string, ProviderScore>;

export interface OfferBundle {
  flights: FlightOffer[];
  hotels: HotelOffer[];
  attractions: AttractionOffer[];
  restaurants: DiningOffer[];
}

const PRIOR = 4;
const PRIOR_WEIGHT = 8;

export function bayesScore(avg: number, count: number): number {
  return (avg * count + PRIOR * PRIOR_WEIGHT) / (count + PRIOR_WEIGHT);
}

export function scoresFromAgents(
  agents: Pick<AgentProfile, "address" | "ratingAvg" | "ratingCount" | "ratingAvgX100" | "name">[]
): ProviderScoreMap {
  const map: ProviderScoreMap = {};
  for (const agent of agents) {
    map[agent.address.toLowerCase()] = {
      ratingAvg: agent.ratingAvg,
      ratingCount: agent.ratingCount,
      ratingAvgX100: agent.ratingAvgX100,
      name: agent.name,
    };
  }
  return map;
}

export function scoreOf(address: Address | string, scores: ProviderScoreMap): ProviderScore {
  return (
    scores[address.toLowerCase()] ?? {
      ratingAvg: 0,
      ratingCount: 0,
      ratingAvgX100: 0,
    }
  );
}

export function compareAgentsByMode<T extends { ratingAvg: number; ratingCount: number; ratingAvgX100: number }>(
  a: T,
  b: T,
  mode: "rating" | "balanced"
): number {
  if (mode === "rating") {
    return b.ratingAvgX100 - a.ratingAvgX100 || b.ratingCount - a.ratingCount;
  }
  const bayes = bayesScore(b.ratingAvg, b.ratingCount) - bayesScore(a.ratingAvg, a.ratingCount);
  return bayes || b.ratingCount - a.ratingCount;
}

export function isOutboundFlight(
  flight: FlightOffer,
  request?: Pick<TripRequest, "origin" | "destination">
): boolean {
  if (request) {
    if (flight.from.city === request.destination) return false;
    if (flight.from.city === request.origin || flight.to.city === request.destination) return true;
  }
  return /outbound/i.test(flight.id);
}

type OfferKind = "flight" | "hotel" | "attraction" | "dining";

function offerPrice(offer: FlightOffer | HotelOffer | AttractionOffer | DiningOffer, kind: OfferKind): number {
  if (kind === "hotel") return (offer as HotelOffer).total;
  if (kind === "flight") return (offer as FlightOffer).pricePerPerson;
  return (offer as AttractionOffer | DiningOffer).pricePerPerson;
}

function tripCostOf(
  offer: FlightOffer | HotelOffer | AttractionOffer | DiningOffer,
  kind: OfferKind,
  pax: number
): number {
  if (kind === "hotel") return (offer as HotelOffer).total;
  if (kind === "flight") return (offer as FlightOffer).pricePerPerson * pax;
  return (offer as AttractionOffer | DiningOffer).pricePerPerson * pax;
}

function valueScore(rating: number, price: number): number {
  return rating / Math.log(Math.max(price, 0) + Math.E);
}

function categoryShare(kind: OfferKind): number {
  if (kind === "flight") return 0.18;
  if (kind === "hotel") return 0.35;
  if (kind === "attraction") return 0.06;
  return 0.06;
}

function balancedOfferScore(
  offer: FlightOffer | HotelOffer | AttractionOffer | DiningOffer,
  kind: OfferKind,
  scores: ProviderScoreMap,
  request: TripRequest,
  priceMin: number,
  priceMax: number
): number {
  const provider = scoreOf(offer.provider, scores);
  const ratingNorm = bayesScore(provider.ratingAvg, provider.ratingCount) / 5;
  const confidence = Math.min(1, Math.log(1 + provider.ratingCount) / Math.log(21));
  const price = offerPrice(offer, kind);
  const span = priceMax - priceMin;
  const priceNorm = span <= 0 ? 1 : 1 - (price - priceMin) / span;
  const budgetFit = Math.max(0, Math.min(1, 1 - price / Math.max(request.budget * categoryShare(kind), 1)));
  return 0.35 * ratingNorm + 0.15 * confidence + 0.3 * priceNorm + 0.2 * budgetFit;
}

function sortList<T extends FlightOffer | HotelOffer | AttractionOffer | DiningOffer>(
  items: T[],
  mode: RecommendMode,
  kind: OfferKind,
  scores: ProviderScoreMap,
  request: TripRequest,
  priceOfItem: (item: T) => number
): T[] {
  if (items.length <= 1) return [...items];
  const prices = items.map(priceOfItem);
  const priceMin = Math.min(...prices);
  const priceMax = Math.max(...prices);

  return [...items].sort((a, b) => {
    const sa = scoreOf(a.provider, scores);
    const sb = scoreOf(b.provider, scores);
    if (mode === "rating") {
      return sb.ratingAvgX100 - sa.ratingAvgX100 || sb.ratingCount - sa.ratingCount;
    }
    if (mode === "price" || mode === "budget") {
      return priceOfItem(a) - priceOfItem(b);
    }
    if (mode === "value") {
      return valueScore(sb.ratingAvg || bayesScore(sb.ratingAvg, sb.ratingCount), priceOfItem(b)) -
        valueScore(sa.ratingAvg || bayesScore(sa.ratingAvg, sa.ratingCount), priceOfItem(a));
    }
    return (
      balancedOfferScore(b, kind, scores, request, priceMin, priceMax) -
      balancedOfferScore(a, kind, scores, request, priceMin, priceMax)
    );
  });
}

export function sortFlights(
  flights: FlightOffer[],
  mode: RecommendMode,
  request: TripRequest,
  scores: ProviderScoreMap
): FlightOffer[] {
  const outbound = sortList(
    flights.filter((item) => isOutboundFlight(item, request)),
    mode,
    "flight",
    scores,
    request,
    (item) => item.pricePerPerson
  );
  const inbound = sortList(
    flights.filter((item) => !isOutboundFlight(item, request)),
    mode,
    "flight",
    scores,
    request,
    (item) => item.pricePerPerson
  );
  return [...outbound, ...inbound];
}

export function rankOffers(
  offers: OfferBundle,
  mode: RecommendMode,
  request: TripRequest,
  scores: ProviderScoreMap
): OfferBundle {
  const ranked: OfferBundle = {
    flights: sortFlights(offers.flights, mode, request, scores),
    hotels: sortList(offers.hotels, mode, "hotel", scores, request, (item) => item.total),
    attractions: sortList(offers.attractions, mode, "attraction", scores, request, (item) => item.pricePerPerson),
    restaurants: sortList(offers.restaurants, mode, "dining", scores, request, (item) => item.pricePerPerson),
  };
  if (mode !== "budget") return ranked;

  const ids = new Set(pickRecommendedIds(ranked, "budget", request, scores));
  const pin = <T extends { id: string }>(items: T[]) => [
    ...items.filter((item) => ids.has(item.id)),
    ...items.filter((item) => !ids.has(item.id)),
  ];
  return {
    flights: pin(ranked.flights),
    hotels: pin(ranked.hotels),
    attractions: pin(ranked.attractions),
    restaurants: pin(ranked.restaurants),
  };
}

function skeletonIds(offers: OfferBundle, request: TripRequest): string[] {
  const ids: string[] = [];
  const outbound = offers.flights.find((item) => isOutboundFlight(item, request));
  const inbound = offers.flights.find((item) => !isOutboundFlight(item, request));
  if (outbound) ids.push(outbound.id);
  if (inbound) ids.push(inbound.id);
  if (offers.hotels[0]) ids.push(offers.hotels[0].id);
  const attractionCount = Math.min(offers.attractions.length, Math.max(1, request.days - 1));
  const diningCount = Math.min(offers.restaurants.length, Math.max(1, request.days));
  ids.push(...offers.attractions.slice(0, attractionCount).map((item) => item.id));
  ids.push(...offers.restaurants.slice(0, diningCount).map((item) => item.id));
  return ids;
}

function costOfIds(ids: Iterable<string>, offers: OfferBundle, pax: number): number {
  const wanted = new Set(ids);
  let total = 0;
  for (const flight of offers.flights) {
    if (wanted.has(flight.id)) total += tripCostOf(flight, "flight", pax);
  }
  for (const hotel of offers.hotels) {
    if (wanted.has(hotel.id)) total += tripCostOf(hotel, "hotel", pax);
  }
  for (const attraction of offers.attractions) {
    if (wanted.has(attraction.id)) total += tripCostOf(attraction, "attraction", pax);
  }
  for (const dining of offers.restaurants) {
    if (wanted.has(dining.id)) total += tripCostOf(dining, "dining", pax);
  }
  return total;
}

function pickBudgetIds(priced: OfferBundle, request: TripRequest, scores: ProviderScoreMap): string[] {
  const outbound = priced.flights.filter((item) => isOutboundFlight(item, request));
  const inbound = priced.flights.filter((item) => !isOutboundFlight(item, request));
  const attractionCount = Math.min(priced.attractions.length, Math.max(1, request.days - 1));
  const diningCount = Math.min(priced.restaurants.length, Math.max(1, request.days));

  const chosen = {
    outbound: outbound[0],
    inbound: inbound[0],
    hotel: priced.hotels[0],
    attractions: priced.attractions.slice(0, attractionCount),
    dining: priced.restaurants.slice(0, diningCount),
  };

  const collect = () =>
    [
      chosen.outbound?.id,
      chosen.inbound?.id,
      chosen.hotel?.id,
      ...chosen.attractions.map((item) => item.id),
      ...chosen.dining.map((item) => item.id),
    ].filter((id): id is string => Boolean(id));

  const fits = (ids: string[]) => costOfIds(ids, priced, request.pax) <= request.budget;

  const better = (next: { provider: Address }, prev?: { provider: Address }) => {
    if (!prev) return true;
    return bayesScore(scoreOf(next.provider, scores).ratingAvg, scoreOf(next.provider, scores).ratingCount) >
      bayesScore(scoreOf(prev.provider, scores).ratingAvg, scoreOf(prev.provider, scores).ratingCount);
  };

  const trySlot = <T extends FlightOffer | HotelOffer | AttractionOffer | DiningOffer>(
    candidates: T[],
    current: T | undefined,
    assign: (item: T) => void
  ) => {
    const ranked = sortList(candidates, "balanced", "hotel", scores, request, () => 0);
    for (const item of ranked) {
      if (item.id === current?.id || !better(item, current)) continue;
      assign(item);
      if (fits(collect())) return;
      if (current) assign(current);
      else if (candidates[0] && item.id !== candidates[0].id) assign(candidates[0]);
    }
  };

  trySlot(outbound, chosen.outbound, (item) => {
    chosen.outbound = item;
  });
  trySlot(inbound, chosen.inbound, (item) => {
    chosen.inbound = item;
  });
  trySlot(priced.hotels, chosen.hotel, (item) => {
    chosen.hotel = item;
  });

  const tryList = (pool: Array<FlightOffer | HotelOffer | AttractionOffer | DiningOffer>, current: typeof pool) => {
    const unused = pool.filter((item) => !current.some((pick) => pick.id === item.id));
    const rankedUnused = sortList(unused, "balanced", "attraction", scores, request, (item) =>
      "total" in item ? item.total : item.pricePerPerson
    );
    for (const candidate of rankedUnused) {
      let weakest = 0;
      for (let i = 1; i < current.length; i++) {
        if (!better(current[i]!, current[weakest])) weakest = i;
      }
      const prev = current[weakest];
      if (!prev || !better(candidate, prev)) continue;
      current[weakest] = candidate;
      if (fits(collect())) continue;
      current[weakest] = prev;
    }
  };

  tryList(priced.attractions, chosen.attractions);
  tryList(priced.restaurants, chosen.dining);

  return collect();
}

export function pickRecommendedIds(
  offers: OfferBundle,
  mode: RecommendMode,
  request: TripRequest,
  scores: ProviderScoreMap
): string[] {
  const ranked: OfferBundle = {
    flights: sortFlights(offers.flights, mode === "budget" ? "price" : mode, request, scores),
    hotels: sortList(offers.hotels, mode === "budget" ? "price" : mode, "hotel", scores, request, (item) => item.total),
    attractions: sortList(
      offers.attractions,
      mode === "budget" ? "price" : mode,
      "attraction",
      scores,
      request,
      (item) => item.pricePerPerson
    ),
    restaurants: sortList(
      offers.restaurants,
      mode === "budget" ? "price" : mode,
      "dining",
      scores,
      request,
      (item) => item.pricePerPerson
    ),
  };
  return mode === "budget" ? pickBudgetIds(ranked, request, scores) : skeletonIds(ranked, request);
}

export function sameIdSet(left: Iterable<string>, right: Iterable<string>): boolean {
  const a = [...left];
  const b = [...right];
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}
