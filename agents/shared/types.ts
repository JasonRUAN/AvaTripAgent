/**
 * AvaTrip Agent —— 后端 / 前端共享契约
 *
 * ⚠️ 本文件字段必须与 `frontend/lib/types.ts` 保持一致。
 */

export type Address = `0x${string}`;
export type Hex = `0x${string}`;

/** 0 机票 / 1 酒店 / 2 门票 / 3 餐饮 */
export type CategoryCode = 0 | 1 | 2 | 3;

export const CATEGORY_LABEL: Record<CategoryCode, string> = {
  0: "机票",
  1: "酒店",
  2: "门票",
  3: "餐饮",
};

export const ALL_CATEGORIES: CategoryCode[] = [0, 1, 2, 3];

export function categoriesFromMask(mask: number): CategoryCode[] {
  return ALL_CATEGORIES.filter((code) => (mask & (1 << code)) !== 0);
}

// ---------------------------------------------------------------- 需求

export interface TripRequest {
  origin: string;
  destination: string;
  /** YYYY-MM-DD */
  startDate: string;
  days: number;
  pax: number;
  /** USD */
  budget: number;
  rooms: number;
  preferences: string[];
  rawText: string;
}

// ---------------------------------------------------------------- 候选

export interface AirportPoint {
  city: string;
  airport: string;
  terminal: string;
  code: string;
}

export interface FlightOffer {
  id: string;
  carrier: string;
  flightNo: string;
  aircraft: string;
  from: AirportPoint;
  to: AirportPoint;
  departAt: string;
  arriveAt: string;
  durationMinutes: number;
  cabin: string;
  seatsLeft: number;
  pricePerPerson: number;
  currency: string;
  provider: Address;
}

export interface HotelOffer {
  id: string;
  name: string;
  stars: number;
  area: string;
  address: string;
  checkIn: string;
  checkOut: string;
  roomType: string;
  rooms: number;
  nights: number;
  pricePerNight: number;
  total: number;
  provider: Address;
}

export interface AttractionOffer {
  id: string;
  name: string;
  area: string;
  durationMinutes: number;
  openHours: string;
  needBooking: boolean;
  pricePerPerson: number;
  provider: Address;
}

export interface DiningOffer {
  id: string;
  name: string;
  area: string;
  cuisine: string;
  durationMinutes: number;
  pricePerPerson: number;
  provider: Address;
}

// ---------------------------------------------------------------- 行程

export interface ItineraryItem {
  time: string;
  title: string;
  offerId?: string;
  category?: CategoryCode;
  area?: string;
  note?: string;
  price?: number;
}

export interface ItineraryDay {
  index: number;
  date: string;
  theme: string;
  items: ItineraryItem[];
  dayCost: number;
}

export interface BudgetItem {
  label: string;
  category: CategoryCode;
  amount: number;
}

// ---------------------------------------------------------------- 报价单

export interface QuoteLineItem {
  provider: Address;
  providerName: string;
  category: CategoryCode;
  /** 最小单位字符串（6 decimals） */
  amount: string;
  itemHash: Hex;
  label: string;
  /** 关联的候选条目 id（航班/酒店/景点/餐厅 offer id），用于按条目发券 */
  itemId?: string;
}

export interface Quote {
  runId: string;
  tripId: string;
  total: string;
  itineraryHash: Hex;
  lineItems: QuoteLineItem[];
  totalUsd: number;
  budgetState: "comfortable" | "within" | "over";
}

// ---------------------------------------------------------------- 规划流

export type Phase =
  | "understanding"
  | "sourcing"
  | "planning"
  | "budgeting"
  | "done";

export type ToolName =
  | "search_flights"
  | "search_hotels"
  | "search_attractions"
  | "search_restaurants"
  | "quote_total";

export type StreamEvent =
  | { type: "run.start"; runId: string; request: TripRequest }
  | { type: "agent.status"; phase: Phase; label: string }
  | { type: "agent.delta"; text: string }
  | { type: "tool.call"; name: ToolName; args: Record<string, unknown> }
  | { type: "tool.result"; name: ToolName; data: unknown; ms: number }
  | { type: "offer.flight"; items: FlightOffer[] }
  | { type: "offer.hotel"; items: HotelOffer[] }
  | { type: "offer.attraction"; items: AttractionOffer[] }
  | { type: "offer.dining"; items: DiningOffer[] }
  | { type: "day.start"; index: number; date: string; theme: string }
  | { type: "day.delta"; index: number; text: string }
  | { type: "day.done"; index: number; day: ItineraryDay }
  | { type: "budget.update"; total: number; items: BudgetItem[]; budget: number }
  | { type: "quote.ready"; quote: Quote }
  | { type: "run.degraded"; reason: string }
  | { type: "run.error"; code: string; message: string }
  | { type: "run.done" };

// ---------------------------------------------------------------- 结算流

export interface SettlementStep {
  key: string;
  provider: Address;
  providerName: string;
  category: CategoryCode;
  label: string;
  txHash?: Hex;
  voucherTxHash?: Hex;
  tokenId?: string;
  voucherCode?: string;
  status: "pending" | "settling" | "paid" | "issued" | "failed";
  error?: string;
}

export type SettlementEvent =
  | { type: "settlement.start"; orderId: string; total: string }
  | { type: "settlement.step"; step: SettlementStep }
  | { type: "settlement.done"; orderId: string; tokenIds: string[] }
  | { type: "settlement.error"; code: string; message: string };

// ---------------------------------------------------------------- 凭证

export type VoucherStatus = "Issued" | "Redeemed" | "Voided";

export interface VoucherDetail {
  tokenId: string;
  orderId: string;
  provider: Address;
  providerName: string;
  holder: Address;
  category: CategoryCode;
  code: string;
  title: string;
  metadataHash: Hex;
  validFrom: number;
  validTo: number;
  status: VoucherStatus;
  metadata?: VoucherMetadata;
}

export interface VoucherMetadata {
  name: string;
  description: string;
  image: string;
  attributes: { trait_type: string; value: string }[];
  details: Record<string, string>;
}
