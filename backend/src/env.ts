import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function loadDeployment() {
  try {
    const path = resolve(here, "../../deployments/fuji.json");
    return JSON.parse(readFileSync(path, "utf8")) as {
      chainId: number;
      deployed: boolean;
      usdc: string;
      agentRegistry: string;
      tripSettlement: string;
      travelVoucher: string;
      orchestrator: string;
      agents: Record<string, string>;
    };
  } catch {
    return null;
  }
}

export const deployment = loadDeployment();

export const env = {
  PORT: Number(process.env.PORT ?? 3001),
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",

  // ---- LLM（OpenAI 兼容接口） ----
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
  OPENAI_BASE_URL:
    process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  OPENAI_MODEL: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  OPENAI_TIMEOUT_MS: Number(process.env.OPENAI_TIMEOUT_MS ?? 60_000),
  OPENAI_TEMPERATURE: Number(process.env.OPENAI_TEMPERATURE ?? 0.2),
  /**
   * 推理强度：minimal/low/medium/high。
   * 推理模型（如 deepseek-v4.1-flash）会把输出额度消耗在 thinking 上，
   * max_tokens 给小了就会返回空 content —— 默认 minimal 关闭思考。
   */
  OPENAI_REASONING_EFFORT: process.env.OPENAI_REASONING_EFFORT ?? "minimal",
  /** 逐日展开的并发路数 */
  SYNTH_DAY_CONCURRENCY: Number(process.env.SYNTH_DAY_CONCURRENCY ?? 4),

  // ---- 链 ----
  FUJI_RPC:
    process.env.FUJI_RPC ?? "https://api.avax-test.network/ext/bc/C/rpc",
  ORCHESTRATOR_KEY: (process.env.ORCHESTRATOR_KEY ?? "") as `0x${string}`,
  FLIGHT_AGENT_KEY: (process.env.FLIGHT_AGENT_KEY ?? "") as `0x${string}`,
  HOTEL_AGENT_KEY: (process.env.HOTEL_AGENT_KEY ?? "") as `0x${string}`,
  ATTRACTION_AGENT_KEY: (process.env.ATTRACTION_AGENT_KEY ?? "") as `0x${string}`,
  DINING_AGENT_KEY: (process.env.DINING_AGENT_KEY ?? "") as `0x${string}`,

  /** tokenURI 的公开基址，例如 https://abc.ngrok.app/api/vouchers/ */
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL ?? "http://localhost:3001",
} as const;

/** 是否具备调用真实 LLM 的条件 */
export const hasLLM = env.OPENAI_API_KEY.length > 0;

/** 是否具备真实链上操作的条件（需要部署产物 + Orchestrator 私钥） */
export const hasChain =
  !!deployment?.deployed &&
  !!deployment.tripSettlement &&
  deployment.tripSettlement !== "0x0000000000000000000000000000000000000000" &&
  env.ORCHESTRATOR_KEY.length > 0;
