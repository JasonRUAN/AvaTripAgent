/**
 * 用户勾选候选后，即时改写逐日行程与报价单。
 *
 * 推荐项（Agent 原行程里的 offerId）取消后再勾回，会回到原来的天；
 * 额外勾选的项按区域 / 日期启发式插入，不重跑 LLM。
 */

import { keccak256, toHex } from "viem";
import { toUnits } from "./format";
import { getDict, interpolate } from "./i18n";
import type { Locale } from "./i18n/config";
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
} from "./types";

export type OfferKind = "flights" | "hotels" | "attractions" | "dining";

export interface OfferBundle {
  flights: FlightOffer[];
  hotels: HotelOffer[];
  attractions: AttractionOffer[];
  dining: DiningOffer[];
}

export function recommendedOfferIds(days: ItineraryDay[]): string[] {
  const ids = new Set<string>();
  for (const day of days) {
    for (const item of day.items) {
      if (item.offerId) ids.add(item.offerId);
    }
  }
  return [...ids];
}

export function offerIdsOf(offers: OfferBundle, kind: OfferKind): string[] {
  return offers[kind].map((item) => item.id);
}

function dateOf(value?: string): string {
  return value?.slice(0, 10) ?? "";
}

function timeOf(value?: string, fallback = ""): string {
  const stamp = value?.slice(11, 16);
  return stamp && /^\d{2}:\d{2}$/.test(stamp) ? stamp : fallback;
}

function slotFor(category: CategoryCode, order: number): string {
  if (category === 0) return "";
  if (category === 1) return "15:00";
  if (category === 2) return order === 0 ? "10:00" : "14:30";
  return order <= 1 ? "12:30" : "18:30";
}

function findOffer(
  id: string,
  offers: OfferBundle
):
  | { kind: "flights"; offer: FlightOffer }
  | { kind: "hotels"; offer: HotelOffer }
  | { kind: "attractions"; offer: AttractionOffer }
  | { kind: "dining"; offer: DiningOffer }
  | null {
  const flight = offers.flights.find((item) => item.id === id);
  if (flight) return { kind: "flights", offer: flight };
  const hotel = offers.hotels.find((item) => item.id === id);
  if (hotel) return { kind: "hotels", offer: hotel };
  const attraction = offers.attractions.find((item) => item.id === id);
  if (attraction) return { kind: "attractions", offer: attraction };
  const dining = offers.dining.find((item) => item.id === id);
  if (dining) return { kind: "dining", offer: dining };
  return null;
}

export function itineraryItemFromOffer(
  id: string,
  offers: OfferBundle,
  locale: Locale
): ItineraryItem | null {
  const found = findOffer(id, offers);
  if (!found) return null;
  const { units, offers: offerText } = getDict(locale);

  if (found.kind === "flights") {
    const flight = found.offer;
    return {
      time: timeOf(flight.departAt),
      title: `${flight.flightNo} ${flight.from.code} → ${flight.to.code}`,
      offerId: flight.id,
      category: 0,
      note: `${flight.carrier} · ${flight.aircraft} · ${interpolate(units.minutes, { n: flight.durationMinutes })} · ${flight.cabin}`,
    };
  }

  if (found.kind === "hotels") {
    const hotel = found.offer;
    return {
      time: "15:00",
      title: `${offerText.checkInWord} ${hotel.name}`,
      offerId: hotel.id,
      category: 1,
      area: hotel.area,
      note: `${hotel.stars}${offerText.starSuffix} · ${hotel.roomType} · ${interpolate(units.nights, { n: hotel.nights })}`,
    };
  }

  if (found.kind === "attractions") {
    const attraction = found.offer;
    return {
      time: "",
      title: attraction.name,
      offerId: attraction.id,
      category: 2,
      area: attraction.area,
      note: `${interpolate(units.minutes, { n: attraction.durationMinutes })} · ${attraction.openHours}${
        attraction.needBooking ? ` · ${offerText.needBooking}` : ""
      }`,
    };
  }

  const dining = found.offer;
  return {
    time: "",
    title: dining.name,
    offerId: dining.id,
    category: 3,
    area: dining.area,
    note: `${dining.cuisine} · ${offerText.aboutWord}${interpolate(units.minutes, { n: dining.durationMinutes })}`,
  };
}

