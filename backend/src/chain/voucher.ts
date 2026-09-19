import { keccak256, toHex } from "viem";
import { AGENT_ADDRESSES, AGENT_NAMES, CATEGORY_TO_KEY } from "../agents/addresses";
import { env, hasChain } from "../env";
import { indexVoucher } from "../store";
import type { CategoryCode, VoucherDetail, VoucherMetadata } from "../types";
import { VOUCHER_ABI } from "./abis";
import { agentWallet, contractAddresses, publicClient } from "./clients";

/** 模拟模式下自增的 tokenId（未部署合约时用于演示） */
let simulatedTokenId = 1;

function randomCode(prefix: string, length = 6): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${prefix} ${out}`;
}

const CODE_PREFIX: Record<CategoryCode, string> = {
  0: "PNR",
  1: "CONF",
  2: "TCK",
  3: "RSV",
};

export function voucherCode(category: CategoryCode): string {
  return randomCode(CODE_PREFIX[category], category === 1 ? 7 : 6);
}

export interface IssueParams {
  category: CategoryCode;
  holder: `0x${string}`;
  orderId: string;
  title: string;
  /** 链下明细（写进 tokenURI metadata） */
  details: Record<string, string>;
  validFrom: number;
  validTo: number;
}

/**
 * 发行凭证。
 *
 * 已部署时用对应服务商 Agent 的私钥真实 mint ERC-721；
 * 未部署时退化成进程内模拟，保证演示链路不断。
 */
export async function issueVoucher(
  params: IssueParams
): Promise<{ tokenId: string; txHash?: `0x${string}`; detail: VoucherDetail }> {
  const key = CATEGORY_TO_KEY[params.category];
  const provider = AGENT_ADDRESSES[key];
  const code = voucherCode(params.category);
  const metadataHash = keccak256(toHex(JSON.stringify(params.details)));

  let tokenId: string;
  let txHash: `0x${string}` | undefined;

  if (hasChain) {
    const wallet = agentWallet(key);
    const { voucher } = contractAddresses();

    const hash = await wallet.writeContract({
      address: voucher,
      abi: VOUCHER_ABI,
      functionName: "issueVoucher",
      args: [
        params.holder,
        BigInt(params.orderId),
        params.category,
        code,
        params.title,
        metadataHash,
        BigInt(params.validFrom),
        BigInt(params.validTo),
      ],
      chain: undefined,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    txHash = hash;

    const issued = receipt.logs
      .map((log) => {
        try {
          return { log, decoded: decodeIssued(log) };
        } catch {
          return null;
        }
      })
      .find((entry) => entry?.decoded)?.decoded;

    tokenId = issued?.tokenId?.toString() ?? String(simulatedTokenId++);
  } else {
    tokenId = String(simulatedTokenId++);
  }

  const metadata = buildMetadata({
    tokenId,
    category: params.category,
    title: params.title,
    code,
    details: params.details,
  });

  const detail: VoucherDetail = {
    tokenId,
    orderId: params.orderId,
    provider,
    providerName: AGENT_NAMES[key],
    holder: params.holder,
    category: params.category,
    code,
    title: params.title,
    metadataHash,
    validFrom: params.validFrom,
    validTo: params.validTo,
    status: "Issued",
    metadata,
  };

  indexVoucher(detail);
  return { tokenId, txHash, detail };
}

function decodeIssued(log: { topics: readonly `0x${string}`[] | readonly string[]; data: `0x${string}` }):
  | { tokenId: bigint }
  | null {
  // VoucherIssued(tokenId indexed, provider indexed, holder indexed, category, code)
  if (!log.topics[1]) return null;
  try {
    return { tokenId: BigInt(log.topics[1] as string) };
  } catch {
    return null;
  }
}

/**
 * 商户核销：只有发行该凭证的服务商 Agent 才能调用 redeem，且不可重复使用。
 */
export async function redeemVoucher(
  tokenId: string,
  which: "flight" | "hotel" | "attraction" | "dining"
): Promise<{ txHash?: `0x${string}`; status: "Redeemed" }> {
  const { vouchers } = await import("../store");
  const detail = vouchers.get(tokenId);

  if (hasChain) {
    const wallet = agentWallet(which);
    const { voucher } = contractAddresses();
    const hash = await wallet.writeContract({
      address: voucher,
      abi: VOUCHER_ABI,
      functionName: "redeem",
      args: [BigInt(tokenId)],
      chain: undefined,
    });
    await publicClient.waitForTransactionReceipt({ hash });

    if (detail) {
      detail.status = "Redeemed";
      vouchers.set(tokenId, detail);
    }
    return { txHash: hash, status: "Redeemed" };
  }

  // 未部署：只改进程内状态，UI 上标注为演示
  if (detail) {
    detail.status = "Redeemed";
    vouchers.set(tokenId, detail);
  }
  return { status: "Redeemed" };
}

export function buildMetadata(input: {
  tokenId: string;
  category: CategoryCode;
  title: string;
  code: string;
  details: Record<string, string>;
}): VoucherMetadata {
  const categoryLabel = ["机票", "酒店", "门票", "餐饮"][input.category]!;
  const categoryEn = ["Flight", "Hotel", "Attraction", "Dining"][input.category]!;

  return {
    name: `${categoryLabel}凭证 · ${input.title}`,
    description: `由 ${AGENT_NAMES[CATEGORY_TO_KEY[input.category]]} 在 Avalanche Fuji 上签发的${categoryLabel}凭证（演示用，非真实可预订凭证）。`,
    image: `${env.PUBLIC_BASE_URL}/api/vouchers/${input.tokenId}/image`,
    attributes: [
      { trait_type: "Category", value: categoryEn },
      { trait_type: "Code", value: input.code },
      { trait_type: "Network", value: "Avalanche Fuji" },
      { trait_type: "Demo", value: "true" },
    ],
    details: input.details,
  };
}
