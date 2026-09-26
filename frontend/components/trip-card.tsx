"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  getCachedTripSummary,
  useTripSummary,
} from "@/hooks/use-trip-summary";
import { BACKEND_URL } from "@/lib/contracts";
import { formatUsd } from "@/lib/format";
import {
  downloadItineraryMarkdown,
  loadLocalItinerary,
  type ItineraryDocument,
} from "@/lib/itinerary-export";
import { useT } from "@/lib/i18n/context";
import { categoryLabel, categoryStyle } from "@/lib/i18n/labels";
import { demoText, displayCity } from "@/lib/i18n/dictionaries/demo";
import type { TripRequest } from "@/lib/types";
import { ItineraryDayCard } from "./itinerary-day-card";
import { VoucherCard } from "./voucher-card";
import type { TripGroup } from "@/hooks/use-vouchers";

function FoldChevron({ open }: { open: boolean }) {
  return (
    <span
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-brand-100 bg-white text-brand-600 transition-transform duration-300 ease-pop motion-reduce:transition-none ${
        open ? "rotate-180 bg-brand-50" : "rotate-0"
      }`}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path
          d="M2.5 4.5 6 8l3.5-3.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/**
 * 凭证页内嵌折叠块：标题行可点，右侧可放「重新生成 / 下载」等操作。
 */
function FoldPanel({
  open,
  onToggle,
  icon,
  title,
  badge,
  preview,
  actions,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  icon: string;
  title: string;
  badge?: ReactNode;
  preview?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-brand-100 bg-white/90 shadow-card">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-xl text-left transition-colors hover:bg-brand-50/70"
        >
          <span className="text-sm">{icon}</span>
          <h3 className="shrink-0 text-sm font-bold text-ink-700">{title}</h3>
          {badge}
          {!open && preview ? (
            <span className="min-w-0 truncate text-[11px] text-ink-300">{preview}</span>
          ) : (
            <span className="h-px min-w-4 flex-1 bg-brand-50" />
          )}
          <FoldChevron open={open} />
        </button>
        {actions}
      </div>

      <div
        className="grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          opacity: open ? 1 : 0,
        }}
      >
        <div className="overflow-hidden">
          <div className="border-t border-brand-50 px-4 pb-4 pt-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * AI 行程总结面板：首次展开时自动生成（后端按行程缓存），
 * 之后展开/收起直接读缓存，也可手动重新生成。
 */
function TripSummaryPanel({
  trip,
  tripOpen,
}: {
  trip: TripGroup;
  tripOpen: boolean;
}) {
  const { summary, loading, error, generate } = useTripSummary(trip);
  const { t } = useT();
  const requestedRef = useRef(false);
  const [open, setOpen] = useState(false);

  const request = useCallback(() => {
    if (!loading) void generate();
  }, [generate, loading]);

  useEffect(() => {
    if (!tripOpen || requestedRef.current) return;
    requestedRef.current = true;
    if (!getCachedTripSummary(trip.orderId)) void generate();
    // 只在行程卡展开瞬间触发一次；generate 的变化不需要重新触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripOpen, trip.orderId]);

  const preview = loading
    ? t("tripCard.generating")
    : error
      ? t("tripCard.generateFailed")
      : summary?.summary || t("tripCard.generateHint");

  return (
    <FoldPanel
      open={open}
      onToggle={() => setOpen((value) => !value)}
      icon="✨"
      title={t("tripCard.summaryTitle")}
      badge={
        summary?.source === "offline" ? (
          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold text-ink-500">
            {t("tripCard.offlineSummary")}
          </span>
        ) : summary && !loading ? (
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-600">
            {t("tripCard.orchestrator")}
          </span>
        ) : null
      }
      preview={preview}
      actions={
        summary && !loading ? (
          <button
            type="button"
            onClick={request}
            className="shrink-0 cursor-pointer rounded-full border border-brand-100 bg-white px-2.5 py-1 text-[11px] font-bold text-brand-600 transition-colors hover:border-brand-300 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t("tripCard.regenerate")}
          </button>
        ) : null
      }
    >
      {loading ? (
        <p className="flex items-center gap-2 text-xs leading-5 text-ink-500">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-brand-200 border-t-brand-500" />
          {t("tripCard.summaryLoading", { n: trip.vouchers.length })}
        </p>
      ) : null}

      {!loading && error ? (
        <p className="text-xs leading-5 text-coral-500">{error}</p>
      ) : null}

      {!loading && !error && !summary ? (
        <p className="text-xs leading-5 text-ink-400">{t("tripCard.generateHint")}</p>
      ) : null}

      {summary && !loading ? (
        <div className="flex flex-col gap-3">
          <div className="relative rounded-2xl rounded-tl-sm border border-brand-100 bg-linear-to-br from-brand-50/80 via-white to-mint-50/50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg sky-gradient text-xs shadow-soft">
                🤖
              </span>
              <span className="text-xs font-bold text-brand-700">
                {t("tripCard.orchestrator")}
              </span>
            </div>
            <p className="text-sm leading-7 text-ink-700">{summary.summary}</p>
          </div>

          {summary.highlights?.length ? (
            <ul className="overflow-hidden rounded-2xl border border-brand-100 bg-white/90">
              {summary.highlights.map((item, index) => (
                <li
                  key={`${index}-${item}`}
                  className="flex items-start gap-3 border-b border-brand-50 px-4 py-2.5 last:border-b-0"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-mint-100 text-[10px] font-bold text-mint-500">
                    {index + 1}
                  </span>
                  <p className="text-sm font-semibold leading-5 text-ink-800">{item}</p>
                </li>
              ))}
            </ul>
          ) : null}

          {summary.tips?.length ? (
            <div className="rounded-2xl border border-brand-100 bg-brand-50/70 px-4 py-3">
              <p className="text-[11px] font-bold tracking-wide text-brand-700">
                {t("tripCard.tips")}
              </p>
              <ul className="mt-2 grid gap-1.5">
                {summary.tips.map((item, index) => (
                  <li
                    key={`${index}-${item}`}
                    className="flex items-start gap-2 text-[12px] leading-5 text-ink-600"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </FoldPanel>
  );
}

function TripItineraryPanel({
  orderId,
  tripOpen,
}: {
  orderId: string;
  tripOpen: boolean;
}) {
  const [doc, setDoc] = useState<ItineraryDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const { t, locale } = useT();

  useEffect(() => {
    if (!tripOpen) return;
    let cancelled = false;
    const local = loadLocalItinerary(orderId);
    if (local?.days.length) setDoc(local);

    setLoading(true);
    void fetch(`${BACKEND_URL}/api/orders/${orderId}`)
      .then(async (response) => {
        if (!response.ok) return local;
        const payload = (await response.json()) as ItineraryDocument & {
          request?: TripRequest;
        };
        return {
          request: payload.request,
          days: payload.days ?? [],
          quote: payload.quote,
        } satisfies ItineraryDocument;
      })
      .then((next) => {
        if (!cancelled && next?.days.length) setDoc(next);
      })
      .catch(() => {
        if (!cancelled && local) setDoc(local);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tripOpen, orderId]);

  const request = doc?.request;
  const days = doc?.days ?? [];
  const preview =
    loading && !days.length
      ? t("tripCard.itineraryLoading")
      : days.length
        ? t("tripCard.itineraryPreview", {
            n: days.length,
            first: days[0]?.theme ?? "",
            last: days[days.length - 1]?.theme ?? "",
          })
        : t("tripCard.noItinerary");

  return (
    <FoldPanel
      open={open}
      onToggle={() => setOpen((value) => !value)}
      icon="🗓️"
      title={t("tripCard.itineraryTitle")}
      badge={
        days.length ? (
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-600">
            {t("tripCard.daysSuffix", { n: days.length })}
          </span>
        ) : null
      }
      preview={preview}
      actions={
        days.length ? (
          <button
            type="button"
            onClick={() => downloadItineraryMarkdown(doc!, locale)}
            className="shrink-0 cursor-pointer rounded-full border border-brand-100 bg-white px-2.5 py-1 text-[11px] font-bold text-brand-600 transition-colors hover:border-brand-300"
          >
            {t("tripCard.download")}
          </button>
        ) : null
      }
    >
      {loading && !days.length ? (
        <p className="text-xs text-ink-400">{t("tripCard.loadingItinerary")}</p>
      ) : null}

      {!loading && !days.length ? (
        <p className="text-xs text-ink-400">{t("tripCard.noDownloadable")}</p>
      ) : null}

      {days.length ? (
        <div className="flex flex-col gap-3">
          {request ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-brand-50/70 px-3 py-2 text-[11px] font-semibold text-ink-500">
              <span className="font-bold text-ink-800">
                {displayCity(request.origin, locale)} → {displayCity(request.destination, locale)}
              </span>
              <span>{t("tripCard.daysSuffix", { n: request.days })}</span>
              <span>{t("tripCard.paxRooms", { pax: request.pax, rooms: request.rooms })}</span>
              {request.startDate ? (
                <span>{t("tripCard.departOn", { date: request.startDate })}</span>
              ) : null}
              {request.preferences.length ? (
                <span className="text-ink-300">
                  {request.preferences.join(demoText(locale).listSeparator)}
                </span>
              ) : null}
            </div>
          ) : null}

          {days.map((day) => (
            <ItineraryDayCard
              key={day.index}
              day={day}
              emptyText={t("itinerary.emptyShort")}
            />
          ))}

          {doc?.quote ? (
            <div className="rounded-2xl border border-brand-100 bg-white/90 px-4 py-3">
              <div className="mb-2 flex items-baseline justify-between">
                <p className="text-[11px] font-bold tracking-wide text-ink-400">
                  {t("tripCard.quoteDetails")}
                </p>
                <p className="font-display text-base font-bold text-ink-900">
                  ${formatUsd(doc.quote.total)}
                </p>
              </div>
              <ul className="grid gap-1.5">
                {doc.quote.lineItems.map((item) => (
                  <li
                    key={item.itemHash}
                    className="flex items-start justify-between gap-3 text-[12px] leading-5"
                  >
                    <span className="min-w-0 text-ink-600">
                      <span className="font-bold text-ink-400">
                        {categoryLabel(item.category, locale)}
                      </span>
                      <span className="mx-1.5 text-ink-300">·</span>
                      {item.label}
                    </span>
                    <span className="shrink-0 font-bold text-ink-700">
                      ${formatUsd(item.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </FoldPanel>
  );
}

/**
 * 行程卡：一次结算订单 = 一趟行程，卡片可折叠。
 *
 * 折叠动画用 grid-template-rows 0fr→1fr（内容高度未知也能平滑过渡），
 * 展开时配一道流光 + 品类分区依次淡入，收起后头部保留品类概览。
 */
export function TripCard({
  trip,
  open,
  onToggle,
  isLatest = false,
}: {
  trip: TripGroup;
  open: boolean;
  onToggle: () => void;
  isLatest?: boolean;
}) {
  const { t, locale } = useT();
  const orderTail =
    trip.orderId.length > 10 ? `…${trip.orderId.slice(-6)}` : trip.orderId;

  return (
    <section
      className={`glass-card group relative overflow-hidden rounded-3xl transition-all duration-300 ease-out motion-reduce:transition-none ${
        open
          ? "border-brand-200 shadow-lift"
          : "hover:-translate-y-0.5 hover:shadow-lift"
      }`}
    >
      {/* 顶部渐变进度条：展开填满，收起缩到一小段 */}
      <span
        className="sky-gradient absolute inset-x-0 top-0 h-0.75 origin-left transition-transform duration-500 ease-out motion-reduce:transition-none"
        style={{ transform: `scaleX(${open ? 1 : 0.18})` }}
      />

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="relative flex w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-2 overflow-hidden px-4 py-3.5 text-left sm:px-5"
      >
        {/* 展开瞬间一道光扫过卡头 */}
        {open ? <span className="trip-sheen" /> : null}

        <span
          className={`relative text-lg transition-transform duration-300 ease-pop motion-reduce:transition-none ${
            open ? "-rotate-6 scale-110" : "rotate-0 scale-100"
          }`}
        >
          🧳
        </span>

        <span className="relative min-w-0">
          <span className="flex items-center gap-2">
            <h2 className="font-display text-base font-bold text-ink-900">
              {trip.title}
            </h2>
            {isLatest ? (
              <span className="rounded-full bg-mint-100 px-2 py-0.5 text-[11px] font-bold text-mint-500">
                {t("tripCard.latest")}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 flex items-center gap-2 text-[11px] font-semibold text-ink-300">
            {trip.dateLabel ? (
              <span>{t("tripCard.travelOn", { date: trip.dateLabel })}</span>
            ) : null}
            <span>{t("tripCard.order", { id: orderTail })}</span>
          </span>
        </span>

        {/* 品类概览：收起时也能一眼看清这趟行程有什么 */}
        <span className="relative ml-auto flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            {trip.categories.map(({ category, list }) => (
              <span
                key={category}
                className="flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-ink-500"
                title={t("tripCard.categoryTip", {
                  label: categoryLabel(category, locale),
                  n: list.length,
                })}
              >
                <span>{categoryStyle(category).icon}</span>
                {list.length}
              </span>
            ))}
          </span>
          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-700">
            {t("tripCard.countSuffix", { n: trip.vouchers.length })}
          </span>

          {/* 折叠指示箭头 */}
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full border border-brand-100 bg-white text-brand-600 transition-all duration-300 ease-pop group-hover:border-brand-300 group-hover:text-brand-700 motion-reduce:transition-none ${
              open ? "rotate-180 bg-brand-50" : "rotate-0"
            }`}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2.5 4.5 6 8l3.5-3.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </span>
      </button>

      {/* 折叠区：0fr → 1fr 平滑展开，内容高度未知也能过渡 */}
      <div
        className="grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          opacity: open ? 1 : 0,
        }}
      >
        <div className="overflow-hidden">
          <div className="border-t border-brand-100 px-4 pb-1 pt-3 sm:px-5">
            <TripSummaryPanel trip={trip} tripOpen={open} />
            <TripItineraryPanel orderId={trip.orderId} tripOpen={open} />
            {trip.categories.map(({ category, list }, index) => {
              const style = categoryStyle(category);

              return (
                <div
                  key={category}
                  className={open ? "animate-fade-up" : ""}
                  style={{ animationDelay: `${index * 70}ms` }}
                >
                  <div className="mb-2.5 flex items-center gap-2">
                    <span className="text-sm">{style.icon}</span>
                    <h3 className="text-sm font-bold text-ink-700">
                      {categoryLabel(category, locale)}
                    </h3>
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-ink-500">
                      {t("tripCard.countSuffix", { n: list.length })}
                    </span>
                    <div className="h-px flex-1 bg-brand-50" />
                  </div>

                  <div className="mb-4 grid gap-4 sm:grid-cols-2">
                    {list.map((voucher, voucherIndex) => (
                      <div
                        key={voucher.tokenId}
                        className={open ? "animate-fade-up" : ""}
                        style={{
                          animationDelay: `${index * 70 + voucherIndex * 40}ms`,
                        }}
                      >
                        <VoucherCard voucher={voucher} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
