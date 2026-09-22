import { env, hasLLM } from "../env";
import { chatJson } from "../llm";
import {
  compressOffers,
  searchAttractions,
  searchFlights,
  searchHotels,
  searchRestaurants,
} from "../mock/inventory";
import {
  buildDay,
  buildQuote,
  dayDate,
  deterministicOutline,
  fillPrices,
  type PlanOffers,
} from "../mock/demo-run";
import { offersByRun } from "../store";
import type { ItineraryDay, StreamEvent, TripRequest } from "../types";
import {
  DAY_SYSTEM,
  OUTLINE_SYSTEM,
  PARSE_SYSTEM,
  dayUser,
  outlineUser,
  parseUser,
} from "./prompts";
import { coerceOutline, type Outline } from "./schemas";

/**
 * 两段式编排（骨架 + 逐日并行）。
 *
 * 教训来自参考项目：别让模型做算术和地理计算，别让它一次吐完整份行程。
 * 拆成「骨架 + 逐日并行」能把首字延迟从 100s 级降到 20s 级，
 * 且单日失败可以降级为占位安排，不会拖垮整份行程。
 */

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
  emit: Emit;
}): Promise<PlanResult> {
  const { runId, tripId, emit } = params;
  let degraded = false;

  // ① 理解需求 ------------------------------------------------------------
  emit({ type: "agent.status", phase: "understanding", label: "正在理解你的需求…" });

  let request = params.request;
  if (request.rawText && hasLLM) {
    try {
      const extracted = await chatJson<Partial<TripRequest>>({
        system: PARSE_SYSTEM,
        user: parseUser(request.rawText),
        maxTokens: 500,
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
    } catch (error) {
      console.error("[planner] 需求解析失败，沿用前端传入参数:", error);
    }
  }

  emit({
    type: "run.start",
    runId,
    request,
  });

  const summary =
    `收到：${request.origin} 出发去 ${request.destination}，` +
    `${request.days} 天 ${request.pax} 人，预算 ${request.budget} 美元。` +
    (request.preferences.length
      ? `偏好是「${request.preferences.join("、")}」，我会据此调整节奏与餐食标准。`
      : "我会按舒适档位安排，兼顾通勤成本与餐食质量。");

  await emitDelta(emit, summary);

  // ② 询价 ----------------------------------------------------------------
  emit({ type: "agent.status", phase: "sourcing", label: "正在向 4 家服务商 Agent 询价…" });

  emit({ type: "tool.call", name: "search_flights", args: { to: request.destination, pax: request.pax } });
  const flights = await searchFlights(request, tripId);
  emit({ type: "tool.result", name: "search_flights", data: { count: flights.items.length }, ms: flights.ms });
  emit({ type: "offer.flight", items: flights.items });

  emit({ type: "tool.call", name: "search_hotels", args: { city: request.destination, rooms: request.rooms } });
  const hotels = await searchHotels(request, tripId);
  emit({ type: "tool.result", name: "search_hotels", data: { count: hotels.items.length }, ms: hotels.ms });
  emit({ type: "offer.hotel", items: hotels.items });

  emit({ type: "tool.call", name: "search_attractions", args: { city: request.destination, styles: request.preferences } });
  const attractions = await searchAttractions(request, tripId);
  emit({ type: "tool.result", name: "search_attractions", data: { count: attractions.items.length }, ms: attractions.ms });
  emit({ type: "offer.attraction", items: attractions.items });

  emit({ type: "tool.call", name: "search_restaurants", args: { city: request.destination, styles: request.preferences } });
  const restaurants = await searchRestaurants(request, tripId);
  emit({ type: "tool.result", name: "search_restaurants", data: { count: restaurants.items.length }, ms: restaurants.ms });
  emit({ type: "offer.dining", items: restaurants.items });

  const offers: PlanOffers = {
    flights: flights.items,
    hotels: hotels.items,
    attractions: attractions.items,
    restaurants: restaurants.items,
  };
  offersByRun.set(runId, offers);

  // ③ 骨架 ----------------------------------------------------------------
  emit({ type: "agent.status", phase: "planning", label: "正在编排逐日行程…" });

  let outline: Outline;
  try {
    outline = await chatJson<Outline>({
      system: OUTLINE_SYSTEM,
      user: outlineUser(request, compressOffers(offers)),
      maxTokens: 4000,
      timeoutMs: 45_000,
    });
    const coerced = coerceOutline(outline);
    if (!coerced) throw new Error("骨架格式不合法");
    outline = coerced;
  } catch (error) {
    console.error("[planner] 骨架生成失败，改用确定性骨架:", error);
    degraded = true;
    emit({ type: "run.degraded", reason: "模型编排失败，已切换为确定性行程" });
    outline = deterministicOutline(request, offers);
  }

  // 骨架天数与需求天数不一致时以需求为准
  const dayCount = Math.max(1, Math.min(request.days, outline.days.length || request.days));
  const skeletons = outline.days.slice(0, dayCount);

  // ④ 逐日展开（并发） ------------------------------------------------------
  const tasks = skeletons.map((skeleton, position) => async () => {
    const date = dayDate(request, skeleton.index);
    const base = buildDay(skeleton.index, date, skeleton.theme, skeleton.picks, offers);
    const priced = fillPrices(base, offers, request.pax);

    emit({ type: "day.start", index: skeleton.index, date, theme: skeleton.theme });

    const itemLines = priced.items.map(
      (item) =>
        `${item.time} ${item.title}${item.note ? `（${item.note}）` : ""}`
    );

    let narrative: string | null = null;
    if (hasLLM) {
      try {
        narrative = await dayNarrative(request, {
          index: skeleton.index,
          date,
          theme: skeleton.theme,
          items: itemLines,
          tips: skeleton.tips,
        });
      } catch (error) {
        console.error(`[planner] 第 ${skeleton.index + 1} 天叙述生成失败:`, error);
      }
    }

    const fallbackText =
      `${skeleton.theme}：${priced.items.map((item) => `${item.time} ${item.title}`).join("；")}。` +
      (skeleton.tips ? ` ${skeleton.tips}` : "");

    await emitDelta(emit, narrative ?? fallbackText, position * 120);

    emit({ type: "day.done", index: skeleton.index, day: priced });
    return priced;
  });

  const days = (await runWithConcurrency(tasks, env.SYNTH_DAY_CONCURRENCY))
    .filter((day): day is ItineraryDay => Boolean(day))
    .sort((a, b) => a.index - b.index);

  // ⑤ 预算与报价单 ----------------------------------------------------------
  emit({ type: "agent.status", phase: "budgeting", label: "正在核算预算…" });

  const { quote, budgetItems } = buildQuote({ runId, tripId, request, offers, days });

  emit({
    type: "budget.update",
    total: quote.totalUsd,
    items: budgetItems,
    budget: request.budget,
  });

  emit({
    type: "agent.status",
    phase: "done",
    label: `行程已就绪：${days.length} 天，合计 ${quote.totalUsd} 美元`,
  });
  emit({ type: "quote.ready", quote });

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
  day: { index: number; date: string; theme: string; items: string[]; tips: string }
): Promise<string | null> {
  let text = "";
  try {
    const json = await chatJson<{ narrative: string }>({
      system: DAY_SYSTEM,
      user: dayUser(request, day),
      maxTokens: 600,
      timeoutMs: 35_000,
    });
    text = json.narrative ?? "";
  } catch {
    return null;
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
        console.error("[planner] 并发任务失败:", error);
      }
    }
  });

  await Promise.all(workers);
  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
