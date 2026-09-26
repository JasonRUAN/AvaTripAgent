import { REGISTRY_ABI, REVIEW_ABI } from "../shared/abis";
import { contractAddresses, publicClient } from "../shared/clients";
import { CATEGORY_TO_KEY, deployment, type AgentKey } from "../shared/env";
import { createLogger } from "../shared/logger";
import type { Address, CategoryCode, ProviderSelectionInput } from "../shared/types";
import { categoriesFromMask, normalizeProviders } from "../shared/types";

const log = createLogger("registry");

export interface AgentProfile {
  address: Address;
  name: string;
  category: CategoryCode;
  categories: CategoryCode[];
  categoryMask: number;
  endpoint: string;
  active: boolean;
  ratingAvg: number;
  ratingCount: number;
  ratingAvgX100: number;
  description: string;
  website: string;
}

export interface OnchainReview {
  tokenId: string;
  reviewer: Address;
  provider: Address;
  score: number;
  comment: string;
  timestamp: number;
}

const ZERO = "0x0000000000000000000000000000000000000000";

export type RegistryErrorCode =
  | "REGISTRY_NOT_DEPLOYED"
  | "REGISTRY_READ_FAILED"
  | "NO_REGISTERED_AGENTS"
  | "NO_PROVIDER_FOR_CATEGORY"
  | "PROVIDER_NOT_REGISTERED";

export class RegistryError extends Error {
  readonly code: RegistryErrorCode;
  /** 语言无关的技术细节（地址、数量、原始异常），前端会原样追加到本地化文案后 */
  readonly details?: string;

  constructor(code: RegistryErrorCode, message: string, details?: string) {
    super(message);
    this.name = "RegistryError";
    this.code = code;
    this.details = details;
  }
}

// 显式环境变量优先：跨主机部署时用它指向各服务商的公网地址
function endpointOverride(key: AgentKey): string | undefined {
  const raw = {
    flight: process.env.FLIGHT_AGENT_ENDPOINT,
    hotel: process.env.HOTEL_AGENT_ENDPOINT,
    attraction: process.env.ATTRACTION_AGENT_ENDPOINT,
    dining: process.env.DINING_AGENT_ENDPOINT,
  }[key];
  return raw?.trim() || undefined;
}

