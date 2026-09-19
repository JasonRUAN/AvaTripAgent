# AvaTrip Agent — 产品与技术方案

> 面向 **Avalanche Build Day** 的概念性产品。核心叙事：**一个 AI 旅行规划 Agent，帮用户规划行程、代用户向多家旅游服务商 Agent 付款，并把机票/酒店/门票凭证以链上资产的形式交还给用户**。
>
> 产品是概念演示，但 **Avalanche Fuji (43113) 上的所有链上交互都是真实交易**（真实签名、真实转账、真实 NFT、Explorer 可查）。

---

## 0. 电梯陈述（30 秒）

「用户说一句『上海去东京 5 天、两人、预算 8000、想吃好少走路』，AI Agent 边想边把行程流式写出来；确认后钱包签 2 次：一次授权、一次付款。钱进旅行 Agent 的链上结算合约，Agent 立刻把钱分给航司 Agent、酒店 Agent、门票 Agent；这些 Agent 收到钱的瞬间自动把机票、酒店、门票凭证（NFT）发到用户钱包。用户拿着凭证上的二维码就能在链下核销——整个过程在 Avalanche 上 1~2 秒确认完毕。」

---

## 1. 真实 vs Mock 的边界（必须在 UI 上诚实标注）

| 环节 | 性质 | 说明 |
| --- | --- | --- |
| 需求理解 / 行程规划 / 预算拆解 | **真实 LLM** | OpenAI 兼容接口，DeepAgents 编排 |
| 航班、酒店、景点、餐厅库存与价格 | **Mock 数据** | 本地 catalog + 种子随机生成，**不接任何实时旅行 API** |
| 金额 | **Fuji 上的测试代币 tUSDC**（6 decimals） | 沿用 `AvaTrip-DEV/contract/ava_trip/src/MockUSDC.sol` |
| 钱包连接、授权、支付、分账 | **真实链上交易** | 用户签名 → Fuji C-Chain → Explorer 可查 |
| 凭证（机票/酒店/门票） | **真实 ERC-721 NFT** | 由各服务商 Agent 用自己的私钥 mint 给用户 |
| 凭证链下核销 | **真实链上状态变更** | 商户端签名 `redeem()`，凭证置为已核销 |
| 「链下实际使用」 | **概念演示** | 提供验证页 + 二维码 + 商户核销端，模拟线下扫码场景 |

统一口径：**「行程与价格为演示数据，链上支付与凭证为 Fuji 测试网真实交易」**。前端在行程卡、报价单、凭证卡上均带 `DEMO` 角标。

---

## 2. 端到端流程

```
① 自然语言需求
      │
      ▼
② Orchestrator Agent（LLM）
   ├─ 解析需求（目的地/日期/人数/预算/偏好）
   ├─ 并行向 3~4 个 Provider Agent 询价（mock 库存）
   ├─ 编排逐日行程 + 报价单 Quote
   └─ SSE 流式吐出「思考过程 → 候选 → 逐日行程 → 预算」
      │
      ▼
③ 用户确认行程（前端展示 Quote + 总金额）
      │
      ▼
④ 钱包签名 ×2（用户唯一需要做的链上操作）
   4a. MockUSDC.approve(TripSettlement, total)
   4b. TripSettlement.createOrder(tripId, itineraryHash, total)
       → tUSDC 从用户转入结算合约，状态 Funded
      │
      ▼
⑤ Orchestrator Agent（后端私钥，代付 gas）
   TripSettlement.settle(orderId, provider, amount) × N
       → tUSDC 分笔转给 FlightAgent / HotelAgent / AttractionAgent / DiningAgent
       → 每笔发出 ProviderPaid(orderId, provider, amount, lineItemId)
      │
      ▼
⑥ 各 Provider Agent 监听到自己收款
   TravelVoucher.issueVoucher(user, category, voucherCode, metadataHash, expiresAt)
       → 用**自己的私钥** mint 一张 ERC-721 凭证给用户
       → VoucherIssued(tokenId, provider, user, category)
      │
      ▼
⑦ 前端「我的凭证」实时出现机票 / 酒店 / 门票卡片
      │
      ▼
⑧ 链下核销演示：出示二维码 → 商户核销端扫码 → 验证页读链 → provider 签 redeem()
```