function priceOf(
  item: ItineraryItem,
  offers: OfferBundle,
  pax: number,
  dayIndex: number
): number | undefined {
  if (item.category === 0) {
    const flight = offers.flights.find((entry) => entry.id === item.offerId);
    return flight ? flight.pricePerPerson * pax : item.price;
  }
  if (item.category === 2) {
    const attraction = offers.attractions.find((entry) => entry.id === item.offerId);
    return attraction ? attraction.pricePerPerson * pax : item.price;
  }
  if (item.category === 3 && item.offerId) {
    const dining = offers.dining.find((entry) => entry.id === item.offerId);
    return dining ? dining.pricePerPerson * pax : item.price;
  }
  if (item.category === 1) {
    const hotel = offers.hotels.find((entry) => entry.id === item.offerId);
    return dayIndex === 0 && hotel ? hotel.total : hotel ? 0 : item.price;
  }
  return item.price;
}

export function fillDay(day: ItineraryDay, offers: OfferBundle, pax: number): ItineraryDay {
  const items = [...day.items]
    .map((item, order) => {
      const next = { ...item };
      if (next.category === 2 && !next.time) {
        const count = day.items
          .slice(0, order)
          .filter((entry) => entry.category === 2).length;
        next.time = slotFor(2, count);
      } else if (next.category === 3 && !next.time) {
        const count = day.items
          .slice(0, order)
          .filter((entry) => entry.category === 3).length;
        next.time = slotFor(3, count);
      } else if (!next.time && next.category !== undefined) {
        next.time = slotFor(next.category, 0);
      }
      next.price = priceOf(next, offers, pax, day.index);
      return next;
    })
    .sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));

  const dayCost = Math.round(items.reduce((sum, item) => sum + (item.price ?? 0), 0) * 100) / 100;
  return { ...day, items, dayCost };
}

function pickDayIndex(
  item: ItineraryItem,
  days: ItineraryDay[],
  offers: OfferBundle,
  request?: TripRequest | null
): number {
  if (days.length === 0) return 0;

  if (item.category === 0 && item.offerId) {
    const flight = offers.flights.find((entry) => entry.id === item.offerId);
    const depart = dateOf(flight?.departAt);
    const byDate = days.findIndex((day) => day.date === depart);
    if (byDate >= 0) return byDate;

    const returning =
      Boolean(flight && request) &&
      (flight!.from.city === request!.destination || flight!.to.city === request!.origin);
    return returning ? days.length - 1 : 0;
  }

  if (item.category === 1) return 0;

  if (item.area) {
    const byArea = days.findIndex((day) =>
      day.items.some((entry) => entry.area === item.area) || day.theme.includes(item.area!)
    );
    if (byArea >= 0) return byArea;
  }

  let lightest = 0;
  let lightestCount = Number.POSITIVE_INFINITY;
  days.forEach((day, index) => {
    if (day.items.length < lightestCount) {
      lightest = index;
      lightestCount = day.items.length;
    }
  });
  return lightest;
}

export function placementsFromDays(days: ItineraryDay[]): Record<string, number> {
  const placements: Record<string, number> = {};
  for (const day of days) {
    for (const item of day.items) {
      if (item.offerId && placements[item.offerId] === undefined) {
        placements[item.offerId] = day.index;
      }
    }
  }
  return placements;
}

export interface AvailableOffer {
  id: string;
  kind: OfferKind;
  category: CategoryCode;
  label: string;
  detail: string;
}

export function availableOffers(
  offers: OfferBundle,
  selectedIds: Iterable<string>,
  locale: Locale
): AvailableOffer[] {
  const selected = new Set(selectedIds);
  const dict = getDict(locale);
  const perPerson = (price: number) =>
    price === 0 ? dict.units.free : `$${price}${dict.offers.perPersonSuffix}`;

  const rows: AvailableOffer[] = [];
  for (const flight of offers.flights) {
    if (selected.has(flight.id)) continue;
    rows.push({
      id: flight.id,
      kind: "flights",
      category: 0,
      label: `${flight.flightNo} ${flight.from.code} → ${flight.to.code}`,
      detail: `${flight.carrier} · ${perPerson(flight.pricePerPerson)}`,
    });
  }
  for (const hotel of offers.hotels) {
    if (selected.has(hotel.id)) continue;
    rows.push({
      id: hotel.id,
      kind: "hotels",
      category: 1,
      label: hotel.name,
      detail: `${hotel.area} · $${hotel.total}`,
    });
  }
  for (const attraction of offers.attractions) {
    if (selected.has(attraction.id)) continue;
    rows.push({
      id: attraction.id,
      kind: "attractions",
      category: 2,
      label: attraction.name,
      detail: `${attraction.area} · ${perPerson(attraction.pricePerPerson)}`,
    });
  }
  for (const dining of offers.dining) {
    if (selected.has(dining.id)) continue;
    rows.push({
      id: dining.id,
      kind: "dining",
      category: 3,
      label: dining.name,
      detail: `${dining.cuisine} · ${perPerson(dining.pricePerPerson)}`,
    });
  }
  return rows;
}

