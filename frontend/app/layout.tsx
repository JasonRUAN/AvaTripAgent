import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito } from "next/font/google";
import { AppProviders } from "@/components/providers";
import { SiteHeader } from "@/components/site-header";
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

export const metadata: Metadata = {
  title: "AvaTrip Agent · AI 旅行规划与链上凭证",
  description:
    "一句话说出旅行需求，AI Agent 流式生成行程与报价，链上完成托管支付与分账，机票/酒店/门票以 Avalanche 凭证 NFT 交还给你。",
};

export const viewport: Viewport = {
  themeColor: "#2e7bf6",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={`${fredoka.variable} ${nunito.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <AppProviders>
          <SiteHeader />
          <div className="flex-1 pt-[68px]">{children}</div>
        </AppProviders>
      </body>
    </html>
  );
}
