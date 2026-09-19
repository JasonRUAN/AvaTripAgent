"use client";

import { DemoBadge } from "@/components/demo-badge";
import { CATEGORY_STYLE, VoucherCard } from "@/components/voucher-card";
import { WalletButton } from "@/components/wallet-button";
import { useVouchers } from "@/hooks/use-vouchers";

export default function VouchersPage() {
  const { address, grouped, stats, loading, offline } = useVouchers();

  if (!address) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-4 py-20 text-center">
        <span className="text-5xl animate-drift">🎫</span>
        <h1 className="font-display text-2xl font-bold text-brand-gradient">
          我的凭证
        </h1>
        <p className="max-w-md text-sm leading-6 text-ink-500">
          连接钱包后，这里会显示由各家服务商 Agent 签发到你的地址的机票 / 酒店 / 门票 /
          餐饮凭证 NFT。
        </p>
        <WalletButton />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-brand-gradient">
            我的凭证
          </h1>
          <p className="mt-1 text-xs text-ink-500">
            每张凭证都是 Avalanche Fuji 上的 ERC-721，二维码可直接给商户扫码核销
          </p>
        </div>
        {offline ? <DemoBadge tone="warn" label="演示凭证 · 后端未连接" /> : null}
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3">
        {[
          { label: "有效", value: stats.issued, tone: "text-mint-500" },
          { label: "已核销", value: stats.redeemed, tone: "text-ink-500" },
          { label: "已作废", value: stats.voided, tone: "text-coral-500" },
        ].map((item) => (
          <div
            key={item.label}
            className="glass-card rounded-2xl px-4 py-3 text-center"
          >
            <p className={`font-display text-2xl font-bold ${item.tone}`}>
              {item.value}
            </p>
            <p className="text-[11px] font-bold text-ink-300">{item.label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-52 rounded-2xl skeleton-shimmer" />
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-6">
        {[0, 1, 2, 3].map((category) => {
          const list = grouped[category] ?? [];
          if (list.length === 0) return null;
          const style = CATEGORY_STYLE[category]!;

          return (
            <section key={category}>
              <div className="mb-3 flex items-center gap-2">
                <span className="text-base">{style.icon}</span>
                <h2 className="font-display text-base font-bold text-ink-900">
                  {style.label}
                </h2>
                <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-700">
                  {list.length} 张
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {list.map((voucher) => (
                  <VoucherCard key={voucher.tokenId} voucher={voucher} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
