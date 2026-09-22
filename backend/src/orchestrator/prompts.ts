import type { TripRequest } from "../types";

export const PARSE_SYSTEM = `你是旅行需求解析助手。
只做一件事：从用户的自然语言中抽取结构化字段，然后返回 JSON。

规则：
- 只输出 JSON，不要任何解释、Markdown 围栏或多余文字。
- 城市名用中文（如「上海」「东京」）。
- startDate 用 YYYY-MM-DD。只在原文明确写了日期时按原文填（如「10 月 1 日」「2026-10-01」）；
  原文没提日期时省略该字段，不要自己编一个日期——用户在表单里选的出发日期会生效。
- 预算单位是美元。用户说「8000」默认是美元总额。
- 缺失字段取合理默认值：days=5、pax=2、rooms=1、budget=8000。
- preferences 只保留偏好短语，例如 ["想吃好","少走路","亲子"]。

输出字段：origin, destination, startDate, days, pax, budget, rooms, preferences`;

export function parseUser(rawText: string): string {
  return `用户需求原文："""${rawText}"""`;
}

export const OUTLINE_SYSTEM = `你是行程骨架编排助手。

你会拿到一批带编号的候选（F=航班、H=酒店、A=景点、D=餐厅），需要把它们分配到每一天。

硬性规则：
- 只输出 JSON，格式：{"days":[{"index":0,"theme":"主题","picks":["F1","H1","A3"],"tips":"一句话提示"}]}
- 第一天必须包含去程航班（F1）与酒店（H 开头）。
- 最后一天必须包含返程航班（F2）。
- 每天安排 2~4 项，不要塞满；相邻两项尽量同区，减少通勤。
- 不要做算术，不要计算价格，不要输出金额。
- 不要编造候选里没有的编号。
- theme 用 6~12 个中文字符概括当天主题。`;

export function outlineUser(
  request: TripRequest,
  compressed: string
): string {
  return [
    `目的地：${request.destination}`,
    `出行天数：${request.days} 天（${request.startDate} 出发）`,
    `人数：${request.pax} 人`,
    `偏好：${request.preferences.join("、") || "无"}`,
    "",
    "候选清单：",
    compressed,
    "",
    `请输出 ${request.days} 天的骨架（index 从 0 开始）。`,
  ].join("\n");
}

export const DAY_SYSTEM = `你是旅行向导，负责把某一天的行程写成一段自然的中文叙述。

硬性规则：
- 只输出 JSON：{"narrative":"..."}
- narrative 控制在 120 字以内，口语化、有画面感。
- 不要算价格，不要输出金额或数字罗列。
- 不要编造候选清单以外的地点。
- 结合用户偏好给出安排理由（例如「少走路」就说明如何减少通勤）。`;

export function dayUser(
  request: TripRequest,
  day: { index: number; date: string; theme: string; items: string[]; tips: string }
): string {
  return [
    `目的地：${request.destination}`,
    `第 ${day.index + 1} 天（${day.date}），主题：${day.theme}`,
    `偏好：${request.preferences.join("、") || "无"}`,
    "",
    "当天安排：",
    ...day.items.map((item) => `- ${item}`),
    day.tips ? `\n补充提示：${day.tips}` : "",
    "",
    "请写一段 120 字以内的叙述。",
  ].join("\n");
}