/** 以当前行程为底，按勾选增删带 offerId 的条目；placements 指定插到哪一天 */
export function applySelection(
  currentDays: ItineraryDay[],
  selectedIds: Iterable<string>,
  offers: OfferBundle,
  pax: number,
  locale: Locale,
  request?: TripRequest | null,
  placements?: Record<string, number>
): ItineraryDay[] {
  const selected = new Set(selectedIds);

  const days = currentDays.map((day) => ({
    ...day,
    items: day.items.filter((item) => !item.offerId || selected.has(item.offerId)),
  }));

  const present = new Set<string>();
  for (const day of days) {
    for (const item of day.items) {
      if (item.offerId) present.add(item.offerId);
    }
  }

  for (const id of selected) {
    if (present.has(id)) continue;
    const item = itineraryItemFromOffer(id, offers, locale);
    if (!item) continue;
    const preferred = placements?.[id];
    const byIndex = preferred === undefined ? -1 : days.findIndex((day) => day.index === preferred);
    const index = byIndex >= 0 ? byIndex : pickDayIndex(item, days, offers, request);
    const target = days[index] ?? days[0];
    if (!target) continue;
    target.items = [...target.items, item];
    present.add(id);
  }

  return days.map((day) => fillDay(day, offers, pax));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function namedProvider(address: QuoteLineItem["provider"], previous?: Quote): string {
  const hit = previous?.lineItems.find(
    (item) => item.provider.toLowerCase() === address.toLowerCase()
  );
  if (hit?.providerName) return hit.providerName;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function quoteFromSelection(params: {
  selectedIds: Iterable<string>;
  offers: OfferBundle;
  days: ItineraryDay[];
  request: TripRequest;
  locale: Locale;
  previousQuote?: Quote;
}): { quote: Quote; budgetItems: BudgetItem[] } {
  const selected = new Set(params.selectedIds);
  const previous = params.previousQuote;
  const units = getDict(params.locale).units;
  const tripId = previous?.tripId ?? `trip_${params.request.destination}`;
  const runId = previous?.runId ?? "local-run";

  const lineItems: QuoteLineItem[] = [];

  const push = (
    category: CategoryCode,
    itemId: string,
    label: string,
    amountUsd: number,
    provider: QuoteLineItem["provider"]
  ) => {
    if (amountUsd <= 0) return;
    lineItems.push({
      provider,
      providerName: namedProvider(provider, previous),
      category,
      amount: toUnits(round2(amountUsd)).toString(),
      itemHash: keccak256(toHex(`${tripId}:${category}:${itemId}`)),
      label,
      itemId,
    });
  };

  for (const flight of params.offers.flights) {
    if (!selected.has(flight.id)) continue;
    push(
      0,
      flight.id,
      `${flight.flightNo} ${flight.from.code} → ${flight.to.code} ${interpolate(units.paxSuffix, { n: params.request.pax })}`,
      flight.pricePerPerson * params.request.pax,
      flight.provider
    );
  }

  for (const hotel of params.offers.hotels) {
    if (!selected.has(hotel.id)) continue;
    push(
      1,
      hotel.id,
      `${hotel.name} ${hotel.roomType} ${interpolate(units.nightsSuffix, { n: hotel.nights })}`,
      hotel.total,
      hotel.provider
    );
  }

  for (const attraction of params.offers.attractions) {
    if (!selected.has(attraction.id)) continue;
    push(
      2,
      attraction.id,
      `${attraction.name} ${interpolate(units.paxSuffix, { n: params.request.pax })}`,
      attraction.pricePerPerson * params.request.pax,
      attraction.provider
    );
  }

  for (const dining of params.offers.dining) {
    if (!selected.has(dining.id)) continue;
    push(
      3,
      dining.id,
      `${dining.name} ${interpolate(units.paxSuffix, { n: params.request.pax })}`,
      dining.pricePerPerson * params.request.pax,
      dining.provider
    );
  }

  const totalUsd = round2(
    lineItems.reduce((sum, item) => sum + Number(item.amount) / 1_000_000, 0)
  );

  const itineraryHash = keccak256(
    toHex(
      JSON.stringify({
        tripId,
        days: params.days.map((day) => day.items.map((item) => item.title)),
      })
    )
  );

  const budgetState: Quote["budgetState"] =
    totalUsd <= params.request.budget * 0.9
      ? "comfortable"
      : totalUsd <= params.request.budget
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
