"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DemoBadge } from "@/components/demo-badge";
import { VoucherCard } from "@/components/voucher-card";
import { BACKEND_URL } from "@/lib/contracts";
import { invalidateVoucherList } from "@/lib/session-cache";
import { useT } from "@/lib/i18n/context";
import { backendErrorText } from "@/lib/backend-error";
import type { VoucherDetail } from "@/lib/types";

/**
 * 提示语的错误类型。
 *
 * 之前是靠 `message.includes("失败")` 判断红/绿样式，翻译后这条判断必然失效；
 * 改成结构化 code，样式与文案解耦。
 */
type NoticeCode = "success" | "not_found" | "not_exist" | "failed" | "network";

interface Notice {
  code: NoticeCode;
  text: string;
}

/** 商户核销端（演示）：输入 tokenId，后端自动匹配签发 Agent 身份完成链上核销 */
export default function MerchantPage() {
  const { t, locale } = useT();
  const [tokenId, setTokenId] = useState("");
  const [detail, setDetail] = useState<VoucherDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!tokenId) {
      setDetail(null);
      setNotice(null);
      return;
    }
    let cancelled = false;

    fetch(`${BACKEND_URL}/api/vouchers/${tokenId}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("404"))))
      .then((payload: VoucherDetail) => {
        if (!cancelled) {
          setDetail(payload);
          setNotice(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetail(null);
          setNotice({ code: "not_found", text: t("merchant.notFound") });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tokenId, t]);

  // 仅 Issued 状态可核销；Redeemed / Voided 均视为不可重复使用
  const unavailable = detail !== null && detail.status !== "Issued";

  const redeem = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(`${BACKEND_URL}/api/vouchers/${tokenId}/redeem`, {
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
        txHash?: string;
        providerName?: string;
      };

      if (!response.ok) {
        setNotice(
          payload.error === "VOUCHER_NOT_FOUND"
            ? { code: "not_exist", text: t("merchant.notExist") }
            : {
                code: "failed",
                // 后端只回 code：按当前语言取字典，未知 code 才回退服务端 message
                text:
                  backendErrorText(locale, {
                    code: payload.error,
                    message: payload.message,
                  }) ?? t("merchant.redeemFailed"),
              }
        );
        return;
      }

      setDetail((prev) => (prev ? { ...prev, status: "Redeemed" } : prev));
      // 状态已变成 Redeemed：持有者那边的凭证页缓存作废，避免还显示「有效」
      invalidateVoucherList();
      setNotice({
        code: "success",
        text:
          t("merchant.redeemSuccess", {
            provider: payload.providerName ?? detail?.providerName ?? t("merchant.issuerFallback"),
          }) + (payload.txHash ? "" : t("merchant.demoSuffix")),
      });
    } catch {
      setNotice({ code: "network", text: t("merchant.backendDown") });
    } finally {
      setBusy(false);
    }
  };

  const redeemLabel = busy
    ? t("merchant.redeeming")
    : unavailable
      ? detail?.status === "Voided"
        ? t("merchant.voided")
        : t("merchant.alreadyRedeemed")
      : t("merchant.confirm");

  return (
    <main className="mx-auto w-full max-w-[880px] px-4 py-6 sm:px-6">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold tracking-tight text-brand-gradient">
          {t("merchant.title")}
        </h1>
        <p className="mt-1 text-xs text-ink-500">{t("merchant.subtitle")}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="glass-card flex flex-col gap-4 rounded-3xl p-5">
          <div>
            <p className="mb-2 text-xs font-bold tracking-wide text-ink-300">
              {t("merchant.step1")}
            </p>
            <input
              value={tokenId}
              onChange={(event) => setTokenId(event.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              autoFocus
              placeholder={t("merchant.tokenPlaceholder")}
              className="w-full rounded-xl border border-brand-100 bg-white px-4 py-3 font-display text-lg font-bold text-ink-900 outline-none transition-all focus:border-brand-400 focus:shadow-glow"
            />
            <p className="mt-2 text-xs text-ink-500">
              {t("merchant.identity")}
              {detail ? (
                <span className="font-bold text-ink-900">{detail.providerName}</span>
              ) : (
                <span className="text-ink-300">{t("merchant.identityEmpty")}</span>
              )}
            </p>
          </div>

          <button
            type="button"
            disabled={busy || !tokenId || unavailable}
            onClick={redeem}
            className="sky-gradient flex h-12 w-full cursor-pointer items-center justify-center rounded-2xl text-base font-bold text-white shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
          >
            {redeemLabel}
          </button>

          {unavailable && !busy && !notice ? (
            <p className="rounded-xl bg-ink-100 px-3 py-2 text-xs font-semibold text-ink-500">
              {t("merchant.unavailable")}
            </p>
          ) : null}

          {notice ? (
            <p
              className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                notice.code === "success"
                  ? "bg-mint-100 text-mint-500"
                  : "bg-coral-100 text-coral-500"
              }`}
            >
              {notice.text}
            </p>
          ) : null}
          {detail?.status === "Redeemed" ? (
            <Link href="/vouchers" className="text-xs font-bold text-brand-700 hover:underline">
              {t("merchant.rateLink")}
            </Link>
          ) : null}

          <div className="flex items-center gap-2">
            <DemoBadge tone="warn" label={t("merchant.demoLabel")} />
            <span className="text-[11px] text-ink-300">{t("merchant.demoNote")}</span>
          </div>
        </div>

        <div>
          {detail ? (
            <VoucherCard voucher={detail} />
          ) : (
            <div className="rounded-3xl border border-dashed border-brand-200 bg-white/50 px-5 py-12 text-center">
              <span className="text-3xl">🎫</span>
              <p className="mt-2 text-sm font-semibold text-ink-500">
                {t("merchant.previewEmpty")}
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
