import { decodeEventLog, keccak256, toHex } from "viem";
import { VOUCHER_ABI } from "../shared/abis";
import { contractAddresses, providerWallet, publicClient } from "../shared/clients";
import { deployment, env, hasChain } from "../shared/env";
import { indexVoucher } from "../shared/store";
import type { CategoryCode, VoucherDetail, VoucherMetadata } from "../shared/types";

let simulatedTokenId = 1;

function randomCode(prefix: string, length = 6): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
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
  details: Record<string, string>;
  validFrom: number;
  validTo: number;
}

function agentAddress(): `0x${string}` {
  if (env.AGENT_KEY) {
    return providerWallet().account.address;
  }
  return (
    (deployment?.agents?.[env.AGENT_CATEGORY] as `0x${string}` | undefined) ??
    "0x0000000000000000000000000000000000000000"
  );
}

export async function issueVoucher(params: IssueParams): Promise<{
  tokenId: string;
  txHash?: `0x${string}`;
  detail: VoucherDetail;
}> {
  const provider = agentAddress();
  const code = voucherCode(params.category);
  const metadataHash = keccak256(toHex(JSON.stringify(params.details)));

  let tokenId: string;
  let txHash: `0x${string}` | undefined;

  if (hasChain && env.AGENT_KEY) {
    const wallet = providerWallet();
    const { voucher } = contractAddresses();
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
          return decodeIssued(log);
        } catch {
          return null;
        }
      })
      .find(Boolean);
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
    providerName: env.AGENT_NAME,
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

function decodeIssued(log: { topics: readonly `0x${string}`[] | readonly string[]; data: `0x${string}` }) {
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
const VOUCHER_STATUS_LABEL = ["Issued", "Redeemed", "Voided"] as const;

export async function ensureVoucher(tokenId: string): Promise<VoucherDetail | null> {
  const { vouchers } = await import("../shared/store");
  const cached = vouchers.get(tokenId);
  if (cached) return cached;
  if (!hasChain) return null;

  const { voucher } = contractAddresses();
  try {
    const onChain = await publicClient.readContract({
      address: voucher,
      abi: VOUCHER_ABI,
      functionName: "getVoucher",
      args: [BigInt(tokenId)],
    });
    if (onChain.provider === ZERO_ADDRESS) return null;
    const category = Number(onChain.category) as CategoryCode;
    const status = VOUCHER_STATUS_LABEL[Number(onChain.status)] ?? "Issued";
    const detail: VoucherDetail = {
      tokenId,
      orderId: onChain.orderId.toString(),
      provider: onChain.provider,
      providerName: env.AGENT_NAME,
      holder: onChain.holder,
      category,
      code: onChain.code,
      title: onChain.title,
      metadataHash: onChain.metadataHash,
      validFrom: Number(onChain.validFrom),
      validTo: Number(onChain.validTo),
      status,
      metadata: buildMetadata({
        tokenId,
        category,
        title: onChain.title,
        code: onChain.code,
        details: { restored: "从链上状态重建" },
      }),
    };
    indexVoucher(detail);
    return detail;
  } catch {
    return null;
  }
}

export async function redeemVoucher(tokenId: string): Promise<{
  txHash?: `0x${string}`;
  status: "Redeemed";
  provider?: string;
  providerName?: string;
}> {
  const { vouchers } = await import("../shared/store");
  const detail = vouchers.get(tokenId);

  if (hasChain && env.AGENT_KEY) {
    const { voucher } = contractAddresses();
    const id = BigInt(tokenId);
    const onChain = await publicClient.readContract({
      address: voucher,
      abi: VOUCHER_ABI,
      functionName: "getVoucher",
      args: [id],
    });
    if (onChain.provider === ZERO_ADDRESS) {
      throw new Error(`凭证 #${tokenId} 在链上不存在`);
    }
    if (Number(onChain.status) !== 0) {
      throw new Error(`凭证 #${tokenId} 已是 ${VOUCHER_STATUS_LABEL[Number(onChain.status)]} 状态`);
    }
    const self = providerWallet().account.address.toLowerCase();
    if (onChain.provider.toLowerCase() !== self) {
      throw new Error(`凭证签发者不是本 Agent（${onChain.provider}）`);
    }
    const hash = await providerWallet().writeContract({
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
    return {
      txHash: hash,
      status: "Redeemed",
      provider: onChain.provider,
      providerName: env.AGENT_NAME,
    };
  }

  if (detail) {
    detail.status = "Redeemed";
    vouchers.set(tokenId, detail);
  }
  return { status: "Redeemed", provider: detail?.provider, providerName: env.AGENT_NAME };
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
    description: `由 ${env.AGENT_NAME} 在 Avalanche Fuji 上签发的${categoryLabel}凭证（演示用）。`,
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

