import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Fredoka, Nunito } from "next/font/google";
import { AppProviders } from "@/components/providers";
import { SiteHeader } from "@/components/site-header";
import {
  HTML_LANG,
  LOCALE_COOKIE_KEY,
  parseLocale,
  type Locale,
} from "@/lib/i18n/config";
import { getDict } from "@/lib/i18n";
import "./globals.css";

/** 活泼圆体 —— 标题与数字 */
const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  display: "swap",
});

/** 圆润正文 —— 兼顾大量中文行程内容的可读性 */
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  display: "swap",
});

/**
 * 语言存在 cookie 里，服务端读得到，首屏就能输出正确的 <html lang> 与 metadata，
 * 客户端 Provider 用同一个值初始化，避免先渲染中文再跳变。
 */
async function readLocale(): Promise<Locale> {
  const store = await cookies();
  return parseLocale(store.get(LOCALE_COOKIE_KEY)?.value);
}

export async function generateMetadata(): Promise<Metadata> {
  const dict = getDict(await readLocale());
  return {
    title: dict.meta.title,
    description: dict.meta.description,
    icons: {
      icon: [{ url: "/logo.png", type: "image/png" }],
      shortcut: "/logo.png",
      apple: "/logo.png",
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#2e7bf6",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await readLocale();

  return (
    <html
      lang={HTML_LANG[locale]}
      className={`${fredoka.variable} ${nunito.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <AppProviders initialLocale={locale}>
          <SiteHeader />
          <div className="flex-1 pt-[68px]">{children}</div>
        </AppProviders>
      </body>
    </html>
  );
}
