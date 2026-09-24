import {
  BaseError,
  ContractFunctionRevertedError,
  type PublicClient,
} from "viem";
import { BACKEND_URL, CONTRACTS, VOUCHER_ABI, isDeployed } from "./contracts";
import { maskAddress } from "./format";
import type {
  Address,
  CategoryCode,
  VoucherDetail,
  VoucherMetadata,
  VoucherStatus,
} from "./types";

/**
 * 链上凭证读取。
 *
 * 「我的凭证」的唯一数据源是 Fuji 上的 `TravelVoucher` 合约：
 * 合约只会 `getVoucher` 出一个纯数字/字符串结构，没有任何 mock 兜底。
 *
 * 列表先用 `multicall` 读完 `ownerOf` + `getVoucher` 立刻渲染；
 * `metadata` 后补，且带超时——链上 `tokenURI` 仍指向已停用的
 * `localhost:3001`，浏览器直连会卡到连接超时，绝不能阻塞列表。
 */

/** 服务商 Agent 地址 → 展示名（对应 AgentRegistry 里的注册项） */
const AGENT_NAMES: Record<string, string> = {
  [CONTRACTS.agents.flight.toLowerCase()]: "AvaFlights Agent",
  [CONTRACTS.agents.hotel.toLowerCase()]: "AvaStays Agent",
  [CONTRACTS.agents.attraction.toLowerCase()]: "AvaTickets Agent",
  [CONTRACTS.agents.dining.toLowerCase()]: "AvaTables Agent",
};

/** 链下明细请求超时。死掉的 tokenURI 绝不能把整页卡住。 */
const METADATA_TIMEOUT_MS = 2_500;

export function providerName(provider: string): string {
  return AGENT_NAMES[provider.toLowerCase()] ?? maskAddress(provider);
}

/** 与合约 `VoucherStatus` 枚举顺序一致 */
const STATUS: VoucherStatus[] = ["Issued", "Redeemed", "Voided"];

/**
 * 是否为合约 revert（例如对不存在的 tokenId 调 `ownerOf`）。
 *
 * 只有 revert 才应该被「跳过」；RPC 超时、ABI 解码失败这类错误必须往外抛，
 * 否则会静默变成「该地址还没有链上凭证」，真实故障被藏起来。
 */
function isRevert(error: unknown): boolean {
  return (
    error instanceof BaseError &&
    error.walk((cause) => cause instanceof ContractFunctionRevertedError) !== null
  );
}

/** 分批并发，避免凭证较多时一次性打出上百个 eth_call */
async function inChunks<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    results.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return results;
}

function fallbackMetadata(
  tokenId: bigint | string,
  title: string,
  code: string
): VoucherMetadata {
  return {
    name: title || `凭证 #${tokenId}`,
    description: "Avalanche Fuji 链上凭证（链下明细暂不可用）",
    image: "",
    attributes: [{ trait_type: "Code", value: code }],
    details: {},
  };
}

function toDetail(
  tokenId: bigint,
  onChain: {
    orderId: bigint;
    provider: Address;
    holder: Address;
    category: number;
    code: string;
    title: string;
    metadataHash: `0x${string}`;
    validFrom: bigint;
    validTo: bigint;
    status: number;
  }
): VoucherDetail {
  return {
    tokenId: tokenId.toString(),
    orderId: onChain.orderId.toString(),
    provider: onChain.provider,
    providerName: providerName(onChain.provider),
    holder: onChain.holder,
    category: (Number(onChain.category) || 0) as CategoryCode,
    code: onChain.code,
    title: onChain.title,
    metadataHash: onChain.metadataHash,
    validFrom: Number(onChain.validFrom),
    validTo: Number(onChain.validTo),
    status: STATUS[Number(onChain.status)] ?? "Issued",
    metadata: fallbackMetadata(tokenId, onChain.title, onChain.code),
  };
}

/**
 * 枚举某个地址在链上当前持有的全部凭证。
 *
 * 合约是普通 ERC-721（非 Enumerable），没有 `tokenOfOwnerByIndex`，
 * 因此按 `nextTokenId` 遍历所有已签发 tokenId，再用 `ownerOf` 判定归属
 * —— `Voucher.holder` 是签发时的快照，转赠后会失真，不能当持有者用。
 *
 * `ownerOf` / `getVoucher` 走 Multicall3，整页只需 2～3 次 RPC；
 * 链下 metadata 不阻塞返回。
 */
