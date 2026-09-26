/**
 * AvaTrip Agent —— 前端 / 后端共享契约
 *
 * ⚠️ 本文件字段必须与 `backend/src/types.ts` 保持一致。
 *    修改任一侧时，另一侧需同步更新，否则 SSE 事件解析会静默丢字段。
 */

// ---------------------------------------------------------------- 基础类型

export type Address = `0x${string}`;
export type Hex = `0x${string}`;

/** 0 机票 / 1 酒店 / 2 门票 / 3 餐饮 */
export type CategoryCode = 0 | 1 | 2 | 3;

/**
 * 品类的展示名走 `lib/i18n/labels.ts` 的 `categoryLabel(code, locale)`。
 * 这里不再维护语言相关的常量：types.ts 是前后端共享契约，不该掺入文案。
 */

export const CATEGORY_AGENT: Record<CategoryCode, string> = {
  0: "FlightAgent",
  1: "HotelAgent",
  2: "AttractionAgent",
  3: "DiningAgent",
};

// ---------------------------------------------------------------- 需求

export interface TripRequest {
  /** 出发城市 */
  origin: string;
  /** 目的地城市 */
  destination: string;
  /** 出发日期 YYYY-MM-DD */
  startDate: string;
  /** 出行天数 */
  days: number;
  /** 出行人数 */
  pax: number;
  /** 总预算（USD，人类可读数字） */
  budget: number;
  /** 房间数 */
  rooms: number;
  /** 偏好标签，如 ["想吃好", "少走路"] */
  preferences: string[];
  /** 原始自然语言输入 */
  rawText: string;
}

/**
 * 表单默认需求。城市与偏好统一用中文规范名（后端目录就是中文），
 * 展示层再按当前语言翻译，所以这里不要改成英文。
 */
export const DEFAULT_TRIP_REQUEST: TripRequest = {
  origin: "上海",
  destination: "东京",
  startDate: "2026-10-01",
  days: 5,
  pax: 2,
  budget: 8000,
  rooms: 1,
  preferences: ["想吃好", "少走路"],
  rawText: "上海去东京 5 天、两人、预算 8000、想吃好少走路",
};

// ---------------------------------------------------------------- 报价候选

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
  /** 时段 */
  time: string;
  title: string;
  /** 关联的候选 id（航班/酒店/景点/餐厅），用于回填价格 */
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
  /** 当天预估花费（USD） */
  dayCost: number;
}

export interface BudgetItem {
  label: string;
  category: CategoryCode;
  amount: number;
}

// ---------------------------------------------------------------- 报价单

export interface QuoteLineItem {
  /** 服务商 Agent 地址 */
  provider: Address;
  /** 服务商 Agent 名称，如 "AvaFlights Agent" */
  providerName: string;
  category: CategoryCode;
  /** 最小单位字符串（6 decimals） */
  amount: string;
  /** 明细 hash，上链用 */
  itemHash: Hex;
  /** 人类可读描述，如 "NH959 上海浦东 → 东京羽田 ×2 人" */
  label: string;
  /** 关联的候选条目 id（航班/酒店/景点/餐厅 offer id），用于按条目发券 */
  itemId?: string;
}

export interface Quote {
  runId: string;
  tripId: string;
  /** 最小单位字符串（6 decimals） */
  total: string;
  itineraryHash: Hex;
  lineItems: QuoteLineItem[];
  /** 人类可读总金额 */
  totalUsd: number;
  /** 预算状态 */
  budgetState: "comfortable" | "within" | "over";
}

// ---------------------------------------------------------------- 规划流（SSE #1）

export type Phase =
  | "understanding"
  | "sourcing"
  | "planning"
  | "budgeting"
  | "done";

/** 阶段展示名见 `lib/i18n/labels.ts` 的 `phaseLabel(phase, locale)` */

export const PHASE_ORDER: Phase[] = [
  "understanding",
  "sourcing",
  "planning",
  "budgeting",
  "done",
];

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
  // code = 稳定错误标识（前端据此取本地化文案）；message = 服务端默认文案（未知 code 时兜底）；
  // details = 语言无关的技术细节（地址 / 数量 / 原始异常），由前端原样追加
  | { type: "run.error"; code: string; message: string; details?: string }
  | { type: "run.done" };

export type StreamEventType = StreamEvent["type"];

// ---------------------------------------------------------------- 结算流（SSE #2）

