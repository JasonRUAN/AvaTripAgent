import { env, hasLLM } from "../shared/env";
import { createLogger, startTimer } from "../shared/logger";
import { chatJson } from "../shared/llm";
import { cityName } from "../shared/catalog";
import { compressOffers, localeOf } from "../shared/inventory";
import { pick, type Locale } from "../shared/locale";
import {
  buildDay,
  buildQuote,
  dayDate,
  deterministicOutline,
  fillPrices,
  type PlanOffers,
} from "../shared/demo-run";
import { offersByRun } from "../shared/store";
import { rankOffers, scoresFromProfiles } from "../shared/recommend";
import type {
  ItineraryDay,
  ProviderSelectionInput,
  RecommendMode,
  StreamEvent,
  TripRequest,
} from "../shared/types";
import { DEFAULT_RECOMMEND_MODE, RECOMMEND_MODE_LABEL, parseRecommendMode } from "../shared/types";
import {
  PARSE_SYSTEM,
  daySystem,
  dayUser,
  outlineSystem,
  outlineUser,
  parseUser,
} from "../shared/prompts";
import { coerceOutline, type Outline } from "../shared/schemas";
import { pickProviders } from "./registry";
import { rfqAll } from "./rfq";

/**
 * 两段式编排（骨架 + 逐日并行）。
 *
 * 教训来自参考项目：别让模型做算术和地理计算，别让它一次吐完整份行程。
 * 拆成「骨架 + 逐日并行」能把首字延迟从 100s 级降到 20s 级，
 * 且单日失败可以降级为占位安排，不会拖垮整份行程。
 */

const log = createLogger("planner");

export type Emit = (event: StreamEvent) => void;

export interface PlanResult {
  request: TripRequest;
  days: ItineraryDay[];
  quote: Awaited<ReturnType<typeof buildQuote>>["quote"];
  degraded: boolean;
}

