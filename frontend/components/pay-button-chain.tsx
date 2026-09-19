"use client";

import { useAccount } from "wagmi";
import { WalletButton } from "./wallet-button";
import { isDeployed } from "@/lib/contracts";
import type { CheckoutStage } from "@/hooks/use-checkout";

const CHAIN: { key: CheckoutStage; label: string; hint: string }[] = [
  { key: "connect", label: "连接钱包", hint: "Core / MetaMask，切到 Avalanche Fuji" },
  { key: "faucet", label: "领取 tUSDC", hint: "每次 1,000,000 测试币，可重复领" },
  { key: "approve", label: "授权结算合约", hint: "批准 TripSettlement 划转本次总额" },
  { key: "pay", label: "确认支付", hint: "资金进入链上托管，状态 Funded" },
];

export function PayButtonChain({
  stage,
  busy,
  error,
  onFaucet,
  onApprove,
  onPay,
}: {
  stage: CheckoutStage;
  busy: string | null;
  error: string | null;
  onFaucet: () => void;
  onApprove: () => void;
  onPay: () => void;
}) {
  const { isConnected } = useAccount();

  // 未部署合约时按钮链退化为单步「模拟支付」
  if (!isDeployed) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={busy !== null || stage === "settling"}
          onClick={onPay}
          className="sky-gradient flex h-12 w-full cursor-pointer items-center justify-center rounded-2xl text-base font-bold text-white shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "pay"
            ? "提交中…"
            : stage === "settling"
              ? "分账进行中…"
              : "演示模式：模拟支付并分账"}
        </button>
        <p className="rounded-xl bg-amber-100 px-3 py-2 text-[11px] leading-4 text-amber-700">
          合约尚未部署到 Fuji，支付与分账走模拟流程，凭证仅在后端生成（无链上交易）。
          执行 `forge script` 部署后本按钮会自动切换为真实钱包签名。
        </p>
        {error ? (
          <p className="rounded-xl bg-coral-100 px-3 py-2 text-[11px] font-semibold text-coral-500">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  const stageIndex = ["connect", "faucet", "approve", "pay"].indexOf(stage);
  const settled = stage === "settling" || stage === "done";

  const payLabel =
    stage === "faucet"
      ? "领取测试币并完成支付"
      : stage === "approve"
        ? "授权并支付（2 次签名）"
        : "确认支付（1 次签名）";

  return (
    <div className="flex flex-col gap-2.5">
      {!isConnected ? (
        <div className="flex items-center justify-between rounded-xl border border-brand-100 bg-white p-3">
          <span className="text-xs font-semibold text-ink-500">先连接钱包</span>
          <WalletButton />
        </div>
      ) : null}

      {CHAIN.map((item, index) => {
        // 是否高亮当前步骤完全由 stage 决定（stage 由链上余额 / 授权推导），
        // 这样点「确认支付」时内部自动补领、补授权，步骤条也会同步前进
        const active = stageIndex === index;
        const done = settled || stageIndex > index;

        return (
          <div
            key={item.key}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all ${
              active
                ? "border-brand-300 bg-white shadow-soft"
                : done
                  ? "border-mint-500/30 bg-mint-100/60"
                  : "border-brand-100 bg-white/60"
            }`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                done
                  ? "bg-mint-500 text-white"
                  : active
                    ? "sky-gradient text-white"
                    : "bg-brand-50 text-ink-300"
              }`}
            >
              {done ? "✓" : index + 1}
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink-900">{item.label}</p>
              <p className="truncate text-[11px] text-ink-300">{item.hint}</p>
            </div>

            {active && item.key === "faucet" ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={onFaucet}
                className="shrink-0 cursor-pointer rounded-full bg-brand-100 px-3 py-1.5 text-xs font-bold text-brand-700 transition-colors hover:bg-brand-200 disabled:opacity-60"
              >
                {busy === "faucet" ? "领取中…" : "领取"}
              </button>
            ) : null}

            {active && item.key === "approve" ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={onApprove}
                className="shrink-0 cursor-pointer rounded-full bg-brand-100 px-3 py-1.5 text-xs font-bold text-brand-700 transition-colors hover:bg-brand-200 disabled:opacity-60"
              >
                {busy === "approve" ? "授权中…" : "授权"}
              </button>
            ) : null}
          </div>
        );
      })}

      <button
        type="button"
        disabled={!isConnected || busy !== null || settled}
        onClick={onPay}
        className="sky-gradient mt-1 flex h-12 w-full cursor-pointer items-center justify-center rounded-2xl text-base font-bold text-white shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy === "pay"
          ? "等待钱包签名…"
          : busy === "faucet"
            ? "领取测试币中…"
            : busy === "approve"
              ? "授权中…"
              : busy === "prepare"
                ? "检查链上状态…"
                : settled
                  ? "已完成"
                  : payLabel}
      </button>

      <p className="text-[11px] leading-4 text-ink-300">
        全程最多签 3 次（领测试币 / 授权 / 支付）。后续分账与发券由后端 Agent 私钥承担 gas。
      </p>

      {error ? (
        <p className="rounded-xl bg-coral-100 px-3 py-2 text-[11px] font-semibold text-coral-500">
          {error}
        </p>
      ) : null}
    </div>
  );
}
