import { deployment } from "../env";
import type { Address, CategoryCode } from "../types";

const ZERO = "0x0000000000000000000000000000000000000000";

/** 未部署时使用的演示地址（与前端 `lib/demo-fixture.ts` 保持一致） */
export const DEMO_AGENT_ADDRESSES: Record<
  "flight" | "hotel" | "attraction" | "dining",
  Address
> = {
  flight: "0x1a4f0e8c6b3d5a7f9e2c4b6d8a0f1e3c5b7d9a2f",
  hotel: "0x2b5e1f9d7c4e6b8a0f3d5c7e9b1a3f5d7c9e0b2a",
  // 必须是 40 位十六进制，否则 viem 会以「Address is invalid」直接拒绝
  attraction: "0x3c6f2a0e8d5f7c9b1a4e6d8f0b2c4e6a8d0f1b3c",
  dining: "0x4d7a3b1f9e6a8c0d2b5f7e9a1c3d5f7b9e1a2c4e",
};

export const AGENT_NAMES: Record<
  "flight" | "hotel" | "attraction" | "dining",
  string
> = {
  flight: "AvaFlights Agent",
  hotel: "AvaStays Agent",
  attraction: "AvaTickets Agent",
  dining: "AvaTables Agent",
};

export const CATEGORY_TO_KEY: Record<CategoryCode, "flight" | "hotel" | "attraction" | "dining"> = {
  0: "flight",
  1: "hotel",
  2: "attraction",
  3: "dining",
};

function resolve(key: "flight" | "hotel" | "attraction" | "dining"): Address {
  const deployed = deployment?.agents?.[key];
  if (deployed && deployed !== ZERO) return deployed as Address;
  return DEMO_AGENT_ADDRESSES[key];
}

export const AGENT_ADDRESSES = {
  flight: resolve("flight"),
  hotel: resolve("hotel"),
  attraction: resolve("attraction"),
  dining: resolve("dining"),
} as const;

export function providerAddress(category: CategoryCode): Address {
  return AGENT_ADDRESSES[CATEGORY_TO_KEY[category]];
}

export function providerName(category: CategoryCode): string {
  return AGENT_NAMES[CATEGORY_TO_KEY[category]];
}

/** 地址 → 名称（验证页从 AgentRegistry 读不到时用它兜底） */
export function nameOfAgent(address: string): string {
  const lower = address.toLowerCase();
  for (const key of ["flight", "hotel", "attraction", "dining"] as const) {
    if (AGENT_ADDRESSES[key].toLowerCase() === lower) return AGENT_NAMES[key];
  }
  return "未注册的服务商 Agent";
}