export async function runPlan(params: {
  runId: string;
  tripId: string;
  request: TripRequest;
  providers?: ProviderSelectionInput;
  recommendMode?: RecommendMode;
  emit: Emit;
}): Promise<PlanResult> {
  const { runId, tripId, emit } = params;
  let degraded = false;
  // 规划语言以需求原文为准：中文需求 → 中文回答；英文需求 → 英文回答
  let locale: Locale = localeOf(params.request);
  const planLog = log.child({ runId, tripId });
  const elapsed = startTimer();

  planLog.info("开始规划", {
    origin: params.request.origin,
    destination: params.request.destination,
    days: params.request.days,
    pax: params.request.pax,
    budget: params.request.budget,
    preferences: params.request.preferences,
    rawText: Boolean(params.request.rawText),
    llm: hasLLM,
  });

  // ① 理解需求 ------------------------------------------------------------
  emit({
    type: "agent.status",
    phase: "understanding",
    label: pick(locale, "正在理解你的需求…", "Understanding your trip…"),
  });

  let request = params.request;
  if (request.rawText && hasLLM) {
    try {
      const extracted = await chatJson<Partial<TripRequest>>({
        system: PARSE_SYSTEM,
        user: parseUser(request.rawText),
        maxTokens: 800,
        temperature: 0,
        timeoutMs: 25_000,
      });
      // startDate 特殊处理：原文没写日期时模型只能凭空编一个（会把表单里
      // 用户选好的「出发日期」冲掉），所以只有原文确实提到日期才采纳模型结果。
      request = {
        ...request,
        ...extracted,
        startDate: dateFromText(request.rawText, request.startDate) ?? request.startDate,
        rawText: request.rawText,
      };
      planLog.info("需求解析完成", {
        ms: elapsed(),
        parsed: {
          origin: request.origin,
          destination: request.destination,
          days: request.days,
          pax: request.pax,
          budget: request.budget,
          startDate: request.startDate,
        },
      });
    } catch (error) {
      planLog.error("需求解析失败，沿用前端传入参数", { ms: elapsed() }, error);
    }
  }

  emit({
    type: "run.start",
    runId,
    request,
  });

  // 解析层统一把城市名归一成中文（见 PARSE_SYSTEM），英文回答时需按 locale 翻译
  const originLabel = cityName(request.origin, locale);
  const destinationLabel = cityName(request.destination, locale);

  const summary = pick(
    locale,
    `收到：${request.origin} 出发去 ${request.destination}，` +
      `${request.days} 天 ${request.pax} 人，预算 ${request.budget} 美元。` +
      (request.preferences.length
        ? `偏好是「${request.preferences.join("、")}」，我会据此调整节奏与餐食标准。`
        : "我会按舒适档位安排，兼顾通勤成本与餐食质量。"),
    `Got it: ${destinationLabel} from ${originLabel}, ` +
      `${request.days} days for ${request.pax}, budget $${request.budget}.` +
      (request.preferences.length
        ? ` Preferences: "${request.preferences.join('", "')}" — I'll tune the pace and dining accordingly.`
        : " I'll plan at a comfortable tier, balancing transit cost and dining quality.")
  );

  await emitDelta(emit, summary);

  // ② 询价 ----------------------------------------------------------------
  emit({
    type: "agent.status",
    phase: "sourcing",
    label: pick(locale, "正在选择服务商并向其询价…", "Requesting quotes from providers…"),
  });
  const recommendMode = parseRecommendMode(params.recommendMode ?? DEFAULT_RECOMMEND_MODE);
  const selected = await pickProviders(params.providers);
  const names: Record<string, string> = {};
  const scoreRows: Array<{
    address: `0x${string}`;
    ratingAvg: number;
    ratingCount: number;
    ratingAvgX100: number;
    name: string;
  }> = [];
  for (const profiles of Object.values(selected)) {
    for (const profile of profiles) {
      names[profile.address.toLowerCase()] = profile.name;
      scoreRows.push(profile);
    }
  }
  const scores = scoresFromProfiles(scoreRows);

  emit({
    type: "tool.call",
    name: "search_flights",
    args: {
      to: destinationLabel,
      pax: request.pax,
      agents: selected.flight.map((agent) => agent.name),
      scores: selected.flight.map((agent) => agent.ratingAvg),
    },
  });
  emit({
    type: "tool.call",
    name: "search_hotels",
    args: {
      city: destinationLabel,
      agents: selected.hotel.map((agent) => agent.name),
      scores: selected.hotel.map((agent) => agent.ratingAvg),
    },
  });
  emit({
    type: "tool.call",
    name: "search_attractions",
    args: {
      city: destinationLabel,
      agents: selected.attraction.map((agent) => agent.name),
      scores: selected.attraction.map((agent) => agent.ratingAvg),
    },
  });
  emit({
    type: "tool.call",
    name: "search_restaurants",
    args: {
      city: destinationLabel,
      agents: selected.dining.map((agent) => agent.name),
      scores: selected.dining.map((agent) => agent.ratingAvg),
    },
  });

  const sourced = await rfqAll(selected, request, tripId);
  const offers: PlanOffers = rankOffers(
    {
      flights: sourced.flights,
      hotels: sourced.hotels,
      attractions: sourced.attractions,
      restaurants: sourced.restaurants,
    },
    recommendMode,
    request,
    scores
  );
  offersByRun.set(runId, offers);

  planLog.info("报价已就绪并排序", {
    ms: elapsed(),
    mode: recommendMode,
    counts: {
      flight: offers.flights.length,
      hotel: offers.hotels.length,
      attraction: offers.attractions.length,
      dining: offers.restaurants.length,
    },
  });

  emit({
    type: "tool.result",
    name: "search_flights",
    data: { count: offers.flights.length, agents: sourced.queried.flight },
    ms: sourced.timings.flight,
  });
  emit({ type: "offer.flight", items: offers.flights });
  emit({
    type: "tool.result",
    name: "search_hotels",
    data: { count: offers.hotels.length, agents: sourced.queried.hotel },
    ms: sourced.timings.hotel,
  });
  emit({ type: "offer.hotel", items: offers.hotels });
  emit({
    type: "tool.result",
    name: "search_attractions",
    data: { count: offers.attractions.length, agents: sourced.queried.attraction },
    ms: sourced.timings.attraction,
  });
  emit({ type: "offer.attraction", items: offers.attractions });
  emit({
    type: "tool.result",
    name: "search_restaurants",
    data: { count: offers.restaurants.length, agents: sourced.queried.dining },
    ms: sourced.timings.dining,
  });
  emit({ type: "offer.dining", items: offers.restaurants });

  // ③ 骨架 ----------------------------------------------------------------
  emit({
    type: "agent.status",
    phase: "planning",
    label: pick(locale, "正在编排逐日行程…", "Orchestrating the day-by-day itinerary…"),
  });

  let outline: Outline;
  const outlineElapsed = startTimer();
  try {
    outline = await chatJson<Outline>({
      system: outlineSystem(locale),
      user: outlineUser(
        request,
        compressOffers(offers, { names, scores, locale }),
        RECOMMEND_MODE_LABEL[recommendMode],
        locale
      ),
      maxTokens: 4000,
      timeoutMs: 45_000,
    });
    const coerced = coerceOutline(outline);
    if (!coerced) throw new Error("骨架格式不合法");
    outline = coerced;
    planLog.info("骨架生成完成", { ms: outlineElapsed(), days: outline.days.length });
  } catch (error) {
    planLog.error("骨架生成失败，改用确定性骨架", { ms: outlineElapsed() }, error);
    degraded = true;
    emit({
      type: "run.degraded",
      reason: pick(locale, "模型编排失败，已切换为确定性行程", "LLM orchestration failed, switched to the deterministic itinerary"),
    });
    outline = deterministicOutline(request, offers, locale);
  }

  // 骨架天数与需求天数不一致时以需求为准
  const dayCount = Math.max(1, Math.min(request.days, outline.days.length || request.days));
  const skeletons = outline.days.slice(0, dayCount);

  // ④ 逐日展开（并发） ------------------------------------------------------
  const dayElapsed = startTimer();
  planLog.info("开始逐日展开", {
    skeletons: skeletons.length,
    requestedDays: request.days,
    concurrency: env.SYNTH_DAY_CONCURRENCY,
  });
  const tasks = skeletons.map((skeleton, position) => async () => {
    const date = dayDate(request, skeleton.index);
    const base = buildDay(skeleton.index, date, skeleton.theme, skeleton.picks, offers, locale);
    const priced = fillPrices(base, offers, request.pax);

    emit({ type: "day.start", index: skeleton.index, date, theme: skeleton.theme });

    const itemLines = priced.items.map(
      (item) =>
        `${item.time} ${item.title}${item.note ? pick(locale, `（${item.note}）`, ` (${item.note})`) : ""}`
    );

    let narrative: string | null = null;
    if (hasLLM) {
      try {
        narrative = await dayNarrative(request, locale, {
          index: skeleton.index,
          date,
          theme: skeleton.theme,
          items: itemLines,
          tips: skeleton.tips,
        });
      } catch (error) {
        planLog.error("当日叙述生成失败，改用占位文本", { day: skeleton.index + 1 }, error);
      }
    }

    const fallbackText =
      `${skeleton.theme}${pick(locale, "：", ": ")}${priced.items.map((item) => `${item.time} ${item.title}`).join(pick(locale, "；", "; "))}。` +
      (skeleton.tips ? ` ${skeleton.tips}` : "");

    await emitDelta(emit, narrative ?? fallbackText, position * 120);

    emit({ type: "day.done", index: skeleton.index, day: priced });
    return priced;
  });

  const days = (await runWithConcurrency(tasks, env.SYNTH_DAY_CONCURRENCY))
    .filter((day): day is ItineraryDay => Boolean(day))
    .sort((a, b) => a.index - b.index);

  if (days.length !== tasks.length) {
    planLog.error("部分日期展开失败", { expected: tasks.length, actual: days.length });
  }
  planLog.info("逐日展开完成", { ms: dayElapsed(), days: days.length });

  // ⑤ 预算与报价单 ----------------------------------------------------------
  emit({
    type: "agent.status",
    phase: "budgeting",
    label: pick(locale, "正在核算预算…", "Crunching the budget…"),
  });

  const { quote, budgetItems } = buildQuote({
    runId,
    tripId,
    request,
    offers,
    days,
    providerNames: names,
    locale,
  });

  emit({
    type: "budget.update",
    total: quote.totalUsd,
    items: budgetItems,
    budget: request.budget,
  });

  emit({
    type: "agent.status",
    phase: "done",
    label: pick(
      locale,
      `行程已就绪：${days.length} 天，合计 ${quote.totalUsd} 美元`,
      `Itinerary ready: ${days.length} days, $${quote.totalUsd} total`
    ),
  });
  emit({ type: "quote.ready", quote });

  planLog.info("规划结束", {
    ms: elapsed(),
    days: days.length,
    totalUsd: quote.totalUsd,
    total: quote.total,
    degraded,
  });

  return { request, days, quote, degraded };
}

