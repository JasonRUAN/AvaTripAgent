"use client";

import { LOCALES, LOCALE_NAME, type Locale } from "@/lib/i18n/config";
import { useT } from "@/lib/i18n/context";

/** 右上角中 / EN 切换：当前语言高亮，选择写进 cookie */
export function LocaleSwitcher() {
  const { locale, setLocale, t } = useT();

  return (
    <div
      role="group"
      aria-label={t("locale.label")}
      className="flex items-center gap-0.5 rounded-full border border-brand-100 bg-white/90 p-0.5 shadow-soft"
    >
      {LOCALES.map((item: Locale) => {
        const active = item === locale;
        return (
          <button
            key={item}
            type="button"
            aria-pressed={active}
            title={t("locale.switchTo", { language: LOCALE_NAME[item] })}
            onClick={() => setLocale(item)}
            className={`cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-bold transition-all ${
              active
                ? "sky-gradient text-white shadow-soft"
                : "text-ink-500 hover:bg-brand-50 hover:text-brand-700"
            }`}
          >
            {LOCALE_NAME[item]}
          </button>
        );
      })}
    </div>
  );
}
