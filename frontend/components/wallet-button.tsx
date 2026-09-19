"use client";

import { useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { maskAddress } from "@/lib/format";

export function WalletButton() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);

  if (isConnected && address) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-full border border-brand-200 bg-white/90 px-3 py-2 text-sm font-semibold text-ink-700 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift"
        >
          <span className="h-2 w-2 rounded-full bg-mint-500" />
          <span className="font-mono">{maskAddress(address)}</span>
          {chain?.name ? (
            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-700">
              {chain.name}
            </span>
          ) : null}
        </button>

        {open ? (
          <div className="absolute right-0 z-50 mt-2 w-48 animate-pop-in rounded-xl border border-brand-100 bg-white p-2 shadow-lift">
            <button
              type="button"
              onClick={() => {
                disconnect();
                setOpen(false);
              }}
              className="w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm font-medium text-ink-500 transition-colors hover:bg-brand-50 hover:text-coral-500"
            >
              断开连接
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={isPending}
        onClick={() => setOpen((v) => !v)}
        className="sky-gradient cursor-pointer rounded-full px-4 py-2 text-sm font-bold text-white shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "连接中…" : "连接钱包"}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-56 animate-pop-in rounded-xl border border-brand-100 bg-white p-2 shadow-lift">
          {connectors.length === 0 ? (
            <p className="px-3 py-2 text-sm text-ink-300">
              未检测到钱包，请安装 Core 或 MetaMask
            </p>
          ) : (
            connectors.map((connector) => (
              <button
                key={connector.uid}
                type="button"
                onClick={() => {
                  connect({ connector });
                  setOpen(false);
                }}
                className="w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm font-semibold text-ink-700 transition-colors hover:bg-brand-50 hover:text-brand-700"
              >
                {connector.name}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
