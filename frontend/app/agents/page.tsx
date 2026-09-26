"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AgentCardSkeleton, AgentMarketCard } from "@/components/agent-card";
import { DemoBadge } from "@/components/demo-badge";
import { useAgentReviews, useAgents } from "@/hooks/use-agents";
import { readStoredProviders, patchStoredProvider } from "@/lib/provider-selection";
import { compareAgentsByMode } from "@/lib/recommend";
import {
  ALL_CATEGORIES,
  CATEGORY_ICON,
  CATEGORY_TO_KEY,
  agentCovers,
  hasProvider,
  type AgentKey,
  type AgentProfile,
  type CategoryCode,
  type ProviderSelection,
} from "@/lib/types";
import { useT } from "@/lib/i18n/context";
import { categoryLabel } from "@/lib/i18n/labels";

function MarketCard({
  agent,
  forCategory,
  selected,
  recommended,
  onSelect,
}: {
  agent: AgentProfile;
  forCategory: CategoryCode;
  selected: boolean;
  recommended?: boolean;
  onSelect: () => void;
}) {
  const { reviews } = useAgentReviews(agent.address);
  return (
    <AgentMarketCard
      agent={agent}
      forCategory={forCategory}
      reviews={reviews}
      selected={selected}
      recommended={recommended}
      onSelect={onSelect}
    />
  );
}

export default function AgentsPage() {
  const { agents, loading, error } = useAgents();
  const { t, locale } = useT();
  const [tab, setTab] = useState<CategoryCode | "all">("all");
  const [sortMode, setSortMode] = useState<"balanced" | "rating">("balanced");
  const [selected, setSelected] = useState<ProviderSelection>({});

  useEffect(() => {
    setSelected(readStoredProviders());
  }, []);

  const pick = (key: AgentKey, address: `0x${string}`) => {
    patchStoredProvider(key, address);
    setSelected(readStoredProviders());
  };

  const stats = useMemo(() => {
    const rated = agents.filter((item) => item.ratingCount > 0);
    const reviewTotal = agents.reduce((sum, item) => sum + item.ratingCount, 0);
    const avg =
      rated.length === 0
        ? 0
        : rated.reduce((sum, item) => sum + item.ratingAvg, 0) / rated.length;
    return { count: agents.length, avg, reviewTotal };
  }, [agents]);

  const groups = tab === "all" ? ALL_CATEGORIES : [tab];

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6">
      <section className="relative mb-8 overflow-hidden rounded-[28px] border border-brand-100 bg-white/80 px-5 py-6 shadow-card sm:px-8">
        <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-brand-200/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-20 h-40 w-40 rounded-full bg-cat-hotel/20 blur-3xl" />
        <div className="relative">
          <p className="text-[11px] font-bold tracking-[0.18em] text-brand-500">
            {t("agentsPage.market")}
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-brand-gradient">
            {t("agentsPage.title")}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-ink-500">{t("agentsPage.subtitle")}</p>
          <div className="mt-5 grid grid-cols-3 gap-3 max-w-lg">
            <HeroStat label={t("agentsPage.statProviders")} value={String(stats.count)} />
            <HeroStat
              label={t("agentsPage.statAvg")}
              value={stats.reviewTotal ? stats.avg.toFixed(1) : "—"}
            />
            <HeroStat label={t("agentsPage.statReviews")} value={String(stats.reviewTotal)} />
          </div>
        </div>
      </section>

      {error ? <DemoBadge tone="warn" label={error} /> : null}

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <TabChip active={tab === "all"} onClick={() => setTab("all")}>
          {t("common.all")}
        </TabChip>
        {ALL_CATEGORIES.map((code) => (
          <TabChip key={code} active={tab === code} onClick={() => setTab(code)}>
            {CATEGORY_ICON[code]} {categoryLabel(code, locale)}
          </TabChip>
        ))}
        <span className="ml-auto flex flex-wrap gap-1.5">
          <TabChip active={sortMode === "balanced"} onClick={() => setSortMode("balanced")}>
            {t("agentsPage.sortBalanced")}
          </TabChip>
          <TabChip active={sortMode === "rating"} onClick={() => setSortMode("rating")}>
            {t("agentsPage.sortRating")}
          </TabChip>
        </span>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AgentCardSkeleton />
          <AgentCardSkeleton />
          <AgentCardSkeleton />
        </div>
      ) : null}

      {!loading && agents.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-brand-200 bg-white/60 px-6 py-16 text-center">
          <p className="text-sm font-semibold text-ink-500">{t("agentsPage.empty")}</p>
          <Link href="/admin" className="mt-3 inline-block text-sm font-bold text-brand-700">
            {t("agentsPage.goAdmin")}
          </Link>
        </div>
      ) : null}

      {!loading
        ? groups.map((category) => {
            const listed = agents
              .filter((agent) => agentCovers(agent, category))
              .sort((a, b) => compareAgentsByMode(a, b, sortMode));
            if (listed.length === 0) return null;
            const key = CATEGORY_TO_KEY[category];
            const pickedCount = listed.filter((agent) => hasProvider(selected, key, agent.address)).length;
            const recommendedAddress = listed[0]?.address;
            return (
              <section key={category} className="mb-10">
                <div className="mb-3 flex items-end justify-between">
                  <h2 className="font-display text-lg font-bold text-ink-800">
                    {CATEGORY_ICON[category]} {categoryLabel(category, locale)}
                  </h2>
                  <p className="text-[11px] font-semibold text-ink-300">
                    {t("agentsPage.picked", {
                      picked: pickedCount,
                      total: listed.length,
                    })}
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {listed.map((agent) => (
                    <MarketCard
                      key={`${agent.address}-${category}`}
                      agent={agent}
                      forCategory={category}
                      selected={hasProvider(selected, key, agent.address)}
                      recommended={agent.address.toLowerCase() === recommendedAddress?.toLowerCase()}
                      onSelect={() => pick(key, agent.address)}
                    />
                  ))}
                </div>
              </section>
            );
          })
        : null}
    </main>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-brand-50/80 px-3 py-2.5">
      <p className="text-[11px] font-bold text-ink-400">{label}</p>
      <p className="font-display text-2xl font-bold text-ink-900">{value}</p>
    </div>
  );
}

function TabChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-bold ${
        active ? "sky-gradient text-white shadow-soft" : "border border-brand-100 bg-white text-ink-500"
      }`}
    >
      {children}
    </button>
  );
}
