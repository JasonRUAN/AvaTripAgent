import { parseAbi } from "viem";
import deployment from "@/deployments/fuji.json";
import type { Address } from "./types";

/**
 * 合约地址与 ABI。
 *
 * 地址来自仓库根 `deployments/fuji.json`（`forge script` 写入）。
 * `frontend/deployments/` 是同步副本（`scripts/sync-fuji-deployment.sh` / `npm run predev`）。
 * 前端只持有公开地址，**任何私钥都不会进入前端**。
 */

export const CONTRACTS = {
  chainId: deployment.chainId,
  /** 合约是否已部署到 Fuji；false 时前端自动进入演示兜底模式 */
  deployed: deployment.deployed,
  usdc: deployment.usdc as Address,
  agentRegistry: deployment.agentRegistry as Address,
  tripSettlement: deployment.tripSettlement as Address,
  travelVoucher: deployment.travelVoucher as Address,
  agentReview: ((deployment as { agentReview?: string }).agentReview ??
    "0x0000000000000000000000000000000000000000") as Address,
  orchestrator: deployment.orchestrator as Address,
  agents: {
    flight: deployment.agents.flight as Address,
    hotel: deployment.agents.hotel as Address,
    attraction: deployment.agents.attraction as Address,
    dining: deployment.agents.dining as Address,
  },
} as const;

const ZERO = "0x0000000000000000000000000000000000000000";

/** 所有地址都非 0 才算真正部署完成 */
export const isDeployed =
  CONTRACTS.deployed &&
  CONTRACTS.usdc !== ZERO &&
  CONTRACTS.tripSettlement !== ZERO &&
  CONTRACTS.travelVoucher !== ZERO;

export const isReviewDeployed =
  isDeployed && CONTRACTS.agentReview !== ZERO;

/** 后端地址，SSE / REST 都走它 */
export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3010";

// ---------------------------------------------------------------------- ABI

export const USDC_ABI = parseAbi([
  "function faucet()",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  // 自定义 error 必须写进 ABI，viem 才能把 revert data 解成可读原因；
  // 否则只能看到 "unknown custom error" + 一串十六进制
  "error InsufficientBalance()",
  "error InsufficientAllowance()",
  "error InvalidReceiver()",
]);

export const SETTLEMENT_ABI = parseAbi([
  "function createOrder(uint256 tripId, bytes32 itineraryHash, (address provider, uint256 amount, uint8 category, bytes32 itemHash)[] items) returns (uint256)",
  "function getOrder(uint256 orderId) view returns (address traveler, uint256 total, uint256 settled, bytes32 itineraryHash, uint256 tripId, uint8 status)",
  "function getItems(uint256 orderId) view returns ((address provider, uint256 amount, uint8 category, bytes32 itemHash)[])",
  "function itemCount(uint256 orderId) view returns (uint256)",
  "function cancel(uint256 orderId)",
  "event OrderCreated(uint256 indexed orderId, address indexed traveler, uint256 total, bytes32 itineraryHash)",
  "error NotOperator()",
  "error NotTraveler()",
  "error ZeroAmount()",
  "error EmptyItems()",
  "error InactiveProvider(address provider)",
  "error ProviderIsTraveler(address provider)",
  "error UnknownOrder(uint256 orderId)",
  "error OrderNotFunded(uint256 orderId)",
  "error OrderAlreadySettled(uint256 orderId)",
  "error ItemAlreadySettled(uint256 itemIndex)",
  "error ItemOutOfRange(uint256 itemIndex)",
  "error TransferFailed()",
]);

export const VOUCHER_ABI = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function redeem(uint256 tokenId)",
  "function void(uint256 tokenId)",
  "function isValid(uint256 tokenId) view returns (bool)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  // Voucher 含 string（动态成员），合约返回的是「单个 struct」：
  // ABI 里第一个字是指向 tuple 的偏移量，绝不能写成 10 个独立返回值，
  // 否则解码整体错位（viem 会在 uint64 上抛 not in safe integer range）
  "function getVoucher(uint256 tokenId) view returns ((uint256 orderId, address provider, address holder, uint8 category, string code, string title, bytes32 metadataHash, uint64 validFrom, uint64 validTo, uint8 status))",
  "function balanceOf(address owner) view returns (uint256)",
  // 合约是普通 ERC-721（非 Enumerable），只能靠 nextTokenId + ownerOf 枚举持有者
  "function nextTokenId() view returns (uint256)",
  "event VoucherIssued(uint256 indexed tokenId, address indexed provider, address indexed holder, uint8 category, string code)",
]);

export const REGISTRY_ABI = parseAbi([
  "function owner() view returns (address)",
  "function isActiveAgent(address agent) view returns (bool)",
  "function getAgent(address agent) view returns ((string name, uint8 category, string endpoint, bool active, string description, string website))",
  "function getCategoryMask(address agent) view returns (uint8)",
  "function getAgents() view returns (address[])",
  "function getAgentsByCategory(uint8 category) view returns (address[])",
  "function getAgentsByCategoryActive(uint8 category) view returns (address[])",
  "function registerAgent(address agent, string name, uint8 categoryMask, string endpoint, string description, string website)",
  "function setActive(address agent, bool active)",
  "event AgentRegistered(address indexed agent, string name, uint8 categoryMask, string endpoint, string description, string website)",
  "event AgentStatusChanged(address indexed agent, bool active)",
  "error NotOwner()",
  "error ZeroAddress()",
  "error EmptyName()",
  "error EmptyCategories()",
  "error InvalidCategories()",
]);

export const REVIEW_ABI = parseAbi([
  "function submitReview(uint256 tokenId, uint8 score, string comment)",
  "function getReview(uint256 tokenId) view returns ((uint256 tokenId, address reviewer, address provider, uint8 score, string comment, uint64 timestamp))",
  "function hasReview(uint256 tokenId) view returns (bool)",
  "function getReviewsByAgent(address agent) view returns ((uint256 tokenId, address reviewer, address provider, uint8 score, string comment, uint64 timestamp)[])",
  "function getScore(address agent) view returns (uint256 sum, uint256 count, uint256 avgX100)",
  "event ReviewSubmitted(uint256 indexed tokenId, address indexed reviewer, address indexed provider, uint8 score, string comment)",
  "error UnknownVoucher()",
  "error NotHolder()",
  "error VoucherNotRedeemed()",
  "error AlreadyReviewed(uint256 tokenId)",
  "error InvalidScore()",
  "error CommentTooLong()",
  "error InactiveProvider(address provider)",
]);

