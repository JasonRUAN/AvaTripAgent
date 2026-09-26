"use client";

import { useState } from "react";
import Link from "next/link";
import { DemoBadge } from "@/components/demo-badge";
import { TripCard } from "@/components/trip-card";
import { WalletButton } from "@/components/wallet-button";
import { useVouchers } from "@/hooks/use-vouchers";
import { formatClock } from "@/lib/format";
import { useT } from "@/lib/i18n/context";

export default function VouchersPage() {
  const { address, items, trips, stats, loading, refreshing, updatedAt, error, refresh } =
    useVouchers();
  const { t, locale } = useT();

  // 默认只展开最新一趟行程（列表首位），其余折叠；
  // manual 里只记录用户手动切换过的行程，后读取到的行程仍按默认规则。
  const [manual, setManual] = useState<Record<string, boolean>>({});
  const latestOrderId = trips[0]?.orderId;

  const isOpen = (orderId: string) => manual[orderId] ?? orderId === latestOrderId;

  const toggleTrip = (orderId: string) =>
    setManual((prev) => ({ ...prev, [orderId]: !isOpen(orderId) }));

  const allCollapsed =
    trips.length > 0 && trips.every((trip) => !isOpen(trip.orderId));

  const toggleAll = () =>
    setManual(
      Object.fromEntries(trips.map((trip) => [trip.orderId, allCollapsed]))
    );

  if (!address) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-4 py-20 text-center">
        <span className="text-5xl animate-drift">🎫</span>
        <h1 className="font-display text-2xl font-bold text-brand-gradient">
          {t("vouchersPage.title")}
        </h1>
        <p className="max-w-md text-sm leading-6 text-ink-500">
          {t("vouchersPage.connectHint")}
        </p>
        <WalletButton />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-brand-gradient">
            {t("vouchersPage.title")}
          </h1>
          <p className="mt-1 text-xs text-ink-500">{t("vouchersPage.subtitle")}</p>
          {/* 列表来自缓存时说清楚，避免用户以为状态没更新 */}
          {updatedAt && !loading ? (
            <p className="mt-0.5 text-[11px] text-ink-300">
              {t("vouchersPage.readAt", { time: formatClock(updatedAt, locale) })}
              {refreshing ? t("vouchersPage.syncing") : null}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {error ? <DemoBadge tone="warn" label={error} /> : null}
          {trips.length > 0 ? (
            <button
              type="button"
              onClick={toggleAll}
              className="cursor-pointer rounded-full border border-brand-200 bg-white/90 px-3.5 py-2 text-xs font-bold text-ink-700 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift"
            >
              {allCollapsed ? t("vouchersPage.expandAll") : t("vouchersPage.collapseAll")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={refresh}
            disabled={loading || refreshing}
            className="cursor-pointer rounded-full border border-brand-200 bg-white/90 px-3.5 py-2 text-xs font-bold text-ink-700 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading
              ? t("vouchersPage.loading")
              : refreshing
                ? t("vouchersPage.verifying")
                : t("vouchersPage.refresh")}
          </button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3">
        {[
          {
            label: t("vouchersPage.statIssued"),
            value: stats.issued,
            tone: "text-mint-500",
          },
          {
            label: t("vouchersPage.statRedeemed"),
            value: stats.redeemed,
            tone: "text-ink-500",
          },
          {
            label: t("vouchersPage.statVoided"),
            value: stats.voided,
            tone: "text-coral-500",
          },
        ].map((item) => (
          <div
            key={item.label}
            className="glass-card rounded-2xl px-4 py-3 text-center"
          >
            <p className={`font-display text-2xl font-bold ${item.tone}`}>
              {item.value}
            </p>
            <p className="text-[11px] font-bold text-ink-300">{item.label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-52 rounded-2xl skeleton-shimmer" />
          ))}
        </div>
      ) : null}

      {!loading && error ? (
        <div className="rounded-3xl border border-dashed border-coral-200 bg-white/60 px-6 py-14 text-center">
          <span className="text-4xl">⚠️</span>
          <p className="mt-3 text-sm font-bold text-ink-700">
            {t("vouchersPage.loadFailed")}
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-ink-500">
            {error}
          </p>
          <button
            type="button"
            onClick={refresh}
            className="mt-4 cursor-pointer rounded-full sky-gradient px-4 py-2 text-xs font-bold text-white shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-glow"
          >
            {t("vouchersPage.retry")}
          </button>
        </div>
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-brand-200 bg-white/60 px-6 py-14 text-center">
          <span className="text-4xl">🎫</span>
          <p className="mt-3 text-sm font-bold text-ink-700">{t("vouchersPage.empty")}</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-ink-500">
            {t("vouchersPage.emptyHint")}
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-full sky-gradient px-4 py-2 text-xs font-bold text-white shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-glow"
          >
            {t("vouchersPage.goPlan")}
          </Link>
        </div>
      ) : null}

      <div className="flex flex-col gap-5">
        {trips.map((trip, tripIndex) => (
          <TripCard
            key={trip.orderId}
            trip={trip}
            open={isOpen(trip.orderId)}
            onToggle={() => toggleTrip(trip.orderId)}
            isLatest={tripIndex === 0}
          />
        ))}
      </div>
    </main>
  );
}
