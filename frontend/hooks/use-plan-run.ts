"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";
import { consumeSSE } from "@/lib/sse-client";
import { buildDemoEvents } from "@/lib/demo-fixture";
import { useLocale } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/config";
import {
  PLAN_CACHE_KEY,
  clearCheckoutSnapshot,
  readSession,
  removeSession,
  writeSession,
} from "@/lib/session-cache";
import { BACKEND_URL } from "@/lib/contracts";
import type { BackendErrorPayload } from "@/lib/backend-error";
import {
  applySelection,
  fillDay,
  offerIdsOf,
  placementsFromDays,
  quoteFromSelection,
  recommendedOfferIds,
  type OfferKind,
} from "@/lib/offer-selection";
import {
  pickRecommendedIds,
  sameIdSet,
  scoresFromAgents,
  type ProviderScoreMap,
} from "@/lib/recommend";
import type {
  AttractionOffer,
  AgentProfile,
  DiningOffer,
  FlightOffer,
  HotelOffer,
  ItineraryDay,
  Phase,
  Quote,
  StreamEvent,
  ToolName,
  TripRequest,
  ProviderSelection,
  RecommendMode,
} from "@/lib/types";
import { DEFAULT_RECOMMEND_MODE, DEFAULT_TRIP_REQUEST, parseRecommendMode } from "@/lib/types";

export interface ToolCall {
  id: string;
  name: ToolName;
  args: Record<string, unknown>;
  ms?: number;
  count?: number;
}

export interface DayState {
  index: number;
  date: string;
  theme: string;
  text: string;
  day?: ItineraryDay;
}

export interface RunState {
  status: "idle" | "running" | "done" | "error";
  /** true = 走的离线兜底（后端不可达 / 模型失败） */
  offline: boolean;
  degraded: boolean;
  runId?: string;
  phase: Phase;
  thought: string;
  toolCalls: ToolCall[];
  offers: {
    flights: FlightOffer[];
    hotels: HotelOffer[];
    attractions: AttractionOffer[];
    dining: DiningOffer[];
  };
  days: DayState[];
  /** Agent 原始逐日行程，勾选增删都以它为底 */
  baseDays: ItineraryDay[];
  selectedOfferIds: string[];
  recommendedOfferIds: string[];
  recommendMode: RecommendMode;
  /** offerId → 用户指定的天 index，避免勾选后被启发式挪走 */
  offerPlacements: Record<string, number>;
  budget?: { total: number; items: { label: string; category: number; amount: number }[]; budget: number };
  quote?: Quote;
  /**
   * 后端报错。存 code + details 而不是成品文案：
   * 渲染时才按当前语言取字典，切语言后旧错误也能立刻换成对应语言。
   */
  error?: BackendErrorPayload;
}

const INITIAL: RunState = {
  status: "idle",
  offline: false,
  degraded: false,
  phase: "understanding",
  thought: "",
  toolCalls: [],
  offers: { flights: [], hotels: [], attractions: [], dining: [] },
  days: [],
  baseDays: [],
  selectedOfferIds: [],
  recommendedOfferIds: [],
  recommendMode: DEFAULT_RECOMMEND_MODE,
  offerPlacements: {},
};

/** 工具调用名的展示文案见 `lib/i18n/labels.ts` 的 `toolLabel(name, locale)` */

// ---------------------------------------------------------------- 跨路由 store
//
// 顶部导航是路由跳转（/ → /vouchers → /merchant），切走时工作台整树卸载。
// 把规划状态放在模块级 store 里，SSE 流在后台继续写入，切回来数据还在；
// 同时镜像到 sessionStorage，整刷页面后也能恢复快照。

interface PlanStore {
  state: RunState;
  /** 最近一次提交的行程需求，用于切页后恢复左侧表单 */
  request: TripRequest | null;
  providers: ProviderSelection;
  recommendMode: RecommendMode;
}

/** SSR / hydration 阶段使用的固定快照 */
const SERVER_STORE: PlanStore = {
  state: INITIAL,
  request: null,
  providers: {},
  recommendMode: DEFAULT_RECOMMEND_MODE,
};

let cachedStore: PlanStore | null = null;

/** 快照可能来自旧版本（error 曾是成品字符串），读取时放宽再归一 */
type SnapshotRunState = Omit<RunState, "error"> & {
  error?: BackendErrorPayload | string;
};

