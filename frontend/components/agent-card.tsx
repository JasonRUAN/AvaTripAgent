"use client";

import { useState } from "react";
import type { AgentHealth } from "@/lib/agent-health";
import { probeAgentHealth } from "@/lib/agent-health";
import { explorerAddress, maskAddress } from "@/lib/format";
import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  agentCovers,
  categoryLabels,
  type AgentProfile,
  type CategoryCode,
  type OnchainReview,
} from "@/lib/types";

const ACCENT: Record<CategoryCode, { bar: string; avatar: string; chip: string; wash: string }> = {
  0: {
    bar: "bg-cat-flight",
    avatar: "from-cat-flight to-brand-400",
    chip: "bg-cat-flight/12 text-cat-flight",
    wash: "from-cat-flight/20 via-brand-50 to-transparent",
  },
  1: {
    bar: "bg-cat-hotel",
    avatar: "from-cat-hotel to-brand-400",
    chip: "bg-cat-hotel/12 text-cat-hotel",
    wash: "from-cat-hotel/20 via-brand-50 to-transparent",
  },
  2: {
    bar: "bg-cat-attraction",
    avatar: "from-cat-attraction to-mint-500",
    chip: "bg-cat-attraction/12 text-cat-attraction",
    wash: "from-cat-attraction/18 via-mint-100 to-transparent",
  },
  3: {
    bar: "bg-cat-dining",
    avatar: "from-cat-dining to-amber-500",
    chip: "bg-cat-dining/12 text-cat-dining",
    wash: "from-cat-dining/20 via-amber-100 to-transparent",
  },
};

export function AgentAvatar({ name, category }: { name: string; category: CategoryCode }) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <span
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-lg font-bold text-white shadow-soft ${ACCENT[category].avatar}`}
    >
      {initial}
    </span>
  );
}

export function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
        active ? "bg-mint-100 text-mint-500" : "bg-ink-100 text-ink-400"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-mint-500" : "bg-ink-300"}`} />
      {active ? "启用" : "停用"}
    </span>
  );
}

export function StarRating({ value, count }: { value: number; count: number }) {
  if (!count) {
    return <p className="text-xs font-semibold text-ink-300">暂无评价</p>;
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="flex items-center gap-0.5 text-amber-500" aria-label={`${value.toFixed(1)} 分`}>
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = value >= star;
          const half = !filled && value >= star - 0.5;
          return (
            <span key={star} className="relative inline-block w-3 text-[12px] leading-none">
              <span className="text-brand-100">★</span>
              {filled ? <span className="absolute inset-0">★</span> : null}
              {half ? <span className="absolute inset-0 w-1/2 overflow-hidden">★</span> : null}
            </span>
          );
        })}
      </span>
      <span className="text-xs font-bold text-ink-800">{value.toFixed(1)}</span>
      <span className="text-[11px] text-ink-400">{count} 条评价</span>
    </div>
  );
}

