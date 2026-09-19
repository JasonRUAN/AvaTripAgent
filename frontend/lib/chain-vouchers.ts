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
 * `metadata`（各品类结构化明细）优先取 `tokenURI` 指向的链下 JSON，
 * 取不到时用链上字段合成，保证卡片始终有可读内容。
 */

/** 服务商 Agent 地址 → 展示名（对应 AgentRegistry 里的注册项） */
const AGENT_NAMES: Record<string, string> = {
  [CONTRACTS.agents.flight.toLowerCase()]: "AvaFlights Agent",
  [CONTRACTS.agents.hotel.toLowerCase()]: "AvaStays Agent",
  [CONTRACTS.agents.attraction.toLowerCase()]: "AvaTickets Agent",
  [CONTRACTS.agents.dining.toLowerCase()]: "AvaTables Agent",
};

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

/**
 * 枚举某个地址在链上当前持有的全部凭证。
 *
 * 合约是普通 ERC-721（非 Enumerable），没有 `tokenOfOwnerByIndex`，
 * 因此按 `nextTokenId` 遍历所有已签发 tokenId，再用 `ownerOf` 判定归属
 * —— `Voucher.holder` 是签发时的快照，转赠后会失真，不能当持有者用。
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

  const owners = await inChunks(ids, 25, async (id) => {
    try {
      const owner = await client.readContract({
        address: CONTRACTS.travelVoucher,
        abi: VOUCHER_ABI,
        functionName: "ownerOf",
        args: [id],
      });
      return owner.toLowerCase();
    } catch (error) {
      // tokenId 不存在时 ownerOf 会 revert（ERC721NonexistentToken），跳过即可
      if (isRevert(error)) return null;
      throw error;
    }
  });

  const mine = ids.filter((_, index) => owners[index] === target);
  if (mine.length === 0) return [];

  const details = await inChunks(mine, 10, (id) => readVoucher(client, id));

  return details
    .filter((voucher): voucher is VoucherDetail => voucher !== null)
    .sort((a, b) => Number(BigInt(b.tokenId) - BigInt(a.tokenId)));
}

/** 读取单个 tokenId 的链上凭证 */
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

    // getVoucher 返回的是单个 struct（含 string 动态成员），viem 解成对象
    const {
      orderId,
      provider,
      holder,
      category,
      code,
      title,
      metadataHash,
      validFrom,
      validTo,
      status,
    } = onChain;

    const categoryCode = (Number(category) || 0) as CategoryCode;

    return {
      tokenId: tokenId.toString(),
      orderId: orderId.toString(),
      provider,
      providerName: providerName(provider),
      holder,
      category: categoryCode,
      code,
      title,
      metadataHash,
      validFrom: Number(validFrom),
      validTo: Number(validTo),
      status: STATUS[Number(status)] ?? "Issued",
      metadata: await loadMetadata(client, tokenId, title, code),
    };
  } catch (error) {
    // 单个 token 解码异常不应该给出「没有凭证」的假象
    if (isRevert(error)) return null;
    throw error;
  }
}

/** 链下明细：`tokenURI` 优先，失败时退回后端 metadata 端点 */
async function loadMetadata(
  client: PublicClient,
  tokenId: bigint,
  title: string,
  code: string
): Promise<VoucherMetadata> {
  const remote = await fetchMetadata(client, tokenId);
  if (remote) return remote;

  return {
    name: title || `凭证 #${tokenId}`,
    description: "Avalanche Fuji 链上凭证（链下明细暂不可用）",
    image: "",
    attributes: [{ trait_type: "Code", value: code }],
    details: {},
  };
}

async function fetchMetadata(
  client: PublicClient,
  tokenId: bigint
): Promise<VoucherMetadata | null> {
  try {
    const uri = await client.readContract({
      address: CONTRACTS.travelVoucher,
      abi: VOUCHER_ABI,
      functionName: "tokenURI",
      args: [tokenId],
    });

    if (uri) {
      const metadata = await fetchMetadataJson(uri);
      if (metadata) return metadata;
    }
  } catch {
    // 合约未 setBaseURI 时 tokenURI 不可用，继续走后端兜底
  }

  return fetchMetadataJson(`${BACKEND_URL}/api/vouchers/${tokenId}/metadata`);
}

async function fetchMetadataJson(url: string): Promise<VoucherMetadata | null> {
  try {
    const response = await fetch(url);
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