用户签名次数：**2 次**。第 ⑤⑥ 步的 gas 与签名由后端 Agent 私钥承担（Fuji 测试网，可解释清楚）。

---

## 3. Agent 拓扑

| Agent | 角色 | 链上身份 | 职责 |
| --- | --- | --- | --- |
| **Orchestrator（旅行总管）** | 用户面对的 AI | 有地址（结算操作者） | 需求解析、行程编排、发起分账 |
| **FlightAgent** | 服务商 Agent | 独立地址 + 私钥 | 提供航班库存、收款后发行机票凭证 |
| **HotelAgent** | 服务商 Agent | 独立地址 + 私钥 | 提供酒店库存、收款后发行住宿凭证 |
| **AttractionAgent** | 服务商 Agent | 独立地址 + 私钥 | 景点/门票、收款后发行门票凭证 |
| **DiningAgent**（可选/并入 Attraction） | 服务商 Agent | 独立地址 + 私钥 | 餐厅预订凭证 |

- 所有 Provider Agent 在 `AgentRegistry` 注册（`address → name / category / endpoint / active`）。
- 演示时它们跑在**同一个后端进程**里（模块隔离 + 各自私钥），但对外表现为独立 Agent；每个都有独立的链上地址、独立收款、独立发券。
- 「Agent 给 Agent 付款」的叙事成立：Orchestrator 收到用户资金后，自主决策向哪些 Provider 分账、分多少。

---

## 4. 系统架构与目录

```
AvaTripAgent-DEV/
├── contract/ava_trip_agent/          # Foundry，部署到 Fuji
│   ├── src/
│   │   ├── MockUSDC.sol              # 测试代币 tUSDC（沿用参考实现）
│   │   ├── AgentRegistry.sol         # 服务商 Agent 注册表
│   │   ├── TripSettlement.sol        # 订单托管 + 分账
│   │   └── TravelVoucher.sol         # ERC-721 凭证
│   ├── script/Deploy.s.sol
│   └── test/
├── backend/                          # Hono + Node 20 + TS，:3001
│   ├── src/
│   │   ├── index.ts                  # HTTP 入口
│   │   ├── sse.ts                    # SSE 运行时（runId → stream）
│   │   ├── orchestrator/             # 总管 Agent
│   │   │   ├── planner.ts            # 需求解析 → 骨架 → 逐日
│   │   │   └── prompts.ts
│   │   ├── agents/                   # 各服务商 Agent
│   │   │   ├── flight-agent.ts
│   │   │   ├── hotel-agent.ts
│   │   │   ├── attraction-agent.ts
│   │   │   └── base.ts              # 私钥 + viem walletClient + 发券
│   │   ├── mock/                     # 库存与价格生成
│   │   │   ├── catalog.ts            # 城市/航司/酒店/景点种子数据
│   │   │   ├── inventory.ts          # 询价接口
│   │   │   └── seeded-random.ts      # 同一 tripId 结果稳定
│   │   ├── chain/
│   │   │   ├── clients.ts            # viem publicClient / walletClients
│   │   │   ├── settlement.ts         # 监听订单 → 分账
│   │   │   └── voucher.ts            # 发券 / 核销辅助
│   │   └── types.ts
│   └── .env.example
├── frontend/                         # Next.js 16 + React 19，:3000
│   ├── app/
│   │   ├── page.tsx                  # 需求输入 + 流式行程工作台
│   │   ├── vouchers/page.tsx         # 我的凭证
│   │   ├── verify/[tokenId]/page.tsx # 凭证验证页（扫码落地页）
│   │   └── merchant/page.tsx         # 商户核销端（演示）
│   ├── components/
│   │   ├── agent-stream.tsx          # SSE 渲染：思考/工具/候选/逐日
│   │   ├── quote-panel.tsx           # 报价单 + 支付按钮
│   │   ├── settlement-timeline.tsx   # 分账进度（每笔交易 + Explorer 链接）
│   │   ├── voucher-card.tsx          # 机票/酒店/门票卡片 + 二维码
│   │   └── providers.tsx             # wagmi + Fuji
│   └── lib/
│       ├── contracts.ts              # 地址 + ABI（从部署产物同步）
│       ├── sse-client.ts             # fetch + ReadableStream 解析 SSE
│       └── types.ts
└── deployments/fuji.json             # 部署产物（地址快照）
```

