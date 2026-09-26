import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger } from "./logger";
import type { Address, CategoryCode } from "./types";

const here = dirname(fileURLToPath(import.meta.url));
const log = createLogger("env");

export type AgentKey = "flight" | "hotel" | "attraction" | "dining";

export const CATEGORY_TO_KEY: Record<CategoryCode, AgentKey> = {
  0: "flight",
  1: "hotel",
  2: "attraction",
  3: "dining",
};

export const KEY_TO_CATEGORY: Record<AgentKey, CategoryCode> = {
  flight: 0,
  hotel: 1,
  attraction: 2,
  dining: 3,
};

type Deployment = {
  chainId: number;
  deployed: boolean;
  usdc: string;
  agentRegistry: string;
  tripSettlement: string;
  travelVoucher: string;
  agentReview?: string;
  orchestrator: string;
  agents: Record<string, string>;
};

function loadDeployment(): Deployment | null {
  const candidates = [
    process.env.DEPLOYMENT_FILE,
    resolve(here, "../../deployments/fuji.json"),
    resolve(here, "../deployments/fuji.json"),
    resolve(process.cwd(), "deployments/fuji.json"),
    resolve(process.cwd(), "../deployments/fuji.json"),
  ].filter((path): path is string => Boolean(path));

  for (const path of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as Deployment;
      // 命中哪一份 fuji.json 直接决定合约地址，启动后必须能一眼看到
      log.info("已加载合约部署信息", {
        path,
        chainId: parsed.chainId,
        deployed: Boolean(parsed.deployed),
        settlement: parsed.tripSettlement,
      });
      return parsed;
    } catch (error) {
      log.debug("部署文件候选不可用", { path, reason: (error as Error).message });
      continue;
    }
  }
  log.warn("未找到可用的 deployments/fuji.json，链上交互将全部走模拟路径");
  return null;
}

export const deployment = loadDeployment();

function resolveAgentKey(): `0x${string}` {
  if (process.env.AGENT_KEY) return process.env.AGENT_KEY as `0x${string}`;
  const category = process.env.AGENT_CATEGORY ?? "flight";
  const mapped = {
    flight: process.env.FLIGHT_AGENT_KEY,
    hotel: process.env.HOTEL_AGENT_KEY,
    attraction: process.env.ATTRACTION_AGENT_KEY,
    dining: process.env.DINING_AGENT_KEY,
  }[category];
  return (mapped ?? "") as `0x${string}`;
}

function isAgentKey(value: string): value is AgentKey {
  return value === "flight" || value === "hotel" || value === "attraction" || value === "dining";
}

function parseAgentCategories(): AgentKey[] {
  const raw = process.env.AGENT_CATEGORIES ?? "";
  const fromList = raw
    .split(/[,+\s]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(isAgentKey);
  if (fromList.length > 0) return [...new Set(fromList)];
  const single = (process.env.AGENT_CATEGORY ?? "flight").toLowerCase();
  return isAgentKey(single) ? [single] : ["flight"];
}

export const env = {
  PORT: Number(process.env.PORT ?? 3010),
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  OPENAI_MODEL: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  OPENAI_TIMEOUT_MS: Number(process.env.OPENAI_TIMEOUT_MS ?? 60_000),
  OPENAI_TEMPERATURE: Number(process.env.OPENAI_TEMPERATURE ?? 0.2),
  /**
   * 推理强度。minimal/none/off = 关闭思考（DeepSeek 走 thinking.disabled）。
   * 其余值：low / high / max。默认关闭——行程 JSON 不需要深度推理，
   * 开思考会把小 max_tokens 耗光，表现为「LLM 返回空内容」。
   */
  OPENAI_REASONING_EFFORT: process.env.OPENAI_REASONING_EFFORT ?? "minimal",
  SYNTH_DAY_CONCURRENCY: Number(process.env.SYNTH_DAY_CONCURRENCY ?? 4),
  FUJI_RPC: process.env.FUJI_RPC ?? "https://api.avax-test.network/ext/bc/C/rpc",
  ORCHESTRATOR_KEY: (process.env.ORCHESTRATOR_KEY ?? "") as `0x${string}`,
  AGENT_KEY: resolveAgentKey(),
  AGENT_NAME: process.env.AGENT_NAME ?? "AvaTrip Agent",
  AGENT_CATEGORY: (process.env.AGENT_CATEGORY ?? "flight") as AgentKey,
  AGENT_CATEGORIES: parseAgentCategories(),
  INTERNAL_TOKEN: process.env.INTERNAL_TOKEN ?? "avatrip-demo-internal",
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL ?? "http://localhost:3010",
  FLIGHT_AGENT_ENDPOINT: process.env.FLIGHT_AGENT_ENDPOINT ?? "http://127.0.0.1:3011",
  HOTEL_AGENT_ENDPOINT: process.env.HOTEL_AGENT_ENDPOINT ?? "http://127.0.0.1:3012",
  ATTRACTION_AGENT_ENDPOINT: process.env.ATTRACTION_AGENT_ENDPOINT ?? "http://127.0.0.1:3013",
  DINING_AGENT_ENDPOINT: process.env.DINING_AGENT_ENDPOINT ?? "http://127.0.0.1:3014",
} as const;

export const hasLLM = env.OPENAI_API_KEY.length > 0;

export const hasChain =
  !!deployment?.deployed &&
  !!deployment.tripSettlement &&
  deployment.tripSettlement !== "0x0000000000000000000000000000000000000000" &&
  env.ORCHESTRATOR_KEY.length > 0;

// 密钥类字段由 logger 自动脱敏，可安全整体输出
log.debug("运行配置", { ...env, hasLLM, hasChain, rpc: env.FUJI_RPC });

export const DEMO_AGENT_ADDRESSES: Record<AgentKey, Address> = {
  flight: "0x1a4f0e8c6b3d5a7f9e2c4b6d8a0f1e3c5b7d9a2f",
  hotel: "0x2b5e1f9d7c4e6b8a0f3d5c7e9b1a3f5d7c9e0b2a",
  attraction: "0x3c6f2a0e8d5f7c9b1a4e6d8f0b2c4e6a8d0f1b3c",
  dining: "0x4d7a3b1f9e6a8c0d2b5f7e9a1c3d5f7b9e1a2c4e",
};

const ZERO = "0x0000000000000000000000000000000000000000";

export function deployedAgentAddress(key: AgentKey): Address {
  const deployed = deployment?.agents?.[key];
  if (deployed && deployed !== ZERO) return deployed as Address;
  return DEMO_AGENT_ADDRESSES[key];
}
