type Listener<T> = (event: T) => void;

/**
 * 带回放的事件通道。
 *
 * 前端在 `POST /api/runs` 拿到 runId 后才会连上 SSE，中间可能已经吐了几帧；
 * 因此新订阅者先收到缓冲区的历史事件，再接实时事件，避免丢帧。
 */
export class EventChannel<T> {
  private listeners = new Set<Listener<T>>();
  private buffer: T[] = [];
  private closed = false;

  constructor(private readonly terminalTypes: string[] = []) {}

  push(event: T): void {
    if (this.closed) return;
    this.buffer.push(event);
    for (const listener of this.listeners) {
      safeCall(listener, event);
    }

    const type = (event as { type?: string })?.type;
    if (type && this.terminalTypes.includes(type)) {
      this.closed = true;
      for (const listener of this.listeners) listener;
      this.listeners.clear();
    }
  }

  /** 已结束时返回 true，便于调用方决定是否立即收尾 */
  get isClosed(): boolean {
    return this.closed;
  }

  get history(): T[] {
    return [...this.buffer];
  }

  subscribe(listener: Listener<T>): () => void {
    for (const event of this.buffer) safeCall(listener, event);
    if (this.closed) return () => {};

    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  close(): void {
    this.closed = true;
    this.listeners.clear();
  }
}

function safeCall<T>(listener: Listener<T>, event: T): void {
  try {
    listener(event);
  } catch (error) {
    console.error("[sse] listener 抛错:", error);
  }
}

/** runId → 规划流 */
export const runChannels = new Map<string, EventChannel<unknown>>();
/** orderId → 结算流 */
export const orderChannels = new Map<string, EventChannel<unknown>>();

export function getRunChannel(runId: string): EventChannel<unknown> {
  let channel = runChannels.get(runId);
  if (!channel) {
    channel = new EventChannel<unknown>(["run.done", "run.error"]);
    runChannels.set(runId, channel);
  }
  return channel;
}

export function getOrderChannel(orderId: string): EventChannel<unknown> {
  let channel = orderChannels.get(orderId);
  if (!channel) {
    channel = new EventChannel<unknown>([
      "settlement.done",
      "settlement.error",
    ]);
    orderChannels.set(orderId, channel);
  }
  return channel;
}

/** 通道数量无上限会吃内存，定期清理已结束且超过 TTL 的通道 */
export function pruneChannels(ttlMs = 30 * 60 * 1000): void {
  const now = Date.now();
  for (const [key, channel] of runChannels) {
    if (channel.isClosed && now - lastSeen.get(key)! > ttlMs) runChannels.delete(key);
  }
}

const lastSeen = new Map<string, number>();
export function touch(key: string): void {
  lastSeen.set(key, Date.now());
}