---

## 5. 链上设计

### 5.1 合约清单

| 合约 | 职责 | 关键点 |
| --- | --- | --- |
| `MockUSDC` | 测试稳定币 tUSDC，6 位小数 | `faucet()` 每次 10,000；可重复调用 |
| `AgentRegistry` | 服务商 Agent 注册 | 仅 owner 可注册；`isActiveAgent(address)` 供结算合约校验 |
| `TripSettlement` | 订单托管 + 原子分账 | 用户付款 → Agent 分账给多个 Provider |
| `TravelVoucher` | ERC-721 凭证 | 仅已注册 Agent 可 mint；仅发行者可 redeem |

### 5.2 MockUSDC

直接沿用 `AvaTrip-DEV/contract/ava_trip/src/MockUSDC.sol`（6 decimals、`faucet()`、`approve/transfer/transferFrom`），不改。

### 5.3 AgentRegistry

```solidity
enum AgentCategory { Flight, Hotel, Attraction, Dining }

struct AgentInfo {
    string name;            // "AvaFlights Agent"
    AgentCategory category;
    string endpoint;        // agent 服务地址（演示用）
    bool active;
}

function registerAgent(address agent, string name, AgentCategory category, string endpoint) external;
function setActive(address agent, bool active) external;
function getAgent(address agent) external view returns (AgentInfo);
function isActiveAgent(address agent) external view returns (bool);
```

### 5.4 TripSettlement

```solidity
enum OrderStatus { None, Funded, Settled, Cancelled }

struct LineItem {
    address provider;      // 必须是已注册 Agent
    uint256 amount;        // 6 位小数 tUSDC
    uint8 category;        // 0 机票 1 酒店 2 门票 3 餐饮
    bytes32 itemHash;      // 报价明细 hash（航班号/酒店名/日期…）
}

struct Order {
    address traveler;
    uint256 total;
    uint256 settled;        // 已分账金额
    bytes32 itineraryHash;  // 整份行程 JSON 的 hash
    OrderStatus status;
}

function createOrder(uint256 tripId, bytes32 itineraryHash, LineItem[] calldata items)
    external returns (uint256 orderId);   // transferFrom(traveler → this, total)

function settle(uint256 orderId, uint256[] calldata itemIndexes) external; // 仅 operator（Orchestrator）
function cancel(uint256 orderId) external;                                 // 未分账时可退给 traveler

event OrderCreated(uint256 indexed orderId, address indexed traveler, uint256 total, bytes32 itineraryHash);
event ProviderPaid(uint256 indexed orderId, uint256 indexed itemIndex, address indexed provider, uint256 amount);
event OrderSettled(uint256 indexed orderId, uint256 total);
```

要点：
- `createOrder` 校验 `sum(items.amount) == total`，且每个 `provider` 都 `isActiveAgent`。
- `settle` 由 Orchestrator 地址调用；演示里分 1~N 次调用（每次一项），**每笔都是一笔独立可查的 Fuji 交易**——这正是演示的亮点。
- 保留 `cancel`：发券前用户可退款，演示「托管安全」故事。

### 5.5 TravelVoucher（ERC-721）

```solidity
enum VoucherStatus { Issued, Redeemed, Voided }

struct Voucher {
    uint256 orderId;
    address provider;     // 发行者（服务商 Agent）
    address holder;       // 持有者（用户）
    uint8 category;       // 机票/酒店/门票/餐饮
    string code;          // "PNR 7KQ2ZP" / "Confirmation HX-88213"
    string title;         // "NH959 上海浦东 → 东京羽田"
    bytes32 metadataHash; // 明细 JSON 的 hash（明细本体后端存，二维码可带）
    uint64 validFrom;
    uint64 validTo;
    VoucherStatus status;
}

function issueVoucher(address holder, uint256 orderId, uint8 category,
                      string code, string title, bytes32 metadataHash,
                      uint64 validFrom, uint64 validTo) external returns (uint256 tokenId);

function redeem(uint256 tokenId) external;   // 仅 provider
function void(uint256 tokenId) external;     // 仅 provider（退票/作废）

event VoucherIssued(uint256 indexed tokenId, address indexed provider, address indexed holder, uint8 category, string code);
event VoucherRedeemed(uint256 indexed tokenId, address indexed provider);
```

