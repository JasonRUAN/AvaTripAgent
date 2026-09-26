"use client";

import { useAccount } from "wagmi";
import { WalletButton } from "./wallet-button";
import { isDeployed } from "@/lib/contracts";
import { useT } from "@/lib/i18n/context";
import type { CheckoutStage } from "@/hooks/use-checkout";

export function PayButtonChain({
  stage,
  busy,
  error,
  payDisabled,
  onFaucet,
  onApprove,
  onPay,
}: {
  stage: CheckoutStage;
  busy: string | null;
  error: string | null;
  payDisabled?: boolean;
  onFaucet: () => void;
  onApprove: () => void;
  onPay: () => void;
}) {
  const { isConnected } = useAccount();
  const { t } = useT();

  // 未部署合约时按钮链退化为单步「模拟支付」
  if (!isDeployed) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={payDisabled || busy !== null || stage === "settling"}
          onClick={onPay}
          className="sky-gradient flex h-12 w-full cursor-pointer items-center justify-center rounded-2xl text-base font-bold text-white shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "pay"
            ? t("pay.submitting")
            : stage === "settling"
              ? t("pay.settling")
              : t("pay.demoPay")}
        </button>
        <p className="rounded-xl bg-amber-100 px-3 py-2 text-[11px] leading-4 text-amber-700">
          {t("pay.notDeployed")}
        </p>
        {payDisabled ? (
          <p className="rounded-xl bg-brand-50 px-3 py-2 text-[11px] leading-4 text-ink-500">
            {t("pay.needSelection")}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-xl bg-coral-100 px-3 py-2 text-[11px] font-semibold text-coral-500">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  const chain: {
    key: CheckoutStage;
    label: string;
    hint: string;
  }[] = [
    { key: "connect", label: t("pay.stepConnect"), hint: t("pay.stepConnectHint") },
    { key: "faucet", label: t("pay.stepFaucet"), hint: t("pay.stepFaucetHint") },
    { key: "approve", label: t("pay.stepApprove"), hint: t("pay.stepApproveHint") },
    { key: "pay", label: t("pay.stepPay"), hint: t("pay.stepPayHint") },
  ];

  const stageIndex = ["connect", "faucet", "approve", "pay"].indexOf(stage);
  const settled = stage === "settling" || stage === "done";

  const payLabel =
    stage === "faucet"
      ? t("pay.claimAndPay")
      : stage === "approve"
        ? t("pay.approveAndPay")
        : t("pay.confirmPay");

  return (
    <div className="flex flex-col gap-2.5">
      {!isConnected ? (
        <div className="flex items-center justify-between rounded-xl border border-brand-100 bg-white p-3">
          <span className="text-xs font-semibold text-ink-500">{t("pay.connectFirst")}</span>
          <WalletButton />
        </div>
      ) : null}

      {chain.map((item, index) => {
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
                {busy === "faucet" ? t("pay.claiming") : t("pay.claim")}
              </button>
            ) : null}

            {active && item.key === "approve" ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={onApprove}
                className="shrink-0 cursor-pointer rounded-full bg-brand-100 px-3 py-1.5 text-xs font-bold text-brand-700 transition-colors hover:bg-brand-200 disabled:opacity-60"
              >
                {busy === "approve" ? t("pay.approving") : t("pay.approve")}
              </button>
            ) : null}
          </div>
        );
      })}

      <button
        type="button"
        disabled={payDisabled || !isConnected || busy !== null || settled}
        onClick={onPay}
        className="sky-gradient mt-1 flex h-12 w-full cursor-pointer items-center justify-center rounded-2xl text-base font-bold text-white shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy === "pay"
          ? t("pay.waitingSignature")
          : busy === "faucet"
            ? t("pay.claimingTokens")
            : busy === "approve"
              ? t("pay.approving")
              : busy === "prepare"
                ? t("pay.checkingChain")
                : settled
                  ? t("pay.done")
                  : payLabel}
      </button>

      <p className="text-[11px] leading-4 text-ink-300">{t("pay.signatureNote")}</p>

      {payDisabled ? (
        <p className="rounded-xl bg-brand-50 px-3 py-2 text-[11px] leading-4 text-ink-500">
          {t("pay.needSelection")}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-xl bg-coral-100 px-3 py-2 text-[11px] font-semibold text-coral-500">
          {error}
        </p>
      ) : null}
    </div>
  );
}
