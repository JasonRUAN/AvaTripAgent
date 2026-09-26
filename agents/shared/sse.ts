import { createLogger } from "./logger";

const log = createLogger("sse");

/** 打字机分片等高频事件默认不打日志，否则 debug 级别会被刷屏 */
const HIGH_FREQUENCY_TYPES = new Set(["agent.delta"]);

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
      this.listeners.clear();
      log.debug("通道已终止", { type, buffered: this.buffer.length });
      return;
    }
    if (!type || !HIGH_FREQUENCY_TYPES.has(type)) {
      log.debug("事件已推送", { type, listeners: this.listeners.size });
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
    log.error("listener 抛错，该订阅者本轮事件丢失", {}, error);
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
    log.debug("创建规划通道", { runId, total: runChannels.size });
    // 只增不减是内存泄漏信号，早于 OOM 报警
    if (runChannels.size > 500) log.warn("规划通道数量异常增长", { total: runChannels.size });
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
    log.debug("创建结算通道", { orderId, total: orderChannels.size });
    if (orderChannels.size > 500) log.warn("结算通道数量异常增长", { total: orderChannels.size });
  }
  return channel;
}

/**
 * 通道数量无上限会吃内存，定期清理已结束且超过 TTL 的通道。
 * 由 orchestrator 起定时器调用；清理结果记日志，便于确认「确实在回收」。
 */
export function pruneChannels(ttlMs = 30 * 60 * 1000): void {
  const now = Date.now();
  let removedRuns = 0;
  for (const [key, channel] of runChannels) {
    if (channel.isClosed && now - (lastSeen.get(key) ?? 0) > ttlMs) {
      runChannels.delete(key);
      lastSeen.delete(key);
      removedRuns += 1;
    }
  }
  let removedOrders = 0;
  for (const [key, channel] of orderChannels) {
    if (channel.isClosed && now - (lastSeen.get(key) ?? 0) > ttlMs) {
      orderChannels.delete(key);
      lastSeen.delete(key);
      removedOrders += 1;
    }
  }
  if (removedRuns || removedOrders) {
    log.info("已清理过期通道", {
      removedRuns,
      removedOrders,
      remainingRuns: runChannels.size,
      remainingOrders: orderChannels.size,
    });
  }
}

const lastSeen = new Map<string, number>();
export function touch(key: string): void {
  lastSeen.set(key, Date.now());
}
