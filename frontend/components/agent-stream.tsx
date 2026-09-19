"use client";

import { DemoBadge } from "./demo-badge";
import { ToolCallCard } from "./tool-call-card";
import {
  AttractionCards,
  DiningCards,
  FlightCards,
  HotelCards,
  OfferSection,
} from "./offer-cards";
import { toolLabel, type RunState } from "@/hooks/use-plan-run";
import { formatDayLabel } from "@/lib/format";
import {
  PHASE_LABEL,
  PHASE_ORDER,
  type Phase,
} from "@/lib/types";

function PhaseTrack({ phase }: { phase: Phase }) {
  const currentIndex = PHASE_ORDER.indexOf(phase);

  return (
    <div className="flex items-center gap-1.5">
      {PHASE_ORDER.map((item, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <div key={item} className="flex items-center gap-1.5">
            <span
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition-all ${
                active
                  ? "sky-gradient text-white shadow-soft"
                  : done
                    ? "bg-mint-100 text-mint-500"
                    : "bg-white text-ink-300"
              }`}
            >
              {done ? "✓" : null}
              {PHASE_LABEL[item]}
            </span>
            {index < PHASE_ORDER.length - 1 ? (
              <span
                className={`h-0.5 w-3 rounded-full ${done ? "bg-mint-500" : "bg-brand-100"}`}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ThoughtBubble({ text, running }: { text: string; running: boolean }) {
  if (!text) return null;
  return (
    <div className="relative rounded-2xl rounded-tl-sm border border-brand-100 bg-white/90 p-4 shadow-card">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg sky-gradient text-xs shadow-soft">
          🤖
        </span>
        <span className="text-xs font-bold text-brand-700">Orchestrator 总管</span>
        {running ? (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-ink-300">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-breathe" />
            思考中
          </span>
        ) : null}
      </div>
      <p className="text-sm leading-7 text-ink-700">
        {text}
        {running ? (
          <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 bg-brand-500 animate-caret" />
        ) : null}
      </p>
    </div>
  );
}

function DayCard({ day }: { day: NonNullable<RunState["days"][number]["day"]> }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-brand-100 bg-white/90 shadow-card animate-fade-up">
      <div className="flex items-center gap-2 border-b border-brand-100 bg-brand-50/70 px-4 py-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg sky-gradient text-xs font-bold text-white shadow-soft">
          D{day.index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink-900">{day.theme}</p>
          <p className="text-[11px] text-ink-300">{formatDayLabel(day.date)}</p>
        </div>
        {day.dayCost > 0 ? (
          <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-brand-700 shadow-soft">
            ${day.dayCost.toLocaleString("en-US")}
          </span>
        ) : null}
      </div>

      <ul className="flex flex-col divide-y divide-brand-50">
        {day.items.map((item, index) => (
          <li key={`${item.time}-${item.title}-${index}`} className="flex gap-3 px-4 py-2.5">
            <span className="w-11 shrink-0 font-mono text-xs font-bold text-brand-600">
              {item.time || "—"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink-900">{item.title}</p>
              {item.note ? (
                <p className="mt-0.5 text-[11px] leading-4 text-ink-300">{item.note}</p>
              ) : null}
            </div>
            {item.price ? (
              <span className="shrink-0 text-xs font-bold text-ink-500">
                ${item.price.toLocaleString("en-US")}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BudgetBar({
  total,
  budget,
}: {
  total: number;
  budget: number;
}) {
  const ratio = budget > 0 ? total / budget : 0;
  const percent = Math.min(100, Math.round(ratio * 100));
  const state =
    ratio <= 0.9 ? "comfortable" : ratio <= 1 ? "within" : "over";

  const tone =
    state === "over"
      ? { bar: "bg-coral-500", text: "text-coral-500", label: "超出预算" }
      : state === "within"
        ? { bar: "bg-amber-500", text: "text-amber-500", label: "贴近预算" }
        : { bar: "bg-mint-500", text: "text-mint-500", label: "舒适有余" };

  return (
    <div className="rounded-2xl border border-brand-100 bg-white/90 p-4 shadow-card animate-fade-up">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-bold tracking-wide text-ink-300">预算</span>
        <span className={`text-xs font-bold ${tone.text}`}>{tone.label}</span>
      </div>

      <div className="h-2.5 w-full overflow-hidden rounded-full bg-brand-50">
        <div
          className={`h-full rounded-full transition-all duration-700 ${tone.bar}`}
          style={{ width: `${Math.max(4, percent)}%` }}
        />
      </div>

      <div className="mt-2 flex items-baseline justify-between font-display">
        <span className="text-xl font-bold text-ink-900">
          ${total.toLocaleString("en-US")}
        </span>
        <span className="text-xs font-semibold text-ink-300">
          / 预算 ${budget.toLocaleString("en-US")}（{percent}%）
        </span>
      </div>
    </div>
  );
}

export function AgentStream({ state }: { state: RunState }) {
  const idle = state.status === "idle";

  if (idle) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-brand-200 bg-white/50 px-6 py-16 text-center">
        <span className="text-4xl animate-drift">🗺️</span>
        <p className="font-display text-base font-bold text-ink-700">
          在左边说一句话，Agent 就开始工作
        </p>
        <p className="max-w-sm text-xs leading-5 text-ink-300">
          它会先理解需求，再并行向航班 / 酒店 / 门票 / 餐饮四个服务商 Agent
          询价，最后逐日编排行程并给出报价单。
        </p>
      </div>
    );
  }

  const running = state.status === "running";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <PhaseTrack phase={state.phase} />
        {state.offline ? (
          <DemoBadge tone="warn" label="离线演示流" />
        ) : state.degraded ? (
          <DemoBadge tone="warn" label="模型降级 · 确定性行程" />
        ) : null}
      </div>

      <ThoughtBubble text={state.thought} running={running} />

      {state.toolCalls.length > 0 ? (
        <div className="flex flex-col gap-2">
          {state.toolCalls.map((call) => (
            <ToolCallCard key={call.id} call={call} />
          ))}
        </div>
      ) : null}

      {state.offers.flights.length > 0 ? (
        <OfferSection title="航班候选">
          <FlightCards items={state.offers.flights} />
        </OfferSection>
      ) : null}

      {state.offers.hotels.length > 0 ? (
        <OfferSection title="酒店候选">
          <HotelCards items={state.offers.hotels} />
        </OfferSection>
      ) : null}

      {state.offers.attractions.length > 0 ? (
        <OfferSection title="景点候选">
          <AttractionCards items={state.offers.attractions} />
        </OfferSection>
      ) : null}

      {state.offers.dining.length > 0 ? (
        <OfferSection title="餐厅候选">
          <DiningCards items={state.offers.dining} />
        </OfferSection>
      ) : null}

      {state.days.length > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold tracking-wide text-ink-500">逐日行程</h3>
            <span className="text-[11px] text-ink-300">
              {state.days.filter((d) => d.day).length}/{state.days.length} 天已就绪
            </span>
          </div>

          {state.days.map((day) =>
            day.day ? (
              <DayCard key={day.index} day={day.day} />
            ) : (
              <div
                key={day.index}
                className="rounded-2xl border border-brand-100 bg-white/70 p-4 animate-fade-up"
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-100 text-xs font-bold text-brand-700">
                    D{day.index + 1}
                  </span>
                  <span className="text-sm font-bold text-ink-700">{day.theme}</span>
                </div>
                <p className="text-xs leading-6 text-ink-500">
                  {day.text}
                  <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 bg-brand-400 animate-caret" />
                </p>
              </div>
            )
          )}
        </div>
      ) : null}

      {state.budget ? (
        <BudgetBar total={state.budget.total} budget={state.budget.budget} />
      ) : null}

      {state.error ? (
        <div className="rounded-2xl border border-coral-500/30 bg-coral-100 px-4 py-3 text-sm font-semibold text-coral-500">
          {state.error}
        </div>
      ) : null}

      {running && state.toolCalls.length === 0 ? (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-brand-50">
          <div className="h-full w-1/3 rounded-full bg-brand-400 skeleton-shimmer" />
        </div>
      ) : null}

      {running && state.toolCalls.length > 0 ? (
        <p className="text-center text-[11px] text-ink-300">
          {toolLabel(state.toolCalls[state.toolCalls.length - 1]?.name ?? "")} · Agent 工作中
        </p>
      ) : null}
    </div>
  );
}
