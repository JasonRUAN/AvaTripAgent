"use client";

import { useState } from "react";
import { toolLabel, type ToolCall } from "@/hooks/use-plan-run";

const ICON: Record<string, string> = {
  search_flights: "✈️",
  search_hotels: "🏨",
  search_attractions: "🎟️",
  search_restaurants: "🍜",
  quote_total: "🧾",
};

function argText(args: Record<string, unknown>): string {
  return Object.entries(args)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" · ");
}

export function ToolCallCard({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(false);
  const pending = call.ms === undefined;

  return (
    <div className="overflow-hidden rounded-xl border border-brand-100 bg-white/80 transition-all hover:border-brand-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left"
      >
        <span className="text-base">{ICON[call.name] ?? "🔧"}</span>

        <span className="font-mono text-xs font-bold text-brand-700">
          {call.name}
        </span>
        <span className="text-xs text-ink-300">{toolLabel(call.name)}</span>

        <span className="ml-auto flex items-center gap-2">
          {pending ? (
            <span className="flex items-center gap-1.5 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-600">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-breathe" />
              调用中
            </span>
          ) : (
            <span className="rounded-full bg-mint-100 px-2 py-0.5 text-[11px] font-bold text-mint-500">
              {call.ms}ms · {call.count ?? 0} 条
            </span>
          )}
          <span
            className={`text-xs text-ink-300 transition-transform ${open ? "rotate-90" : ""}`}
          >
            ›
          </span>
        </span>
      </button>

      {open ? (
        <div className="border-t border-brand-100 bg-brand-50/60 px-3 py-2 animate-fade-up">
          <p className="font-mono text-[11px] leading-5 text-ink-500">
            {argText(call.args) || "无参数"}
          </p>
        </div>
      ) : null}
    </div>
  );
}
