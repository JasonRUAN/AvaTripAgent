"use client";

import Link from "next/link";
import { DemoBadge } from "@/components/demo-badge";
import { CATEGORY_STYLE, VoucherCard } from "@/components/voucher-card";
import { WalletButton } from "@/components/wallet-button";
import { useVouchers } from "@/hooks/use-vouchers";

export default function VouchersPage() {
  const { address, items, grouped, stats, loading, error, refresh } = useVouchers();

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
        <div className="flex items-center gap-2">
          {error ? <DemoBadge tone="warn" label={error} /> : null}
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="cursor-pointer rounded-full border border-brand-200 bg-white/90 px-3.5 py-2 text-xs font-bold text-ink-700 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "读取中…" : "刷新链上数据"}
          </button>
        </div>
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

      {!loading && error ? (
        <div className="rounded-3xl border border-dashed border-coral-200 bg-white/60 px-6 py-14 text-center">
          <span className="text-4xl">⚠️</span>
          <p className="mt-3 text-sm font-bold text-ink-700">链上凭证读取失败</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-ink-500">
            {error}
          </p>
          <button
            type="button"
            onClick={refresh}
            className="mt-4 cursor-pointer rounded-full sky-gradient px-4 py-2 text-xs font-bold text-white shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-glow"
          >
            重新读取
          </button>
        </div>
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-brand-200 bg-white/60 px-6 py-14 text-center">
          <span className="text-4xl">🎫</span>
          <p className="mt-3 text-sm font-bold text-ink-700">
            该地址还没有链上凭证
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-ink-500">
            完成一次行程支付并分账后，服务商 Agent 会把机票 / 酒店 / 门票 /
            餐饮凭证签发到这个地址。
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-full sky-gradient px-4 py-2 text-xs font-bold text-white shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-glow"
          >
            去规划行程
          </Link>
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
