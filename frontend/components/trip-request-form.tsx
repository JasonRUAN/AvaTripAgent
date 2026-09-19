"use client";

import { useState } from "react";
import { DemoDisclaimer } from "./demo-badge";
import { DEFAULT_TRIP_REQUEST, type TripRequest } from "@/lib/types";

const EXAMPLES = [
  "上海去东京 5 天、两人、预算 8000、想吃好少走路",
  "深圳飞新加坡 4 天、一家三口、预算 12000、想轻松点",
  "北京出发曼谷 6 天、两人、预算 6000、爱逛夜市",
];

const DESTINATIONS = ["东京", "新加坡", "曼谷"];

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
}: {
  onSubmit: (request: TripRequest) => void;
  running: boolean;
}) {
  const [request, setRequest] = useState<TripRequest>(DEFAULT_TRIP_REQUEST);

  const patch = (next: Partial<TripRequest>) =>
    setRequest((prev) => ({ ...prev, ...next }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-100 text-base">
          💬
        </span>
        <h2 className="font-display text-lg font-bold text-ink-900">说出你的旅行</h2>
      </div>

      <textarea
        value={request.rawText}
        onChange={(event) => patch({ rawText: event.target.value })}
        rows={4}
        placeholder="例如：上海去东京 5 天、两人、预算 8000、想吃好少走路"
        className="w-full resize-none rounded-2xl border border-brand-100 bg-white px-4 py-3 text-sm leading-6 text-ink-900 outline-none transition-all placeholder:text-ink-100 focus:border-brand-400 focus:shadow-glow"
      />

      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => patch({ rawText: example })}
            className="cursor-pointer rounded-full border border-brand-100 bg-white px-3 py-1.5 text-[11px] font-semibold text-ink-500 transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:text-brand-700 hover:shadow-soft"
          >
            {example}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-brand-100 bg-white/70 p-4">
        <p className="mb-3 text-xs font-bold tracking-wide text-ink-300">
          解析出的参数（可直接改）
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Field label="出发地">
            <input
              className={inputClass}
              value={request.origin}
              onChange={(event) => patch({ origin: event.target.value })}
            />
          </Field>

          <Field label="目的地">
            <select
              className={inputClass}
              value={request.destination}
              onChange={(event) => patch({ destination: event.target.value })}
            >
              {DESTINATIONS.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
              {!DESTINATIONS.includes(request.destination) ? (
                <option value={request.destination}>{request.destination}</option>
              ) : null}
            </select>
          </Field>

          <Field label="出发日期">
            <input
              type="date"
              className={inputClass}
              value={request.startDate}
              onChange={(event) => patch({ startDate: event.target.value })}
            />
          </Field>

          <Field label="天数">
            <input
              type="number"
              min={1}
              max={14}
              className={inputClass}
              value={request.days}
              onChange={(event) => patch({ days: Number(event.target.value) })}
            />
          </Field>

          <Field label="人数">
            <input
              type="number"
              min={1}
              max={12}
              className={inputClass}
              value={request.pax}
              onChange={(event) => patch({ pax: Number(event.target.value) })}
            />
          </Field>

          <Field label="预算（USD）">
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
          <p className="mb-2 text-xs font-bold tracking-wide text-ink-300">偏好</p>
          <div className="flex flex-wrap gap-2">
            {["想吃好", "少走路", "亲子", "购物", "夜景", "博物馆"].map((pref) => {
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
                  {pref}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <button
        type="button"
        disabled={running}
        onClick={() => onSubmit(request)}
        className="sky-gradient flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl text-base font-bold text-white shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
      >
        {running ? "Agent 规划中…" : "开始规划 ✈"}
      </button>

      <DemoDisclaimer />
    </div>
  );
}
