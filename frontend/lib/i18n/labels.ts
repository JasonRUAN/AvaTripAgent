import type { Locale } from "./config";
import { getDict, interpolate, type Dictionary } from "./index";
import { demoText } from "./dictionaries/demo";
import { DEFAULT_TRIP_REQUEST } from "../types";
import type {
  AgentKey,
  AgentProfile,
  CategoryCode,
  Phase,
  RecommendMode,
  SettlementStep,
  TripRequest,
  VoucherStatus,
} from "../types";

/**
 * 枚举 → 展示文案。
 *
 *  全部收在这里（此前散落在 types.ts / use-plan-run / 各组件），签名统一为
 *  `(code, locale)`，这样 lib 下的纯函数也能拿到正确的语言而不用引 React。
 */

/** 品类码 → 字典 key */
const CATEGORY_KEY = {
  0: "flight",
  1: "hotel",
  2: "attraction",
  3: "dining",
} as const satisfies Record<CategoryCode, keyof Dictionary["category"]>;

export function categoryLabel(code: CategoryCode, locale: Locale): string {
  const { category } = getDict(locale);
  return category[CATEGORY_KEY[code] ?? CATEGORY_KEY[0]];
}

export function agentKeyLabel(key: AgentKey, locale: Locale): string {
  return getDict(locale).agentKey[key];
}

export function phaseLabel(phase: Phase, locale: Locale): string {
  return getDict(locale).phase[phase];
}

export function recommendModeLabel(mode: RecommendMode, locale: Locale): string {
  return getDict(locale).recommendMode[mode];
}

/** 短标签（推荐策略五宫格用） */
export function recommendModeShort(mode: RecommendMode, locale: Locale): string {
  const { recommendMode } = getDict(locale);
  const key = `short${mode.charAt(0).toUpperCase()}${mode.slice(1)}` as keyof typeof recommendMode;
  return (recommendMode[key] as string) ?? recommendMode[mode];
}

/** 推荐策略说明 */
export function recommendModeHint(mode: RecommendMode, locale: Locale): string {
  const { recommendMode } = getDict(locale);
  const key = `hint${mode.charAt(0).toUpperCase()}${mode.slice(1)}` as keyof typeof recommendMode;
  return (recommendMode[key] as string) ?? recommendMode[mode];
}

export function toolLabel(name: string, locale: Locale): string {
  const { tool } = getDict(locale);
  return (tool as Record<string, string>)[name] ?? name;
}

export function settlementStatusText(
  status: SettlementStep["status"],
  locale: Locale
): string {
  return getDict(locale).settlementStatus[status];
}

export function voucherStatusText(status: VoucherStatus, locale: Locale): string {
  return getDict(locale).voucherStatus[status];
}

export type BudgetState = "comfortable" | "within" | "over";

export function budgetToneText(state: BudgetState, locale: Locale): string {
  return getDict(locale).budgetTone[state];
}

/** "机票 · 餐饮" */
export function categoryLabels(
  agent: { category: CategoryCode; categories?: CategoryCode[] },
  locale: Locale
): string {
  const listed = agent.categories?.length ? agent.categories : [agent.category];
  return listed.map((code) => categoryLabel(code, locale)).join(" · ");
}

/** 表单默认值：城市与偏好按当前语言展示（仍以中文规范名存储） */
export function defaultTripRequest(locale: Locale): TripRequest {
  const text = demoText(locale);
  return {
    ...DEFAULT_TRIP_REQUEST,
    rawText: text.examples[0] ?? DEFAULT_TRIP_REQUEST.rawText,
  };
}

/** 服务商头像/卡片上的品类色板（渐变与图标不随语言变） */
export const CATEGORY_STYLE: Record<
  number,
  { gradient: string; icon: string }
> = {
  0: { gradient: "linear-gradient(135deg,#2e7bf6,#4c9aff)", icon: "✈️" },
  1: { gradient: "linear-gradient(135deg,#7c6bf5,#a78bfa)", icon: "🏨" },
  2: { gradient: "linear-gradient(135deg,#17c964,#5fd98d)", icon: "🎟️" },
  3: { gradient: "linear-gradient(135deg,#ff8a3d,#ffb020)", icon: "🍜" },
};

export function categoryStyle(code: number) {
  return CATEGORY_STYLE[code] ?? CATEGORY_STYLE[0]!;
}

/** 凭证卡顶部 "机票凭证" / "Flights voucher" */
export function voucherTitleText(code: number, locale: Locale): string {
  return interpolate(getDict(locale).voucher.titleSuffix, {
    label: categoryLabel(code as CategoryCode, locale),
  });
}

export function agentProfileLabel(agent: AgentProfile, locale: Locale): string {
  return categoryLabels(agent, locale);
}
