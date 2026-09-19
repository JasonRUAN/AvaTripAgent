import { decodeEventLog, keccak256, toHex } from "viem";
import {
  AGENT_ADDRESSES,
  AGENT_NAMES,
  CATEGORY_TO_KEY,
  nameOfAgent,
} from "../agents/addresses";
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

    // 发券前先记下即将被分配的 tokenId，事件解析失败时用它兜底（合约 nextTokenId 从 1 开始）
    const expectedTokenId = await publicClient.readContract({
      address: voucher,
      abi: VOUCHER_ABI,
      functionName: "nextTokenId",
    });

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

    // 拿不到事件时才用链上计数兜底；绝不能退回到进程内自增，
    // 否则会记出一个链上并不存在的 tokenId（例如 0 或重复的小号），核销必然 UnknownVoucher。
    tokenId = (issued?.tokenId ?? expectedTokenId).toString();
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
  // 发券交易里 _safeMint 会先 emit ERC-721 Transfer（from = 0x0），
  // 不能简单拿 topics[1] 当 tokenId，必须按事件签名只认 VoucherIssued。
  try {
    const decoded = decodeEventLog({
      abi: VOUCHER_ABI,
      data: log.data,
      topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
    });
    if (decoded.eventName !== "VoucherIssued") return null;
    const tokenId = decoded.args.tokenId;
    return typeof tokenId === "bigint" ? { tokenId } : null;
  } catch {
    return null;
  }
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** 与合约 `VoucherStatus` 枚举顺序一致 */
const VOUCHER_STATUS_LABEL = ["Issued", "Redeemed", "Voided"] as const;

/**
 * 商户核销：只有发行该凭证的服务商 Agent 才能调用 redeem，且不可重复使用。
 *
 * 写交易前先读一次链上状态：合约里的 require 条件都在链下先过一遍，
 * 这样失败时能给出「凭证不存在 / 已核销 / 身份不对」这类可读原因，
 * 而不是只能看到一个无法解码的 revert 签名。
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
    const id = BigInt(tokenId);

    // getVoucher 返回单个 struct（含 string 动态成员），viem 解成带字段名的对象
    const onChain = await publicClient.readContract({
      address: voucher,
      abi: VOUCHER_ABI,
      functionName: "getVoucher",
      args: [id],
    });
    const onChainProvider = onChain.provider;
    const onChainStatus = Number(onChain.status);

    if (onChainProvider === ZERO_ADDRESS) {
      throw new Error(
        `凭证 #${tokenId} 在链上不存在（tokenId 记错了？链上编号从 1 开始）`
      );
    }
    if (onChainStatus !== 0) {
      throw new Error(
        `凭证 #${tokenId} 已是 ${VOUCHER_STATUS_LABEL[onChainStatus] ?? onChainStatus} 状态，不能重复核销`
      );
    }
    if (onChainProvider.toLowerCase() !== wallet.account.address.toLowerCase()) {
      throw new Error(
        `凭证 #${tokenId} 由 ${nameOfAgent(onChainProvider)} 签发，请切换到该身份后再核销`
      );
    }

    const hash = await wallet.writeContract({
      address: voucher,
      abi: VOUCHER_ABI,
      functionName: "redeem",
      args: [id],
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