- 实现：OpenZeppelin 5.x ERC721（`forge install OpenZeppelin/openzeppelin-contracts`）；若要零外部依赖，可手写最小 ERC-721（~120 行），演示足够。
- `tokenURI` 指向后端 `GET /api/vouchers/:tokenId/metadata`（返回 ERC-721 metadata JSON + 明细），让凭证在钱包/Explorer 里也"看得见"。

### 5.6 谁签名 / 谁付 gas

| 步骤 | 签名者 | gas |
| --- | --- | --- |
| `faucet` | 用户 | 用户 |
| `approve` | 用户 | 用户 |
| `createOrder` | 用户 | 用户 |
| `settle` × N | Orchestrator 私钥 | Orchestrator（需 Fuji AVAX） |
| `issueVoucher` × N | 各 Provider 私钥 | 各 Provider（需 Fuji AVAX） |
| `redeem` | Provider 私钥（商户端演示） | Provider |

部署/演示前给 5 个 Agent 地址各转少量 Fuji AVAX（水龙头一次 2 AVAX 足够）。

### 5.7 触发方式

- 前端 `createOrder` 成功后把 `txHash` 回传后端 `POST /api/orders/:orderId/settle`。
- 后端确认 receipt → 逐项 `settle()` → **用 receipt 中的 `ProviderPaid` 事件驱动**对应 Provider Agent 立刻 `issueVoucher()`（进程内同步，最快最稳）。
- 进度通过**第二条 SSE 流**（结算流）实时推给前端：每笔交易 hash + Explorer 链接 + 凭证 mint 结果。
- 生产化可替换为 `watchContractEvent` 长连接监听；演示用 receipt 驱动，避免 RPC WebSocket 不稳定。

---

## 6. Agent 与流式输出（SSE）

### 6.1 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/runs` | 创建规划 run，返回 `{ runId }`（body = 需求原文或结构化参数） |
| `GET` | `/api/runs/:runId/stream` | **SSE**，规划流（EventSource） |
| `GET` | `/api/quotes/:runId` | 规划完成后的报价单 Quote |
| `POST` | `/api/orders` | 用户链上 `createOrder` 后登记 |
| `GET` | `/api/orders/:orderId/stream` | **SSE**，结算 + 发券流 |
| `GET` | `/api/vouchers?address=0x…` | 用户凭证列表（含状态） |
| `GET` | `/api/vouchers/:tokenId` | 凭证明细（验证页用） |
| `GET` | `/api/vouchers/:tokenId/metadata` | ERC-721 metadata |

前端 SSE 客户端：`fetch` + `ReadableStream` 逐块解析 `data:` 帧（比 `EventSource` 更好控制重连与 POST）。

### 6.2 规划流事件协议

```ts
type StreamEvent =
  | { type: "run.start";     runId: string; request: TripRequest }
  | { type: "agent.status";  phase: Phase; label: string }            // 理解需求/询价/编排/预算
  | { type: "agent.delta";   text: string }                           // 思考过程，逐 token
  | { type: "tool.call";     name: "search_flights" | … ; args: unknown }
  | { type: "tool.result";   name: string; data: unknown; ms: number }
  | { type: "offer.flight";  items: FlightOffer[] }
  | { type: "offer.hotel";   items: HotelOffer[] }
  | { type: "offer.attraction"; items: AttractionOffer[] }
  | { type: "day.start";     index: number; date: string; theme: string }
  | { type: "day.delta";     index: number; text: string }             // 当天行程流式
  | { type: "day.done";      index: number; day: ItineraryDay }
  | { type: "budget.update"; total: number; items: BudgetItem[] }
  | { type: "quote.ready";   quote: Quote }
  | { type: "run.error";     code: string; message: string }
  | { type: "run.done" };

type Phase = "understanding" | "sourcing" | "planning" | "budgeting" | "done";
```

前端把 `agent.delta` 渲染成「Agent 思考中」打字机，把 `tool.call/result` 渲染成可折叠的工具调用卡（**这是演示最抓眼球的部分**：能看到 Agent 在查航班、查酒店）。

