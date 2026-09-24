import { z } from "zod";

/** 结构化需求（前端可传，也可由 LLM 从自然语言抽取） */
export const tripRequestSchema = z.object({
  origin: z.string().min(1).default("上海"),
  destination: z.string().min(1).default("东京"),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .default("2026-10-01"),
  days: z.number().int().min(1).max(14).default(5),
  pax: z.number().int().min(1).max(12).default(2),
  budget: z.number().min(0).default(8000),
  rooms: z.number().int().min(1).max(6).default(1),
  preferences: z.array(z.string()).default([]),
  rawText: z.string().default(""),
});

/** 理解阶段：模型只需抽取字段，不要编造城市以外的信息 */
export const extractRequestSchema = z.object({
  origin: z.string().min(1),
  destination: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.number().int().min(1).max(14),
  pax: z.number().int().min(1).max(12),
  budget: z.number().min(0),
  rooms: z.number().int().min(1).max(6),
  preferences: z.array(z.string()),
});

export type ExtractRequest = z.infer<typeof extractRequestSchema>;

/** 骨架阶段：模型只输出「每天用哪几个编号」，输出量小、速度快 */
export const outlineDaySchema = z.object({
  index: z.number().int().min(0),
  theme: z.string().min(1),
  /** 候选编号，如 ["F1","H1","A3","D2"] */
  picks: z.array(z.string()),
  tips: z.string().default(""),
});

export const outlineSchema = z.object({
  days: z.array(outlineDaySchema).min(1),
});

export type Outline = z.infer<typeof outlineSchema>;

/** 逐日展开：模型只写叙述与注意点，价格与时刻由代码回填 */
export const dayNarrativeSchema = z.object({
  narrative: z.string().min(1),
});

export type DayNarrative = z.infer<typeof dayNarrativeSchema>;

/** 宽松解析：模型偶尔把数字写成字符串，这里统一兜住 */
export function coerceOutline(input: unknown): Outline | null {
  const parsed = outlineSchema.safeParse(input);
  if (parsed.success) return parsed.data;

  const raw = input as { days?: unknown } | null;
  if (!raw || !Array.isArray(raw.days)) return null;

  const days = raw.days
    .map((day, index) => {
      const d = day as Record<string, unknown>;
      return {
        index: Number(d?.index ?? index),
        theme: String(d?.theme ?? `第 ${index + 1} 天`),
        picks: Array.isArray(d?.picks)
          ? d.picks.map((p) => String(p))
          : Array.isArray(d?.items)
            ? (d.items as unknown[]).map((p) => String(p))
            : [],
        tips: String(d?.tips ?? ""),
      };
    })
    .filter((d) => Number.isFinite(d.index));

  return days.length > 0 ? { days } : null;
}