/**
 * 从自然语言里认出用户**明确写出**的出发日期，支持
 * `2026-10-01`、`2026/10/1`、`2026.10.1`、`2026年10月1日`、`10月1日`、`10/1`。
 *
 * 认不出来就返回 null：调用方应沿用表单里选定的日期，
 * 而不是采信模型编造的「一个合理的未来日期」。
 */
export function dateFromText(text: string, baseDate: string): string | null {
  const full = text.match(/(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*[日号]?/);
  if (full) {
    const iso = toIsoDate(Number(full[1]), Number(full[2]), Number(full[3]));
    if (iso) return iso;
  }

  const year = Number(baseDate.slice(0, 4)) || new Date().getFullYear();

  const monthDay = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/);
  if (monthDay) {
    const iso = toIsoDate(year, Number(monthDay[1]), Number(monthDay[2]));
    if (iso) return iso;
  }

  // 纯数字简写（10/1、10-1）放在最后，避免误伤价格、时长里的数字组合
  const short = text.match(/(?:^|[^\d])(\d{1,2})\s*[/-]\s*(\d{1,2})(?![\d])/);
  if (short) {
    const iso = toIsoDate(year, Number(short[1]), Number(short[2]));
    if (iso) return iso;
  }

  return null;
}

function toIsoDate(year: number, month: number, day: number): string | null {
  if (year < 2000 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

/** 单日叙述：流式吐出，失败由调用方降级 */
async function dayNarrative(
  request: TripRequest,
  locale: Locale,
  day: { index: number; date: string; theme: string; items: string[]; tips: string }
): Promise<string | null> {
  let text = "";
  try {
    const json = await chatJson<{ narrative: string }>({
      system: daySystem(locale),
      user: dayUser(request, day, locale),
      maxTokens: 1200,
      timeoutMs: 35_000,
    });
    text = json.narrative ?? "";
  } catch (error) {
    // 调用方只会看到「没叙述」，这里补一句才知道是 LLM 挂了还是输出为空
    log.warn("单日叙述生成失败，降级为占位文本", { day: day.index + 1, date: day.date }, error);
    return null;
  }
  if (!text) {
    log.warn("单日叙述为空，降级为占位文本", { day: day.index + 1, date: day.date });
  }
  return text || null;
}

/**
 * 以打字机节奏流式吐出确认文本。
 *
 * 注意：这里不再调用 LLM 重新生成——确认语已是编排好的自然语言，
 * 让模型转述只会引入不可控内容（曾把解析结果 JSON 原样流给用户）。
 */
async function emitDelta(emit: Emit, text: string, startDelayMs = 0): Promise<void> {
  if (startDelayMs > 0) await sleep(startDelayMs);

  const chunks = text.match(/[\s\S]{1,12}/g) ?? [];
  for (const chunk of chunks) {
    emit({ type: "agent.delta", text: chunk });
    await sleep(18);
  }
}

/** 简易并发池 */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  const size = Math.max(1, Math.min(limit, tasks.length));
  let cursor = 0;

  const workers = Array.from({ length: size }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= tasks.length) return;
      try {
        results[index] = await tasks[index]!();
      } catch (error) {
        log.error("并发任务失败", { task: index }, error);
      }
    }
  });

  await Promise.all(workers);
  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
