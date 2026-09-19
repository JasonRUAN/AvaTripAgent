"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";
import { consumeSSE } from "@/lib/sse-client";
import { buildDemoEvents } from "@/lib/demo-fixture";
import { BACKEND_URL } from "@/lib/contracts";
import {
  PLAN_CACHE_KEY,
  clearCheckoutSnapshot,
  readSession,
  removeSession,
  writeSession,
} from "@/lib/session-cache";
import type {
  AttractionOffer,
  DiningOffer,
  FlightOffer,
  HotelOffer,
  ItineraryDay,
  Phase,
  Quote,
  StreamEvent,
  ToolName,
  TripRequest,
} from "@/lib/types";

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
  budget?: { total: number; items: { label: string; category: number; amount: number }[]; budget: number };
  quote?: Quote;
  error?: string;
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
};

const TOOL_LABEL: Record<string, string> = {
  search_flights: "查询航班",
  search_hotels: "查询酒店",
  search_attractions: "查询景点",
  search_restaurants: "查询餐厅",
  quote_total: "汇总报价",
};

export function toolLabel(name: string): string {
  return TOOL_LABEL[name] ?? name;
}

// ---------------------------------------------------------------- 跨路由 store
//
// 顶部导航是路由跳转（/ → /vouchers → /merchant），切走时工作台整树卸载。
// 把规划状态放在模块级 store 里，SSE 流在后台继续写入，切回来数据还在；
// 同时镜像到 sessionStorage，整刷页面后也能恢复快照。

interface PlanStore {
  state: RunState;
  /** 最近一次提交的行程需求，用于切页后恢复左侧表单 */
  request: TripRequest | null;
}

/** SSR / hydration 阶段使用的固定快照 */
const SERVER_STORE: PlanStore = { state: INITIAL, request: null };

let cachedStore: PlanStore | null = null;

function loadStore(): PlanStore {
  if (cachedStore) return cachedStore;
  const raw = readSession<{ state?: RunState; request?: TripRequest | null }>(PLAN_CACHE_KEY);
  if (raw?.state) {
    // 整刷后旧的 SSE 消费者已不存在，running 快照定格为 done
    const state: RunState =
      raw.state.status === "running" ? { ...raw.state, status: "done" } : raw.state;
    cachedStore = { state, request: raw.request ?? null };
    return cachedStore;
  }
  cachedStore = { state: INITIAL, request: null };
  return cachedStore;
}

const listeners = new Set<() => void>();

function updateStore(recipe: (prev: PlanStore) => PlanStore): void {
  cachedStore = recipe(loadStore());
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

      case "quote.ready":
        return { ...draft, quote: event.quote };

      case "run.degraded":
        return { ...draft, degraded: true };

      case "run.error":
        return { ...draft, status: "error", error: event.message };

      case "run.done":
        return { ...draft, status: "done" };

      default:
        return draft;
    }
  }, []);

  /** 播放预置离线流（带节奏，观感接近真实 SSE） */
  const playOffline = useCallback(
    async (request: TripRequest) => {
      patchState((prev) => ({ ...prev, offline: true, status: "running", thought: "" }));
      const events = buildDemoEvents(request);

      for (const event of events) {
        await sleep(event.type === "agent.delta" ? 26 : 140);
        patchState((prev) => applyEvent(event, prev));
      }
    },
    [applyEvent]
  );

  const start = useCallback(
    async (request: TripRequest) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      updateStore((prev) => ({ ...prev, request, state: { ...INITIAL, status: "running" } }));

      let runId: string | undefined;
      try {
        const response = await fetch(`${BACKEND_URL}/api/runs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request, rawText: request.rawText }),
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
        controller.signal
      );

      // 流结束时若仍没有报价单（后端中途失败），补一遍离线流
      patchState((prev) => {
        if (prev.quote || prev.offline) return prev;
        if (prev.status === "error") return prev;
        void playOffline(request);
        return prev;
      });
    },
    [applyEvent, playOffline]
  );

  /** 用户主动「重新规划」：清空规划与结算缓存 */
  const reset = useCallback(() => {
    abortRef.current?.abort();
    clearCheckoutSnapshot();
    updateStore(() => ({ state: INITIAL, request: null }));
    removeSession(PLAN_CACHE_KEY);
  }, []);

  return { state: store.state, lastRequest: store.request, start, reset };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
