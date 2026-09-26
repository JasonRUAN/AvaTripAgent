import { hasLLM } from "./env";
import { createLogger, startTimer } from "./logger";
import { chatJson } from "./llm";
import { detectLocale, pick, type Locale } from "./locale";

/**
 * 行程 AI 总结。
 *
 * 输入是前端按订单聚合好的凭证明细（链下 metadata.details），
 * 输出一段口语化的行程总结 + 亮点 + 出行提示。
 * 结果按 tripId 缓存在进程内：同一趟行程反复展开卡片不会重复烧 token。
 */

export interface TripSummaryVoucherInput {
  title: string;
  categoryLabel: string;
  details: Record<string, string>;
}

export interface TripSummary {
  summary: string;
  highlights: string[];
  tips: string[];
  /** llm = 真实模型；offline = 未配置 OPENAI_API_KEY 时的规则拼装兜底 */
  source: "llm" | "offline";
}

const SYSTEM_PROMPT = systemPrompt("zh");

function systemPrompt(locale: Locale): string {
  return locale === "zh"
    ? `你是 AvaTrip 行程助理。用户会给你一趟行程的全部凭证明细（机票/酒店/门票/餐饮），请据此生成行程总结。

硬性规则：
1. 只根据给定明细作答，不得编造明细里没有的航班号、地点、价格。
2. summary：120 字以内的口语化中文，按时间线串起这趟行程（交通 → 住宿 → 游玩 → 餐饮），点出目的地、日期、人数等关键信息。
3. highlights：3~5 条，每条不超过 20 字，挑最值得期待的安排。
4. tips：2~4 条实用提示（如提前到机场、入住退房时间、凭证二维码核销方式）。
5. 只输出 JSON，不要输出其他内容：{"summary": string, "highlights": string[], "tips": string[]}`
    : `You are the AvaTrip trip assistant. The user gives you all voucher details of one trip (flights/hotels/attractions/dining); generate a trip summary from them.

Hard rules:
1. Answer only from the given details; never invent flight numbers, places or prices.
2. summary: conversational English within 90 words, walking the trip along a timeline (transit → stay → sights → dining) and calling out destination, dates and party size.
3. highlights: 3~5 items, each within 12 words, the most exciting parts.
4. tips: 2~4 practical tips (arrive early at the airport, check-in/check-out times, redeeming vouchers via QR code).
5. Output JSON only: {"summary": string, "highlights": string[], "tips": string[]}`;
}

const log = createLogger("trip-summary");

/** 进程内缓存，上限防止 Map 无限膨胀 */
const cache = new Map<string, TripSummary>();
const MAX_CACHE = 100;

export async function generateTripSummary(
  tripId: string,
  vouchers: TripSummaryVoucherInput[]
): Promise<TripSummary> {
  // 跟随凭证明细的语言：中文行程 → 中文总结；英文行程 → 英文总结
  const locale = detectLocale(
    vouchers.map((voucher) => `${voucher.title} ${voucher.categoryLabel}`).join(" ")
  );
  const elapsed = startTimer();
  const cacheKey = `${tripId}:${locale}`;
  const hit = cache.get(cacheKey);
  if (hit) {
    log.debug("命中行程总结缓存", { tripId, locale });
    return hit;
  }

  const result = hasLLM
    ? await viaLLM(vouchers, locale).catch((error: unknown) => {
        log.error("LLM 调用失败，退回离线摘要", { tripId, locale }, error);
        return offlineSummary(vouchers, locale);
      })
    : offlineSummary(vouchers, locale);

  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
      log.debug("总结缓存已满，淘汰最旧记录", { evicted: oldest, size: cache.size });
    }
  }
  cache.set(cacheKey, result);
  log.info("行程总结已生成", {
    tripId,
    locale,
    source: result.source,
    ms: elapsed(),
    vouchers: vouchers.length,
  });
  return result;
}

async function viaLLM(vouchers: TripSummaryVoucherInput[], locale: Locale): Promise<TripSummary> {
  const raw = await chatJson<unknown>({
    system: systemPrompt(locale),
    user: buildUserPrompt(vouchers),
    maxTokens: 800,
    temperature: 0.4,
    timeoutMs: 30_000,
  });
  return coerceSummary(raw, vouchers, locale);
}

function buildUserPrompt(vouchers: TripSummaryVoucherInput[]): string {
  const lines = vouchers.map((voucher) => {
    const pairs = Object.entries(voucher.details ?? {})
      .filter(([key, value]) => key !== "行程" && value)
      .map(([key, value]) => `${key}=${value}`);
    return `【${voucher.categoryLabel}】${voucher.title}${
      pairs.length > 0 ? `：${pairs.join("；")}` : ""
    }`;
  });
  return `行程凭证明细（共 ${vouchers.length} 张）：\n${lines.join("\n")}`;
}

function coerceSummary(
  raw: unknown,
  vouchers: TripSummaryVoucherInput[],
  locale: Locale
): TripSummary {
  const value = (raw ?? {}) as {
    summary?: unknown;
    highlights?: unknown;
    tips?: unknown;
  };

  const summary =
    typeof value.summary === "string" && value.summary.trim()
      ? value.summary.trim()
      : offlineSummary(vouchers, locale).summary;

  const list = (input: unknown, fallback: string[]): string[] => {
    if (!Array.isArray(input)) return fallback;
    const items = input
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 5);
    return items.length > 0 ? items : fallback;
  };

  const fallback = offlineSummary(vouchers, locale);
  return {
    summary,
    highlights: list(value.highlights, fallback.highlights),
    tips: list(value.tips, fallback.tips),
    source: "llm",
  };
}

/** 未配置 LLM 或调用失败时：直接用凭证明细拼一份朴素摘要 */
function offlineSummary(vouchers: TripSummaryVoucherInput[], locale: Locale): TripSummary {
  const en = locale === "en";
  const counts = new Map<string, number>();
  for (const voucher of vouchers) {
    counts.set(voucher.categoryLabel, (counts.get(voucher.categoryLabel) ?? 0) + 1);
  }
  const parts = [...counts.entries()].map(([label, count]) => `${label} ×${count}`);
  const summary = en
    ? `This trip includes ${vouchers.length} on-chain vouchers (${parts.join(", ")}). Scan the voucher QR code at the merchant to redeem.`
    : `这趟行程共包含 ${vouchers.length} 张链上凭证（${parts.join("、")}），凭证二维码可在商户处直接扫码核销。`;

  const highlights = vouchers
    .slice(0, 4)
    .map((voucher) => voucher.title.replace(/^.*?·\s*/, "").slice(0, 24));

  return {
    summary,
    highlights:
      highlights.length > 0
        ? highlights
        : [pick(locale, "查看凭证明细了解具体安排", "Check the voucher details for the full plan")],
    tips: en
      ? ["Watch the times and venues on your vouchers on travel days", "Show the voucher QR code at the merchant to redeem"]
      : ["出行当天请留意凭证上的时间与地点信息", "商户核销时出示凭证二维码即可"],
    source: "offline",
  };
}
