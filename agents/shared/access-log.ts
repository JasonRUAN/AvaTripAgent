import type { MiddlewareHandler } from "hono";
import { createLogger, shortId, startTimer } from "./logger";

/**
 * Hono 访问日志中间件。
 *
 * 之前两个服务都没有 access log：请求进来/出去没有任何痕迹，
 * 规划卡住、子 Agent 超时、401 被拒都只能靠前端表现反推。
 * 这里统一产出一行/请求：reqId + method + path + status + 耗时，
 * 并把 reqId 写进响应头，便于前端报错时直接把 id 贴过来查日志。
 */

export const REQUEST_ID_HEADER = "x-request-id";

/** 需要 `c.get('reqId')` 的服务用这个 Env 实例化 Hono */
export interface AppEnv {
  Variables: {
    reqId: string;
    reqStartedAt: number;
  };
}

function clientIp(c: Parameters<MiddlewareHandler>[0]): string {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return c.req.header("x-real-ip") ?? "-";
}

export function accessLog(scope: string): MiddlewareHandler<AppEnv> {
  const log = createLogger(scope);

  return async (c, next) => {
    const elapsed = startTimer();
    const reqId = c.req.header(REQUEST_ID_HEADER)?.trim() || shortId("req");
    c.set("reqId", reqId);
    c.set("reqStartedAt", Date.now());

    try {
      await next();
    } finally {
      const status = c.res?.status ?? 500;
      // 流式响应（SSE）已经发过 header，这里再 set 会抛错，忽略即可
      try {
        c.res?.headers.set(REQUEST_ID_HEADER, reqId);
      } catch {
        // headers 已冻结（stream 已开始），reqId 仍可从日志侧关联
      }

      const fields = {
        reqId,
        method: c.req.method,
        path: c.req.path,
        status,
        ms: elapsed(),
        ip: clientIp(c),
      };
      if (status >= 500) log.error("请求失败", fields);
      else if (status >= 400) log.warn("请求被拒绝", fields);
      else log.info("请求完成", fields);
    }
  };
}
