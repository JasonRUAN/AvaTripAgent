"use client";

import { useState } from "react";
import { AgentStream } from "@/components/agent-stream";
import { QuotePanel } from "@/components/quote-panel";
import { TripRequestForm } from "@/components/trip-request-form";
import { useCheckout } from "@/hooks/use-checkout";
import { usePlanRun } from "@/hooks/use-plan-run";
import { useT } from "@/lib/i18n/context";
import type { ProviderSelection, RecommendMode, TripRequest } from "@/lib/types";

export default function WorkbenchPage() {
  const { state, lastRequest, start, reset } = usePlanRun();
  const { t } = useT();
  const [request, setRequest] = useState<TripRequest | null>(lastRequest);
  const days = state.days.flatMap((day) => (day.day ? [day.day] : []));
  const checkout = useCheckout({ quote: state.quote, runId: state.runId, days, request });
  const selectionLocked = checkout.stage === "settling" || checkout.stage === "done";

  const handleSubmit = (next: TripRequest, providers: ProviderSelection, recommendMode: RecommendMode) => {
    setRequest(next);
    void start(next, providers, recommendMode);
  };

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-brand-gradient">
            {t("home.title")}
          </h1>
          <p className="mt-1 text-xs text-ink-500">{t("home.subtitle")}</p>
        </div>

        {state.status !== "idle" ? (
          <button
            type="button"
            onClick={() => {
              reset();
              setRequest(null);
            }}
            className="cursor-pointer rounded-full border border-brand-200 bg-white px-4 py-2 text-xs font-bold text-brand-700 transition-all hover:-translate-y-0.5 hover:shadow-soft"
          >
            {t("home.replan")}
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <aside className="lg:sticky lg:top-[88px] lg:self-start">
          <div className="glass-card rounded-3xl p-4">
            <TripRequestForm
              onSubmit={handleSubmit}
              running={state.status === "running"}
              initialRequest={lastRequest ?? undefined}
            />
          </div>
        </aside>

        <section className="min-w-0">
          <div className="glass-card min-h-[420px] rounded-3xl p-4 sm:p-5">
            <AgentStream
              state={state}
              request={request}
              selectionLocked={selectionLocked}
            />
          </div>
        </section>

        <aside className="xl:sticky xl:top-[88px] xl:self-start">
          <div className="glass-card rounded-3xl p-4">
            <QuotePanel
              quote={state.quote}
              budget={request?.budget ?? state.budget?.budget}
              checkout={checkout}
            />
          </div>
        </aside>
      </div>
    </main>
  );
}
