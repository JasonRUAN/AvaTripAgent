import {
  createPublicClient,
  createWalletClient,
  formatEther,
  http,
  nonceManager,
  type Account,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import { deployment, env } from "./env";
import { createLogger } from "./logger";

const log = createLogger("chain");

export const publicClient = createPublicClient({
  chain: avalancheFuji,
  transport: http(env.FUJI_RPC),
});

log.info("链上读客户端已初始化", { chainId: avalancheFuji.id, rpc: env.FUJI_RPC });

type AgentWallet = WalletClient<ReturnType<typeof http>, typeof avalancheFuji, Account>;

const wallets = new Map<string, AgentWallet>();
const sendQueue = new Map<string, Promise<unknown>>();

export function walletFor(key: `0x${string}`): AgentWallet {
  const cached = wallets.get(key);
  if (cached) return cached;
  const account: Account = privateKeyToAccount(key, { nonceManager });
  const wallet = createWalletClient({
    account,
    chain: avalancheFuji,
    transport: http(env.FUJI_RPC),
  });
  wallets.set(key, wallet);
  // 只记地址：私钥永远不进日志
  log.info("钱包客户端已创建", { address: account.address, chainId: avalancheFuji.id });
  return wallet;
}

/**
 * 同一地址的发交易排队：只串行 `eth_send*`，等回执由调用方并行。
 * 公共 RPC 上即使有 nonceManager，并发 prepare 仍可能读到同一个 pending nonce。
 */
export function enqueueWalletSend<T>(address: string, send: () => Promise<T>): Promise<T> {
  const key = address.toLowerCase();
  const prev = sendQueue.get(key) ?? Promise.resolve();
  const next = prev.then(send, send);
  log.debug("交易入队", { address: key });
  sendQueue.set(
    key,
    next.then(
      () => undefined,
      // 队列内部吞掉错误是为了不让一次失败毒化后续交易，但必须留下痕迹
      (error: unknown) => {
        log.warn("队列中交易失败", { address: key }, error);
      }
    )
  );
  return next;
}

export function orchestratorWallet() {
  if (!env.ORCHESTRATOR_KEY) {
    log.warn("缺少 ORCHESTRATOR_KEY，无法构造编排器钱包");
    throw new Error("未配置 ORCHESTRATOR_KEY");
  }
  return walletFor(env.ORCHESTRATOR_KEY);
}

export function providerWallet() {
  if (!env.AGENT_KEY) {
    log.warn("缺少 AGENT_KEY，无法构造服务商钱包");
    throw new Error("未配置 AGENT_KEY");
  }
  return walletFor(env.AGENT_KEY);
}

export function contractAddresses() {
  if (!deployment) {
    log.error("缺少 deployments/fuji.json，无法解析合约地址");
    throw new Error("缺少 deployments/fuji.json");
  }
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
    const text = `${label}: ${Number(formatEther(balance)).toFixed(4)} AVAX`;
    log.debug("余额查询成功", { label, address, balance: text });
    return text;
  } catch (error) {
    // RPC 不通时前端只会看到「查询失败」，根因要靠这条日志
    log.warn("余额查询失败（RPC 可能不可用）", { label, address }, error);
    return `${label}: 查询失败 ${(error as Error).message}`;
  }
}
