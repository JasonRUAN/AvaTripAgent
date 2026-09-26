/** 稳定伪随机：同一 tripId 永远得到同一批价格，刷新页面不会变 */

export function hashCode(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed: string): () => number {
  return mulberry32(hashCode(seed));
}

/** 在 [1-spread, 1+spread] 区间内抖动 */
export function jitter(rng: () => number, value: number, spread = 0.08): number {
  return value * (1 + (rng() * 2 - 1) * spread);
}

export function pick<T>(rng: () => number, items: readonly T[], count: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const index = Math.floor(rng() * pool.length);
    out.push(pool.splice(index, 1)[0]!);
  }
  return out;
}

/** 档位系数：经济 0.7 / 舒适 1.0 / 奢华 1.8 */
export const TIER_FACTOR = { economy: 0.7, comfort: 1.0, luxury: 1.8 } as const;
export type Tier = keyof typeof TIER_FACTOR;

/**
 * 按「每人每天预算」定档。
 * 例：8000 美元 / 5 天 / 2 人 = 800 每人每天 → 舒适档。
 */
export function resolveTier(budget: number, days: number, pax = 1): Tier {
  const perDayPerPax = budget / (Math.max(1, days) * Math.max(1, pax));
  if (perDayPerPax >= 1200) return "luxury";
  if (perDayPerPax >= 300) return "comfort";
  return "economy";
}

/** 人为延迟：让流式过程有节奏感（演示效果关键） */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function toolDelay(rng: () => number): number {
  return Math.round(80 + rng() * 320);
}
