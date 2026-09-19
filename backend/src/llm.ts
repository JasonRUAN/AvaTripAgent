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
  timeoutMs?: number;
  signal?: AbortSignal;
}

function endpoint(): string {
  return `${env.OPENAI_BASE_URL.replace(/\/+$/, "")}/chat/completions`;
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
        max_tokens: options.maxTokens ?? 3000,
        ...(env.OPENAI_REASONING_EFFORT
          ? { reasoning_effort: env.OPENAI_REASONING_EFFORT }
          : {}),
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
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("LLM 返回空内容");
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
        max_tokens: options.maxTokens ?? 900,
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
    // 推理模型可能在第一轮把额度耗在思考上导致空内容：放宽额度再试一次
    console.error("[llm] 首次调用失败，放宽 max_tokens 重试:", error);
    const raw = await chatComplete({
      ...options,
      json: false,
      maxTokens: (options.maxTokens ?? 3000) * 2,
    });
    return extractJson(raw) as T;
  }
}
