"use client";

import { useCallback, useRef, useState } from "react";
import { consumeSSE } from "@/lib/sse-client";
import { buildDemoEvents } from "@/lib/demo-fixture";
import { BACKEND_URL } from "@/lib/contracts";
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

/**
 * 规划流：真实后端优先，失败自动降级到预置离线流。
 *
 * 降级路径：
 *   1. POST /api/runs 失败（后端没起 / 网络断了）→ 直接播放 demo 事件
 *   2. SSE 中途报错且还没拿到报价单 → 播放 demo 事件补齐
 */
export function usePlanRun() {
  const [state, setState] = useState<RunState>(INITIAL);
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
      setState((prev) => ({ ...prev, offline: true, status: "running", thought: "" }));
      const events = buildDemoEvents(request);

      for (const event of events) {
        await sleep(event.type === "agent.delta" ? 26 : 140);
        setState((prev) => applyEvent(event, prev));
      }
    },
    [applyEvent]
  );

  const start = useCallback(
    async (request: TripRequest) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({ ...INITIAL, status: "running" });

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

      setState((prev) => ({ ...prev, runId }));

      await consumeSSE<StreamEvent>(
        `${BACKEND_URL}/api/runs/${runId}/stream`,
        { method: "GET" },
        {
          onEvent: (event) => setState((prev) => applyEvent(event, prev)),
          onError: async (error) => {
            console.error("[plan] SSE 出错，切换离线兜底:", error);
            if (!state.quote) await playOffline(request);
          },
        },
        controller.signal
      );

      // 流结束时若仍没有报价单（后端中途失败），补一遍离线流
      setState((prev) => {
        if (prev.quote || prev.offline) return prev;
        if (prev.status === "error") return prev;
        void playOffline(request);
        return prev;
      });
    },
    [applyEvent, playOffline, state.quote]
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL);
  }, []);

  return { state, start, reset };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
