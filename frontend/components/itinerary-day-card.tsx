"use client";

import type { ReactNode } from "react";
import { formatDayLabel, formatNumber } from "@/lib/format";
import { CATEGORY_ICON, type ItineraryDay, type ItineraryItem } from "@/lib/types";
import { useT } from "@/lib/i18n/context";

/**
 * 规划页 / 凭证页共用的逐日行程卡片。
 * 只负责只读展示；增删按钮通过 headerExtra / renderItemExtra 注入。
 */
export function ItineraryDayCard({
  day,
  headerExtra,
  renderItemExtra,
  footer,
  emptyText,
  className = "",
}: {
  day: ItineraryDay;
  headerExtra?: ReactNode;
  renderItemExtra?: (item: ItineraryItem, index: number) => ReactNode;
  footer?: ReactNode;
  emptyText?: string;
  className?: string;
}) {
  const { t, locale } = useT();
  const emptyLabel = emptyText ?? t("itinerary.empty");

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-brand-100 bg-white/90 shadow-card ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-brand-100 bg-brand-50/70 px-4 py-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg sky-gradient text-xs font-bold text-white shadow-soft">
          D{day.index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink-900">{day.theme}</p>
          <p className="text-[11px] text-ink-300">{formatDayLabel(day.date, locale)}</p>
        </div>
        {day.dayCost > 0 ? (
          <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-brand-700 shadow-soft">
            ${formatNumber(day.dayCost, locale)}
          </span>
        ) : null}
        {headerExtra}
      </div>

      <ul className="flex flex-col divide-y divide-brand-50">
        {day.items.length === 0 ? (
          <li className="px-4 py-3 text-xs text-ink-300">{emptyLabel}</li>
        ) : null}
        {day.items.map((item, index) => (
          <li
            key={`${item.time}-${item.title}-${index}`}
            className="flex items-start gap-3 px-4 py-2.5"
          >
            <span className="w-11 shrink-0 font-mono text-xs font-bold text-brand-600">
              {item.time || "—"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink-900">
                {item.category != null ? (
                  <span className="mr-1" aria-hidden>
                    {CATEGORY_ICON[item.category]}
                  </span>
                ) : null}
                {item.title}
              </p>
              {item.note || item.area ? (
                <p className="mt-0.5 text-[11px] leading-4 text-ink-300">
                  {[item.area, item.note].filter(Boolean).join(" · ")}
                </p>
              ) : null}
            </div>
            {item.price ? (
              <span className="shrink-0 text-xs font-bold text-ink-500">
                ${formatNumber(item.price, locale)}
              </span>
            ) : null}
            {renderItemExtra?.(item, index)}
          </li>
        ))}
      </ul>

      {footer}
    </div>
  );
}
