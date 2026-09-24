"use client";

import { useMemo, useState } from "react";
import { useAgents } from "@/hooks/use-agents";
import { useSubmitReview, useTokenReview } from "@/hooks/use-agent-review";
import { isReviewDeployed } from "@/lib/contracts";
import type { VoucherDetail } from "@/lib/types";

export function VoucherReviewPanel({ voucher }: { voucher: VoucherDetail }) {
  const { review, refresh } = useTokenReview(voucher.tokenId);
  const { submit, isPending, error, address } = useSubmitReview(voucher.tokenId);
  const [score, setScore] = useState(5);
  const [comment, setComment] = useState("");
  const isHolder = Boolean(address && address.toLowerCase() === voucher.holder.toLowerCase());

  if (voucher.status === "Issued") {
    return (
      <p className="mt-2 text-[11px] text-ink-400">
        核销后即可为 {voucher.providerName} 打分
      </p>
    );
  }
  if (voucher.status !== "Redeemed") return null;
  if (!isReviewDeployed) {
    return <p className="mt-2 text-[11px] text-ink-400">评价合约尚未部署到当前网络</p>;
  }
  if (review) {
    return (
      <p className="mt-2 text-[11px] text-ink-700">
        你的评价：{"★".repeat(review.score)}
        {"☆".repeat(5 - review.score)} {review.comment}
      </p>
    );
  }
  if (!isHolder) {
    return <p className="mt-2 text-[11px] text-ink-400">仅持有人可评价</p>;
  }

  return (
    <form
      className="mt-3 flex flex-col gap-2 rounded-xl bg-brand-50/60 p-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const ok = await submit(score, comment);
        if (ok) void refresh();
      }}
    >
      <p className="text-[11px] font-bold text-ink-700">为 {voucher.providerName} 打分</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setScore(value)}
            className={`cursor-pointer text-base ${value <= score ? "text-amber-500" : "text-ink-200"}`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        maxLength={280}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="这次服务怎么样？（可选，最多 280 字）"
        className="min-h-[64px] w-full rounded-lg border border-brand-100 bg-white px-2 py-1.5 text-[11px] outline-none focus:border-brand-400"
      />
      {error ? <p className="text-[11px] text-coral-500">{error}</p> : null}
      <button
        type="submit"
        disabled={isPending}
        className="cursor-pointer rounded-full bg-brand-600 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
      >
        {isPending ? "上链中…" : "提交评价"}
      </button>
    </form>
  );
}

export function AgentScoreBadge({ address }: { address: `0x${string}` }) {
  const { agents } = useAgents();
  const profile = useMemo(
    () => agents.find((agent) => agent.address.toLowerCase() === address.toLowerCase()),
    [agents, address]
  );
  if (!profile) return null;
  const label = profile.ratingCount
    ? `★${profile.ratingAvg.toFixed(1)} (${profile.ratingCount})`
    : "暂无评分";
  return (
    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
      {profile.name} · {label}
    </span>
  );
}
