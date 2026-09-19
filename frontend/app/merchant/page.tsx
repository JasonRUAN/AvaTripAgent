"use client";

import { useEffect, useState } from "react";
import { DemoBadge } from "@/components/demo-badge";
import { VoucherCard } from "@/components/voucher-card";
import { BACKEND_URL } from "@/lib/contracts";
import type { VoucherDetail } from "@/lib/types";

const PROVIDERS = [
  { key: "flight", name: "AvaFlights Agent", icon: "✈️", gradient: "linear-gradient(135deg,#2e7bf6,#4c9aff)" },
  { key: "hotel", name: "AvaStays Agent", icon: "🏨", gradient: "linear-gradient(135deg,#7c6bf5,#a78bfa)" },
  { key: "attraction", name: "AvaTickets Agent", icon: "🎟️", gradient: "linear-gradient(135deg,#17c964,#5fd98d)" },
  { key: "dining", name: "AvaTables Agent", icon: "🍜", gradient: "linear-gradient(135deg,#ff8a3d,#ffb020)" },
] as const;

type ProviderKey = (typeof PROVIDERS)[number]["key"];

/** 商户核销端（演示）：选一个服务商 Agent 身份，输入 tokenId 完成链上核销 */
export default function MerchantPage() {
  const [provider, setProvider] = useState<ProviderKey>("flight");
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

  const redeem = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`${BACKEND_URL}/api/vouchers/${tokenId}/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
        txHash?: string;
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
      setMessage(`核销成功${payload.txHash ? ` · 交易已上链` : " · 演示模式（无链上交易）"}`);
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
          出示二维码 → 商家扫码验证 → 以服务商 Agent 身份在链上标记已核销 → 不可重复使用
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="glass-card flex flex-col gap-4 rounded-3xl p-5">
          <div>
            <p className="mb-2 text-xs font-bold tracking-wide text-ink-300">
              ① 选择核销身份
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PROVIDERS.map((item) => {
                const active = item.key === provider;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setProvider(item.key)}
                    className={`cursor-pointer rounded-2xl border p-3 text-center transition-all hover:-translate-y-0.5 ${
                      active
                        ? "border-brand-300 bg-white shadow-lift"
                        : "border-brand-100 bg-white/60"
                    }`}
                  >
                    <span
                      className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl text-lg"
                      style={{ backgroundImage: item.gradient }}
                    >
                      {item.icon}
                    </span>
                    <p className="mt-1.5 truncate text-[11px] font-bold text-ink-900">
                      {item.name}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold tracking-wide text-ink-300">
              ② 输入凭证编号
            </p>
            <input
              value={tokenId}
              onChange={(event) => setTokenId(event.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              placeholder="如 1"
              className="w-full rounded-xl border border-brand-100 bg-white px-4 py-3 font-display text-lg font-bold text-ink-900 outline-none transition-all focus:border-brand-400 focus:shadow-glow"
            />
          </div>

          <button
            type="button"
            disabled={busy || !tokenId}
            onClick={redeem}
            className="sky-gradient flex h-12 w-full cursor-pointer items-center justify-center rounded-2xl text-base font-bold text-white shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "核销中…" : "③ 确认核销"}
          </button>

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
