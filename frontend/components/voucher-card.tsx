"use client";

import { useCallback, useSyncExternalStore } from "react";
import QRCode from "react-qr-code";
import { DemoBadge } from "./demo-badge";
import { VoucherReviewPanel } from "./voucher-review";
import { CONTRACTS } from "@/lib/contracts";
import { explorerToken, formatDate, maskAddress } from "@/lib/format";
import { useT } from "@/lib/i18n/context";
import {
  categoryStyle,
  voucherStatusText,
  voucherTitleText,
} from "@/lib/i18n/labels";
import type { VoucherDetail } from "@/lib/types";

export function VoucherCard({
  voucher,
  showQr = true,
}: {
  voucher: VoucherDetail;
  showQr?: boolean;
}) {
  const { t, locale } = useT();
  const style = categoryStyle(voucher.category);
  const redeemed = voucher.status !== "Issued";

  // 二维码需要绝对 URL，而 origin 只有运行时才拿得到：
  // 用 useSyncExternalStore 读取，避免 effect 内 setState 的级联渲染与 hydration 不一致
  const subscribe = useCallback(() => () => {}, []);
  const getOrigin = useCallback(() => window.location.origin, []);
  const getServerOrigin = useCallback(() => "", []);
  const origin = useSyncExternalStore(subscribe, getOrigin, getServerOrigin);
  const verifyUrl = origin
    ? `${origin}/verify/${voucher.tokenId}`
    : `avatrip://voucher/${voucher.tokenId}`;

  const details = Object.entries(voucher.metadata?.details ?? {}).slice(0, 5);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-card animate-pop-in ${
        redeemed ? "" : "transition-all hover:-translate-y-1 hover:shadow-lift"
      }`}
    >
      {/* 已核销只灰化票面，评价区保持彩色，避免星级/按钮被 saturate-0 洗成灰色 */}
      <div className={redeemed ? "relative opacity-60 saturate-0" : "relative"}>
        {/* 顶部色条 */}
        <div
          className="flex items-center gap-2 px-4 py-3 text-white"
          style={{ backgroundImage: style.gradient }}
        >
          <span className="text-lg">{style.icon}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">
              {voucherTitleText(voucher.category, locale)}
            </p>
            <p className="truncate text-[11px] opacity-90">{voucher.providerName}</p>
          </div>
          <span className="shrink-0 rounded-full bg-white/25 px-2.5 py-1 text-[11px] font-bold">
            {voucherStatusText(voucher.status, locale)}
          </span>
        </div>

        {/* 撕口 + 二维码 */}
        <div className="ticket-perforation flex gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold tracking-widest text-ink-300">
              {voucher.code}
            </p>
            <p className="mt-1 truncate text-sm font-bold text-ink-900">
              {voucher.title}
            </p>

            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-300">
              <span>{t("voucher.holder", { address: maskAddress(voucher.holder) })}</span>
              <span>
                {t("voucher.validUntil", { date: formatDate(voucher.validTo, locale) })}
              </span>
            </div>

            {details.length > 0 ? (
              <dl className="mt-3 flex flex-col gap-1">
                {details.map(([key, value]) => (
                  <div key={key} className="flex gap-2 text-[11px]">
                    <dt className="shrink-0 text-ink-300">{key}</dt>
                    <dd className="min-w-0 flex-1 truncate font-semibold text-ink-700">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>

          {showQr ? (
            <div className="flex shrink-0 flex-col items-center gap-1.5">
              <div className="rounded-xl bg-white p-1.5 shadow-soft">
                <QRCode value={verifyUrl} size={72} />
              </div>
              <span className="text-[10px] font-bold text-ink-300">
                #{voucher.tokenId}
              </span>
            </div>
          ) : null}
        </div>

        {/* 撕口半圆 */}
        <span className="ticket-notch -left-2 top-[62px]" />
        <span className="ticket-notch -right-2 top-[62px]" />

        <div className="flex items-center gap-2 border-t border-brand-50 px-4 py-2.5">
          <DemoBadge tone="soft" label={t("common.onChainVoucher")} />
          <a
            href={explorerToken(CONTRACTS.travelVoucher)}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-[11px] font-bold text-brand-700 hover:underline"
          >
            {t("voucher.viewExplorer")}
          </a>
        </div>

        {redeemed ? (
          <span className="pointer-events-none absolute right-6 top-20 -rotate-8 rounded-lg border-2 border-ink-300 px-3 py-1 font-display text-base font-bold text-ink-300 animate-stamp">
            {voucherStatusText(voucher.status, locale)}
          </span>
        ) : null}
      </div>

      <div className="px-4 pb-3">
        <VoucherReviewPanel voucher={voucher} />
      </div>
    </div>
  );
}
