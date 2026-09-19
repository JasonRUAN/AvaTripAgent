"use client";

import { useCallback, useSyncExternalStore } from "react";
import QRCode from "react-qr-code";
import { DemoBadge } from "./demo-badge";
import { CONTRACTS } from "@/lib/contracts";
import { explorerToken, formatDate, maskAddress } from "@/lib/format";
import type { VoucherDetail } from "@/lib/types";

export const CATEGORY_STYLE: Record<
  number,
  { gradient: string; label: string; icon: string }
> = {
  0: {
    gradient: "linear-gradient(135deg,#2e7bf6,#4c9aff)",
    label: "机票",
    icon: "✈️",
  },
  1: {
    gradient: "linear-gradient(135deg,#7c6bf5,#a78bfa)",
    label: "酒店",
    icon: "🏨",
  },
  2: {
    gradient: "linear-gradient(135deg,#17c964,#5fd98d)",
    label: "门票",
    icon: "🎟️",
  },
  3: {
    gradient: "linear-gradient(135deg,#ff8a3d,#ffb020)",
    label: "餐饮",
    icon: "🍜",
  },
};

const STATUS_STYLE: Record<VoucherDetail["status"], { text: string; cls: string }> = {
  Issued: { text: "有效", cls: "bg-mint-100 text-mint-500" },
  Redeemed: { text: "已核销", cls: "bg-ink-100 text-ink-500" },
  Voided: { text: "已作废", cls: "bg-coral-100 text-coral-500" },
};

export function VoucherCard({
  voucher,
  showQr = true,
}: {
  voucher: VoucherDetail;
  showQr?: boolean;
}) {
  const style = CATEGORY_STYLE[voucher.category] ?? CATEGORY_STYLE[0]!;
  const status = STATUS_STYLE[voucher.status];
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
      className={`relative overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-card transition-all hover:-translate-y-1 hover:shadow-lift animate-pop-in ${
        redeemed ? "opacity-60 saturate-0" : ""
      }`}
    >
      {/* 顶部色条 */}
      <div
        className="flex items-center gap-2 px-4 py-3 text-white"
        style={{ backgroundImage: style.gradient }}
      >
        <span className="text-lg">{style.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{style.label}凭证</p>
          <p className="truncate text-[11px] opacity-90">{voucher.providerName}</p>
        </div>
        <span className="shrink-0 rounded-full bg-white/25 px-2.5 py-1 text-[11px] font-bold">
          {status.text}
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
            <span>持有者 {maskAddress(voucher.holder)}</span>
            <span>有效期至 {formatDate(voucher.validTo)}</span>
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
        <DemoBadge tone="soft" label="Avalanche Fuji · 链上凭证" />
        <a
          href={explorerToken(CONTRACTS.travelVoucher)}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-[11px] font-bold text-brand-700 hover:underline"
        >
          在 Explorer 查看 ↗
        </a>
      </div>

      {redeemed ? (
        <span className="pointer-events-none absolute right-6 top-20 -rotate-8 rounded-lg border-2 border-ink-300 px-3 py-1 font-display text-base font-bold text-ink-300 animate-stamp">
          {voucher.status === "Redeemed" ? "已核销" : "已作废"}
        </span>
      ) : null}
    </div>
  );
}
