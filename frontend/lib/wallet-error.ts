/**
 * 写合约失败的展示文案。
 *
 * viem / wagmi 抛出的错误只有英文原文，其中「用户取消签名」是最高频的一种，
 * 直接展示会让中文界面出现英文，必须本地化；其余（revert 原因、gas 不足等）
 * 保留原文 —— 这些信息量都在技术细节里，翻译成中文反而丢信息。
 */
import { getDict } from "./i18n";
import type { Locale } from "./i18n/config";

/** 用户在钱包弹窗里点了「拒绝 / 取消」 */
export function isUserRejected(error: unknown): boolean {
  return (
    error instanceof Error &&
    /user (rejected|denied)|rejected the request|用户拒绝/i.test(error.message)
  );
}

/** 用户取消 → 本地化文案；其余 Error → 原文；非 Error → 调用方给的兜底文案 */
export function walletErrorText(
  locale: Locale,
  error: unknown,
  fallback: string
): string {
  if (isUserRejected(error)) return getDict(locale).errors.userRejected;
  return error instanceof Error ? error.message : fallback;
}
