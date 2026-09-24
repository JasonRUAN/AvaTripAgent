import { env, hasLLM } from "./env";

/**
 * 极薄的 OpenAI 兼容客户端。
 *
 * 只依赖 fetch：不引入任何 SDK，避免现场安装失败或体积膨胀。
 * 同时提供「一次性 JSON」与「流式 delta」两种调用。
 */

export class LLMUnavailableError extends Error {
  constructor(message = "未配置 OPENAI_API_KEY，无法调用真实模型") {
    super(message);
    this.name = "LLMUnavailableError";
  }
}

interface ChatOptions {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  /** 要求模型返回 JSON（走 response_format，不支持的服务端会在解析层兜底） */
  json?: boolean;
  /** 重试时强制关闭思考，避免推理额度把 content 吃空 */
  disableThinking?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

function endpoint(): string {
  return `${env.OPENAI_BASE_URL.replace(/\/+$/, "")}/chat/completions`;
}

function usesDeepSeekThinking(): boolean {
  const model = env.OPENAI_MODEL.toLowerCase();
  const url = env.OPENAI_BASE_URL.toLowerCase();
  return (
    model.includes("deepseek") ||
    url.includes("volces.com") ||
    url.includes("deepseek.com")
  );
}

function thinkingOff(force?: boolean): boolean {
  if (force) return true;
  const effort = env.OPENAI_REASONING_EFFORT.trim().toLowerCase();
  return !effort || effort === "minimal" || effort === "none" || effort === "off" || effort === "disabled";
}

/**
 * DeepSeek V4 / 火山方舟默认开思考：`reasoning_effort: "minimal"` 只会降到 low，
 * 并不会关思考。官方关思考要用 `thinking: { type: "disabled" }`。
 * OpenAI o 系列则继续走 reasoning_effort。
 */
function thinkingParams(forceDisable?: boolean): Record<string, unknown> {
  const disable = thinkingOff(forceDisable);
  if (usesDeepSeekThinking()) {
    if (disable) return { thinking: { type: "disabled" } };
    const effort = env.OPENAI_REASONING_EFFORT.trim().toLowerCase();
    const mapped = effort === "max" || effort === "ultra" ? "max" : effort === "low" ? "low" : "high";
    return { thinking: { type: "enabled" }, reasoning_effort: mapped };
  }
  const effort = env.OPENAI_REASONING_EFFORT.trim();
  if (!effort) return {};
  return { reasoning_effort: disable ? "minimal" : effort };
}

/** 思考开启时 max_tokens 是「思考 + 正文」共享额度，太小会返回空 content */
function effectiveMaxTokens(requested: number, forceDisable?: boolean): number {
  if (thinkingOff(forceDisable)) return requested;
  return Math.max(requested, 2048);
}

function flattenContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          const text = (part as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .join("");
  }
  return "";
}

/** 从模型输出里抢救 JSON：围栏、前缀说明、截断都要能容错 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1] ?? "", trimmed];

  for (const candidate of candidates) {
    const value = candidate.trim();
    if (!value) continue;
    try {
      return JSON.parse(value);
    } catch {
      // 继续尝试下一种
    }
  }

  // 截断修复：截取第一个 { 到最后一个 } / [ 到最后一个 ]
  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd > objectStart) {
    try {
      return JSON.parse(trimmed.slice(objectStart, objectEnd + 1));
    } catch {
      // 落到数组分支
    }
  }

  const arrayStart = trimmed.indexOf("[");
  const arrayEnd = trimmed.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    try {
      return JSON.parse(trimmed.slice(arrayStart, arrayEnd + 1));
    } catch {
      // 彻底失败
    }
  }

  throw new Error("模型输出无法解析为 JSON");
}

export async function chatComplete(options: ChatOptions): Promise<string> {
  if (!hasLLM) throw new LLMUnavailableError();

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? env.OPENAI_TIMEOUT_MS
  );
  options.signal?.addEventListener("abort", () => controller.abort());

  try {
    const response = await fetch(endpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        temperature: options.temperature ?? env.OPENAI_TEMPERATURE,
        max_tokens: effectiveMaxTokens(options.maxTokens ?? 3000, options.disableThinking),
        ...thinkingParams(options.disableThinking),
        ...(options.json ? { response_format: { type: "json_object" } } : {}),
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.user },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`LLM ${response.status}: ${await response.text()}`);
    }

    const payload = (await response.json()) as {
      choices?: {
        finish_reason?: string;
        message?: { content?: unknown };
      }[];
      usage?: { completion_tokens?: number };
    };
    const choice = payload.choices?.[0];
    const content = flattenContent(choice?.message?.content).trim();
    if (!content) {
      const reason = choice?.finish_reason ?? "unknown";
      const tokens = payload.usage?.completion_tokens ?? "?";
      throw new Error(`LLM 返回空内容 (finish_reason=${reason}, completion_tokens=${tokens})`);
    }
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

/** 流式返回模型增量文本，用于「Agent 思考中」打字机 */
export async function* chatStream(
  options: ChatOptions
): AsyncGenerator<string, void, unknown> {
  if (!hasLLM) throw new LLMUnavailableError();

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? env.OPENAI_TIMEOUT_MS
  );
  options.signal?.addEventListener("abort", () => controller.abort());

  try {
    const response = await fetch(endpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        temperature: options.temperature ?? env.OPENAI_TEMPERATURE,
        max_tokens: effectiveMaxTokens(options.maxTokens ?? 900, options.disableThinking),
        ...thinkingParams(options.disableThinking),
        stream: true,
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.user },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`LLM 流式请求失败：HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const payload = line.trim();
        if (!payload.startsWith("data:")) continue;
        const data = payload.slice(5).trim();
        if (data === "[DONE]") return;

        try {
          const json = JSON.parse(data) as {
            choices?: { delta?: { content?: string } }[];
          };
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // 忽略无法解析的片段（可能是心跳注释）
        }
      }
    }
  } finally {
    clearTimeout(timeout);
  }
}

/** 一次性拿到 JSON 对象（内部做围栏剥离与截断修复） */
export async function chatJson<T>(options: ChatOptions): Promise<T> {
  try {
    const raw = await chatComplete({ ...options, json: true });
    return extractJson(raw) as T;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn("[llm] 首次调用失败，关闭思考并放宽 max_tokens 重试:", detail);
    const raw = await chatComplete({
      ...options,
      json: false,
      disableThinking: true,
      maxTokens: Math.max((options.maxTokens ?? 3000) * 2, 2048),
    });
    return extractJson(raw) as T;
  }
}