export async function fetchHolderVouchers(
  client: PublicClient,
  holder: Address
): Promise<VoucherDetail[]> {
  if (!isDeployed) return [];

  const nextTokenId = await client.readContract({
    address: CONTRACTS.travelVoucher,
    abi: VOUCHER_ABI,
    functionName: "nextTokenId",
  });

  // nextTokenId 从 1 开始且指向下一个可用 id，已签发的最大 id 是 next - 1
  const issued = Number(nextTokenId) - 1;
  if (issued <= 0) return [];

  const ids = Array.from({ length: issued }, (_, index) => BigInt(index + 1));
  const target = holder.toLowerCase();

  const owners = await readOwners(client, ids);
  const mine = ids.filter((_, index) => owners[index] === target);
  if (mine.length === 0) return [];

  const details = await readVoucherBatch(client, mine);

  return details.sort((a, b) => Number(BigInt(b.tokenId) - BigInt(a.tokenId)));
}

/** 给已有列表补链下明细；失败或超时不影响已展示的卡片 */
export async function enrichVoucherMetadata(
  items: VoucherDetail[]
): Promise<VoucherDetail[]> {
  if (items.length === 0) return items;

  const extras = await inChunks(items, 8, async (item) => {
    const remote = await fetchMetadataJson(metadataFallbackUrl(item.tokenId));
    return remote ? { ...item, metadata: remote } : item;
  });

  return extras;
}

async function readOwners(
  client: PublicClient,
  ids: bigint[]
): Promise<(string | null)[]> {
  try {
    const results = await client.multicall({
      contracts: ids.map((id) => ({
        address: CONTRACTS.travelVoucher,
        abi: VOUCHER_ABI,
        functionName: "ownerOf" as const,
        args: [id] as const,
      })),
      allowFailure: true,
    });
    return results.map((item) =>
      item.status === "success" ? item.result.toLowerCase() : null
    );
  } catch {
    return inChunks(ids, 25, async (id) => {
      try {
        const owner = await client.readContract({
          address: CONTRACTS.travelVoucher,
          abi: VOUCHER_ABI,
          functionName: "ownerOf",
          args: [id],
        });
        return owner.toLowerCase();
      } catch (error) {
        if (isRevert(error)) return null;
        throw error;
      }
    });
  }
}

async function readVoucherBatch(
  client: PublicClient,
  ids: bigint[]
): Promise<VoucherDetail[]> {
  try {
    const results = await client.multicall({
      contracts: ids.map((id) => ({
        address: CONTRACTS.travelVoucher,
        abi: VOUCHER_ABI,
        functionName: "getVoucher" as const,
        args: [id] as const,
      })),
      allowFailure: true,
    });
    return results.flatMap((item, index) => {
      const id = ids[index];
      if (!id || item.status !== "success") return [];
      return [toDetail(id, item.result)];
    });
  } catch {
    const details = await inChunks(ids, 10, (id) => readVoucher(client, id));
    return details.filter((voucher): voucher is VoucherDetail => voucher !== null);
  }
}

/** 读取单个 tokenId 的链上凭证（不阻塞等 metadata） */
export async function readVoucher(
  client: PublicClient,
  tokenId: bigint
): Promise<VoucherDetail | null> {
  try {
    const onChain = await client.readContract({
      address: CONTRACTS.travelVoucher,
      abi: VOUCHER_ABI,
      functionName: "getVoucher",
      args: [tokenId],
    });

    return toDetail(tokenId, onChain);
  } catch (error) {
    if (isRevert(error)) return null;
    throw error;
  }
}

/**
 * 浏览器走 Next rewrite 的同源路径，这样 Cursor 只转发 13000 时
 * 也能打到本机 orchestrator，而不是用户电脑上的 localhost:3001。
 */
function metadataFallbackUrl(tokenId: string): string {
  if (typeof window !== "undefined") {
    return `/api/vouchers/${tokenId}/metadata`;
  }
  return `${BACKEND_URL}/api/vouchers/${tokenId}/metadata`;
}

async function fetchMetadataJson(url: string): Promise<VoucherMetadata | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as VoucherMetadata;
    if (!payload || typeof payload !== "object") return null;

    return {
      name: payload.name ?? "",
      description: payload.description ?? "",
      image: payload.image ?? "",
      attributes: payload.attributes ?? [],
      details: payload.details ?? {},
    };
  } catch {
    return null;
  }
}