### 6.3 规划编排（沿用参考项目已验证的两段式）

1. **理解阶段**：LLM 从自然语言中抽取结构化 `TripRequest`（Zod schema 强校验），缺失项在 SSE 里向用户追问或直接取默认值（演示模式不追问，直接取默认）。
2. **询价阶段**：并行调用 mock 工具 `search_flights / search_hotels / search_attractions`，拿到候选后 **压缩** 成编号清单。
3. **骨架阶段**：LLM 只输出「每天用哪几个编号 + 大交通 + 主题 + tips」，输出量小、速度快。
4. **逐日展开**：每天一次调用，**并发 4 路**，流式回传；价格、路线、预算由代码确定性回填（不交给模型算数）。
5. **报价单**：代码按 lineItem 汇总成 `Quote`（每项绑定一个 Provider Agent 地址与金额），`itineraryHash = keccak(规范化 JSON)` 上链。

> 教训（来自 `AvaTrip-DEV`）：别让模型做算术和地理计算，别让它一次吐完整份行程——拆骨架 + 逐日并行能把首字延迟从 100s 降到 20s 级，且失败可降级为占位安排。

### 6.4 Agent 工具（全部 mock）

```
search_flights(origin, destination, date, pax)        → FlightOffer[]
search_hotels(destination, checkIn, checkOut, rooms)  → HotelOffer[]
search_attractions(destination, styles[])             → AttractionOffer[]
search_restaurants(destination, area, styles[])       → DiningOffer[]
quote_total(lineItems[])                              → Quote
```

每个工具都带 **80~400ms 的人为延迟**，让流式过程有"节奏感"（演示效果关键）。

---

## 7. Mock 数据设计（"看起来真实"）

### 7.1 城市目录（先做 3 个，够演示）

`东京 / 新加坡 / 曼谷`（每个城市预置：机场 2 个、酒店 8~10 家、景点 12~15 个、餐厅 12~15 家、街区/交通方式）。

### 7.2 生成器

```ts
const rng = mulberry32(hashCode(tripId));   // 同一行程 → 同一批价格，刷新不变
```

- 价格 = 基准价 × 档位系数(经济 0.7 / 舒适 1.0 / 奢华 1.8) × 人数/间数 × (1 ± 8% 抖动)
- 航班时刻随航班号稳定生成；时长按城市对查表
- 预算状态自动判定：≤ 预算 90% → 舒适有余；90~100% → 符合；> 100% → 超出（前端给黄色提示）

### 7.3 数据形态

```ts
type FlightOffer = {
  id: string; carrier: "NH"; flightNo: "NH959";
  aircraft: "Boeing 787-8";
  from: { city: "上海"; airport: "浦东国际机场"; terminal: "T2"; code: "PVG" };
  to:   { city: "东京"; airport: "羽田机场";     terminal: "T3"; code: "HND" };
  departAt: "2026-10-01 09:25"; arriveAt: "2026-10-01 13:40";
  durationMinutes: 195; cabin: "经济舱"; seatsLeft: 7;
  pricePerPerson: 2380; currency: "USD"; provider: "0xFlight…";
};

type HotelOffer = {
  id: string; name: "新宿格拉斯丽酒店"; stars: 4;
  area: "新宿"; address: "东京都新宿区歌舞伎町1-19-1";
  checkIn: "2026-10-01 15:00"; checkOut: "2026-10-05 11:00";
  roomType: "高级双床房 28㎡"; rooms: 1; nights: 4;
  pricePerNight: 168; total: 672; provider: "0xHotel…";
};

type AttractionOffer = {
  id: string; name: "teamLab Planets TOKYO"; area: "台场";
  durationMinutes: 120; openHours: "10:00-19:00"; needBooking: true;
  pricePerPerson: 32; provider: "0xAttraction…";
};
```

### 7.4 真实感 checklist

