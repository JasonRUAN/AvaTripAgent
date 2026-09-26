"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LOCALE,
  HTML_LANG,
  LOCALE_COOKIE_KEY,
  LOCALE_COOKIE_MAX_AGE,
  type Locale,
} from "./config";
import {
  setActiveLocale,
  translate,
  type MessageKey,
  type MessageVars,
} from "./index";

interface LocaleValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: MessageKey, vars?: MessageVars) => string;
}

const LocaleContext = createContext<LocaleValue | null>(null);

function writeCookie(next: Locale) {
  if (typeof document === "undefined") return;
  document.cookie = `${LOCALE_COOKIE_KEY}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
  // 同步 <html lang>：SSR 输出的 lang 由服务端 cookie 决定，客户端切换后要手动跟上
  document.documentElement.lang = HTML_LANG[next];
}

export function LocaleProvider({
  initialLocale = DEFAULT_LOCALE,
  children,
}: {
  initialLocale?: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  // 同步给模块级镜像：异步回调里读得到最新语言
  useEffect(() => {
    setActiveLocale(locale);
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    writeCookie(next);
    setLocaleState(next);
  }, []);

  const value = useMemo<LocaleValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
    }),
    [locale, setLocale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleValue {
  const value = useContext(LocaleContext);
  if (!value) {
    throw new Error("useLocale 必须在 <LocaleProvider> 内使用");
  }
  return value;
}

/** 组件里拿 `{ locale, t, setLocale }` 的主力 hook */
export function useT(): LocaleValue {
  return useLocale();
}
