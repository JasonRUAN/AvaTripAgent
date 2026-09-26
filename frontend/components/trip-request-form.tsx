"use client";

import { useMemo, useState, useEffect } from "react";
import { DemoDisclaimer } from "./demo-badge";
import {
  AGENT_KEYS,
  DEFAULT_RECOMMEND_MODE,
  RECOMMEND_MODES,
  agentCovers,
  hasProvider,
  toggleProvider,
  KEY_TO_CATEGORY,
  type Address,
  type AgentKey,
  type AgentProfile,
  type ProviderSelection,
  type RecommendMode,
  type TripRequest,
} from "@/lib/types";
import {
  clearStoredProviders,
  readStoredAutoProviders,
  readStoredProviders,
  readStoredRecommendMode,
  writeStoredAutoProviders,
  writeStoredProviders,
  writeStoredRecommendMode,
} from "@/lib/provider-selection";
import { compareAgentsByMode } from "@/lib/recommend";
import { useAgents } from "@/hooks/use-agents";
import { useT } from "@/lib/i18n/context";
import { agentKeyLabel, defaultTripRequest, recommendModeHint, recommendModeLabel, recommendModeShort } from "@/lib/i18n/labels";
import {
  demoText,
  displayCity,
  preferenceDisplay,
} from "@/lib/i18n/dictionaries/demo";
import { parseTripText } from "@/lib/trip-parse";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-bold tracking-wide text-ink-300">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-brand-100 bg-white px-3 py-2 text-sm font-semibold text-ink-900 outline-none transition-all focus:border-brand-400 focus:shadow-glow";

