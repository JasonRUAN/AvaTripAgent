/**
 * 轻量结构化日志。
 *
 * 设计约束（本项目是现场演示 + 多进程部署，日志要能直接 tail 着看）：
 * - 零依赖：不引 pino/winston，避免现场装包失败；只吃 `console`。
 * - 分级 + 作用域 + 结构化字段：一眼看出「哪个服务 / 哪次请求 / 哪个订单」。
 * - 默认脱敏：私钥、API Key、内部令牌、Bearer 绝不进日志。
 * - 环境变量：`LOG_LEVEL=debug|info|warn|error`（默认 info）、`LOG_FORMAT=json`（默认文本）。
 *
 * 用法：
 *   const log = createLogger("orchestrator");
 *   const reqLog = log.child({ reqId });
 *   reqLog.info("下单受理", { orderId, total });
 *   reqLog.error("分账失败", { orderId }, error);
 */

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const LEVEL_LABEL: Record<LogLevel, string> = {
  debug: "DEBUG",
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
};

function resolveMinLevel(): number {
  const raw = (process.env.LOG_LEVEL ?? "").trim().toLowerCase();
  return LEVEL_ORDER[raw as LogLevel] ?? LEVEL_ORDER.info;
}

const MIN_LEVEL = resolveMinLevel();
const JSON_OUTPUT = (process.env.LOG_FORMAT ?? "").trim().toLowerCase() === "json";

/** 64 位十六进制 = 私钥特征（地址是 40 位，不受影响） */
const PRIVATE_KEY = /\b0x[0-9a-fA-F]{64}\b/g;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;

/**
 * 命中即脱敏的字段名（已归一化：小写、只保留字母数字）。
 * 用精确集合而不是模糊包含，避免把 tokenId / txHash 这类排查要害也打码。
 */
const SENSITIVE_NAMES = new Set([
  "authorization",
  "internaltoken",
  "accesstoken",
  "refreshtoken",
  "token",
  "bearer",
  "secret",
  "password",
  "passwd",
  "mnemonic",
  "credential",
]);

/** 这些「以 key 结尾」的字段同样敏感（私钥、API Key），但少数业务字段例外 */
const SENSITIVE_SUFFIX = ["key", "secret", "privatekey"];
const SENSITIVE_EXCEPTIONS = new Set(["cachekey"]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveKey(rawKey: string): boolean {
  const key = normalizeKey(rawKey);
  if (!key || SENSITIVE_EXCEPTIONS.has(key)) return false;
  if (SENSITIVE_NAMES.has(key)) return true;
  return SENSITIVE_SUFFIX.some((suffix) => key.endsWith(suffix));
}

function maskString(value: string): string {
  return value.replace(PRIVATE_KEY, "0x***").replace(BEARER, "Bearer ***");
}

/** Error 只留前几帧：完整堆栈在 demo 里太长，够定位即可 */
export function serializeError(error: unknown): LogFields {
  if (error instanceof Error) {
    const stack = (error.stack ?? "")
      .split("\n")
      .slice(0, 4)
      .map((line) => line.trim())
      .join(" | ");
    return { name: error.name, message: maskString(error.message), ...(stack ? { stack } : {}) };
  }
  if (typeof error === "string") return { message: maskString(error) };
  return { message: maskString(String(error)) };
}

const MAX_DEPTH = 4;
const MAX_ARRAY = 20;

function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return maskString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return `${value}n`;
  if (value instanceof Error) return serializeError(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return `[array:${value.length}]`;
    return value.slice(0, MAX_ARRAY).map((item) => redact(item, depth + 1));
  }
  if (typeof value === "object") {
    if (depth >= MAX_DEPTH) return "[object]";
    const out: LogFields = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      // 布尔型开关（hasAgentKey 之类）不是密钥，放行以免排查信息被误杀
      const masked = isSensitiveKey(key) && typeof nested !== "boolean";
      out[key] = masked ? "***" : redact(nested, depth + 1);
    }
    return out;
  }
  return String(value);
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value.includes(" ") ? `"${value}"` : value;
  if (value === null || value === undefined) return String(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function toText(record: LogFields & { ts: string; level: string; scope: string; msg: string }): string {
  const { ts, level, scope, msg, ...rest } = record;
  const fields = Object.entries(rest)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${formatValue(value)}`)
    .join(" ");
  return `${ts} ${level} [${scope}] ${msg}${fields ? ` ${fields}` : ""}`;
}

export class Logger {
  constructor(
    private readonly scope: string,
    private readonly base: LogFields = {}
  ) {}

  /** 带上固定上下文（runId / orderId / reqId），后续每条日志自动携带 */
  child(fields: LogFields): Logger {
    return new Logger(this.scope, { ...this.base, ...fields });
  }

  debug(message: string, fields?: LogFields, error?: unknown): void {
    this.write("debug", message, fields, error);
  }

  info(message: string, fields?: LogFields, error?: unknown): void {
    this.write("info", message, fields, error);
  }

  warn(message: string, fields?: LogFields, error?: unknown): void {
    this.write("warn", message, fields, error);
  }

  /** error 单独一个参数位：保证堆栈一定被记录，不会被字段覆盖 */
  error(message: string, fields?: LogFields, error?: unknown): void {
    this.write("error", message, fields, error);
  }

  /** 包裹一段异步操作，自动记录耗时；失败时记录耗时 + 堆栈后原样抛出 */
  async time<T>(operation: string, run: () => Promise<T>, fields?: LogFields): Promise<T> {
    const elapsed = startTimer();
    this.debug(`${operation} 开始`, fields);
    try {
      const result = await run();
      this.info(`${operation} 完成`, { ...fields, ms: elapsed() });
      return result;
    } catch (error) {
      this.error(`${operation} 失败`, { ...fields, ms: elapsed() }, error);
      throw error;
    }
  }

  private write(level: LogLevel, message: string, fields?: LogFields, error?: unknown): void {
    if (LEVEL_ORDER[level] < MIN_LEVEL) return;

    const record: LogFields & { ts: string; level: string; scope: string; msg: string } = {
      ts: new Date().toISOString(),
      level: LEVEL_LABEL[level],
      scope: this.scope,
      msg: maskString(message),
      ...(redact({ ...this.base, ...fields }) as LogFields),
    };
    if (error !== undefined) record.err = serializeError(error);

    const line = JSON_OUTPUT ? JSON.stringify(record) : toText(record);
    if (level === "error" || level === "warn") console.error(line);
    else console.log(line);
  }
}

export function createLogger(scope: string, fields?: LogFields): Logger {
  return new Logger(scope, fields);
}

/** 计时器：返回「至今耗时(ms)」的函数，避免每个调用点手写 Date.now() */
export function startTimer(): () => number {
  const started = Date.now();
  return () => Date.now() - started;
}

/** 短期唯一 id，用于串联同一次请求/任务的日志 */
export function shortId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * 进程级兜底：把「静默死掉」变成「有日志地死掉」。
 * 编排里有 fire-and-forget 的 `void runPlan()` / `void settleOrder()`，
 * 没有 unhandledRejection 监听时任何一次抛错都只会消失在终端里。
 */
export function installProcessGuards(service: string): void {
  const log = createLogger("process", { service });

  process.on("uncaughtException", (error) => {
    log.error("未捕获异常，进程退出", {}, error);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    log.error("未处理的 Promise 拒绝（任务结果可能已丢失）", {}, reason);
  });

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      log.info("收到退出信号", { signal });
      setTimeout(() => process.exit(0), 150).unref();
    });
  }
}
