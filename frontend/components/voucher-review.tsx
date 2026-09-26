"use client";

import { useMemo, useState } from "react";
import { useAgents } from "@/hooks/use-agents";
import { useSubmitReview, useTokenReview } from "@/hooks/use-agent-review";
import { isReviewDeployed } from "@/lib/contracts";
import { useT } from "@/lib/i18n/context";
import type { VoucherDetail } from "@/lib/types";

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
      <path
        d="M12 2.6 14.7 8.4l6.3.7-4.7 4.3 1.3 6.2L12 16.6 6.4 19.6l1.3-6.2L3 9.1l6.3-.7L12 2.6Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StarPicker({
  score,
  onChange,
}: {
  score: number;
  onChange: (value: number) => void;
}) {
  const { t } = useT();
  const [hovered, setHovered] = useState<number | null>(null);
  const display = hovered ?? score;

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex items-center"
        onMouseLeave={() => setHovered(null)}
        role="radiogroup"
        aria-label={t("review.ratingGroup")}
      >
        {[1, 2, 3, 4, 5].map((value) => {
          const active = value <= display;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={value === score}
              aria-label={t("review.points", { n: value })}
              onClick={() => onChange(value)}
              onMouseEnter={() => setHovered(value)}
              onFocus={() => setHovered(value)}
              onBlur={() => setHovered(null)}
              className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition-transform duration-150 hover:scale-110 ${
                active ? "text-amber-500" : "text-brand-200"
              }`}
            >
              <StarIcon filled={active} />
            </button>
          );
        })}
      </div>
      <span className="font-display text-sm font-bold text-amber-700">
        {t("review.points", { n: display })}
      </span>
    </div>
  );
}

export function VoucherReviewPanel({ voucher }: { voucher: VoucherDetail }) {
  const { review, refresh } = useTokenReview(voucher.tokenId);
  const { submit, isPending, error, address } = useSubmitReview(voucher.tokenId);
  const { t } = useT();
  const [score, setScore] = useState(5);
  const [comment, setComment] = useState("");
  const isHolder = Boolean(address && address.toLowerCase() === voucher.holder.toLowerCase());

  if (voucher.status === "Issued") {
    return (
      <p className="mt-2 text-[11px] text-ink-400">
        {t("review.canRateAfter", { provider: voucher.providerName })}
      </p>
    );
  }
  if (voucher.status !== "Redeemed") return null;
  if (!isReviewDeployed) {
    return <p className="mt-2 text-[11px] text-ink-400">{t("review.notDeployed")}</p>;
  }
  if (review) {
    return (
      <p className="mt-2 text-[12px] font-semibold text-ink-700">
        {t("review.yourReview")}
        <span className="ml-1 tracking-wide text-amber-500">
          {"★".repeat(review.score)}
        </span>
        <span className="tracking-wide text-brand-200">
          {"☆".repeat(5 - review.score)}
        </span>
        {review.comment ? <span className="ml-1.5 font-normal text-ink-500">{review.comment}</span> : null}
      </p>
    );
  }
  if (!isHolder) {
    return <p className="mt-2 text-[11px] text-ink-400">{t("review.holderOnly")}</p>;
  }

  return (
    <form
      className="mt-1 flex flex-col gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-50 p-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const ok = await submit(score, comment);
        if (ok) void refresh();
      }}
    >
      <p className="text-[12px] font-bold text-ink-900">
        {t("review.rateTitle", { provider: voucher.providerName })}
      </p>
      <StarPicker score={score} onChange={setScore} />
      <textarea
        maxLength={280}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder={t("review.commentPlaceholder")}
        className="min-h-[64px] w-full rounded-xl border border-amber-500/25 bg-white px-3 py-2 text-[12px] text-ink-900 outline-none placeholder:text-ink-300 focus:border-amber-500 focus:shadow-[0_0_0_3px_rgb(255_176_32/0.18)]"
      />
      {error ? <p className="text-[11px] text-coral-500">{error}</p> : null}
      <button
        type="submit"
        disabled={isPending}
        className="sky-gradient h-9 cursor-pointer rounded-full px-3 text-[12px] font-bold text-white shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? t("review.submitting") : t("review.submit")}
      </button>
    </form>
  );
}

export function AgentScoreBadge({ address }: { address: `0x${string}` }) {
  const { agents } = useAgents();
  const { t } = useT();
  const profile = useMemo(
    () => agents.find((agent) => agent.address.toLowerCase() === address.toLowerCase()),
    [agents, address]
  );
  if (!profile) return null;
  const label = profile.ratingCount
    ? `★${profile.ratingAvg.toFixed(1)} (${profile.ratingCount})`
    : t("units.noRating");
  return (
    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
      {profile.name} · {label}
    </span>
  );
}