export function TripRequestForm({
  onSubmit,
  running,
  initialRequest,
}: {
  onSubmit: (request: TripRequest, providers: ProviderSelection, recommendMode: RecommendMode) => void;
  running: boolean;
  initialRequest?: TripRequest;
}) {
  const { t, locale } = useT();
  const demo = demoText(locale);
  const [request, setRequest] = useState<TripRequest>(
    () => initialRequest ?? defaultTripRequest(locale)
  );
  const [autoAll, setAutoAll] = useState(true);
  const [manual, setManual] = useState<ProviderSelection>({});
  const [recommendMode, setRecommendMode] = useState<RecommendMode>(DEFAULT_RECOMMEND_MODE);
  const [openKey, setOpenKey] = useState<AgentKey | null>(null);
  const [providersOpen, setProvidersOpen] = useState(false);
  const { agents } = useAgents();

  useEffect(() => {
    // 默认「自动询价全部」；只有用户显式切到手动过，才恢复上次的手动选择
    if (readStoredAutoProviders()) {
      setAutoAll(true);
    } else {
      setAutoAll(false);
      setManual(readStoredProviders());
      setProvidersOpen(true);
    }
    setRecommendMode(readStoredRecommendMode());
  }, []);

  const defaults = useMemo(() => {
    const next: ProviderSelection = {};
    for (const key of AGENT_KEYS) {
      const listed = agents
        .filter((agent) => agent.active && agentCovers(agent, KEY_TO_CATEGORY[key]))
        .sort((a, b) => compareAgentsByMode(a, b, recommendMode === "rating" ? "rating" : "balanced"));
      if (listed.length) next[key] = listed.map((agent) => agent.address);
    }
    return next;
  }, [agents, recommendMode]);

  const selected: ProviderSelection = autoAll ? defaults : { ...defaults, ...manual };

  const totalPicked = AGENT_KEYS.reduce((sum, key) => sum + (selected[key]?.length ?? 0), 0);

  const patchRecommendMode = (mode: RecommendMode) => {
    setRecommendMode(mode);
    writeStoredRecommendMode(mode);
  };

  const patchProvider = (key: AgentKey, address: Address) => {
    setAutoAll(false);
    writeStoredAutoProviders(false);
    const next = toggleProvider(selected, key, address);
    setManual(next);
    writeStoredProviders(next);
  };

  /** 切到手动：以当前的「全部」为起点，方便逐个取消；切回自动：清掉手动痕迹 */
  const patchAutoAll = (next: boolean) => {
    setAutoAll(next);
    writeStoredAutoProviders(next);
    if (next) {
      setManual({});
      clearStoredProviders();
    } else {
      setManual(selected);
      writeStoredProviders(selected);
    }
  };

  const patch = (next: Partial<TripRequest>) =>
    setRequest((prev) => ({ ...prev, ...next }));

  /** 上方文本（输入/示例）变化时，同步解析出下方参数 */
  const applyText = (text: string) =>
    setRequest((prev) => ({ ...prev, ...parseTripText(text, locale), rawText: text }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-100 text-base">
          💬
        </span>
        <h2 className="font-display text-lg font-bold text-ink-900">{t("form.title")}</h2>
      </div>

      <textarea
        value={request.rawText}
        onChange={(event) => applyText(event.target.value)}
        rows={4}
        placeholder={t("form.placeholder")}
        className="w-full resize-none rounded-2xl border border-brand-100 bg-white px-4 py-3 text-sm leading-6 text-ink-900 outline-none transition-all placeholder:text-ink-100 focus:border-brand-400 focus:shadow-glow"
      />

      <div className="flex flex-wrap gap-2">
        {demo.examples.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => applyText(example)}
            className="cursor-pointer rounded-full border border-brand-100 bg-white px-3 py-1.5 text-[11px] font-semibold text-ink-500 transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:text-brand-700 hover:shadow-soft"
          >
            {example}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-brand-100 bg-white/70 p-4">
        <p className="mb-3 text-xs font-bold tracking-wide text-ink-300">
          {t("form.parsedTitle")}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("form.origin")}>
            <select
              className={inputClass}
              value={request.origin}
              onChange={(event) => patch({ origin: event.target.value })}
            >
              {demo.origins.map((city) => (
                <option key={city} value={city}>
                  {displayCity(city, locale)}
                </option>
              ))}
              {!demo.origins.includes(request.origin) ? (
                <option value={request.origin}>{displayCity(request.origin, locale)}</option>
              ) : null}
            </select>
          </Field>

          <Field label={t("form.destination")}>
            <select
              className={inputClass}
              value={request.destination}
              onChange={(event) => patch({ destination: event.target.value })}
            >
              {demo.destinations.map((city) => (
                <option key={city} value={city}>
                  {displayCity(city, locale)}
                </option>
              ))}
              {!demo.destinations.includes(request.destination) ? (
                <option value={request.destination}>
                  {displayCity(request.destination, locale)}
                </option>
              ) : null}
            </select>
          </Field>

          <Field label={t("form.startDate")}>
            <input
              type="date"
              className={inputClass}
              value={request.startDate}
              onChange={(event) => patch({ startDate: event.target.value })}
            />
          </Field>

          <Field label={t("form.days")}>
            <input
              type="number"
              min={1}
              max={14}
              className={inputClass}
              value={request.days}
              onChange={(event) => patch({ days: Number(event.target.value) })}
            />
          </Field>

          <Field label={t("form.pax")}>
            <input
              type="number"
              min={1}
              max={12}
              className={inputClass}
              value={request.pax}
              onChange={(event) => patch({ pax: Number(event.target.value) })}
            />
          </Field>

          <Field label={t("form.budget")}>
            <input
              type="number"
              min={0}
              step={100}
              className={inputClass}
              value={request.budget}
              onChange={(event) => patch({ budget: Number(event.target.value) })}
            />
          </Field>
        </div>

        <div className="mt-3">
          <p className="mb-2 text-xs font-bold tracking-wide text-ink-300">
            {t("form.preferences")}
          </p>
          <div className="flex flex-wrap gap-2">
            {demo.preferences.map((pref) => {
              const active = request.preferences.includes(pref);
              return (
                <button
                  key={pref}
                  type="button"
                  onClick={() =>
                    patch({
                      preferences: active
                        ? request.preferences.filter((p) => p !== pref)
                        : [...request.preferences, pref],
                    })
                  }
                  className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-bold transition-all hover:-translate-y-0.5 ${
                    active
                      ? "sky-gradient border-transparent text-white shadow-soft"
                      : "border-brand-100 bg-white text-ink-500 hover:border-brand-300"
                  }`}
                >
                  {preferenceDisplay(pref, locale)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-brand-100 bg-white/70 p-4">
        <button
          type="button"
          onClick={() => setProvidersOpen((prev) => !prev)}
          aria-expanded={providersOpen}
          className="flex w-full cursor-pointer items-center justify-between gap-2"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="text-xs font-bold tracking-wide text-ink-300">
              {t("form.providers")}
            </span>
            <span className="shrink-0 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">
              {t("form.providerCount", {
                mode: autoAll ? t("form.auto") : t("form.manual"),
                n: totalPicked,
              })}
            </span>
          </span>
          <span
            className={`shrink-0 text-xs text-ink-300 transition-transform duration-200 ${
              providersOpen ? "rotate-180" : ""
            }`}
          >
            ▾
          </span>
        </button>

        <div className="mt-3">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <p className="text-[11px] font-bold tracking-wide text-ink-300">
              {t("form.recommendMode")}
            </p>
            <p className="text-[11px] font-bold text-brand-700">
              {recommendModeLabel(recommendMode, locale)}
            </p>
          </div>
          <div className="grid grid-cols-5 gap-1 rounded-xl border border-brand-100 bg-white p-1">
            {RECOMMEND_MODES.map((mode) => {
              const active = recommendMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  title={recommendModeLabel(mode, locale)}
                  aria-pressed={active}
                  onClick={() => patchRecommendMode(mode)}
                  className={`flex cursor-pointer flex-col items-center gap-1 rounded-[10px] px-0.5 py-1.5 transition-all ${
                    active ? "sky-gradient text-white shadow-soft" : "text-ink-500 hover:bg-brand-50"
                  }`}
                >
                  <span className="text-[13px] leading-none">{RECOMMEND_MODE_ICON[mode]}</span>
                  <span className="whitespace-nowrap text-[10px] font-bold leading-none">
                    {recommendModeShort(mode, locale)}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] leading-4 text-ink-300">
            {recommendModeHint(recommendMode, locale)}
          </p>
        </div>

        {providersOpen ? (
          <div className="mt-3 animate-fade-up border-t border-brand-100 pt-3">
            <label className="flex cursor-pointer items-start justify-between gap-2 rounded-xl border border-brand-100 bg-white px-3 py-2">
              <span className="min-w-0">
                <span className="block text-xs font-bold text-ink-800">{t("form.autoAll")}</span>
                <span className="block text-[11px] leading-4 text-ink-300">
                  {t("form.autoAllHint")}
                </span>
              </span>
              <input
                type="checkbox"
                checked={autoAll}
                onChange={(event) => patchAutoAll(event.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand-600"
              />
            </label>

            <div className="mt-3 grid grid-cols-1 gap-3">
              {AGENT_KEYS.map((key) => {
                const listed = agents
                  .filter((agent) => agent.active && agentCovers(agent, KEY_TO_CATEGORY[key]))
                  .sort((a, b) =>
                    compareAgentsByMode(a, b, recommendMode === "rating" ? "rating" : "balanced")
                  );
                const picked = selected[key] ?? [];
                const open = openKey === key;
                return (
                  <div key={key}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-bold tracking-wide text-ink-300">
                        {agentKeyLabel(key, locale)}
                      </span>
                      <span className="text-[11px] font-semibold text-ink-300">
                        {t("form.pickedCount", { n: picked.length })}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {picked.map((address) => {
                        const agent = listed.find(
                          (item) => item.address.toLowerCase() === address.toLowerCase()
                        );
                        return (
                          <button
                            key={address}
                            type="button"
                            onClick={() => patchProvider(key, address)}
                            className="cursor-pointer rounded-full sky-gradient px-2.5 py-1 text-[11px] font-bold text-white"
                          >
                            {agent?.name ?? address.slice(0, 6)}
                            {agent?.ratingCount ? ` ★${agent.ratingAvg.toFixed(1)}` : ""} ×
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        disabled={listed.length === 0}
                        onClick={() => setOpenKey(open ? null : key)}
                        className="cursor-pointer rounded-full border border-brand-200 bg-white px-2.5 py-1 text-[11px] font-bold text-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {listed.length === 0
                          ? t("form.noAgent")
                          : open
                            ? t("form.collapse")
                            : t("form.addAgent")}
                      </button>
                    </div>
                    {open ? (
                      <ul className="mt-2 flex flex-col gap-1 rounded-xl border border-brand-100 bg-white p-2">
                        {listed.map((agent) => (
                          <AgentCheckRow
                            key={agent.address}
                            agent={agent}
                            checked={hasProvider(selected, key, agent.address)}
                            onToggle={() => patchProvider(key, agent.address)}
                          />
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        disabled={running}
        onClick={() => onSubmit(request, selected, recommendMode)}
        className="sky-gradient flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl text-base font-bold text-white shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
      >
        {running ? t("form.running") : t("form.start")}
      </button>

      <DemoDisclaimer />
    </div>
  );
}

/** 推荐策略图标不随语言变 */
const RECOMMEND_MODE_ICON: Record<RecommendMode, string> = {
  balanced: "✦",
  rating: "★",
  price: "¥",
  value: "⚖",
  budget: "◎",
};

function AgentCheckRow({
  agent,
  checked,
  onToggle,
}: {
  agent: AgentProfile;
  checked: boolean;
  onToggle: () => void;
}) {
  const { t } = useT();
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-brand-50"
      >
        <span
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${
            checked ? "border-brand-500 bg-brand-500 text-white" : "border-brand-200 bg-white text-transparent"
          }`}
        >
          ✓
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-bold text-ink-800">{agent.name}</span>
        <span className="shrink-0 text-[11px] text-ink-300">
          {agent.ratingCount
            ? `★${agent.ratingAvg.toFixed(1)} (${agent.ratingCount})`
            : t("units.noRating")}
        </span>
      </button>
    </li>
  );
}
