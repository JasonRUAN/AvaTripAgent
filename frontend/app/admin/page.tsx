"use client";

import { useMemo, useRef, useState } from "react";
import { isAddress } from "viem";
import { useAccount } from "wagmi";
import { AgentAdminCard } from "@/components/agent-card";
import { WalletButton } from "@/components/wallet-button";
import { useAgents } from "@/hooks/use-agents";
import { useRegistryAdmin } from "@/hooks/use-registry-admin";
import { type AgentHealth, isHttpUrl, parseHealthCategories, probeAgentHealth } from "@/lib/agent-health";
import { HealthLamp } from "@/components/agent-card";
import { useT } from "@/lib/i18n/context";
import { categoryLabel } from "@/lib/i18n/labels";
import { walletErrorText } from "@/lib/wallet-error";
import {
  ALL_CATEGORIES,
  CATEGORY_ICON,
  agentCovers,
  type AgentProfile,
  type CategoryCode,
} from "@/lib/types";

const DESC_MAX = 200;
const inputClass =
  "w-full rounded-xl border border-brand-100 bg-white px-3 py-2 text-sm font-semibold text-ink-900 outline-none focus:border-brand-400";

export default function AdminPage() {
  const { isConnected } = useAccount();
  const { isOwner, isPending, register, setActive } = useRegistryAdmin();
  const { agents, refresh } = useAgents();
  const { t, locale } = useT();
  const formRef = useRef<HTMLDivElement>(null);

  const [agent, setAgent] = useState("");
  const [name, setName] = useState("");
  const [categories, setCategories] = useState<CategoryCode[]>([]);
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [health, setHealth] = useState<AgentHealth>({ status: "idle" });
  const [editing, setEditing] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const [filterCategory, setFilterCategory] = useState<CategoryCode | "all">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [query, setQuery] = useState("");

  const toggleCategory = (code: CategoryCode) => {
    setCategories((prev) => {
      if (prev.includes(code)) {
        if (prev.length === 1) return prev;
        return prev.filter((item) => item !== code);
      }
      return [...prev, code].sort((a, b) => a - b);
    });
  };

  const fillFrom = (item: AgentProfile) => {
    setAgent(item.address);
    setName(item.name);
    setCategories(item.categories.length ? item.categories : [item.category]);
    setDescription(item.description.slice(0, DESC_MAX));
    setWebsite(item.website);
    setEndpoint(item.endpoint);
    setEditing(true);
    setFormOpen(true);
    setMessage(null);
    setHealth({ status: "idle" });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const onProbe = async () => {
    setHealth({ status: "checking" });
    const result = await probeAgentHealth(endpoint, locale);
    setHealth(result);
  };

  const applyHealthFill = () => {
    if (health.status !== "ok") return;
    if (!name.trim() && health.service) setName(health.service);
    if (!agent.trim() && isAddress(health.address)) setAgent(health.address);
    const parsed = parseHealthCategories(health.categories);
    if (parsed.length > 0) setCategories(parsed);
  };

  const onRegister = async () => {
    setMessage(null);
    if (!isAddress(agent) || !name.trim() || !endpoint.trim()) {
      setMessage(t("admin.errFillFields"));
      return;
    }
    if (categories.length === 0) {
      setMessage(t("admin.errNeedCategory"));
      return;
    }
    if (website.trim() && !isHttpUrl(website)) {
      setMessage(t("admin.errWebsiteHttp"));
      return;
    }
    if (!isHttpUrl(endpoint)) {
      setMessage(t("admin.errEndpointHttp"));
      return;
    }
    try {
      await register({
        agent: agent as `0x${string}`,
        name: name.trim(),
        categories,
        endpoint: endpoint.trim().replace(/\/+$/, ""),
        description: description.trim(),
        website: website.trim(),
      });
      setMessage(t("admin.registered"));
      void refresh();
    } catch (error) {
      setMessage(walletErrorText(locale, error, t("admin.registerFailed")));
    }
  };

  const stats = useMemo(() => {
    const active = agents.filter((item) => item.active).length;
    const byCat = ALL_CATEGORIES.map((code) => ({
      code,
      count: agents.filter((item) => agentCovers(item, code)).length,
    }));
    return { total: agents.length, active, byCat };
  }, [agents]);

  const listed = useMemo(() => {
    const q = query.trim().toLowerCase();
    return agents.filter((item) => {
      if (filterCategory !== "all" && !agentCovers(item, filterCategory)) return false;
      if (filterStatus === "active" && !item.active) return false;
      if (filterStatus === "inactive" && item.active) return false;
      if (!q) return true;
      return item.name.toLowerCase().includes(q) || item.address.toLowerCase().includes(q);
    });
  }, [agents, filterCategory, filterStatus, query]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-brand-gradient">
          {t("admin.title")}
        </h1>
        <p className="mt-1 text-xs text-ink-500">{t("admin.subtitle")}</p>
      </div>

      {!isConnected ? (
        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-ink-500">{t("admin.connectAdmin")}</p>
          <WalletButton />
        </div>
      ) : null}

      {isConnected && !isOwner ? (
        <p className="mb-6 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t("admin.notOwner")}
        </p>
      ) : null}

      {isOwner ? (
        <div ref={formRef} className="mb-8 flex flex-col gap-4 rounded-3xl border border-brand-100 bg-white/90 p-5 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-ink-800">
              {editing ? t("admin.updateAgent") : t("admin.registerAgent")}
            </p>
            {formOpen ? (
              <div className="flex items-center gap-3">
                {editing ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setAgent("");
                      setName("");
                      setCategories([]);
                      setDescription("");
                      setWebsite("");
                      setEndpoint("");
                      setHealth({ status: "idle" });
                      setMessage(null);
                      setFormOpen(false);
                    }}
                    className="cursor-pointer text-xs font-bold text-ink-400 hover:text-brand-700"
                  >
                    {t("admin.clearForm")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setFormOpen(false)}
                    className="cursor-pointer text-xs font-bold text-ink-400 hover:text-brand-700"
                  >
                    {t("admin.collapseForm")}
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setFormOpen(true)}
                className="sky-gradient cursor-pointer rounded-full px-4 py-1.5 text-xs font-bold text-white shadow-soft"
              >
                + {t("admin.addAgent")}
              </button>
            )}
          </div>

          {formOpen ? (
            <>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold tracking-wide text-ink-400">
              {t("admin.endpointLabel")}
            </span>
            <div className="flex gap-2">
              <input
                className={inputClass}
                placeholder="http://127.0.0.1:3011"
                value={endpoint}
                onChange={(e) => {
                  setEndpoint(e.target.value);
                  setHealth({ status: "idle" });
                }}
              />
              <button
                type="button"
                disabled={!endpoint.trim() || health.status === "checking"}
                onClick={() => void onProbe()}
                className="h-10 shrink-0 cursor-pointer rounded-xl border border-brand-200 px-4 text-sm font-bold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
              >
                {health.status === "checking" ? t("admin.probing") : t("admin.probe")}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <HealthLamp health={health} />
              {health.status === "ok" ? (
                <button
                  type="button"
                  onClick={applyHealthFill}
                  className="cursor-pointer text-[11px] font-bold text-brand-700 hover:underline"
                >
                  {t("admin.fillFromHealth")}
                </button>
              ) : null}
            </div>
            {health.status === "ok" ? (
              <p className="break-all font-mono text-[11px] text-ink-400">
                {health.address || t("admin.noAddress")}
                {health.categories.length ? ` · ${health.categories.join(" / ")}` : ""}
              </p>
            ) : null}
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold tracking-wide text-ink-400">
              {t("admin.addressLabel")}
            </span>
            <input
              className={inputClass}
              placeholder="0x…"
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold tracking-wide text-ink-400">
              {t("admin.nameLabel")}
            </span>
            <input className={inputClass} placeholder="AvaFlights Agent" value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <div>
            <p className="mb-2 text-[11px] font-bold tracking-wide text-ink-400">
              {t("admin.categoriesLabel")}
            </p>
            <div className="flex flex-wrap gap-2">
              {ALL_CATEGORIES.map((code) => {
                const on = categories.includes(code);
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => toggleCategory(code)}
                    className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-bold ${
                      on ? "border-brand-400 bg-brand-50 text-brand-700" : "border-brand-100 bg-white text-ink-400"
                    }`}
                  >
                    {CATEGORY_ICON[code]} {categoryLabel(code, locale)}
                  </button>
                );
              })}
            </div>
            {categories.length === 0 ? (
              <p className="mt-1.5 text-[11px] text-coral-500">{t("admin.needCategory")}</p>
            ) : null}
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="flex items-center justify-between text-[11px] font-bold tracking-wide text-ink-400">
              {t("admin.descriptionLabel")}
              <span className={description.length >= DESC_MAX ? "text-coral-500" : ""}>
                {description.length}/{DESC_MAX}
              </span>
            </span>
            <textarea
              maxLength={DESC_MAX}
              rows={3}
              className={`${inputClass} resize-none font-medium`}
              placeholder={t("admin.descriptionPlaceholder")}
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, DESC_MAX))}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold tracking-wide text-ink-400">
              {t("admin.websiteLabel")}
            </span>
            <input
              className={inputClass}
              placeholder="https://example.com"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </label>

          <button
            type="button"
            disabled={isPending || categories.length === 0}
            onClick={() => void onRegister()}
            className="sky-gradient h-11 cursor-pointer rounded-2xl text-sm font-bold text-white disabled:opacity-60"
          >
            {isPending
              ? t("admin.submitting")
              : editing
                ? t("admin.submitUpdate")
                : t("admin.submitRegister")}
          </button>
          {message ? <p className="text-xs text-ink-600">{message}</p> : null}
            </>
          ) : (
            <p className="text-xs text-ink-400">{t("admin.collapsedHint")}</p>
          )}
        </div>
      ) : null}

      <section className="rounded-3xl border border-brand-100 bg-white/70 p-4 shadow-card sm:p-5">
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label={t("admin.statProviders")} value={stats.total} />
          <Stat label={t("admin.statActive")} value={stats.active} />
          {stats.byCat.map((item) => (
            <Stat
              key={item.code}
              label={`${CATEGORY_ICON[item.code]} ${categoryLabel(item.code, locale)}`}
              value={item.count}
            />
          ))}
        </div>

        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <FilterChip active={filterCategory === "all"} onClick={() => setFilterCategory("all")}>
              {t("common.all")}
            </FilterChip>
            {ALL_CATEGORIES.map((code) => (
              <FilterChip key={code} active={filterCategory === code} onClick={() => setFilterCategory(code)}>
                {CATEGORY_ICON[code]} {categoryLabel(code, locale)}
              </FilterChip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "active", "inactive"] as const).map((status) => (
              <FilterChip key={status} active={filterStatus === status} onClick={() => setFilterStatus(status)}>
                {status === "all"
                  ? t("common.allStatus")
                  : status === "active"
                    ? t("common.active")
                    : t("common.inactive")}
              </FilterChip>
            ))}
            <input
              className="w-full rounded-full border border-brand-100 bg-white px-3 py-1.5 text-xs font-semibold text-ink-800 outline-none focus:border-brand-400 sm:w-56"
              placeholder={t("admin.searchPlaceholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {listed.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-brand-200 bg-white/60 px-6 py-14 text-center">
            <p className="text-sm font-semibold text-ink-500">{t("admin.noMatch")}</p>
            <p className="mt-1 text-xs text-ink-400">{t("admin.noMatchHint")}</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {listed.map((item) => (
              <AgentAdminCard
                key={item.address}
                agent={item}
                isOwner={isOwner}
                pending={isPending}
                onEdit={fillFrom}
                onToggle={(current) => void setActive(current.address, !current.active).then(() => refresh())}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-brand-50/80 px-3 py-2.5">
      <p className="text-[11px] font-bold text-ink-400">{label}</p>
      <p className="font-display text-xl font-bold text-ink-900">{value}</p>
    </div>
  );
}

function FilterChip({
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
      className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-bold ${
        active ? "sky-gradient text-white shadow-soft" : "border border-brand-100 bg-white text-ink-500"
      }`}
    >
      {children}
    </button>
  );
}
