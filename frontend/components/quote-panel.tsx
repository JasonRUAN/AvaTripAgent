"use client";

import Link from "next/link";
import { DemoBadge } from "./demo-badge";
import { PayButtonChain } from "./pay-button-chain";
import { SettlementTimeline } from "./settlement-timeline";
import { useCheckout } from "@/hooks/use-checkout";
import { formatUsd } from "@/lib/format";
import { CATEGORY_LABEL, type Quote } from "@/lib/types";

const CATEGORY_ICON: Record<number, string> = {
  0: "✈️",
  1: "🏨",
  2: "🎟️",
  3: "🍜",
};

const BUDGET_TONE = {
  comfortable: { text: "舒适有余", cls: "text-mint-500 bg-mint-100" },
  within: { text: "贴近预算", cls: "text-amber-700 bg-amber-100" },
  over: { text: "超出预算", cls: "text-coral-500 bg-coral-100" },
} as const;

export function QuotePanel({
  quote,
  runId,
  budget,
}: {
  quote?: Quote;
  runId?: string;
  budget?: number;
}) {
  const checkout = useCheckout({ quote, runId });

  if (!quote) {
    return (
      <div className="rounded-3xl border border-dashed border-brand-200 bg-white/50 px-5 py-10 text-center">
        <span className="text-3xl">🧾</span>
        <p className="mt-2 text-sm font-semibold text-ink-500">
          报价单会在行程规划完成后出现
        </p>
      </div>
    );
  }

  const tone = BUDGET_TONE[quote.budgetState];

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-brand-100 bg-white/90 p-4 shadow-card animate-pop-in">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="font-display text-base font-bold text-ink-900">报价单</h3>
          <DemoBadge tone="soft" label="演示价格" />
          {budget ? (
            <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold ${tone.cls}`}>
              {tone.text}
            </span>
          ) : null}
        </div>

        <ul className="flex flex-col divide-y divide-brand-50">
          {quote.lineItems.map((item) => (
            <li key={`${item.category}-${item.provider}`} className="flex items-center gap-2.5 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-sm">
                {CATEGORY_ICON[item.category] ?? "•"}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-ink-900">
                  {item.providerName}
                </p>
                <p className="truncate text-[11px] text-ink-300">{item.label}</p>
              </div>

              <div className="shrink-0 text-right">
                <p className="font-display text-sm font-bold text-ink-900">
                  ${formatUsd(item.amount)}
                </p>
                <p className="text-[10px] text-ink-300">
                  {CATEGORY_LABEL[item.category]}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex items-baseline justify-between border-t border-brand-100 pt-3">
          <span className="text-xs font-bold text-ink-500">合计</span>
          <span className="font-display text-2xl font-bold text-brand-gradient">
            ${formatUsd(quote.total)}
          </span>
        </div>
      </div>

      {checkout.stage === "done" ? (
        <div className="rounded-2xl border border-mint-500/30 bg-mint-100/70 p-4 animate-pop-in">
          <p className="font-display text-base font-bold text-mint-500">
            🎉 支付完成，{checkout.tokenIds.length} 张凭证已签发
          </p>
          <p className="mt-1 text-[11px] leading-4 text-ink-500">
            资金已在链上分给各家服务商 Agent，凭证 NFT 已发到你的钱包。
          </p>
          <Link
            href="/vouchers"
            className="sky-gradient mt-3 flex h-11 w-full items-center justify-center rounded-xl text-sm font-bold text-white shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-glow"
          >
            查看我的凭证 →
          </Link>
        </div>
      ) : (
        <PayButtonChain
          stage={checkout.stage}
          busy={checkout.busy}
          error={checkout.error}
          onFaucet={checkout.actions.faucet}
          onApprove={checkout.actions.approve}
          onPay={checkout.actions.pay}
        />
      )}

      <SettlementTimeline steps={checkout.steps} />
    </div>
  );
}
