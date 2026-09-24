import { REGISTRY_ABI, REVIEW_ABI } from "../shared/abis";
import { contractAddresses, publicClient } from "../shared/clients";
import { CATEGORY_TO_KEY, deployment, env, type AgentKey } from "../shared/env";
import type { Address, CategoryCode } from "../shared/types";
import { categoriesFromMask } from "../shared/types";

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

const FALLBACK_ENDPOINTS: Record<AgentKey, string> = {
  flight: env.FLIGHT_AGENT_ENDPOINT,
  hotel: env.HOTEL_AGENT_ENDPOINT,
  attraction: env.ATTRACTION_AGENT_ENDPOINT,
  dining: env.DINING_AGENT_ENDPOINT,
};

function isHttpEndpoint(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function endpointOverride(key: AgentKey): string | undefined {
  const raw = {
    flight: process.env.FLIGHT_AGENT_ENDPOINT,
    hotel: process.env.HOTEL_AGENT_ENDPOINT,
    attraction: process.env.ATTRACTION_AGENT_ENDPOINT,
    dining: process.env.DINING_AGENT_ENDPOINT,
  }[key];
  return raw && isHttpEndpoint(raw) ? raw.replace(/\/+$/, "") : undefined;
}

function resolveEndpoint(key: AgentKey, onchain: string): string {
  const override = endpointOverride(key);
  if (override) return override;
  if (isHttpEndpoint(onchain)) return onchain.replace(/\/+$/, "");
  return FALLBACK_ENDPOINTS[key].replace(/\/+$/, "");
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
  } catch {
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
  } catch {
    // 旧部署没有 getCategoryMask
  }
  return 1 << fallbackCategory;
}

export async function listAgentProfiles(): Promise<AgentProfile[]> {
  if (!deployment?.agentRegistry || deployment.agentRegistry === ZERO) {
    return fallbackProfiles();
  }

  let addresses: readonly Address[] = [];
  try {
    addresses = (await publicClient.readContract({
      address: contractAddresses().registry,
      abi: REGISTRY_ABI,
      functionName: "getAgents",
    })) as Address[];
  } catch {
    return fallbackProfiles();
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
      if (!key) continue;
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
    } catch {
      continue;
    }
  }
  if (profiles.length === 0) return fallbackProfiles();
  return profiles.sort(compareAgents);
}

function compareAgents(a: AgentProfile, b: AgentProfile): number {
  if (a.category !== b.category) return a.category - b.category;
  if (b.ratingAvgX100 !== a.ratingAvgX100) return b.ratingAvgX100 - a.ratingAvgX100;
  return b.ratingCount - a.ratingCount;
}

const FALLBACK_COPY: Record<AgentKey, { name: string; description: string; website: string }> = {
  flight: {
    name: "AvaFlights Agent",
    description: "Avalanche 上的机票询价 Agent，覆盖亚太主要航线实时舱位与价格。",
    website: "https://avaflights.example",
  },
  hotel: {
    name: "AvaStays Agent",
    description: "精选酒店与民宿，按区域、星级与入住日期即时报价。",
    website: "https://avastays.example",
  },
  attraction: {
    name: "AvaTickets Agent",
    description: "景点门票与体验活动预订，支持当日与预售场次。",
    website: "https://avatickets.example",
  },
  dining: {
    name: "AvaTables Agent",
    description: "本地餐厅与特色料理预订，按人数与时段匹配空位。",
    website: "https://avatables.example",
  },
};

function fallbackProfiles(): AgentProfile[] {
  const agents = deployment?.agents ?? {};
  return (["flight", "hotel", "attraction", "dining"] as AgentKey[]).map((key, index) => ({
    address: (agents[key] ?? ZERO) as Address,
    name: FALLBACK_COPY[key].name,
    category: index as CategoryCode,
    categories: [index as CategoryCode],
    categoryMask: 1 << index,
    endpoint: FALLBACK_ENDPOINTS[key].replace(/\/+$/, ""),
    active: true,
    ratingAvg: 0,
    ratingCount: 0,
    ratingAvgX100: 0,
    description: FALLBACK_COPY[key].description,
    website: FALLBACK_COPY[key].website,
  }));
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
  } catch {
    return [];
  }
}

export async function pickProviders(
  requested?: Partial<Record<AgentKey, Address>>
): Promise<Record<AgentKey, AgentProfile>> {
  const all = await listAgentProfiles();
  const byCat = (category: CategoryCode) =>
    all.filter((agent) => agent.active && agent.categories.includes(category));

  const pick = (key: AgentKey, category: CategoryCode): AgentProfile => {
    const listed = byCat(category);
    const wanted = requested?.[key];
    if (wanted) {
      const match = listed.find((agent) => agent.address.toLowerCase() === wanted.toLowerCase());
      if (!match) {
        throw new Error(`指定的${key} Agent 未注册、未激活或类别不匹配: ${wanted}`);
      }
      return match;
    }
    if (!listed[0]) throw new Error(`没有可用的 ${key} 服务商 Agent`);
    return listed[0];
  };

  return {
    flight: pick("flight", 0),
    hotel: pick("hotel", 1),
    attraction: pick("attraction", 2),
    dining: pick("dining", 3),
  };
}

export function expandRfqTargets(
  selected: Record<AgentKey, AgentProfile>
): Array<{ key: AgentKey; profile: AgentProfile }> {
  const unique = new Map<string, AgentProfile>();
  for (const profile of Object.values(selected)) {
    unique.set(profile.address.toLowerCase(), profile);
  }
  const jobs: Array<{ key: AgentKey; profile: AgentProfile }> = [];
  const seen = new Set<string>();
  for (const profile of unique.values()) {
    const cats = profile.categories.length ? profile.categories : [profile.category];
    for (const cat of cats) {
      const key = CATEGORY_TO_KEY[cat];
      if (!key) continue;
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