- ✅ 用**真实存在**的机场三字码、航司二字码、酒店名、景点名（增强可信度）
- ✅ 合理的地理分区与通勤时间（同区步行 10 min，跨区地铁 25 min）
- ✅ 航班号/酒店确认号/门票号格式逼真（`PNR 7KQ2ZP`、`CONF HX-88213`）
- ✅ 三餐时间窗、景点开放时间、首末日按航班时刻倒推
- ⚠️ 页面固定展示：`演示数据 · 非真实可预订库存`
- 🚫 不做：实时汇率、实时天气 API、真实支付网关（概念演示，保持零外部依赖，现场网络再差也能跑）

---

## 8. 凭证与链下核销

### 8.1 凭证内容（ERC-721 + 后端明细）

- **链上**：`tokenId / provider / holder / category / code / metadataHash / validFrom-validTo / status`
- **链下明细**（后端 + `tokenURI`）：航段、座位、航站楼、酒店地址、入住/退房、房型、门票场次、须知、二维码内容
- 四类卡面：**机票（登机牌）/ 酒店（入住凭证）/ 门票 / 餐厅预订**

### 8.2 我的凭证页

- 卡片按类型分组，显示状态徽章（`有效` / `已核销` / `已作废`）
- 每张卡一个二维码（内容 = `https://<host>/verify/{tokenId}`）
- 点击跳转 Explorer（`subnets-test.avax.network/c-chain/token/{合约地址}`）。
  注意：官方 Explorer **没有单个 NFT 实例的路由**，`/token/{合约}/instance/{tokenId}` 会 404（旧 Snowtrace 格式），
  所以只能落到合约级 Token Details 页，再在页内 Transfers 表按 `TOKEN ID` 定位

### 8.3 验证页 `/verify/[tokenId]`

任何人扫码可见（**不需要连接钱包**）：
- 凭证是否有效（链上 `ownerOf` + `status == Issued` + 未过期）
- 发行者 = 哪个服务商 Agent（从 `AgentRegistry` 读名称）
- 持有者地址（脱敏）
- 只展示必要信息，不暴露完整个人隐私字段

### 8.4 商户核销端 `/merchant`

- 演示用：选择以哪个 Provider Agent 身份操作 → 输入 tokenId → `redeem(tokenId)` → 凭证实时变灰、状态 `已核销`
- 这一步就是「**用户持凭证在链下实际使用**」的具象化：出示二维码 → 商家扫码验证 → 链上标记已核销 → 不可重复使用

---

## 9. 前端交互（页面与关键状态）

主页面（单页工作台，三栏）：

1. **左栏 需求输入**：自然语言一句话输入框 + 解析出的结构化参数卡（可编辑）+ 「开始规划」
2. **中栏 Agent 流**：思考打字机 → 工具调用卡（查航班/查酒店/查景点）→ 候选卡片 → 逐日行程逐条浮现 → 预算条
3. **右栏 报价与结算**：
   - Quote 明细（每项：服务商 Agent 名 + 金额 + 类别）
   - 按钮链：`连接钱包 → 领取 tUSDC → 授权 → 确认支付`（缺哪步走哪步）
   - 结算时间线：每笔 `settle` 交易 hash + Explorer 链接 + 「FlightAgent 已收款 → 机票凭证已签发」

支付完成后自动跳到「我的凭证」。

---

## 10. 技术栈

| 层 | 选型 | 备注 |
| --- | --- | --- |
| 合约 | Solidity 0.8.30 + Foundry | `foundry.toml` 配 `fuji = https://api.avax-test.network/ext/bc/C/rpc` |
| ERC-721 | OpenZeppelin 5.x（或最小手写） | 演示环境优先稳定性 |
| 后端 | Hono + Node 20 + TS + zod | 参考 `AvaTrip-DEV` 后端 |
| LLM | OpenAI 兼容 `/v1`（ChatOpenAI，temperature 0.2） | 复用参考项目的容错解析（Markdown 围栏 / 截断修复） |
| 链交互（服务端） | viem `publicClient` + `walletClient`（各 Agent 私钥） | 后端不存用户私钥 |
| 前端 | Next.js 16 + React 19 + Tailwind v4 | 已有脚手架 |
| 钱包 | wagmi + viem，`avalancheFuji` chain | **需新增依赖** |
| 二维码 | `qrcode` / `react-qr-code` | 轻量 |

---

## 11. 里程碑（Build Day 时间盒）

