/**
 * SSE 客户端 —— fetch + ReadableStream 逐帧解析
 *
 * 不用原生 `EventSource`：这里需要 POST 能力、自定义超时与可控重连，
 * 并且在 `run.done` / `run.error` 到达后要立刻释放 reader，避免悬挂连接。
 */

export type SSEHandlers<T> = {
  onEvent: (event: T) => void;
  onError?: (error: Error) => void;
  onDone?: () => void;
};

/** 把一段 chunk 缓冲按 SSE 帧边界切分，返回未消费的残余 */
function splitFrames(buffer: string): { frames: string[]; rest: string } {
  const frames: string[] = [];
  let rest = buffer;

  // SSE 帧以空行分隔（\n\n 或 \r\n\r\n）
  let sepIndex = rest.search(/\r?\n\r?\n/);
  while (sepIndex !== -1) {
    const raw = rest.slice(0, sepIndex);
    const match = rest.slice(sepIndex).match(/^\r?\n\r?\n/);
    rest = rest.slice(sepIndex + (match ? match[0].length : 2));
    if (raw.trim().length > 0) frames.push(raw);
    sepIndex = rest.search(/\r?\n\r?\n/);
  }

  return { frames, rest };
}

/** 从单个 SSE 帧里取出 data 载荷（可能多行） */
function extractData(frame: string): string | null {
  const lines = frame.split(/\r?\n/);
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith(":")) continue; // 心跳注释
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^ /, ""));
    }
  }

  if (dataLines.length === 0) return null;
  return dataLines.join("\n");
}

/**
 * 消费一条 SSE 流。
 *
 * @param url  流地址
 * @param init fetch 参数（可带 method/body/headers）
 * @param handlers 事件回调
 * @param signal 取消信号
 */
export async function consumeSSE<T>(
  url: string,
  init: RequestInit,
  handlers: SSEHandlers<T>,
  signal?: AbortSignal
): Promise<void> {
  const { onEvent, onError, onDone } = handlers;

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal,
      headers: {
        Accept: "text/event-stream",
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") return;
    onError?.(error as Error);
    return;
  }

  if (!response.ok || !response.body) {
    onError?.(new Error(`SSE 连接失败：HTTP ${response.status}`));
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const close = async () => {
    try {
      await reader.cancel();
    } catch {
      // reader 已关闭，忽略
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const { frames, rest } = splitFrames(buffer);
      buffer = rest;

      for (const frame of frames) {
        const data = extractData(frame);
        if (data === null) continue;

        let payload: T;
        try {
          payload = JSON.parse(data) as T;
        } catch {
          console.error("[sse] 无法解析的帧:", data);
          continue;
        }

        onEvent(payload);

        // 终止帧：立即释放连接
        const maybeType = (payload as { type?: string })?.type;
        if (maybeType === "run.done" || maybeType === "run.error") {
          await close();
          onDone?.();
          return;
        }
      }
    }
    onDone?.();
  } catch (error) {
    if ((error as Error)?.name === "AbortError") return;
    console.error("[sse] 读取流失败:", error);
    onError?.(error as Error);
  } finally {
    void close();
  }
}

/** 让一段文本以「打字机」节奏播放，返回可取消的句柄 */
export function typewriter(
  text: string,
  onChunk: (chunk: string) => void,
  opts: { charsPerTick?: number; intervalMs?: number } = {}
): { cancel: () => void; finished: Promise<void> } {
  const charsPerTick = opts.charsPerTick ?? 3;
  const intervalMs = opts.intervalMs ?? 24;

  let index = 0;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const finished = new Promise<void>((resolve) => {
    const tick = () => {
      if (cancelled) {
        resolve();
        return;
      }
      if (index >= text.length) {
        resolve();
        return;
      }
      onChunk(text.slice(index, index + charsPerTick));
      index += charsPerTick;
      timer = setTimeout(tick, intervalMs);
    };
    tick();
  });

  return {
    cancel: () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    },
    finished,
  };
}
