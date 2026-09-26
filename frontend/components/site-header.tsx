"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LocaleSwitcher } from "./locale-switcher";
import { WalletButton } from "./wallet-button";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";

const NAV: { href: string; label: MessageKey }[] = [
  { href: "/", label: "nav.plan" },
  { href: "/vouchers", label: "nav.vouchers" },
  { href: "/merchant", label: "nav.merchant" },
  { href: "/admin", label: "nav.admin" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { t } = useT();

  return (
    <header className="fixed inset-x-0 top-0 z-40 h-[68px] border-b border-brand-100 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-[1600px] items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/logo.png"
            alt="AvaTrip Agent"
            width={36}
            height={36}
            priority
            className="h-9 w-9 rounded-xl object-cover shadow-soft"
          />
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
                {t(item.label)}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <LocaleSwitcher />
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