| 阶段 | 内容 | 产出 |
| --- | --- | --- |
| **P0 骨架（~2h）** | Foundry 工程 + 前端壳 + Hono 后端 + 健康检查 | 三端跑通 |
| **P1 Mock + 流式（~3h）** | 城市 catalog、询价工具、Orchestrator 编排、SSE 全链路 | "一句话 → 流式行程 + 报价单" |
| **P2 合约 + 支付（~3h）** | 4 个合约 + 部署 Fuji + 钱包授权/支付/分账 + 结算 SSE | 用户签 2 次，钱分给 4 个 Agent（Explorer 可查） |
| **P3 凭证 + 核销（~2h）** | ERC-721 发券、我的凭证页、二维码验证页、商户核销端 | 完整闭环 |
| **P4 打磨（~2h）** | 演示脚本、动画、降级兜底、离线兜底数据、README | 现场稳 |

**P0~P3 是必须项，P4 视时间取舍。** 兜底：提前录一份「离线 demo 行程 JSON」，模型/网络出问题时一键播放预置流。

### MVP 之外（stretch，时间允许再做）
- 行程修改（多轮对话 revise）
- 退款/取消：`cancel(orderId)` + 凭证 `void`
- 凭证转让（ERC-721 transfer → 机票改签/转赠叙事）
- Agent 身份升级为链上可发现（Avalanche agentic 叙事，ERC-8004 风格）
- 分账记录写入行程 hash，做「可审计的消费凭证」

---

## 12. 五分钟演示脚本

1. **（30s）** 输入「上海去东京 5 天、两人、预算 8000、想吃好、少走路」→ 展示 Agent 思考流 + 工具调用（查航班/酒店/景点）+ 逐日行程浮现
2. **（60s）** 展示报价单：机票 4760 / 酒店 672 / 门票 320 / 餐饮 890 —— 每项对应一个服务商 Agent
3. **（90s）** 连接钱包 → 领 tUSDC → 授权 → 确认支付（一次签名，Fuji 1~2 秒确认）
4. **（90s）** 结算时间线动画：4 笔 `settle` 交易依次上链，每笔带 Explorer 链接；紧接 4 张凭证 NFT mint 完成
5. **（60s）** 「我的凭证」页：登机牌 / 酒店凭证 / 门票卡片 + 二维码 → 扫码打开验证页（无需钱包）→ 商户端点「核销」→ 凭证变已核销
6. **（30s）** 收尾：全部资金流与凭证状态在 Avalanche Explorer 上可查；强调「演示数据 + 测试网真交易」

---

## 13. 风险与边界

| 风险 | 应对 |
| --- | --- |
| 模型输出 JSON 不稳定 / 超时 | 骨架 + 逐日并行；截断修复；单日失败降级为占位安排（参考项目已验证） |
| Fuji RPC 抖动 | 结算用 receipt 驱动而非 WS 监听；UI 显示 tx hash 允许手工刷新 |
| Agent 私钥缺 AVAX gas | 部署脚本一并给 5 个 Agent 地址转 AVAX，并在启动自检 `/health` 里报告各地址余额 |
| 用户钱包与 Provider 地址相同 | `createOrder` 校验 `provider != traveler`；前端提示 |
| 现场网络差 | 离线兜底：预录 demo 行程 + 预置凭证截图流程 |
| 被误解为"真实可预订" | 全站 DEMO 角标 + 报价单固定免责说明 |

---

## 14. 待定项（需要拍板）

1. **凭证用 ERC-721 还是 SBT（不可转让）？** 建议 ERC-721（可转让 = 转赠/改签叙事更强，演示更灵活）。 —— 回答：可转让
2. **分账是一笔原子交易还是 N 笔？** 建议 **N 笔**（视觉效果好、叙事清楚），gas 由后端承担。 —— 回答：N 笔
3. **`settle` 由后端自动触发还是用户点确认？** 建议支付后自动触发（少一次签名），UI 用时间线展示进度。 —— 回答：自动触发
4. **是否接真实天气/汇率 API？** 建议**不接**（保持零外部依赖，现场稳定）。 —— 回答：不接
5. **tokenURI 用后端 HTTP 还是纯 on-chain？** 建议后端 HTTP（快、可改），链上只存 `metadataHash`。 —— 回答：后端 HTTP
