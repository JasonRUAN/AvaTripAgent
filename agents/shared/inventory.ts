import {
  addDays,
  addMinutes,
  cityAirportOf,
  cityName,
  findCity,
  originAirportOf,
  type CityCatalog,
  type DiningSeed,
} from "./catalog";
import { detectLocale, pick as pickLocale, type Locale } from "./locale";
import {
  TIER_FACTOR,
  type Tier,
  createRng,
  jitter,
  pick,
  resolveTier,
  toolDelay,
} from "./seeded-random";
import type {
  Address,
  AttractionOffer,
  DiningOffer,
  FlightOffer,
  HotelOffer,
  TripRequest,
} from "./types";

/** 规划语言以需求原文为准：中文需求 → 中文 mock 数据；英文需求 → 英文 mock 数据 */
export function localeOf(request: TripRequest): Locale {
  return detectLocale(request.rawText);
}

function cityOf(name: string): CityCatalog {
  return findCity(name) ?? findCity("东京")!;
}

function tierOf(request: TripRequest): Tier {
  return resolveTier(request.budget, request.days, request.pax);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function searchFlights(
  request: TripRequest,
  tripId: string,
  provider: Address
): Promise<{ items: FlightOffer[]; ms: number }> {
  const tag = provider.slice(2, 10).toLowerCase();
  const ms = toolDelay(createRng(`${tripId}:flights:${tag}`));
  await delay(ms);

  const locale = localeOf(request);
  const rng = createRng(`${tripId}:flights:body:${tag}`);
  const city = cityOf(request.destination);
  const from = originAirportOf(request.origin, locale);
  const to = cityAirportOf(request.destination, 0, locale);
  const factor = TIER_FACTOR[tierOf(request)];
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
    from: { city: cityName(request.origin, locale), airport: from.name, terminal: from.terminal, code: from.code },
    to: { city: cityName(request.destination, locale), airport: to.name, terminal: to.terminal, code: to.code },
    departAt: `${request.startDate} ${depart}`,
    arriveAt: `${request.startDate} ${arrive}`,
    durationMinutes: city.flightMinutes,
    cabin: factor >= 1.8 ? pickLocale(locale, "商务舱", "Business Class") : pickLocale(locale, "经济舱", "Economy"),
    seatsLeft: 2 + Math.floor(rng() * 9),
    pricePerPerson: Math.round(jitter(rng, base)),
    currency: "USD",
    provider,
  };

  const endDate = addDays(request.startDate, request.days - 1);
  const inbound: FlightOffer = {
    ...outbound,
    id: "flt-inbound",
    flightNo: "NH960",
    from: { city: cityName(request.destination, locale), airport: to.name, terminal: to.terminal, code: to.code },
    to: { city: cityName(request.origin, locale), airport: from.name, terminal: from.terminal, code: from.code },
    departAt: `${endDate} ${returnDepart}`,
    arriveAt: `${endDate} ${addMinutes(returnDepart, city.flightMinutes + 10)}`,
    durationMinutes: city.flightMinutes + 10,
    pricePerPerson: Math.round(jitter(rng, base)),
    provider,
  };

  return { items: [outbound, inbound], ms };
}

function tierStarRange(tier: Tier): [number, number] {
  if (tier === "luxury") return [5, 5];
  if (tier === "economy") return [3, 4];
  return [4, 5];
}

export async function searchHotels(
  request: TripRequest,
  tripId: string,
  provider: Address
): Promise<{ items: HotelOffer[]; ms: number }> {
  const tag = provider.slice(2, 10).toLowerCase();
  const ms = toolDelay(createRng(`${tripId}:hotels:${tag}`));
  await delay(ms);

  const rng = createRng(`${tripId}:hotels:body:${tag}`);
  const locale = localeOf(request);
  const en = locale === "en";
  const city = cityOf(request.destination);
  const nights = Math.max(1, request.days - 1);
  const [minStar, maxStar] = tierStarRange(tierOf(request));
  const endDate = addDays(request.startDate, request.days - 1);
  const matched = city.hotels.filter((h) => h.stars >= minStar && h.stars <= maxStar);
  const pool = matched.length >= 3 ? matched : city.hotels;

  const items = pick(rng, pool, 3).map<HotelOffer>((seed) => {
    const pricePerNight = Math.round(jitter(rng, seed.basePrice));
    return {
      id: seed.id,
      name: en ? seed.nameEn : seed.name,
      stars: seed.stars,
      area: en ? seed.areaEn : seed.area,
      address: en ? seed.addressEn : seed.address,
      checkIn: `${request.startDate} 15:00`,
      checkOut: `${endDate} 11:00`,
      roomType: en ? seed.roomTypeEn : seed.roomType,
      rooms: request.rooms,
      nights,
      pricePerNight,
      total: pricePerNight * nights * request.rooms,
      provider,
    };
  });

  return { items: items.sort((a, b) => a.total - b.total), ms };
}

