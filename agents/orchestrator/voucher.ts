import { CATEGORY_TO_KEY, env, type AgentKey } from "../shared/env";
import { createLogger, startTimer } from "../shared/logger";
import { indexVoucher, vouchers } from "../shared/store";
import type { VoucherDetail } from "../shared/types";
import { VOUCHER_ABI } from "../shared/abis";
import { contractAddresses, publicClient } from "../shared/clients";
import { listAgentProfiles } from "./registry";

const log = createLogger("voucher");
const ZERO = "0x0000000000000000000000000000000000000000";
const VOUCHER_STATUS_LABEL = ["Issued", "Redeemed", "Voided"] as const;

export async function issueViaProvider(params: {
  endpoint: string;
  category: 0 | 1 | 2 | 3;
  holder: `0x${string}`;
  orderId: string;
  title: string;
  details: Record<string, string>;
  validFrom: number;
  validTo: number;
}): Promise<{ tokenId: string; txHash?: `0x${string}`; detail: VoucherDetail }> {
  const elapsed = startTimer();
  const issueLog = log.child({ orderId: params.orderId, category: params.category, endpoint: params.endpoint });
  issueLog.info("请求服务商发券", { holder: params.holder, title: params.title });

  const response = await fetch(`${params.endpoint.replace(/\/+$/, "")}/v1/vouchers/issue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-token": env.INTERNAL_TOKEN,
    },
    body: JSON.stringify({
      category: params.category,
      holder: params.holder,
      orderId: params.orderId,
      title: params.title,
      details: params.details,
      validFrom: params.validFrom,
      validTo: params.validTo,
    }),
  });
  if (!response.ok) {
    const body = (await response.text().catch(() => "")).slice(0, 300);
    issueLog.error("发券失败", { status: response.status, ms: elapsed(), body });
    throw new Error(`发券失败 HTTP ${response.status}`);
  }
  const issued = (await response.json()) as {
    tokenId: string;
    txHash?: `0x${string}`;
    detail: VoucherDetail;
  };
  if (issued.detail) indexVoucher(issued.detail);
  issueLog.info("发券完成", { tokenId: issued.tokenId, txHash: issued.txHash, ms: elapsed() });
  return issued;
}

export async function redeemViaProvider(tokenId: string, provider: string) {
  const elapsed = startTimer();
  const profiles = await listAgentProfiles();
  const profile = profiles.find((item) => item.address.toLowerCase() === provider.toLowerCase());
  if (!profile) {
    log.error("找不到签发该凭证的服务商", { tokenId, provider, known: profiles.length });
    throw new Error(`找不到签发该凭证的服务商 ${provider}`);
  }
  log.info("请求服务商核销", { tokenId, provider, endpoint: profile.endpoint });
  const response = await fetch(`${profile.endpoint.replace(/\/+$/, "")}/v1/vouchers/redeem`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-token": env.INTERNAL_TOKEN,
    },
    body: JSON.stringify({ tokenId }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { message?: string };
    log.error("核销失败", {
      tokenId,
      status: response.status,
      ms: elapsed(),
      message: payload.message,
    });
    throw new Error(payload.message ?? `核销失败 HTTP ${response.status}`);
  }
  const result = (await response.json()) as {
    txHash?: `0x${string}`;
    status: "Redeemed";
    provider?: string;
    providerName?: string;
  };
  const cached = vouchers.get(tokenId);
  if (cached) {
    cached.status = "Redeemed";
    vouchers.set(tokenId, cached);
  }
  log.info("核销完成", { tokenId, txHash: result.txHash, ms: elapsed() });
  return result;
}

export async function ensureVoucher(tokenId: string): Promise<VoucherDetail | null> {
  const cached = vouchers.get(tokenId);
  if (cached) return cached;

  log.debug("本地无凭证缓存，向服务商逐个查询", { tokenId });
  const profiles = await listAgentProfiles();
  for (const profile of profiles) {
    try {
      const response = await fetch(`${profile.endpoint.replace(/\/+$/, "")}/v1/vouchers/${tokenId}`);
      if (response.ok) {
        const detail = (await response.json()) as VoucherDetail;
        indexVoucher(detail);
        log.debug("服务商返回凭证明细", { tokenId, provider: profile.name });
        return detail;
      }
      log.debug("服务商处无此凭证", { tokenId, provider: profile.name, status: response.status });
    } catch (error) {
      log.warn("查询服务商凭证失败，继续下一个", { tokenId, provider: profile.name }, error);
      continue;
    }
  }

  try {
    const { voucher } = contractAddresses();
    const onChain = await publicClient.readContract({
      address: voucher,
      abi: VOUCHER_ABI,
      functionName: "getVoucher",
      args: [BigInt(tokenId)],
    });
    if (onChain.provider === ZERO) {
      log.debug("链上查不到该凭证", { tokenId });
      return null;
    }
    const category = Number(onChain.category) as 0 | 1 | 2 | 3;
    const profile = profiles.find(
      (item) => item.address.toLowerCase() === onChain.provider.toLowerCase()
    );
    const detail: VoucherDetail = {
      tokenId,
      orderId: onChain.orderId.toString(),
      provider: onChain.provider,
      providerName: profile?.name ?? CATEGORY_TO_KEY[category],
      holder: onChain.holder,
      category,
      code: onChain.code,
      title: onChain.title,
      metadataHash: onChain.metadataHash,
      validFrom: Number(onChain.validFrom),
      validTo: Number(onChain.validTo),
      status: VOUCHER_STATUS_LABEL[Number(onChain.status)] ?? "Issued",
    };
    indexVoucher(detail);
    log.info("已从链上重建凭证", { tokenId, provider: detail.provider, category: detail.category });
    return detail;
  } catch (error) {
    log.warn("链上凭证查询失败", { tokenId }, error);
    return null;
  }
}

export type { AgentKey };
