"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DemoBadge } from "./demo-badge";
import { ToolCallCard } from "./tool-call-card";
import {
  AttractionCards,
  DiningCards,
  FlightCards,
  HotelCards,
  OfferSection,
  type OfferSelectProps,
} from "./offer-cards";
import { usePlanRun, type RunState } from "@/hooks/use-plan-run";
import { useAgents } from "@/hooks/use-agents";
import { ItineraryDayCard } from "./itinerary-day-card";
import { downloadItineraryMarkdown } from "@/lib/itinerary-export";
import { availableOffers } from "@/lib/offer-selection";
import { rankOffers, scoresFromAgents, sameIdSet } from "@/lib/recommend";
import {
  CATEGORY_ICON,
  PHASE_ORDER,
  RECOMMEND_MODES,
  type Phase,
  type TripRequest,
} from "@/lib/types";
import { useT } from "@/lib/i18n/context";
import {
  budgetToneText,
  categoryLabel,
  phaseLabel,
  recommendModeLabel,
  toolLabel,
  type BudgetState,
} from "@/lib/i18n/labels";
import { formatNumber } from "@/lib/format";
import { backendErrorText } from "@/lib/backend-error";

function PhaseTrack({ phase }: { phase: Phase }) {
  const { locale } = useT();
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
              {phaseLabel(item, locale)}
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
  const { t } = useT();
  if (!text) return null;
  return (
    <div className="relative rounded-2xl rounded-tl-sm border border-brand-100 bg-white/90 p-4 shadow-card">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg sky-gradient text-xs shadow-soft">
          🤖
        </span>
        <span className="text-xs font-bold text-brand-700">{t("stream.orchestrator")}</span>
        {running ? (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-ink-300">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-breathe" />
            {t("stream.thinking")}
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

function DayCard({
  day,
  editable,
}: {
  day: NonNullable<RunState["days"][number]["day"]>;
  editable: boolean;
}) {
  const { state, addOfferToDay, removeDayItem, addCustomToDay } = usePlanRun();
  const { t, locale } = useT();
  const [adding, setAdding] = useState(false);
  const [customTime, setCustomTime] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const unused = availableOffers(state.offers, state.selectedOfferIds, locale);

  const submitCustom = () => {
    addCustomToDay(day.index, { time: customTime, title: customTitle });
    setCustomTitle("");
    setCustomTime("");
  };

  return (
    <ItineraryDayCard
      day={day}
      className="animate-fade-up"
      headerExtra={
        editable ? (
          <button
            type="button"
            onClick={() => setAdding((open) => !open)}
            className="shrink-0 cursor-pointer rounded-full border border-brand-200 bg-white px-2.5 py-1 text-[11px] font-bold text-brand-700 transition-colors hover:border-brand-400"
          >
            {adding ? t("stream.collapse") : t("stream.add")}
          </button>
        ) : null
      }
      renderItemExtra={
        editable
          ? (item, index) => (
              <button
                type="button"
                aria-label={t("stream.removeItem", { title: item.title })}
                onClick={() => removeDayItem(day.index, index)}
                className="mt-0.5 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-300 transition-colors hover:bg-coral-100 hover:text-coral-500"
              >
                ×
              </button>
            )
          : undefined
      }
      footer={
        editable && adding ? (
          <div className="border-t border-brand-100 bg-brand-50/40 px-4 py-3">
            <p className="mb-2 text-[11px] font-bold tracking-wide text-ink-400">
              {t("stream.addFromCandidates")}
            </p>
            {unused.length === 0 ? (
              <p className="mb-3 text-[11px] text-ink-300">
                {t("stream.allCandidatesUsed")}
              </p>
            ) : (
              <div className="mb-3 flex flex-col gap-1.5">
                {unused.map((offer) => (
                  <button
                    key={offer.id}
                    type="button"
                    onClick={() => addOfferToDay(day.index, offer.id)}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-xl border border-brand-100 bg-white px-2.5 py-2 text-left transition-all hover:border-brand-300 hover:shadow-soft"
                  >
                    <span className="text-sm">{CATEGORY_ICON[offer.category]}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold text-ink-800">{offer.label}</span>
                      <span className="block truncate text-[11px] text-ink-300">
                        {categoryLabel(offer.category, locale)} · {offer.detail}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] font-bold text-brand-600">
                      {t("stream.addItem")}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <p className="mb-2 text-[11px] font-bold tracking-wide text-ink-400">
              {t("stream.customItem")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                placeholder="09:30"
                value={customTime}
                onChange={(event) => setCustomTime(event.target.value)}
                className="h-8 w-16 rounded-lg border border-brand-100 bg-white px-2 font-mono text-xs text-ink-800 outline-none focus:border-brand-400"
              />
              <input
                type="text"
                placeholder={t("stream.customTitlePlaceholder")}
                value={customTitle}
                onChange={(event) => setCustomTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitCustom();
                }}
                className="h-8 min-w-0 flex-1 rounded-lg border border-brand-100 bg-white px-2.5 text-xs text-ink-800 outline-none focus:border-brand-400"
              />
              <button
                type="button"
                disabled={!customTitle.trim()}
                onClick={submitCustom}
                className="h-8 cursor-pointer rounded-lg bg-brand-500 px-3 text-xs font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("stream.write")}
              </button>
            </div>
          </div>
        ) : null
      }
    />
  );
}

function BudgetBar({
  total,
  budget,
}: {
  total: number;
  budget: number;
}) {
  const { t, locale } = useT();
  const ratio = budget > 0 ? total / budget : 0;
  const percent = Math.min(100, Math.round(ratio * 100));
  const state: BudgetState =
    ratio <= 0.9 ? "comfortable" : ratio <= 1 ? "within" : "over";

  const tone =
    state === "over"
      ? { bar: "bg-coral-500", text: "text-coral-500" }
      : state === "within"
        ? { bar: "bg-amber-500", text: "text-amber-500" }
        : { bar: "bg-mint-500", text: "text-mint-500" };

  return (
    <div className="rounded-2xl border border-brand-100 bg-white/90 p-4 shadow-card animate-fade-up">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-bold tracking-wide text-ink-300">
          {t("stream.budget")}
        </span>
        <span className={`text-xs font-bold ${tone.text}`}>
          {budgetToneText(state, locale)}
        </span>
      </div>

      <div className="h-2.5 w-full overflow-hidden rounded-full bg-brand-50">
        <div
          className={`h-full rounded-full transition-all duration-700 ${tone.bar}`}
          style={{ width: `${Math.max(4, percent)}%` }}
        />
      </div>

      <div className="mt-2 flex items-baseline justify-between font-display">
        <span className="text-xl font-bold text-ink-900">
          ${formatNumber(total, locale)}
        </span>
        <span className="text-xs font-semibold text-ink-300">
          {t("stream.budgetOf", {
            budget: formatNumber(budget, locale),
            percent,
          })}
        </span>
      </div>
    </div>
  );
}

export function AgentStream({
  state,
  request,
  selectionLocked,
}: {
  state: RunState;
  request?: TripRequest | null;
  selectionLocked?: boolean;
}) {
  const { toggleOffer, setCategorySelection, setRecommendMode, applyRecommended } = usePlanRun();
  const { agents } = useAgents();
  const { t, locale } = useT();
  const idle = state.status === "idle";
  const canSelect = state.status === "done" && Boolean(state.quote) && !selectionLocked;
  const select: OfferSelectProps = {
    selectedIds: state.selectedOfferIds,
    recommendedIds: state.recommendedOfferIds,
    locked: !canSelect,
    onToggle: canSelect ? toggleOffer : undefined,
  };
  const trip = request ?? null;
  const ranked = useMemo(() => {
    if (!trip) return state.offers;
    const rankedBundle = rankOffers(
      {
        flights: state.offers.flights,
        hotels: state.offers.hotels,
        attractions: state.offers.attractions,
        restaurants: state.offers.dining,
      },
      state.recommendMode,
      trip,
      scoresFromAgents(agents)
    );
    return {
      flights: rankedBundle.flights,
      hotels: rankedBundle.hotels,
      attractions: rankedBundle.attractions,
      dining: rankedBundle.restaurants,
    };
  }, [agents, state.offers, state.recommendMode, trip]);

  // agents 是异步拉到的，报价单就绪时它可能还没回来，回来后要按服务商评分重排一次推荐。
  // 用「runId + 模式 + agents 评分签名」做闸门：quote 每次重算都是新对象，
  // 直接把它放进依赖会导致 setRecommendMode → 新 quote → effect 再跑 的死循环。
  const agentScoreKey = useMemo(
    () =>
      agents
        .map((agent) => `${agent.address}:${agent.ratingAvgX100}:${agent.ratingCount}`)
        .sort()
        .join("|"),
    [agents]
  );
  const appliedRecommendKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (state.status !== "done" || !state.quote || !agentScoreKey) return;
    const key = `${state.runId ?? ""}|${state.recommendMode}|${agentScoreKey}`;
    if (appliedRecommendKeyRef.current === key) return;
    appliedRecommendKeyRef.current = key;
    setRecommendMode(state.recommendMode, agents);
  }, [agentScoreKey, agents, setRecommendMode, state.quote, state.recommendMode, state.runId, state.status]);

  const canApplyRecommended =
    canSelect && !sameIdSet(state.selectedOfferIds, state.recommendedOfferIds);

  if (idle) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-brand-200 bg-white/50 px-6 py-16 text-center">
        <span className="text-4xl animate-drift">🗺️</span>
        <p className="font-display text-base font-bold text-ink-700">
          {t("stream.idleTitle")}
        </p>
        <p className="max-w-sm text-xs leading-5 text-ink-300">
          {t("stream.idleBody")}
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
          <DemoBadge tone="warn" label={t("stream.offline")} />
        ) : state.degraded ? (
          <DemoBadge tone="warn" label={t("stream.degraded")} />
        ) : null}
      </div>

      {state.offers.flights.length + state.offers.hotels.length + state.offers.attractions.length + state.offers.dining.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {RECOMMEND_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setRecommendMode(mode, agents)}
              className={`cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-bold transition-all ${
                state.recommendMode === mode
                  ? "sky-gradient border-transparent text-white shadow-soft"
                  : "border-brand-100 bg-white text-ink-500 hover:border-brand-300"
              }`}
            >
              {recommendModeLabel(mode, locale)}
            </button>
          ))}
          {canApplyRecommended ? (
            <button
              type="button"
              onClick={applyRecommended}
              className="ml-auto cursor-pointer rounded-full border border-brand-200 bg-white px-2.5 py-1 text-[11px] font-bold text-brand-700 hover:border-brand-400"
            >
              {t("stream.applyRecommended")}
            </button>
          ) : null}
        </div>
      ) : null}

      <ThoughtBubble text={state.thought} running={running} />

      {state.toolCalls.length > 0 ? (
        <div className="flex flex-col gap-2">
          {state.toolCalls.map((call) => (
            <ToolCallCard key={call.id} call={call} />
          ))}
        </div>
      ) : null}

      {state.offers.flights.length > 0 ? (
        <OfferSection
          title={t("stream.flightOffers")}
          selectedCount={state.quote ? state.offers.flights.filter((item) => state.selectedOfferIds.includes(item.id)).length : undefined}
          totalCount={state.quote ? state.offers.flights.length : undefined}
          locked={!canSelect}
          onSelectAll={canSelect ? () => setCategorySelection("flights", "all") : undefined}
          onClear={canSelect ? () => setCategorySelection("flights", "none") : undefined}
        >
          <FlightCards items={ranked.flights} select={select} />
        </OfferSection>
      ) : null}

      {state.offers.hotels.length > 0 ? (
        <OfferSection
          title={t("stream.hotelOffers")}
          hint={t("stream.hotelHint")}
          selectedCount={state.quote ? state.offers.hotels.filter((item) => state.selectedOfferIds.includes(item.id)).length : undefined}
          totalCount={state.quote ? state.offers.hotels.length : undefined}
          locked={!canSelect}
          onSelectAll={canSelect ? () => setCategorySelection("hotels", "all") : undefined}
          onClear={canSelect ? () => setCategorySelection("hotels", "none") : undefined}
        >
          <HotelCards items={ranked.hotels} select={select} />
        </OfferSection>
      ) : null}

      {state.offers.attractions.length > 0 ? (
        <OfferSection
          title={t("stream.attractionOffers")}
          selectedCount={state.quote ? state.offers.attractions.filter((item) => state.selectedOfferIds.includes(item.id)).length : undefined}
          totalCount={state.quote ? state.offers.attractions.length : undefined}
          locked={!canSelect}
          onSelectAll={canSelect ? () => setCategorySelection("attractions", "all") : undefined}
          onClear={canSelect ? () => setCategorySelection("attractions", "none") : undefined}
        >
          <AttractionCards items={ranked.attractions} select={select} />
        </OfferSection>
      ) : null}

      {state.offers.dining.length > 0 ? (
        <OfferSection
          title={t("stream.diningOffers")}
          selectedCount={state.quote ? state.offers.dining.filter((item) => state.selectedOfferIds.includes(item.id)).length : undefined}
          totalCount={state.quote ? state.offers.dining.length : undefined}
          locked={!canSelect}
          onSelectAll={canSelect ? () => setCategorySelection("dining", "all") : undefined}
          onClear={canSelect ? () => setCategorySelection("dining", "none") : undefined}
        >
          <DiningCards items={ranked.dining} select={select} />
        </OfferSection>
      ) : null}

      {state.days.length > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xs font-bold tracking-wide text-ink-500">
              {t("stream.daysTitle")}
            </h3>
            <span className="text-[11px] text-ink-300">
              {t("stream.daysReady", {
                ready: state.days.filter((d) => d.day).length,
                total: state.days.length,
              })}
              {canSelect ? t("stream.daysEditable") : ""}
            </span>
            {state.status === "done" && state.days.some((d) => d.day) ? (
              <button
                type="button"
                onClick={() =>
                  downloadItineraryMarkdown(
                    {
                      request,
                      days: state.days.flatMap((d) => (d.day ? [d.day] : [])),
                      quote: state.quote,
                    },
                    locale
                  )
                }
                className="ml-auto cursor-pointer rounded-full border border-brand-100 bg-white px-2.5 py-1 text-[11px] font-bold text-brand-700 transition-colors hover:border-brand-300"
              >
                {t("stream.download")}
              </button>
            ) : null}
          </div>

          {state.days.map((day) =>
            day.day ? (
              <DayCard key={day.index} day={day.day} editable={canSelect} />
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
          {backendErrorText(locale, state.error) ?? state.error.message}
        </div>
      ) : null}

      {running && state.toolCalls.length === 0 ? (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-brand-50">
          <div className="h-full w-1/3 rounded-full bg-brand-400 skeleton-shimmer" />
        </div>
      ) : null}

      {running && state.toolCalls.length > 0 ? (
        <p className="text-center text-[11px] text-ink-300">
          {t("stream.working", {
            tool: toolLabel(
              state.toolCalls[state.toolCalls.length - 1]?.name ?? "",
              locale
            ),
          })}
        </p>
      ) : null}
    </div>
  );
}
