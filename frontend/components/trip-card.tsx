"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  getCachedTripSummary,
  useTripSummary,
} from "@/hooks/use-trip-summary";
import { CATEGORY_STYLE, VoucherCard } from "./voucher-card";
import type { TripGroup } from "@/hooks/use-vouchers";

/**
 * AI 行程总结面板：首次展开时自动生成（后端按行程缓存），
 * 之后展开/收起直接读缓存，也可手动重新生成。
 */
function TripSummaryPanel({
  trip,
  open,
}: {
  trip: TripGroup;
  open: boolean;
}) {
  const { summary, loading, error, generate } = useTripSummary(trip);
  const requestedRef = useRef(false);

  const request = useCallback(() => {
    if (!loading) void generate();
  }, [generate, loading]);

  useEffect(() => {
    if (!open || requestedRef.current) return;
    requestedRef.current = true;
    if (!getCachedTripSummary(trip.orderId)) void generate();
    // 只在展开瞬间触发一次；generate 的变化不需要重新触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, trip.orderId]);

  return (
    <div
      className={`mb-4 rounded-2xl border border-brand-100 bg-linear-to-br from-brand-50/80 via-white to-mint-50/60 p-4 ${
        open ? "animate-fade-up" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm">✨</span>
        <h3 className="text-sm font-bold text-ink-700">AI 行程总结</h3>
        {summary?.source === "offline" ? (
          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold text-ink-500">
            离线摘要
          </span>
        ) : null}
        <div className="h-px flex-1 bg-brand-50" />
        {summary && !loading ? (
          <button
            type="button"
            onClick={request}
            className="cursor-pointer rounded-full border border-brand-100 bg-white px-2.5 py-1 text-[11px] font-bold text-brand-600 transition-colors hover:border-brand-300 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            重新生成
          </button>
        ) : null}
      </div>

      {loading ? (
        <p className="mt-2.5 flex items-center gap-2 text-xs leading-5 text-ink-500">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-brand-200 border-t-brand-500" />
          AI 正在阅读 {trip.vouchers.length} 张凭证，为你提炼行程要点…
        </p>
      ) : null}

      {!loading && error ? (
        <p className="mt-2.5 text-xs leading-5 text-coral-500">{error}</p>
      ) : null}

      {!loading && !error && !summary ? (
        <p className="mt-2.5 text-xs leading-5 text-ink-400">
          展开即可生成这趟行程的 AI 总结
        </p>
      ) : null}

      {summary && !loading ? (
        <div className="mt-2.5">
          <p className="text-xs leading-5 text-ink-600">{summary.summary}</p>

          {summary.highlights?.length ? (
            <ul className="mt-3 grid gap-1.5">
              {summary.highlights.map((item, index) => (
                <li
                  key={`${index}-${item}`}
                  className="flex items-start gap-1.5 text-xs leading-5 text-ink-600"
                >
                  <span className="mt-0.5 text-mint-500">◆</span>
                  {item}
                </li>
              ))}
            </ul>
          ) : null}

          {summary.tips?.length ? (
            <div className="mt-3 rounded-xl bg-brand-50/70 px-3 py-2.5">
              <p className="text-[11px] font-bold text-brand-700">出行提示</p>
              <ul className="mt-1 grid gap-1">
                {summary.tips.map((item, index) => (
                  <li
                    key={`${index}-${item}`}
                    className="text-[11px] leading-5 text-ink-500"
                  >
                    · {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
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
                最近
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 flex items-center gap-2 text-[11px] font-semibold text-ink-300">
            {trip.dateLabel ? <span>{trip.dateLabel} 出行</span> : null}
            <span>订单 {orderTail}</span>
          </span>
        </span>

        {/* 品类概览：收起时也能一眼看清这趟行程有什么 */}
        <span className="relative ml-auto flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            {trip.categories.map(({ category, list }) => (
              <span
                key={category}
                className="flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-ink-500"
                title={`${CATEGORY_STYLE[category]?.label ?? ""} ${list.length} 张`}
              >
                <span>{CATEGORY_STYLE[category]?.icon}</span>
                {list.length}
              </span>
            ))}
          </span>
          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-700">
            {trip.vouchers.length} 张
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
            <TripSummaryPanel trip={trip} open={open} />
            {trip.categories.map(({ category, list }, index) => {
              const style = CATEGORY_STYLE[category]!;

              return (
                <div
                  key={category}
                  className={open ? "animate-fade-up" : ""}
                  style={{ animationDelay: `${index * 70}ms` }}
                >
                  <div className="mb-2.5 flex items-center gap-2">
                    <span className="text-sm">{style.icon}</span>
                    <h3 className="text-sm font-bold text-ink-700">
                      {style.label}
                    </h3>
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-ink-500">
                      {list.length} 张
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
