"use client";

import { useT } from "@/lib/i18n/context";

const TONE = {
  soft: "bg-brand-100 text-brand-700 border-brand-200",
  solid: "sky-gradient text-white border-transparent shadow-soft",
  warn: "bg-amber-100 text-amber-700 border-amber-500/30",
} as const;

export function DemoBadge({
  tone = "soft",
  label,
}: {
  tone?: keyof typeof TONE;
  label?: string;
}) {
  const { t } = useT();

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-wide ${TONE[tone]}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full rounded-full bg-current opacity-60 animate-breathe" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
      </span>
      {label ?? t("common.demo")}
    </span>
  );
}

/** 行程卡 / 报价单 / 凭证卡上的固定免责说明 */
export function DemoDisclaimer({ compact = false }: { compact?: boolean }) {
  const { t } = useT();

  if (compact) {
    return (
      <p className="text-[11px] leading-4 text-ink-300">
        {t("common.disclaimerShort")}
      </p>
    );
  }
  return (
    <p className="rounded-xl bg-brand-50 px-3 py-2 text-xs leading-5 text-ink-500">
      {t("common.disclaimerLong")}
    </p>
  );
}