function hydrateState(raw: SnapshotRunState): RunState {
  const baseDays = raw.baseDays ?? raw.days.flatMap((day) => (day.day ? [day.day] : []));
  const recommended = raw.recommendedOfferIds ?? recommendedOfferIds(baseDays);
  return {
    ...INITIAL,
    ...raw,
    // 旧快照里的字符串错误没有 code：包成 payload，渲染时按原文兜底展示
    error: typeof raw.error === "string" ? { message: raw.error } : raw.error,
    status: raw.status === "running" ? "done" : raw.status,
    baseDays,
    recommendMode: parseRecommendMode(raw.recommendMode),
    recommendedOfferIds: recommended,
    selectedOfferIds: raw.selectedOfferIds ?? recommended,
    offerPlacements: raw.offerPlacements ?? placementsFromDays(raw.days.flatMap((day) => (day.day ? [day.day] : []))),
  };
}

function loadStore(): PlanStore {
  if (cachedStore) return cachedStore;
  const raw = readSession<{
    state?: RunState;
    request?: TripRequest | null;
    providers?: ProviderSelection;
    recommendMode?: RecommendMode;
  }>(PLAN_CACHE_KEY);
  if (raw?.state) {
    const recommendMode = parseRecommendMode(raw.recommendMode ?? raw.state.recommendMode);
    cachedStore = {
      state: hydrateState({ ...raw.state, recommendMode }),
      request: raw.request ?? null,
      providers: raw.providers ?? {},
      recommendMode,
    };
    return cachedStore;
  }
  cachedStore = {
    state: INITIAL,
    request: null,
    providers: {},
    recommendMode: DEFAULT_RECOMMEND_MODE,
  };
  return cachedStore;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(): void {
  const current = loadStore();
  if (!current.state.runId || current.state.offline) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const latest = loadStore();
    if (!latest.state.runId || latest.state.offline) return;
    void fetch(`${BACKEND_URL}/api/runs/${latest.state.runId}/selection`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selectedOfferIds: latest.state.selectedOfferIds,
        days: latest.state.days.flatMap((day) => (day.day ? [day.day] : [])),
        quote: latest.state.quote,
      }),
    }).catch(() => {
      // 离线或后端未起时保持本地勾选即可
    });
  }, 400);
}

function offerBundleOf(offers: RunState["offers"]) {
  return {
    flights: offers.flights,
    hotels: offers.hotels,
    attractions: offers.attractions,
    restaurants: offers.dining,
  };
}

function recommendedFromStrategy(
  state: RunState,
  request: TripRequest | null,
  mode: RecommendMode,
  scores: ProviderScoreMap
): string[] {
  if (
    state.offers.flights.length === 0 &&
    state.offers.hotels.length === 0 &&
    state.offers.attractions.length === 0 &&
    state.offers.dining.length === 0
  ) {
    return recommendedOfferIds(state.baseDays.length ? state.baseDays : currentDaysOf(state));
  }
  return pickRecommendedIds(
    offerBundleOf(state.offers),
    mode,
    request ?? DEFAULT_TRIP_REQUEST,
    scores
  );
}

function currentDaysOf(state: RunState): ItineraryDay[] {
  const fromState = state.days.flatMap((day) => (day.day ? [day.day] : []));
  return fromState.length > 0 ? fromState : state.baseDays;
}

function deriveFromSelection(
  prev: RunState,
  selectedIds: string[],
  request: TripRequest | null,
  locale: Locale,
  placements = prev.offerPlacements
): RunState {
  const pax = request?.pax ?? DEFAULT_TRIP_REQUEST.pax;
  const budget = request?.budget ?? prev.budget?.budget ?? DEFAULT_TRIP_REQUEST.budget;
  const nextDays = applySelection(
    currentDaysOf(prev),
    selectedIds,
    prev.offers,
    pax,
    locale,
    request,
    placements
  );
  const { quote, budgetItems } = quoteFromSelection({
    selectedIds,
    offers: prev.offers,
    days: nextDays,
    request: request ?? DEFAULT_TRIP_REQUEST,
    locale,
    previousQuote: prev.quote,
  });

  return {
    ...prev,
    selectedOfferIds: selectedIds,
    offerPlacements: { ...placements, ...placementsFromDays(nextDays) },
    days: nextDays.map((day) => {
      const existing = prev.days.find((entry) => entry.index === day.index);
      return existing
        ? { ...existing, day }
        : { index: day.index, date: day.date, theme: day.theme, text: "", day };
    }),
    quote,
    budget: {
      total: quote.totalUsd,
      items: budgetItems,
      budget,
    },
  };
}

