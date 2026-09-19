"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DemoBadge } from "./demo-badge";
import { WalletButton } from "./wallet-button";

const NAV = [
  { href: "/", label: "规划行程" },
  { href: "/vouchers", label: "我的凭证" },
  { href: "/merchant", label: "商户核销" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="fixed inset-x-0 top-0 z-40 h-[68px] border-b border-brand-100 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-[1600px] items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="sky-gradient flex h-9 w-9 items-center justify-center rounded-xl text-lg shadow-soft">
            ✈
          </span>
          <span className="font-display text-xl font-bold tracking-tight text-brand-gradient">
            AvaTrip
          </span>
        </Link>

        <nav className="ml-2 hidden items-center gap-1 md:flex">
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-3.5 py-2 text-sm font-semibold transition-all ${
                  active
                    ? "bg-brand-100 text-brand-700"
                    : "text-ink-500 hover:bg-brand-50 hover:text-brand-600"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <DemoBadge />
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
