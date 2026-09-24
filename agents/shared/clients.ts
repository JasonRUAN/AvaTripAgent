import {
  createPublicClient,
  createWalletClient,
  formatEther,
  http,
  type Account,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import { deployment, env } from "./env";

export const publicClient = createPublicClient({
  chain: avalancheFuji,
  transport: http(env.FUJI_RPC),
});

export function walletFor(key: `0x${string}`) {
  const account: Account = privateKeyToAccount(key);
  return createWalletClient({
    account,
    chain: avalancheFuji,
    transport: http(env.FUJI_RPC),
  });
}

export function orchestratorWallet() {
  if (!env.ORCHESTRATOR_KEY) throw new Error("未配置 ORCHESTRATOR_KEY");
  return walletFor(env.ORCHESTRATOR_KEY);
}

export function providerWallet() {
  if (!env.AGENT_KEY) throw new Error("未配置 AGENT_KEY");
  return walletFor(env.AGENT_KEY);
}

export function contractAddresses() {
  if (!deployment) throw new Error("缺少 deployments/fuji.json");
  return {
    usdc: deployment.usdc as `0x${string}`,
    registry: deployment.agentRegistry as `0x${string}`,
    settlement: deployment.tripSettlement as `0x${string}`,
    voucher: deployment.travelVoucher as `0x${string}`,
    review: (deployment.agentReview ??
      "0x0000000000000000000000000000000000000000") as `0x${string}`,
  };
}

export async function walletBalance(label: string, address: `0x${string}`): Promise<string> {
  try {
    const balance = await publicClient.getBalance({ address });
    return `${label}: ${Number(formatEther(balance)).toFixed(4)} AVAX`;
  } catch (error) {
    return `${label}: 查询失败 ${(error as Error).message}`;
  }
}
