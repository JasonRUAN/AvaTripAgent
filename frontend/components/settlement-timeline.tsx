"use client";

import { explorerTx, shortHash } from "@/lib/format";
import { CATEGORY_LABEL, type SettlementStep } from "@/lib/types";

const CATEGORY_ICON: Record<number, string> = {
  0: "✈️",
  1: "🏨",
  2: "🎟️",
  3: "🍜",
};

const STATUS_TEXT: Record<SettlementStep["status"], string> = {
  pending: "等待中",
  settling: "分账交易上链中…",
  paid: "服务商已收款",
  issued: "凭证已签发",
  failed: "失败",
};

function statusTone(status: SettlementStep["status"]) {
  if (status === "issued") return "bg-mint-500";
  if (status === "paid") return "bg-brand-500";
  if (status === "settling") return "bg-amber-500";
  if (status === "failed") return "bg-coral-500";
  return "bg-ink-100";
}

export function SettlementTimeline({ steps }: { steps: SettlementStep[] }) {
  if (steps.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-bold tracking-wide text-ink-500">结算时间线</h3>

      <ol className="relative flex flex-col gap-3 pl-6">
        <span className="absolute left-[9px] top-2 bottom-2 w-0.5 rounded-full bg-brand-100" />

        {steps.map((step) => (
          <li key={step.key} className="relative animate-fade-up">
            <span
              className={`absolute -left-6 top-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-white shadow-soft ${statusTone(step.status)} ${
                step.status === "settling" ? "animate-breathe" : ""
              }`}
            >
              {step.status === "issued" ? "✓" : CATEGORY_ICON[step.category] ?? "•"}
            </span>

            <div className="rounded-xl border border-brand-100 bg-white/90 p-3 shadow-card">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-ink-900">
                  {step.providerName}
                </span>
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700">
                  {CATEGORY_LABEL[step.category]}
                </span>
                <span
                  className={`ml-auto text-[11px] font-bold ${
                    step.status === "failed" ? "text-coral-500" : "text-mint-500"
                  }`}
                >
                  {STATUS_TEXT[step.status]}
                </span>
              </div>

              <p className="mt-1 truncate text-[11px] text-ink-300">{step.label}</p>

              {step.txHash ? (
                <a
                  href={explorerTx(step.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2 py-1 font-mono text-[11px] font-bold text-brand-700 transition-colors hover:bg-brand-100"
                >
                  settle {shortHash(step.txHash)} ↗
                </a>
              ) : null}

              {step.tokenId ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-lg bg-mint-100 px-2 py-1 text-[11px] font-bold text-mint-500">
                    凭证 #{step.tokenId} {step.voucherCode ?? ""}
                  </span>
                  {step.voucherTxHash ? (
                    <a
                      href={explorerTx(step.voucherTxHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2 py-1 font-mono text-[11px] font-bold text-brand-700 transition-colors hover:bg-brand-100"
                    >
                      mint {shortHash(step.voucherTxHash)} ↗
                    </a>
                  ) : null}
                </div>
              ) : null}

              {step.error ? (
                <p className="mt-2 text-[11px] font-semibold text-coral-500">
                  {step.error}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
