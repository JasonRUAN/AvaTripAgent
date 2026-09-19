/** 合约 ABI（与 `contract/ava_trip_agent/src/*.sol` 保持同步） */

export const USDC_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const SETTLEMENT_ABI = [
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [
      { name: "orderId", type: "uint256" },
      { name: "itemIndexes", type: "uint256[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getOrder",
    stateMutability: "view",
    inputs: [{ name: "orderId", type: "uint256" }],
    outputs: [
      { name: "traveler", type: "address" },
      { name: "total", type: "uint256" },
      { name: "settled", type: "uint256" },
      { name: "itineraryHash", type: "bytes32" },
      { name: "tripId", type: "uint256" },
      { name: "status", type: "uint8" },
    ],
  },
  {
    type: "function",
    name: "getItems",
    stateMutability: "view",
    inputs: [{ name: "orderId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "provider", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "category", type: "uint8" },
          { name: "itemHash", type: "bytes32" },
        ],
      },
    ],
  },
  {
    type: "event",
    name: "ProviderPaid",
    inputs: [
      { name: "orderId", type: "uint256", indexed: true },
      { name: "itemIndex", type: "uint256", indexed: true },
      { name: "provider", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "OrderSettled",
    inputs: [
      { name: "orderId", type: "uint256", indexed: true },
      { name: "total", type: "uint256", indexed: false },
    ],
  },
] as const;

export const VOUCHER_ABI = [
  {
    type: "function",
    name: "issueVoucher",
    stateMutability: "nonpayable",
    inputs: [
      { name: "holder", type: "address" },
      { name: "orderId", type: "uint256" },
      { name: "category", type: "uint8" },
      { name: "code", type: "string" },
      { name: "title", type: "string" },
      { name: "metadataHash", type: "bytes32" },
      { name: "validFrom", type: "uint64" },
      { name: "validTo", type: "uint64" },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "redeem",
    stateMutability: "nonpayable",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "isValid",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "getVoucher",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { name: "orderId", type: "uint256" },
      { name: "provider", type: "address" },
      { name: "holder", type: "address" },
      { name: "category", type: "uint8" },
      { name: "code", type: "string" },
      { name: "title", type: "string" },
      { name: "metadataHash", type: "bytes32" },
      { name: "validFrom", type: "uint64" },
      { name: "validTo", type: "uint64" },
      { name: "status", type: "uint8" },
    ],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "event",
    name: "VoucherIssued",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "provider", type: "address", indexed: true },
      { name: "holder", type: "address", indexed: true },
      { name: "category", type: "uint8", indexed: false },
      { name: "code", type: "string", indexed: false },
    ],
  },
] as const;

export const REGISTRY_ABI = [
  {
    type: "function",
    name: "isActiveAgent",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "getAgent",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [
      { name: "name", type: "string" },
      { name: "category", type: "uint8" },
      { name: "endpoint", type: "string" },
      { name: "active", type: "bool" },
    ],
  },
] as const;