export function CategoryChips({ agent }: { agent: AgentProfile }) {
  const listed = agent.categories.length ? agent.categories : [agent.category];
  return (
    <div className="flex flex-wrap gap-1">
      {listed.map((code) => (
        <span key={code} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ACCENT[code].chip}`}>
          {CATEGORY_ICON[code]} {CATEGORY_LABEL[code]}
        </span>
      ))}
    </div>
  );
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // 忽略无剪贴板权限
  }
}

export function Copyable({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={value}
      onClick={() => {
        void copyText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        });
      }}
      className="cursor-pointer truncate text-left text-[11px] font-semibold text-ink-400 hover:text-brand-700"
    >
      {copied ? "已复制" : label}
    </button>
  );
}

export function HealthLamp({ health }: { health: AgentHealth }) {
  if (health.status === "idle") {
    return <span className="text-[11px] text-ink-300">未探测</span>;
  }
  if (health.status === "checking") {
    return <span className="text-[11px] font-semibold text-brand-600">探测中…</span>;
  }
  if (health.status === "ok") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-mint-500">
        <span className="h-1.5 w-1.5 rounded-full bg-mint-500" />
        在线
        {health.service ? ` · ${health.service}` : ""}
        {health.chain ? " · 已接链" : " · 未接链"}
      </span>
    );
  }
  return <span className="text-[11px] font-semibold text-coral-500">{health.message}</span>;
}

export function AgentShell({
  category,
  children,
  className = "",
}: {
  category: CategoryCode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <article
      className={`relative overflow-hidden rounded-3xl border border-brand-100 bg-white/90 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift animate-fade-up ${className}`}
    >
      <span className={`absolute inset-y-0 left-0 w-1.5 ${ACCENT[category].bar}`} />
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b ${ACCENT[category].wash}`} />
      <div className="relative flex flex-col gap-3 p-5 pl-6">{children}</div>
    </article>
  );
}

export function AgentMetaRows({ agent }: { agent: AgentProfile }) {
  const site = agent.website.trim();
  return (
    <div className="flex flex-col gap-1">
      {agent.description ? (
        <p className="line-clamp-2 text-xs leading-5 text-ink-500">{agent.description}</p>
      ) : (
        <p className="text-xs text-ink-300">暂无简介</p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {site ? (
          <a
            href={site}
            target="_blank"
            rel="noreferrer"
            className="truncate text-[11px] font-bold text-brand-700 hover:underline"
          >
            {site.replace(/^https?:\/\//, "")}
          </a>
        ) : (
          <span className="text-[11px] text-ink-300">无官网</span>
        )}
        {agent.endpoint ? (
          <Copyable value={agent.endpoint} label={agent.endpoint} />
        ) : (
          <span className="text-[11px] text-ink-300">未填 API</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Copyable value={agent.address} label={maskAddress(agent.address, 6)} />
        <a
          href={explorerAddress(agent.address)}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] font-bold text-ink-400 hover:text-brand-700"
        >
          Snowtrace
        </a>
      </div>
    </div>
  );
}

export function AgentAdminCard({
  agent,
  isOwner,
  pending,
  onEdit,
  onToggle,
}: {
  agent: AgentProfile;
  isOwner: boolean;
  pending: boolean;
  onEdit: (agent: AgentProfile) => void;
  onToggle: (agent: AgentProfile) => void;
}) {
  const [health, setHealth] = useState<AgentHealth>({ status: "idle" });

  return (
    <AgentShell category={agent.category}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <AgentAvatar name={agent.name} category={agent.category} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-base font-bold text-ink-900">{agent.name}</h3>
              <StatusPill active={agent.active} />
            </div>
            <p className="mt-1 text-[11px] font-semibold text-ink-400">{categoryLabels(agent)}</p>
          </div>
        </div>
      </div>
      <CategoryChips agent={agent} />
      <StarRating value={agent.ratingAvg} count={agent.ratingCount} />
      <AgentMetaRows agent={agent} />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-brand-50 pt-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!agent.endpoint || health.status === "checking"}
            onClick={() => {
              setHealth({ status: "checking" });
              void probeAgentHealth(agent.endpoint).then(setHealth);
            }}
            className="cursor-pointer rounded-full border border-brand-200 px-2.5 py-1 text-[11px] font-bold text-brand-700 disabled:opacity-50"
          >
            探测
          </button>
          <HealthLamp health={health} />
        </div>
        {isOwner ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onEdit(agent)}
              className="cursor-pointer rounded-full border border-brand-200 bg-white px-3 py-1 text-[11px] font-bold text-brand-700 hover:bg-brand-50"
            >
              编辑
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => onToggle(agent)}
              className="cursor-pointer rounded-full border border-brand-200 px-3 py-1 text-[11px] font-bold text-ink-600 disabled:opacity-60"
            >
              {agent.active ? "停用" : "启用"}
            </button>
          </div>
        ) : (
          <StatusPill active={agent.active} />
        )}
      </div>
    </AgentShell>
  );
}

export function AgentMarketCard({
  agent,
  forCategory,
  reviews,
  selected,
  onSelect,
}: {
  agent: AgentProfile;
  forCategory: CategoryCode;
  reviews: OnchainReview[];
  selected: boolean;
  onSelect: () => void;
}) {
  const recent = reviews.slice(-2).reverse();
  const covers = agentCovers(agent, forCategory);

  return (
    <AgentShell category={forCategory} className={selected ? "ring-2 ring-brand-400/40" : ""}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <AgentAvatar name={agent.name} category={forCategory} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-lg font-bold text-ink-900">{agent.name}</h3>
              <StatusPill active={agent.active} />
            </div>
            <p className="mt-1 text-[11px] font-semibold text-ink-400">
              {CATEGORY_ICON[forCategory]} {CATEGORY_LABEL[forCategory]}
              {covers && agent.categories.length > 1 ? ` · 兼营 ${categoryLabels(agent)}` : ""}
            </p>
          </div>
        </div>
      </div>
      <StarRating value={agent.ratingAvg} count={agent.ratingCount} />
      <AgentMetaRows agent={agent} />
      {recent.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {recent.map((review) => (
            <li key={review.tokenId} className="rounded-xl bg-white/80 px-2.5 py-1.5 text-[11px] text-ink-700">
              <span className="text-amber-500">{"★".repeat(review.score)}</span>
              <span className="text-brand-100">{"★".repeat(Math.max(0, 5 - review.score))}</span>
              <span className="ml-1 line-clamp-1">{review.comment || "（无评语）"}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <button
        type="button"
        onClick={onSelect}
        className={`mt-auto cursor-pointer rounded-full px-3 py-2 text-center text-xs font-bold transition-all ${
          selected
            ? "sky-gradient text-white shadow-soft"
            : "border border-brand-200 bg-white text-brand-700 hover:bg-brand-50"
        }`}
      >
        {selected ? "已选为询价服务商" : "设为询价服务商"}
      </button>
    </AgentShell>
  );
}

export function AgentCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-3xl border border-brand-100 bg-white/80 p-5">
      <div className="flex gap-3">
        <div className="h-11 w-11 rounded-2xl skeleton-shimmer" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-1/2 rounded-full skeleton-shimmer" />
          <div className="h-3 w-1/3 rounded-full skeleton-shimmer" />
        </div>
      </div>
      <div className="mt-4 h-10 rounded-xl skeleton-shimmer" />
      <div className="mt-3 h-8 rounded-full skeleton-shimmer" />
    </div>
  );
}