export async function searchAttractions(
  request: TripRequest,
  tripId: string,
  provider: Address
): Promise<{ items: AttractionOffer[]; ms: number }> {
  const tag = provider.slice(2, 10).toLowerCase();
  const ms = toolDelay(createRng(`${tripId}:attractions:${tag}`));
  await delay(ms);

  const rng = createRng(`${tripId}:attractions:body:${tag}`);
  const locale = localeOf(request);
  const en = locale === "en";
  const city = cityOf(request.destination);

  const items = pick(rng, city.attractions, 6).map<AttractionOffer>((seed) => ({
    id: seed.id,
    name: en ? seed.nameEn : seed.name,
    area: en ? seed.areaEn : seed.area,
    durationMinutes: seed.durationMinutes,
    openHours: seed.openHours,
    needBooking: seed.needBooking,
    pricePerPerson: Math.round(jitter(rng, seed.basePrice, 0.05)),
    provider,
  }));

  return { items, ms };
}

function tierDiningPool(tier: Tier, list: readonly DiningSeed[]): readonly DiningSeed[] {
  const sorted = [...list].sort((a, b) => a.basePrice - b.basePrice);
  const half = Math.max(3, Math.ceil(sorted.length / 2));
  if (tier === "economy") return sorted.slice(0, half);
  if (tier === "luxury") return sorted.slice(-half);
  return sorted;
}

export async function searchRestaurants(
  request: TripRequest,
  tripId: string,
  provider: Address
): Promise<{ items: DiningOffer[]; ms: number }> {
  const tag = provider.slice(2, 10).toLowerCase();
  const ms = toolDelay(createRng(`${tripId}:restaurants:${tag}`));
  await delay(ms);

  const rng = createRng(`${tripId}:restaurants:body:${tag}`);
  const locale = localeOf(request);
  const en = locale === "en";
  const city = cityOf(request.destination);
  const tier = tierOf(request);

  const items = pick(rng, tierDiningPool(tier, city.restaurants), 5).map<DiningOffer>((seed) => ({
    id: seed.id,
    name: en ? seed.nameEn : seed.name,
    area: en ? seed.areaEn : seed.area,
    cuisine: en ? seed.cuisineEn : seed.cuisine,
    durationMinutes: seed.durationMinutes,
    pricePerPerson: Math.round(jitter(rng, seed.basePrice)),
    provider,
  }));

  return { items, ms };
}

export function compressOffers(
  input: {
    flights: FlightOffer[];
    hotels: HotelOffer[];
    attractions: AttractionOffer[];
    restaurants: DiningOffer[];
  },
  meta?: {
    names?: Record<string, string>;
    scores?: Record<string, { ratingAvg: number; ratingCount: number }>;
    locale?: Locale;
  }
): string {
  const en = (meta?.locale ?? "zh") === "en";
  const named = (address: Address) => {
    const name = meta?.names?.[address.toLowerCase()];
    const score = meta?.scores?.[address.toLowerCase()];
    const rating =
      score && score.ratingCount > 0 ? ` ★${score.ratingAvg.toFixed(1)}(${score.ratingCount})` : "";
    return name ? ` · ${name}${rating}` : rating ? ` ·${rating}` : "";
  };

  const lines: string[] = [];
  lines.push(en ? "Flights (F):" : "航班（F）:");
  input.flights.forEach((f, i) =>
    lines.push(
      `F${i + 1} ${f.flightNo} ${f.from.code}→${f.to.code} ${f.departAt} → ${f.arriveAt} · ${f.durationMinutes}${en ? " min" : "分钟"} · $${f.pricePerPerson}${en ? "/pax" : "/人"}${named(f.provider)}`
    )
  );
  lines.push(en ? "Hotels (H):" : "酒店（H）:");
  input.hotels.forEach((h, i) =>
    lines.push(
      `H${i + 1} ${h.name} ${h.stars}${en ? "-star" : "星"} · ${h.area} · ${h.roomType} · ${h.nights}${en ? " nights" : "晚"} · $${h.total} total${named(h.provider)}`
    )
  );
  lines.push(en ? "Attractions (A):" : "景点（A）:");
  input.attractions.forEach((a, i) =>
    lines.push(
      `A${i + 1} ${a.name} · ${a.area} · ${a.durationMinutes}${en ? " min" : "分钟"} · ${a.openHours} · $${a.pricePerPerson}${en ? "/pax" : "/人"}${a.needBooking ? (en ? " · booking required" : " · 需预约") : ""}${named(a.provider)}`
    )
  );
  lines.push(en ? "Restaurants (D):" : "餐厅（D）:");
  input.restaurants.forEach((d, i) =>
    lines.push(`D${i + 1} ${d.name} · ${d.area} · ${d.cuisine} · $${d.pricePerPerson}${en ? "/pax" : "/人"}${named(d.provider)}`)
  );
  return lines.join("\n");
}