const listeners = new Set<() => void>();

function updateStore(recipe: (prev: PlanStore) => PlanStore): void {
  const prev = loadStore();
  const next = recipe(prev);
  // recipe 返回原对象 = 本次没有任何变化。此时绝不能通知订阅者：
  // 否则「effect 里写 store → 通知 → 重渲染 → effect 再写」会形成无限更新。
  if (next === prev) return;
  cachedStore = next;
  writeSession(PLAN_CACHE_KEY, cachedStore);
  for (const listener of listeners) listener();
}

function patchState(recipe: (prev: RunState) => RunState): void {
  updateStore((prev) => ({ ...prev, state: recipe(prev.state) }));
}

function subscribeStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 规划流：真实后端优先，失败自动降级到预置离线流。
 *
 * 降级路径：
 *   1. POST /api/runs 失败（后端没起 / 网络断了）→ 直接播放 demo 事件
 *   2. SSE 中途报错且还没拿到报价单 → 播放 demo 事件补齐
 */
export function usePlanRun() {
  const { locale } = useLocale();
  const store = useSyncExternalStore(
    subscribeStore,
    loadStore,
    () => SERVER_STORE
  );
  const abortRef = useRef<AbortController | null>(null);

  const applyEvent = useCallback((event: StreamEvent, draft: RunState): RunState => {
    switch (event.type) {
      case "run.start":
        return { ...draft, runId: event.runId };

      case "agent.status":
        return { ...draft, phase: event.phase };

      case "agent.delta":
        return { ...draft, thought: draft.thought + event.text };

      case "tool.call":
        return {
          ...draft,
          toolCalls: [
            ...draft.toolCalls,
            { id: `${event.name}-${draft.toolCalls.length}`, name: event.name, args: event.args },
          ],
        };

      case "tool.result": {
        const calls = draft.toolCalls.map((call, index) =>
          index === draft.toolCalls.length - 1 || call.name === event.name
            ? { ...call, ms: event.ms, count: (event.data as { count?: number })?.count }
            : call
        );
        return { ...draft, toolCalls: calls };
      }

      case "offer.flight":
        return { ...draft, offers: { ...draft.offers, flights: event.items } };

      case "offer.hotel":
        return { ...draft, offers: { ...draft.offers, hotels: event.items } };

      case "offer.attraction":
        return { ...draft, offers: { ...draft.offers, attractions: event.items } };

      case "offer.dining":
        return { ...draft, offers: { ...draft.offers, dining: event.items } };

      case "day.start":
        return {
          ...draft,
          days: [
            ...draft.days.filter((d) => d.index !== event.index),
            { index: event.index, date: event.date, theme: event.theme, text: "" },
          ].sort((a, b) => a.index - b.index),
        };

      case "day.delta":
        return {
          ...draft,
          days: draft.days.map((d) =>
            d.index === event.index ? { ...d, text: d.text + event.text } : d
          ),
        };

      case "day.done":
        return {
          ...draft,
          days: draft.days.map((d) => (d.index === event.index ? { ...d, day: event.day } : d)),
        };

      case "budget.update":
        return { ...draft, budget: event as RunState["budget"] };

      case "quote.ready": {
        const completed = draft.days.flatMap((day) => (day.day ? [day.day] : []));
        const store = loadStore();
        const mode = store.recommendMode;
        const recommended = recommendedFromStrategy(
          { ...draft, baseDays: draft.baseDays.length > 0 ? draft.baseDays : completed },
          store.request,
          mode,
          {}
        );
        const fallback = recommendedOfferIds(completed);
        const nextRecommended = recommended.length > 0 ? recommended : fallback;
        const selected =
          draft.selectedOfferIds.length > 0 ? draft.selectedOfferIds : nextRecommended;
        return deriveFromSelection(
          {
            ...draft,
            quote: event.quote,
            recommendMode: mode,
            baseDays: draft.baseDays.length > 0 ? draft.baseDays : completed,
            recommendedOfferIds:
              draft.recommendedOfferIds.length > 0 ? draft.recommendedOfferIds : nextRecommended,
            selectedOfferIds: selected,
          },
          selected,
          store.request,
          locale
        );
      }

      case "run.degraded":
        return { ...draft, degraded: true };

      case "run.error":
        return {
          ...draft,
          status: "error",
          error: { code: event.code, message: event.message, details: event.details },
        };

      case "run.done":
        return { ...draft, status: "done" };

      default:
        return draft;
    }
  }, [locale]);

  /** 播放预置离线流（带节奏，观感接近真实 SSE） */
  const playOffline = useCallback(
    async (request: TripRequest) => {
      patchState((prev) => ({ ...prev, offline: true, status: "running", thought: "" }));
      // 离线流的文案（机场 / 酒店 / 每日主题 / 阶段提示）按当前语言生成
      const events = buildDemoEvents(request, locale);

      for (const event of events) {
        await sleep(event.type === "agent.delta" ? 26 : 140);
        patchState((prev) => applyEvent(event, prev));
      }
    },
    [applyEvent, locale]
  );

  const start = useCallback(
    async (request: TripRequest, providers?: ProviderSelection, recommendMode?: RecommendMode) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const mode = parseRecommendMode(recommendMode);

      updateStore((prev) => ({
        ...prev,
        request,
        providers: providers ?? {},
        recommendMode: mode,
        state: { ...INITIAL, status: "running", recommendMode: mode },
      }));

      let runId: string | undefined;
      try {
        const response = await fetch(`${BACKEND_URL}/api/runs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request, rawText: request.rawText, providers, recommendMode: mode }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`后端返回 ${response.status}`);
        const payload = (await response.json()) as { runId: string };
        runId = payload.runId;
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return;
        console.error("[plan] 后端不可达，切换离线兜底:", error);
        await playOffline(request);
        return;
      }

      patchState((prev) => ({ ...prev, runId }));

      await consumeSSE<StreamEvent>(
        `${BACKEND_URL}/api/runs/${runId}/stream`,
        { method: "GET" },
        {
          onEvent: (event) => patchState((prev) => applyEvent(event, prev)),
          onError: async (error) => {
            console.error("[plan] SSE 出错，切换离线兜底:", error);
            if (!loadStore().state.quote) await playOffline(request);
          },
        },
        controller.signal,
        locale
      );

      // 流结束时若仍没有报价单（后端中途失败），补一遍离线流
      const finished = loadStore().state;
      if (!finished.quote && !finished.offline && finished.status !== "error") {
        await playOffline(request);
      }
    },
    [applyEvent, playOffline, locale]
  );

  /** 用户主动「重新规划」：清空规划与结算缓存 */
  const reset = useCallback(() => {
    abortRef.current?.abort();
    clearCheckoutSnapshot();
    updateStore(() => ({
      state: INITIAL,
      request: null,
      providers: {},
      recommendMode: DEFAULT_RECOMMEND_MODE,
    }));
    removeSession(PLAN_CACHE_KEY);
  }, []);

  const toggleOffer = useCallback((id: string) => {
    updateStore((prev) => {
      const selected = new Set(prev.state.selectedOfferIds);
      const placements = { ...prev.state.offerPlacements };
      if (selected.has(id)) {
        selected.delete(id);
        delete placements[id];
      } else {
        selected.add(id);
      }
      return { ...prev, state: deriveFromSelection(prev.state, [...selected], prev.request, locale, placements) };
    });
    schedulePersist();
  }, [locale]);

  const setCategorySelection = useCallback((kind: OfferKind, mode: "all" | "none") => {
    updateStore((prev) => {
      const ids = offerIdsOf(prev.state.offers, kind);
      const selected = new Set(prev.state.selectedOfferIds);
      const placements = { ...prev.state.offerPlacements };
      if (mode === "all") ids.forEach((id) => selected.add(id));
      else {
        ids.forEach((id) => {
          selected.delete(id);
          delete placements[id];
        });
      }
      return { ...prev, state: deriveFromSelection(prev.state, [...selected], prev.request, locale, placements) };
    });
    schedulePersist();
  }, [locale]);

  const addOfferToDay = useCallback((dayIndex: number, offerId: string) => {
    updateStore((prev) => {
      const selected = new Set(prev.state.selectedOfferIds);
      selected.add(offerId);
      const placements = { ...prev.state.offerPlacements, [offerId]: dayIndex };
      return { ...prev, state: deriveFromSelection(prev.state, [...selected], prev.request, locale, placements) };
    });
    schedulePersist();
  }, [locale]);

  const removeDayItem = useCallback((dayIndex: number, itemIndex: number) => {
    updateStore((prev) => {
      const days = currentDaysOf(prev.state).map((day) => ({
        ...day,
        items: [...day.items],
      }));
      const target = days.find((day) => day.index === dayIndex);
      const item = target?.items[itemIndex];
      if (!target || !item) return prev;

      if (item.offerId) {
        const selected = prev.state.selectedOfferIds.filter((id) => id !== item.offerId);
        const placements = { ...prev.state.offerPlacements };
        delete placements[item.offerId];
        target.items.splice(itemIndex, 1);
        return {
          ...prev,
          state: deriveFromSelection(
            { ...prev.state, days: stampDays(prev.state, days) },
            selected,
            prev.request,
            locale,
            placements
          ),
        };
      }

      target.items.splice(itemIndex, 1);
      const pax = prev.request?.pax ?? DEFAULT_TRIP_REQUEST.pax;
      const filled = days.map((day) => fillDay(day, prev.state.offers, pax));
      const next = deriveFromSelection(
        { ...prev.state, days: stampDays(prev.state, filled) },
        prev.state.selectedOfferIds,
        prev.request,
        locale
      );
      return { ...prev, state: next };
    });
    schedulePersist();
  }, [locale]);

  const setRecommendMode = useCallback((mode: RecommendMode, agents: AgentProfile[] = []) => {
    const parsed = parseRecommendMode(mode);
    updateStore((prev) => {
      const scores = scoresFromAgents(agents);
      const recommended = recommendedFromStrategy(prev.state, prev.request, parsed, scores);
      const follows = sameIdSet(prev.state.selectedOfferIds, prev.state.recommendedOfferIds);

      // 幂等：模式与推荐集都没变时直接返回原对象，updateStore 会跳过通知。
      // 没有这道闸门，重复的 setRecommendMode 会不断生成新的 quote 对象，
      // 让依赖 quote 的 effect 反复触发（Maximum update depth exceeded）。
      if (
        prev.recommendMode === parsed &&
        prev.state.recommendMode === parsed &&
        sameIdSet(recommended, prev.state.recommendedOfferIds) &&
        (!follows || sameIdSet(prev.state.selectedOfferIds, recommended))
      ) {
        return prev;
      }

      const nextState = follows
        ? deriveFromSelection(
            { ...prev.state, recommendMode: parsed, recommendedOfferIds: recommended },
            recommended,
            prev.request,
            locale
          )
        : { ...prev.state, recommendMode: parsed, recommendedOfferIds: recommended };
      return { ...prev, recommendMode: parsed, state: nextState };
    });
    schedulePersist();
  }, [locale]);

  const applyRecommended = useCallback(() => {
    updateStore((prev) => ({
      ...prev,
      state: deriveFromSelection(prev.state, prev.state.recommendedOfferIds, prev.request, locale),
    }));
    schedulePersist();
  }, [locale]);

  const addCustomToDay = useCallback(
    (dayIndex: number, draft: { time: string; title: string; note?: string }) => {
      const title = draft.title.trim();
      if (!title) return;
      updateStore((prev) => {
        const days = currentDaysOf(prev.state).map((day) => ({
          ...day,
          items: [...day.items],
        }));
        const target = days.find((day) => day.index === dayIndex);
        if (!target) return prev;
        target.items.push({
          time: draft.time.trim(),
          title,
          note: draft.note?.trim() || undefined,
        });
        const pax = prev.request?.pax ?? DEFAULT_TRIP_REQUEST.pax;
        const filled = days.map((day) => fillDay(day, prev.state.offers, pax));
        return {
          ...prev,
          state: deriveFromSelection(
            { ...prev.state, days: stampDays(prev.state, filled) },
            prev.state.selectedOfferIds,
            prev.request,
            locale
          ),
        };
      });
      schedulePersist();
    },
    [locale]
  );

  return {
    state: store.state,
    lastRequest: store.request,
    start,
    reset,
    toggleOffer,
    setCategorySelection,
    addOfferToDay,
    removeDayItem,
    addCustomToDay,
    setRecommendMode,
    applyRecommended,
  };
}

function stampDays(prev: RunState, days: ItineraryDay[]): DayState[] {
  return days.map((day) => {
    const existing = prev.days.find((entry) => entry.index === day.index);
    return existing
      ? { ...existing, day }
      : { index: day.index, date: day.date, theme: day.theme, text: "", day };
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
