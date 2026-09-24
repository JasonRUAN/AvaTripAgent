"use client";

import { DemoBadge } from "./demo-badge";
import { AgentScoreBadge } from "./voucher-review";
import { formatDuration } from "@/lib/format";
import type {
  AttractionOffer,
  DiningOffer,
  FlightOffer,
  HotelOffer,
} from "@/lib/types";

function CardShell({
  icon,
  title,
  subtitle,
  badge,
  children,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  badge?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="w-[240px] shrink-0 rounded-xl border border-brand-100 bg-white/90 p-3 shadow-card transition-all hover:-translate-y-1 hover:shadow-lift animate-pop-in">
      <div className="flex items-start gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-base">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink-900">{title}</p>
          {subtitle ? (
            <p className="truncate text-[11px] text-ink-300">{subtitle}</p>
          ) : null}
        </div>
        {badge ? (
          <span className="shrink-0 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand-700">
            {badge}
          </span>
        ) : null}
      </div>
      {children ? <div className="mt-2.5">{children}</div> : null}
    </div>
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

export function FlightCards({ items }: { items: FlightOffer[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {items.map((item) => (
        <CardShell
          key={item.id}
          icon="✈️"
          title={`${item.flightNo} ${item.from.code} → ${item.to.code}`}
          subtitle={`${item.carrier} · ${item.aircraft}`}
          badge={item.cabin}
        >
          <Row label="起飞" value={item.departAt} />
          <Row label="抵达" value={item.arriveAt} />
          <Row label="时长" value={formatDuration(item.durationMinutes)} />
          <Row
            label="票价"
            value={`$${item.pricePerPerson} / 人 · 余 ${item.seatsLeft}`}
          />
          <div className="mt-2">
            <AgentScoreBadge address={item.provider} />
          </div>
        </CardShell>
      ))}
    </div>
  );
}

export function HotelCards({ items }: { items: HotelOffer[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {items.map((item) => (
        <CardShell
          key={item.id}
          icon="🏨"
          title={item.name}
          subtitle={`${item.area} · ${"★".repeat(item.stars)}`}
          badge={`备选 ${item.nights} 晚`}
        >
          <Row label="房型" value={item.roomType} />
          <Row label="入住" value={item.checkIn} />
          <Row label="退房" value={item.checkOut} />
          <Row label="总价" value={`$${item.total}（$${item.pricePerNight}/晚）`} />
          <div className="mt-2">
            <AgentScoreBadge address={item.provider} />
          </div>
        </CardShell>
      ))}
    </div>
  );
}

export function AttractionCards({ items }: { items: AttractionOffer[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {items.slice(0, 6).map((item) => (
        <CardShell
          key={item.id}
          icon="🎟️"
          title={item.name}
          subtitle={`${item.area} · ${item.openHours}`}
          badge={item.needBooking ? "需预约" : "免预约"}
        >
          <Row label="建议时长" value={formatDuration(item.durationMinutes)} />
          <Row
            label="票价"
            value={item.pricePerPerson === 0 ? "免费" : `$${item.pricePerPerson} / 人`}
          />
          <div className="mt-2">
            <AgentScoreBadge address={item.provider} />
          </div>
        </CardShell>
      ))}
    </div>
  );
}

export function DiningCards({ items }: { items: DiningOffer[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {items.slice(0, 5).map((item) => (
        <CardShell
          key={item.id}
          icon="🍜"
          title={item.name}
          subtitle={`${item.area} · ${item.cuisine}`}
        >
          <Row label="用时" value={formatDuration(item.durationMinutes)} />
          <Row label="人均" value={`$${item.pricePerPerson}`} />
          <div className="mt-2">
            <AgentScoreBadge address={item.provider} />
          </div>
        </CardShell>
      ))}
    </div>
  );
}

export function OfferSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-bold tracking-wide text-ink-500">{title}</h3>
        <DemoBadge tone="soft" label="演示数据" />
      </div>
      {children}
    </div>
  );
}
