import {
  createPublicClient,
  createWalletClient,
  formatEther,
  http,
  type Account,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import { AGENT_NAMES } from "../agents/addresses";
import { deployment, env } from "../env";

/** Fuji 公共读客户端 */
export const publicClient = createPublicClient({
  chain: avalancheFuji,
  transport: http(env.FUJI_RPC),
});

function walletFor(key: `0x${string}`) {
  const account: Account = privateKeyToAccount(key);
  return createWalletClient({
    account,
    chain: avalancheFuji,
    transport: http(env.FUJI_RPC),
  });
}

/** Orchestrator（旅行总管）：唯一有权调用 settle 的地址 */
export function orchestratorWallet() {
  if (!env.ORCHESTRATOR_KEY) throw new Error("未配置 ORCHESTRATOR_KEY");
  return walletFor(env.ORCHESTRATOR_KEY);
}

/** 各服务商 Agent 的钱包：收款后用自己的私钥发券 */
export function agentWallet(
  which: "flight" | "hotel" | "attraction" | "dining"
) {
  const key = {
    flight: env.FLIGHT_AGENT_KEY,
    hotel: env.HOTEL_AGENT_KEY,
    attraction: env.ATTRACTION_AGENT_KEY,
    dining: env.DINING_AGENT_KEY,
  }[which];

  if (!key) throw new Error(`未配置 ${which} Agent 私钥`);
  return walletFor(key);
}

export function contractAddresses() {
  if (!deployment) throw new Error("缺少 deployments/fuji.json");
  return {
    usdc: deployment.usdc as `0x${string}`,
    registry: deployment.agentRegistry as `0x${string}`,
    settlement: deployment.tripSettlement as `0x${string}`,
    voucher: deployment.travelVoucher as `0x${string}`,
  };
}

/** /health 自检：报告 5 个 Agent 地址的 AVAX 余额，缺 gas 时第一时间发现 */
export async function agentBalances(): Promise<Record<string, string>> {
  const entries: [string, `0x${string}`][] = [
    ["orchestrator", (deployment?.orchestrator ?? "0x") as `0x${string}`],
    ["flight", deployment?.agents?.flight as `0x${string}`],
    ["hotel", deployment?.agents?.hotel as `0x${string}`],
    ["attraction", deployment?.agents?.attraction as `0x${string}`],
    ["dining", deployment?.agents?.dining as `0x${string}`],
  ];

  const result: Record<string, string> = {};
  for (const [name, address] of entries) {
    if (!address || address === "0x") {
      result[name] = "未配置";
      continue;
    }
    try {
      const balance = await publicClient.getBalance({ address });
      result[`${name}(${AGENT_NAMES[name as keyof typeof AGENT_NAMES] ?? name})`] =
        `${Number(formatEther(balance)).toFixed(4)} AVAX`;
    } catch (error) {
      result[name] = `查询失败: ${(error as Error).message}`;
    }
  }
  return result;
}
