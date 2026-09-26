"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useReadContract } from "wagmi";
import { DemoBadge } from "@/components/demo-badge";
import { BACKEND_URL, CONTRACTS, VOUCHER_ABI, isDeployed } from "@/lib/contracts";
import { explorerAddress, explorerToken, formatDate, maskAddress } from "@/lib/format";
import { useT } from "@/lib/i18n/context";
import { categoryLabel, categoryStyle } from "@/lib/i18n/labels";
import type { VoucherDetail } from "@/lib/types";

/** 扫码落地页：任何人可见，不需要连接钱包 */
export default function VerifyPage() {
  const params = useParams<{ tokenId: string }>();
  const tokenId = params?.tokenId ?? "";
  const { t, locale } = useT();

  const [detail, setDetail] = useState<VoucherDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tokenId) return;
    let cancelled = false;

    fetch(`${BACKEND_URL}/api/vouchers/${tokenId}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("404"))))
      .then((payload: VoucherDetail) => {
        if (!cancelled) setDetail(payload);
      })
      .catch(() => {
        if (!cancelled) setError(t("verify.notFound"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tokenId, t]);

  // 已部署时额外读链，后端明细只作为展示补充
  const { data: onChainValid } = useReadContract({
    address: CONTRACTS.travelVoucher,
    abi: VOUCHER_ABI,
    functionName: "isValid",
    args: tokenId ? [BigInt(tokenId)] : undefined,
    query: { enabled: isDeployed && Boolean(tokenId) },
  });

  const style = categoryStyle(detail?.category ?? 0);
  const chainValid = typeof onChainValid === "boolean" ? onChainValid : null;
  const valid = chainValid ?? detail?.status === "Issued";

  const statusTitle = valid
    ? t("verify.valid")
    : detail?.status === "Redeemed"
      ? t("verify.redeemed")
      : t("verify.unusable");

  return (
    <main className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-10">
      <div className="mb-4 flex items-center gap-2">
        <Image
          src="/logo.png"
          alt={t("verify.alt")}
          width={36}
          height={36}
          className="h-9 w-9 rounded-xl object-cover shadow-soft"
        />
        <span className="font-display text-lg font-bold text-brand-gradient">
          {t("verify.brand")}
        </span>
      </div>

      {loading ? (
        <div className="h-64 w-full rounded-3xl skeleton-shimmer" />
      ) : error && !detail ? (
        <div className="glass-card w-full rounded-3xl p-8 text-center">
          <span className="text-4xl">🤔</span>
          <p className="mt-3 text-sm font-semibold text-ink-700">{error}</p>
          <Link
            href="/"
            className="mt-4 inline-block text-xs font-bold text-brand-700 hover:underline"
          >
            {t("verify.back")}
          </Link>
        </div>
      ) : (
        <div className="glass-card w-full overflow-hidden rounded-3xl animate-pop-in">
          <div
            className="px-6 py-8 text-center text-white"
            style={{ backgroundImage: style.gradient }}
          >
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-4 border-white/70 text-3xl animate-stamp">
              {valid ? "✓" : "✕"}
            </div>
            <p className="mt-4 font-display text-xl font-bold">{statusTitle}</p>
            <p className="mt-1 text-xs opacity-90">
              {chainValid === null ? t("verify.offlineCheck") : t("verify.onchainCheck")}
            </p>
          </div>

          <div className="flex flex-col gap-3 p-5">
            <div>
              <p className="text-[11px] font-bold tracking-widest text-ink-300">
                {detail?.code ?? `#${tokenId}`}
              </p>
              <p className="mt-1 text-base font-bold text-ink-900">
                {detail?.title ?? t("verify.fallbackTitle", { id: tokenId })}
              </p>
            </div>

            <div className="flex flex-col gap-2 rounded-2xl bg-brand-50 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-300">{t("verify.issuer")}</span>
                <span className="font-bold text-ink-900">
                  🛡 {detail?.providerName ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-300">{t("verify.holder")}</span>
                <span className="font-mono font-bold text-ink-900">
                  {maskAddress(detail?.holder)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-300">{t("verify.validity")}</span>
                <span className="font-bold text-ink-900">
                  {detail
                    ? `${formatDate(detail.validFrom, locale)} → ${formatDate(detail.validTo, locale)}`
                    : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-300">{t("verify.category")}</span>
                <span className="font-bold text-ink-900">
                  {categoryLabel(detail?.category ?? 0, locale)}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <DemoBadge tone="soft" label={t("common.onChainVoucher")} />
              <a
                href={explorerToken(CONTRACTS.travelVoucher)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-bold text-brand-700 hover:underline"
              >
                {t("common.explorer")}
              </a>
              {detail?.provider ? (
                <a
                  href={explorerAddress(detail.provider)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-bold text-brand-700 hover:underline"
                >
                  {t("verify.issuerAddress")}
                </a>
              ) : null}
            </div>

            <p className="rounded-xl bg-amber-100 px-3 py-2 text-[11px] leading-4 text-amber-700">
              {t("verify.demoNote")}
            </p>
          </div>
        </div>
      )}

      <p className="mt-5 text-center text-[11px] text-ink-300">{t("verify.publicNote")}</p>
    </main>
  );
}
