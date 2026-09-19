"use client";

import { useState } from "react";
import { DemoDisclaimer } from "./demo-badge";
import { DEFAULT_TRIP_REQUEST, type TripRequest } from "@/lib/types";

const EXAMPLES = [
  "上海去东京 5 天、两人、预算 8000、想吃好少走路",
  "深圳飞新加坡 4 天、一家三口、预算 12000、想轻松点",
  "北京出发曼谷 6 天、两人、预算 6000、爱逛夜市",
];

/** 与后端 mock/catalog.ts 的 ORIGIN_AIRPORTS 保持一致 */
const ORIGINS = ["上海", "北京", "广州", "深圳", "香港"];

const DESTINATIONS = ["东京", "新加坡", "曼谷"];

const PREFERENCES = ["想吃好", "少走路", "亲子", "购物", "夜景", "博物馆", "夜市"];

/** 偏好关键词 → 偏好标签（按顺序匹配 chips 列表） */
const PREFERENCE_KEYWORDS: [RegExp, string][] = [
  [/吃好|美食/, "想吃好"],
  [/少走路|省力/, "少走路"],
  [/亲子|带娃|孩子/, "亲子"],
  [/购物|买买买/, "购物"],
  [/夜景|夜生活/, "夜景"],
  [/博物馆|美术馆|展览/, "博物馆"],
  [/夜市/, "夜市"],
];

const CN_NUM: Record<string, number> = {
  一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

/**
 * 轻量解析自然语言需求（如「北京出发曼谷 6 天、两人、预算 6000、爱逛夜市」），
 * 只在对应字段能匹配到时才返回该字段，避免覆盖用户已填内容。
 */
export function parseTripText(text: string): Partial<TripRequest> {
  const result: Partial<TripRequest> = {};

  const route = text.match(/([\u4e00-\u9fa5]{2,4})(?:出发|飞|去)([\u4e00-\u9fa5]{2,5})/);
  if (route) {
    if (ORIGINS.includes(route[1]!)) result.origin = route[1];
    result.destination = route[2]!;
  }

  const days = text.match(/(\d+)\s*天/);
  if (days) result.days = clamp(Number(days[1]), 1, 14);

  if (/一家三口|两大一小|三口/.test(text)) {
    result.pax = 3;
  } else {
    const cnPax = text.match(/([\u4e00-\u9fa5])\s*人/);
    const numPax = text.match(/(\d+)\s*人/);
    if (numPax) result.pax = clamp(Number(numPax[1]), 1, 12);
    else if (cnPax && CN_NUM[cnPax[1]!]) result.pax = CN_NUM[cnPax[1]!];
  }

  const budget = text.match(/预算\s*([\d,]+)/);
  if (budget) result.budget = Number(budget[1]!.replace(/,/g, "")) || result.budget;

  const prefs = PREFERENCE_KEYWORDS
    .filter(([re]) => re.test(text))
    .map(([, pref]) => pref);
  // 完整需求句（含出发地/目的地）出现时整体重置偏好，避免残留上一条的偏好
  if (prefs.length || route) result.preferences = prefs;

  return result;
}

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
  onSubmit: (request: TripRequest) => void;
  running: boolean;
  /** 切换分类页回来时恢复上一次填写/提交的需求 */
  initialRequest?: TripRequest;
}) {
  const [request, setRequest] = useState<TripRequest>(initialRequest ?? DEFAULT_TRIP_REQUEST);

  const patch = (next: Partial<TripRequest>) =>
    setRequest((prev) => ({ ...prev, ...next }));

  /** 上方文本（输入/示例）变化时，同步解析出下方参数 */
  const applyText = (text: string) =>
    setRequest((prev) => ({ ...prev, ...parseTripText(text), rawText: text }));

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
        onChange={(event) => applyText(event.target.value)}
        rows={4}
        placeholder="例如：上海去东京 5 天、两人、预算 8000、想吃好少走路"
        className="w-full resize-none rounded-2xl border border-brand-100 bg-white px-4 py-3 text-sm leading-6 text-ink-900 outline-none transition-all placeholder:text-ink-100 focus:border-brand-400 focus:shadow-glow"
      />

      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((example) => (
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
          解析出的参数（可直接改）
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Field label="出发地">
            <select
              className={inputClass}
              value={request.origin}
              onChange={(event) => patch({ origin: event.target.value })}
            >
              {ORIGINS.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
              {!ORIGINS.includes(request.origin) ? (
                <option value={request.origin}>{request.origin}</option>
              ) : null}
            </select>
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
            {PREFERENCES.map((pref) => {
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
