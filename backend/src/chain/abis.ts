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
  // 自定义错误必须写进 ABI，否则 viem 只能报「未知签名 0x...」，无法定位原因
  { type: "error", name: "NotOperator", inputs: [] },
  { type: "error", name: "InactiveProvider", inputs: [{ name: "provider", type: "address" }] },
  { type: "error", name: "UnknownOrder", inputs: [{ name: "orderId", type: "uint256" }] },
  { type: "error", name: "OrderNotFunded", inputs: [{ name: "orderId", type: "uint256" }] },
  { type: "error", name: "ItemAlreadySettled", inputs: [{ name: "itemIndex", type: "uint256" }] },
  { type: "error", name: "ItemOutOfRange", inputs: [{ name: "itemIndex", type: "uint256" }] },
  { type: "error", name: "TransferFailed", inputs: [] },
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
    name: "nextTokenId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "void",
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
    // 合约返回的是单个 struct（Voucher 含 string 动态成员），ABI 必须声明成 tuple：
    // 写成 10 个独立返回值会整体错位，viem 解码时直接抛 not in safe integer range
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
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
  {
    type: "event",
    name: "VoucherRedeemed",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "provider", type: "address", indexed: true },
    ],
  },
  // 自定义错误必须写进 ABI，否则 viem 只能报「未知签名 0x...」，无法定位原因
  { type: "error", name: "NotOwner", inputs: [] },
  {
    type: "error",
    name: "NotRegisteredAgent",
    inputs: [{ name: "caller", type: "address" }],
  },
  { type: "error", name: "NotProvider", inputs: [{ name: "tokenId", type: "uint256" }] },
  { type: "error", name: "UnknownVoucher", inputs: [{ name: "tokenId", type: "uint256" }] },
  {
    type: "error",
    name: "VoucherNotIssued",
    inputs: [{ name: "tokenId", type: "uint256" }],
  },
  { type: "error", name: "InvalidValidityWindow", inputs: [] },
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
