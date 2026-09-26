"use client";

import { DemoBadge } from "./demo-badge";
import { AgentScoreBadge } from "./voucher-review";
import { formatDuration } from "@/lib/format";
import { useT } from "@/lib/i18n/context";
import type {
  AttractionOffer,
  DiningOffer,
  FlightOffer,
  HotelOffer,
} from "@/lib/types";

export interface OfferSelectProps {
  selectedIds: string[];
  recommendedIds: string[];
  locked?: boolean;
  onToggle?: (id: string) => void;
}

function CardShell({
  icon,
  title,
  subtitle,
  badge,
  selected,
  recommended,
  locked,
  onToggle,
  children,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  badge?: string;
  selected?: boolean;
  recommended?: boolean;
  locked?: boolean;
  onToggle?: () => void;
  children?: React.ReactNode;
}) {
  const { t } = useT();
  const interactive = Boolean(onToggle) && !locked;

  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={onToggle}
      aria-pressed={selected}
      className={`w-[240px] shrink-0 rounded-xl border bg-white/90 p-3 text-left shadow-card transition-all animate-pop-in ${
        selected
          ? "border-brand-400 ring-2 ring-brand-200 shadow-lift"
          : "border-brand-100"
      } ${
        interactive
          ? "cursor-pointer hover:-translate-y-1 hover:shadow-lift"
          : locked
            ? "cursor-default opacity-90"
            : "cursor-default"
      }`}
    >
      <div className="flex items-start gap-2">
        <span
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${
            selected
              ? "border-brand-500 bg-brand-500 text-white"
              : "border-brand-200 bg-white text-transparent"
          }`}
          aria-hidden
        >
          ✓
        </span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-base">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink-900">{title}</p>
          {subtitle ? (
            <p className="truncate text-[11px] text-ink-300">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {recommended ? (
            <span className="rounded-full bg-mint-100 px-2 py-0.5 text-[10px] font-bold text-mint-500">
              {t("common.recommended")}
            </span>
          ) : null}
          {badge ? (
            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand-700">
              {badge}
            </span>
          ) : null}
        </div>
      </div>
      {children ? <div className="mt-2.5">{children}</div> : null}
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[11px]">
      <span className="shrink-0 text-ink-300">{label}</span>
      <span className="truncate font-semibold text-ink-700">{value}</span>
    </div>
  );
}

function selectFlags(id: string, props?: OfferSelectProps) {
  return {
    selected: props?.selectedIds.includes(id) ?? false,
    recommended: props?.recommendedIds.includes(id) ?? false,
    locked: props?.locked,
    onToggle: props?.onToggle ? () => props.onToggle?.(id) : undefined,
  };
}

export function FlightCards({
  items,
  select,
}: {
  items: FlightOffer[];
  select?: OfferSelectProps;
}) {
  const { t } = useT();
  if (items.length === 0) return null;
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {items.map((item) => {
        const flags = selectFlags(item.id, select);
        return (
          <CardShell
            key={item.id}
            icon="✈️"
            title={`${item.flightNo} ${item.from.code} → ${item.to.code}`}
            subtitle={`${item.carrier} · ${item.aircraft}`}
            badge={item.cabin}
            {...flags}
          >
            <Row label={t("offers.depart")} value={item.departAt} />
            <Row label={t("offers.arrive")} value={item.arriveAt} />
            <Row label={t("offers.duration")} value={formatDuration(item.durationMinutes)} />
            <Row
              label={t("offers.fare")}
              value={t("offers.fareValue", {
                price: item.pricePerPerson,
                seats: item.seatsLeft,
              })}
            />
            <div className="mt-2">
              <AgentScoreBadge address={item.provider} />
            </div>
          </CardShell>
        );
      })}
    </div>
  );
}

export function HotelCards({
  items,
  select,
}: {
  items: HotelOffer[];
  select?: OfferSelectProps;
}) {
  const { t } = useT();
  if (items.length === 0) return null;
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {items.map((item) => {
        const flags = selectFlags(item.id, select);
        return (
          <CardShell
            key={item.id}
            icon="🏨"
            title={item.name}
            subtitle={`${item.area} · ${"★".repeat(item.stars)}`}
            badge={t("units.nights", { n: item.nights })}
            {...flags}
          >
            <Row label={t("offers.roomType")} value={item.roomType} />
            <Row label={t("offers.checkIn")} value={item.checkIn} />
            <Row label={t("offers.checkOut")} value={item.checkOut} />
            <Row
              label={t("offers.total")}
              value={t("offers.totalValue", {
                total: item.total,
                perNight: item.pricePerNight,
              })}
            />
            <div className="mt-2">
              <AgentScoreBadge address={item.provider} />
            </div>
          </CardShell>
        );
      })}
    </div>
  );
}

export function AttractionCards({
  items,
  select,
}: {
  items: AttractionOffer[];
  select?: OfferSelectProps;
}) {
  const { t } = useT();
  if (items.length === 0) return null;
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {items.map((item) => {
        const flags = selectFlags(item.id, select);
        return (
          <CardShell
            key={item.id}
            icon="🎟️"
            title={item.name}
            subtitle={`${item.area} · ${item.openHours}`}
            badge={
              item.needBooking ? t("offers.needBooking") : t("offers.noBooking")
            }
            {...flags}
          >
            <Row label={t("offers.suggestedDuration")} value={formatDuration(item.durationMinutes)} />
            <Row
              label={t("offers.fare")}
              value={
                item.pricePerPerson === 0
                  ? t("units.free")
                  : t("offers.pricePerPerson", { price: item.pricePerPerson })
              }
            />
            <div className="mt-2">
              <AgentScoreBadge address={item.provider} />
            </div>
          </CardShell>
        );
      })}
    </div>
  );
}

export function DiningCards({
  items,
  select,
}: {
  items: DiningOffer[];
  select?: OfferSelectProps;
}) {
  const { t } = useT();
  if (items.length === 0) return null;
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {items.map((item) => {
        const flags = selectFlags(item.id, select);
        return (
          <CardShell
            key={item.id}
            icon="🍜"
            title={item.name}
            subtitle={`${item.area} · ${item.cuisine}`}
            {...flags}
          >
            <Row label={t("offers.timeSpent")} value={formatDuration(item.durationMinutes)} />
            <Row label={t("offers.perPerson")} value={`$${item.pricePerPerson}`} />
            <div className="mt-2">
              <AgentScoreBadge address={item.provider} />
            </div>
          </CardShell>
        );
      })}
    </div>
  );
}

export function OfferSection({
  title,
  hint,
  selectedCount,
  totalCount,
  locked,
  onSelectAll,
  onClear,
  children,
}: {
  title: string;
  hint?: string;
  selectedCount?: number;
  totalCount?: number;
  locked?: boolean;
  onSelectAll?: () => void;
  onClear?: () => void;
  children: React.ReactNode;
}) {
  const { t } = useT();
  const showActions =
    typeof selectedCount === "number" && typeof totalCount === "number" && totalCount > 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-bold tracking-wide text-ink-500">{title}</h3>
        <DemoBadge tone="soft" label={t("offers.demoData")} />
        {showActions ? (
          <span className="text-[11px] font-semibold text-ink-300">
            {t("offers.selectedCount", { selected: selectedCount, total: totalCount })}
          </span>
        ) : null}
        {hint ? <span className="text-[11px] text-ink-300">{hint}</span> : null}
        {showActions && onSelectAll && onClear ? (
          <span className="ml-auto flex items-center gap-1">
            <button
              type="button"
              disabled={locked || selectedCount === totalCount}
              onClick={onSelectAll}
              className="cursor-pointer rounded-full border border-brand-100 bg-white px-2 py-0.5 text-[11px] font-bold text-brand-700 transition-colors hover:border-brand-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("offers.selectAll")}
            </button>
            <button
              type="button"
              disabled={locked || selectedCount === 0}
              onClick={onClear}
              className="cursor-pointer rounded-full border border-brand-100 bg-white px-2 py-0.5 text-[11px] font-bold text-ink-500 transition-colors hover:border-brand-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("offers.clearAll")}
            </button>
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
