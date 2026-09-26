"use client";

import { useEffect, useRef, useState } from "react";
import { explorerTx, shortHash } from "@/lib/format";
import { useT } from "@/lib/i18n/context";
import { categoryLabel, settlementStatusText } from "@/lib/i18n/labels";
import type { SettlementStep } from "@/lib/types";

/** 超过这个条数就限高滚动，避免右侧栏被撑满 */
const SCROLL_AFTER = 4;

const CATEGORY_ICON: Record<number, string> = {
  0: "✈️",
  1: "🏨",
  2: "🎟️",
  3: "🍜",
};

function statusTone(status: SettlementStep["status"]) {
  if (status === "issued") return "bg-mint-500";
  if (status === "paid") return "bg-brand-500";
  if (status === "settling") return "bg-amber-500";
  if (status === "failed") return "bg-coral-500";
  return "bg-ink-100";
}

function statusLabelTone(status: SettlementStep["status"]) {
  if (status === "failed") return "text-coral-500";
  if (status === "issued") return "text-mint-500";
  if (status === "settling" || status === "paid") return "text-amber-700";
  return "text-ink-300";
}

function isLive(status: SettlementStep["status"]) {
  return status === "settling" || status === "paid";
}

export function SettlementTimeline({ steps }: { steps: SettlementStep[] }) {
  const { t, locale } = useT();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [fade, setFade] = useState({ top: false, bottom: false });
  const scrollerRef = useRef<HTMLDivElement>(null);
  const followKey = steps.find((step) => isLive(step.status))?.key
    ?? steps.find((step) => step.status === "failed")?.key
    ?? null;

  const issued = steps.filter((step) => step.status === "issued").length;
  const failed = steps.filter((step) => step.status === "failed").length;
  const working = steps.filter((step) => isLive(step.status)).length;
  const scrollable = steps.length > SCROLL_AFTER;
  const progress = steps.length === 0 ? 0 : Math.round((issued / steps.length) * 100);

  function refreshFade() {
    const el = scrollerRef.current;
    if (!el || !scrollable) {
      setFade({ top: false, bottom: false });
      return;
    }
    setFade({
      top: el.scrollTop > 6,
      bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 6,
    });
  }

  useEffect(() => {
    refreshFade();
  }, [steps.length, openKey, scrollable]);

  useEffect(() => {
    if (!followKey) return;
    const root = scrollerRef.current;
    const node = root?.querySelector<HTMLElement>(`[data-step="${followKey}"]`);
    if (!root || !node) return;
    const nodeRect = node.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    if (nodeRect.top < rootRect.top + 6) {
      root.scrollBy({ top: nodeRect.top - rootRect.top - 8, behavior: "smooth" });
    } else if (nodeRect.bottom > rootRect.bottom - 6) {
      root.scrollBy({ top: nodeRect.bottom - rootRect.bottom + 8, behavior: "smooth" });
    }
  }, [followKey]);

  if (steps.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-bold tracking-wide text-ink-500">
            {t("settlement.title")}
          </h3>
          <p className="mt-0.5 text-[11px] font-semibold text-ink-300">
            {t("settlement.issued", { issued, total: steps.length })}
            {working > 0 ? t("settlement.working", { n: working }) : ""}
            {failed > 0 ? t("settlement.failed", { n: failed }) : ""}
            {scrollable ? t("settlement.scroll") : ""}
          </p>
        </div>
        <span className="font-display text-sm font-bold text-ink-700">{progress}%</span>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-brand-100">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            failed && issued === 0 ? "bg-coral-500" : "bg-mint-500"
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="relative">
        <div
          ref={scrollerRef}
          onScroll={refreshFade}
          className={
            scrollable
              ? "max-h-[16.5rem] overflow-y-auto overscroll-contain pr-0.5"
              : undefined
          }
        >
          <ol className="relative flex flex-col gap-1.5 pl-5">
            <span className="absolute left-[7px] top-2 bottom-2 w-px rounded-full bg-brand-100" />

            {steps.map((step) => {
              const open = openKey === step.key;
              const expandable = Boolean(
                step.txHash || step.tokenId || step.error
              );

              return (
                <li key={step.key} data-step={step.key} className="relative animate-fade-up">
                  <span
                    className={`absolute -left-5 top-2 flex h-4 w-4 items-center justify-center rounded-full text-[9px] text-white shadow-soft ${statusTone(step.status)} ${
                      step.status === "settling" ? "animate-breathe" : ""
                    }`}
                  >
                    {step.status === "issued" ? "✓" : CATEGORY_ICON[step.category] ?? "•"}
                  </span>

                  <div
                    className={`rounded-xl border bg-white/90 shadow-card ${
                      open ? "border-brand-200" : "border-brand-100"
                    }`}
                  >
                    <button
                      type="button"
                      disabled={!expandable}
                      aria-expanded={open}
                      onClick={() =>
                        setOpenKey((current) => (current === step.key ? null : step.key))
                      }
                      className="flex w-full cursor-pointer items-start gap-2 px-2.5 py-2 text-left disabled:cursor-default"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[13px] font-bold text-ink-900">
                            {step.providerName}
                          </span>
                          <span className="shrink-0 rounded-full bg-brand-50 px-1.5 py-px text-[10px] font-bold text-brand-700">
                            {categoryLabel(step.category, locale)}
                          </span>
                        </span>
                        <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-[11px] text-ink-300">
                            {step.label}
                          </span>
                          {step.tokenId && !open ? (
                            <span className="shrink-0 rounded-md bg-mint-100 px-1.5 py-px text-[10px] font-bold text-mint-500">
                              #{step.tokenId}
                            </span>
                          ) : null}
                        </span>
                      </span>

                      <span className="flex shrink-0 items-center gap-1 pt-0.5">
                        <span
                          className={`text-[11px] font-bold ${statusLabelTone(step.status)}`}
                        >
                          {settlementStatusText(step.status, locale)}
                        </span>
                        {expandable ? (
                          <span
                            className={`text-[10px] text-ink-300 transition-transform ${
                              open ? "rotate-180" : ""
                            }`}
                          >
                            ▾
                          </span>
                        ) : null}
                      </span>
                    </button>

                    {open ? (
                      <div className="flex flex-wrap items-center gap-1.5 border-t border-brand-50 px-2.5 py-2">
                        {step.txHash ? (
                          <a
                            href={explorerTx(step.txHash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2 py-1 font-mono text-[11px] font-bold text-brand-700 transition-colors hover:bg-brand-100"
                          >
                            settle {shortHash(step.txHash)} ↗
                          </a>
                        ) : null}

                        {step.tokenId ? (
                          <span className="rounded-lg bg-mint-100 px-2 py-1 text-[11px] font-bold text-mint-500">
                            {t("settlement.voucherCode", {
                              tokenId: step.tokenId,
                              code: step.voucherCode ?? "",
                            })}
                          </span>
                        ) : null}

                        {step.voucherTxHash ? (
                          <a
                            href={explorerTx(step.voucherTxHash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2 py-1 font-mono text-[11px] font-bold text-brand-700 transition-colors hover:bg-brand-100"
                          >
                            mint {shortHash(step.voucherTxHash)} ↗
                          </a>
                        ) : null}

                        {step.error ? (
                          <p className="w-full text-[11px] font-semibold text-coral-500">
                            {step.error}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {scrollable && fade.top ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-white to-transparent" />
        ) : null}
        {scrollable && fade.bottom ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-white to-transparent" />
        ) : null}
      </div>
    </div>
  );
}
