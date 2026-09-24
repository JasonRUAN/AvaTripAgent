"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DemoBadge } from "@/components/demo-badge";
import { VoucherCard } from "@/components/voucher-card";
import { BACKEND_URL } from "@/lib/contracts";
import type { VoucherDetail } from "@/lib/types";

/** 商户核销端（演示）：输入 tokenId，后端自动匹配签发 Agent 身份完成链上核销 */
export default function MerchantPage() {
  const [tokenId, setTokenId] = useState("1");
  const [detail, setDetail] = useState<VoucherDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenId) return;
    let cancelled = false;

    fetch(`${BACKEND_URL}/api/vouchers/${tokenId}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("404"))))
      .then((payload: VoucherDetail) => {
        if (!cancelled) {
          setDetail(payload);
          setMessage(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetail(null);
          setMessage("未找到该凭证，确认 tokenId 是否正确");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tokenId]);

  // 仅 Issued 状态可核销；Redeemed / Voided 均视为不可重复使用
  const unavailable = detail !== null && detail.status !== "Issued";

  const redeem = async () => {
    setBusy(true);
    setMessage(null);
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
        setMessage(
          payload.error === "VOUCHER_NOT_FOUND"
            ? "凭证不存在"
            : (payload.message ?? "核销失败")
        );
        return;
      }

      setDetail((prev) => (prev ? { ...prev, status: "Redeemed" } : prev));
      setMessage(
        `核销成功 · ${payload.providerName ?? detail?.providerName ?? "签发 Agent"} 身份已上链标记` +
          `${payload.txHash ? "" : "（演示模式，无链上交易）"}`
      );
    } catch {
      setMessage("后端不可达，请确认 backend 已启动");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-[880px] px-4 py-6 sm:px-6">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold tracking-tight text-brand-gradient">
          商户核销端
        </h1>
        <p className="mt-1 text-xs text-ink-500">
          出示二维码 → 商家扫码验证 → 自动以签发该凭证的服务商 Agent 身份在链上标记已核销 → 不可重复使用
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="glass-card flex flex-col gap-4 rounded-3xl p-5">
          <div>
            <p className="mb-2 text-xs font-bold tracking-wide text-ink-300">
              ① 输入凭证编号
            </p>
            <input
              value={tokenId}
              onChange={(event) => setTokenId(event.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              placeholder="如 1"
              className="w-full rounded-xl border border-brand-100 bg-white px-4 py-3 font-display text-lg font-bold text-ink-900 outline-none transition-all focus:border-brand-400 focus:shadow-glow"
            />
            <p className="mt-2 text-xs text-ink-500">
              核销身份自动匹配：
              {detail ? (
                <span className="font-bold text-ink-900">{detail.providerName}</span>
              ) : (
                <span className="text-ink-300">读取凭证后显示签发 Agent</span>
              )}
            </p>
          </div>

          <button
            type="button"
            disabled={busy || !tokenId || unavailable}
            onClick={redeem}
            className="sky-gradient flex h-12 w-full cursor-pointer items-center justify-center rounded-2xl text-base font-bold text-white shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy
              ? "核销中…"
              : unavailable
                ? detail?.status === "Voided"
                  ? "凭证已作废"
                  : "已核销 · 不可重复使用"
                : "② 确认核销"}
          </button>

          {unavailable && !busy && !message ? (
            <p className="rounded-xl bg-ink-100 px-3 py-2 text-xs font-semibold text-ink-500">
              该凭证已被核销或作废，无法再次核销
            </p>
          ) : null}

          {message ? (
            <p
              className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                message.includes("失败") || message.includes("不存在")
                  ? "bg-coral-100 text-coral-500"
                  : "bg-mint-100 text-mint-500"
              }`}
            >
              {message}
            </p>
          ) : null}
          {detail?.status === "Redeemed" ? (
            <Link href="/vouchers" className="text-xs font-bold text-brand-700 hover:underline">
              去评价这张凭证 →
            </Link>
          ) : null}

          <div className="flex items-center gap-2">
            <DemoBadge tone="warn" label="演示核销端" />
            <span className="text-[11px] text-ink-300">
              真实场景下由商家扫码触发，此处手动输入编号
            </span>
          </div>
        </div>

        <div>
          {detail ? (
            <VoucherCard voucher={detail} />
          ) : (
            <div className="rounded-3xl border border-dashed border-brand-200 bg-white/50 px-5 py-12 text-center">
              <span className="text-3xl">🎫</span>
              <p className="mt-2 text-sm font-semibold text-ink-500">
                输入凭证编号后在此预览
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