function isHttpEndpoint(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function resolveEndpoint(key: AgentKey, onchain: string): string {
  const override = endpointOverride(key);
  if (override) {
    if (!isHttpEndpoint(override)) {
      throw new Error(`${key} 的 endpoint 覆盖值不是 http(s) 地址: ${override}`);
    }
    return override.replace(/\/+$/, "");
  }
  if (isHttpEndpoint(onchain)) return onchain.replace(/\/+$/, "");
  throw new Error(`${key} 服务商在链上未登记可用的 http(s) endpoint: "${onchain}"`);
}

async function scoreOf(agent: Address): Promise<{ avgX100: number; count: number }> {
  const review = contractAddresses().review;
  if (!review || review === ZERO) return { avgX100: 0, count: 0 };
  try {
    const result = await publicClient.readContract({
      address: review,
      abi: REVIEW_ABI,
      functionName: "getScore",
      args: [agent],
    });
    return { avgX100: Number(result[2]), count: Number(result[1]) };
  } catch (error) {
    // 评分为 0 会让推荐排序整体退化，这里要能看出是「读不到」而不是「真的 0 分」
    log.warn("读取链上评分失败，按 0 分处理", { agent }, error);
    return { avgX100: 0, count: 0 };
  }
}

async function readInfo(agent: Address) {
  return publicClient.readContract({
    address: contractAddresses().registry,
    abi: REGISTRY_ABI,
    functionName: "getAgent",
    args: [agent],
  });
}

async function readMask(agent: Address, fallbackCategory: CategoryCode): Promise<number> {
  try {
    const mask = await publicClient.readContract({
      address: contractAddresses().registry,
      abi: REGISTRY_ABI,
      functionName: "getCategoryMask",
      args: [agent],
    });
    const numeric = Number(mask);
    if (numeric > 0) return numeric;
  } catch (error) {
    // 旧部署没有 getCategoryMask
    log.debug("读取类目掩码失败，回退到单一类目", { agent, fallbackCategory }, error);
  }
  return 1 << fallbackCategory;
}

export async function listAgentProfiles(): Promise<AgentProfile[]> {
  if (!deployment?.agentRegistry || deployment.agentRegistry === ZERO) {
    log.error("未部署 AgentRegistry，无法获取服务商列表");
    throw new RegistryError(
      "REGISTRY_NOT_DEPLOYED",
      "未部署 AgentRegistry：请先部署合约并写入 deployments 后重启编排器",
      `agentRegistry=${deployment?.agentRegistry ?? ZERO}`
    );
  }

  let addresses: readonly Address[] = [];
  try {
    addresses = (await publicClient.readContract({
      address: contractAddresses().registry,
      abi: REGISTRY_ABI,
      functionName: "getAgents",
    })) as Address[];
  } catch (error) {
    log.error("读取链上服务商列表失败", { registry: deployment.agentRegistry }, error);
    throw new RegistryError(
      "REGISTRY_READ_FAILED",
      `读取链上服务商列表失败：${error instanceof Error ? error.message : String(error)}`,
      `registry=${deployment.agentRegistry}`
    );
  }

  const profiles: AgentProfile[] = [];
  for (const address of addresses) {
    try {
      const info = await readInfo(address);
      const name = info.name;
      const categoryRaw = info.category;
      const endpointRaw = info.endpoint;
      const active = info.active;
      const score = await scoreOf(address);
      const category = Number(categoryRaw) as CategoryCode;
      const categoryMask = await readMask(address, category);
      const categories = categoriesFromMask(categoryMask);
      const key = CATEGORY_TO_KEY[category];
      if (!key) {
        log.warn("服务商类目不在支持范围内，跳过", { address, category });
        continue;
      }
      const endpoint = resolveEndpoint(key, String(endpointRaw ?? ""));
      profiles.push({
        address,
        name: String(name),
        category,
        categories,
        categoryMask,
        endpoint,
        active: Boolean(active),
        ratingAvg: score.count ? score.avgX100 / 100 : 0,
        ratingCount: score.count,
        ratingAvgX100: score.avgX100,
        description: String(info.description ?? ""),
        website: String(info.website ?? ""),
      });
    } catch (error) {
      log.warn("读取服务商信息失败，跳过该服务商", { address }, error);
      continue;
    }
  }
  if (profiles.length === 0) {
    log.error("链上没有可用的服务商", { registry: deployment.agentRegistry, scanned: addresses.length });
    throw new RegistryError(
      "NO_REGISTERED_AGENTS",
      `链上服务商列表为空（registry=${deployment.agentRegistry}，扫描到 ${addresses.length} 个地址）：请先在 AgentRegistry 注册并激活服务商`,
      `registry=${deployment.agentRegistry}, scanned=${addresses.length}`
    );
  }
  log.info("已加载链上服务商", {
    count: profiles.length,
    agents: profiles.map((profile) => `${profile.name}(${profile.address.slice(0, 8)})`),
  });
  return profiles.sort(compareAgents);
}

function compareAgents(a: AgentProfile, b: AgentProfile): number {
  if (a.category !== b.category) return a.category - b.category;
  if (b.ratingAvgX100 !== a.ratingAvgX100) return b.ratingAvgX100 - a.ratingAvgX100;
  return b.ratingCount - a.ratingCount;
}

export async function listReviews(agent: Address): Promise<OnchainReview[]> {
  if (!deployment?.agentReview || deployment.agentReview === ZERO) return [];
  try {
    const review = contractAddresses().review;
    const rows = await publicClient.readContract({
      address: review,
      abi: REVIEW_ABI,
      functionName: "getReviewsByAgent",
      args: [agent],
    });
    return rows.map((row) => ({
      tokenId: row.tokenId.toString(),
      reviewer: row.reviewer,
      provider: row.provider,
      score: Number(row.score),
      comment: row.comment,
      timestamp: Number(row.timestamp),
    }));
  } catch (error) {
    log.warn("读取链上评价失败", { agent }, error);
    return [];
  }
}

export async function pickProviders(
  requested?: ProviderSelectionInput
): Promise<Record<AgentKey, AgentProfile[]>> {
  const all = await listAgentProfiles();
  const wanted = normalizeProviders(requested);
  const byCat = (category: CategoryCode) =>
    all.filter((agent) => agent.active && agent.categories.includes(category));

  const pick = (key: AgentKey, category: CategoryCode): AgentProfile[] => {
    const listed = byCat(category);
    const addrs = wanted[key] ?? [];
    if (addrs.length > 0) {
      return addrs.map((address) => {
        const match = listed.find((agent) => agent.address.toLowerCase() === address.toLowerCase());
        if (!match) {
          throw new RegistryError(
            "PROVIDER_NOT_REGISTERED",
            `指定的${key} Agent 未注册、未激活或类别不匹配: ${address}`,
            `category=${key}, address=${address}`
          );
        }
        return match;
      });
    }
    if (!listed[0]) {
      throw new RegistryError(
        "NO_PROVIDER_FOR_CATEGORY",
        `没有可用的 ${key} 服务商 Agent`,
        `category=${key}`
      );
    }
    return listed;
  };

  const selected = {
    flight: pick("flight", 0),
    hotel: pick("hotel", 1),
    attraction: pick("attraction", 2),
    dining: pick("dining", 3),
  };

  log.info("已选定询价服务商", {
    requested: wanted ? Object.keys(wanted) : "默认",
    flight: selected.flight.map((agent) => agent.name),
    hotel: selected.hotel.map((agent) => agent.name),
    attraction: selected.attraction.map((agent) => agent.name),
    dining: selected.dining.map((agent) => agent.name),
  });
  return selected;
}

export function expandRfqTargets(
  selected: Record<AgentKey, AgentProfile[]>
): Array<{ key: AgentKey; profile: AgentProfile }> {
  const jobs: Array<{ key: AgentKey; profile: AgentProfile }> = [];
  const seen = new Set<string>();
  for (const key of ["flight", "hotel", "attraction", "dining"] as AgentKey[]) {
    for (const profile of selected[key] ?? []) {
      const id = `${profile.address.toLowerCase()}:${key}`;
      if (seen.has(id)) continue;
      seen.add(id);
      jobs.push({ key, profile });
    }
  }
  return jobs;
}

export function endpointOf(profile: AgentProfile): string {
  return profile.endpoint.replace(/\/+$/, "");
}