export interface SettlementStep {
  key: string;
  provider: Address;
  providerName: string;
  category: CategoryCode;
  label: string;
  /** settle 交易 hash */
  txHash?: Hex;
  /** 发券交易 hash */
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
  | { type: "settlement.error"; code: string; message: string; details?: string };

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
  /** 链下明细（后端 / tokenURI 提供） */
  metadata?: VoucherMetadata;
}

export interface VoucherMetadata {
  name: string;
  description: string;
  image: string;
  attributes: { trait_type: string; value: string }[];
  /** 各品类的结构化明细 */
  details: Record<string, string>;
}

export type AgentKey = "flight" | "hotel" | "attraction" | "dining";

export const AGENT_KEYS: AgentKey[] = ["flight", "hotel", "attraction", "dining"];

/** AgentKey 展示名见 `lib/i18n/labels.ts` 的 `agentKeyLabel(key, locale)` */

export const CATEGORY_TO_KEY: Record<CategoryCode, AgentKey> = {
  0: "flight",
  1: "hotel",
  2: "attraction",
  3: "dining",
};

export const KEY_TO_CATEGORY: Record<AgentKey, CategoryCode> = {
  flight: 0,
  hotel: 1,
  attraction: 2,
  dining: 3,
};

export const ALL_CATEGORIES: CategoryCode[] = [0, 1, 2, 3];

export function categoriesFromMask(mask: number): CategoryCode[] {
  return ALL_CATEGORIES.filter((code) => (mask & (1 << code)) !== 0);
}

export function maskFromCategories(categories: CategoryCode[]): number {
  let mask = 0;
  for (const code of categories) mask |= 1 << code;
  return mask;
}

export function agentCovers(agent: { category: CategoryCode; categories?: CategoryCode[] }, code: CategoryCode): boolean {
  const listed = agent.categories?.length ? agent.categories : [agent.category];
  return listed.includes(code);
}

export type ProviderSelection = Partial<Record<AgentKey, Address[]>>;
/** POST /api/runs 兼容旧的单个地址 */
export type ProviderSelectionInput = Partial<Record<AgentKey, Address | Address[]>>;

export type RecommendMode = "balanced" | "rating" | "price" | "value" | "budget";

export const RECOMMEND_MODES: RecommendMode[] = ["balanced", "rating", "price", "value", "budget"];

export const DEFAULT_RECOMMEND_MODE: RecommendMode = "balanced";

/** 推荐策略展示名见 `lib/i18n/labels.ts` 的 `recommendModeLabel(mode, locale)` */

export function parseRecommendMode(value: unknown): RecommendMode {
  if (
    value === "balanced" ||
    value === "rating" ||
    value === "price" ||
    value === "value" ||
    value === "budget"
  ) {
    return value;
  }
  return DEFAULT_RECOMMEND_MODE;
}

export function normalizeProviders(input?: ProviderSelectionInput | null): ProviderSelection {
  const next: ProviderSelection = {};
  if (!input) return next;
  for (const key of AGENT_KEYS) {
    const raw = input[key];
    if (!raw) continue;
    const list = (Array.isArray(raw) ? raw : [raw]).filter(Boolean);
    if (list.length) next[key] = list;
  }
  return next;
}

export function hasProvider(selection: ProviderSelection, key: AgentKey, address: string): boolean {
  return (selection[key] ?? []).some((item) => item.toLowerCase() === address.toLowerCase());
}

export function toggleProvider(
  selection: ProviderSelection,
  key: AgentKey,
  address: Address
): ProviderSelection {
  const current = selection[key] ?? [];
  const exists = current.some((item) => item.toLowerCase() === address.toLowerCase());
  return {
    ...selection,
    [key]: exists
      ? current.filter((item) => item.toLowerCase() !== address.toLowerCase())
      : [...current, address],
  };
}

export interface AgentProfile {
  address: Address;
  name: string;
  category: CategoryCode;
  /** 综合型服务商可同时覆盖多个分类 */
  categories: CategoryCode[];
  categoryMask: number;
  endpoint: string;
  active: boolean;
  ratingAvg: number;
  ratingCount: number;
  ratingAvgX100: number;
  /** 服务商简介，可为空 */
  description: string;
  /** 官网链接，可为空 */
  website: string;
}

export const CATEGORY_ICON: Record<CategoryCode, string> = {
  0: "✈",
  1: "🏨",
  2: "🎫",
  3: "🍽",
};

export interface OnchainReview {
  tokenId: string;
  reviewer: Address;
  provider: Address;
  score: number;
  comment: string;
  timestamp: number;
}

