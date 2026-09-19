# AvaTrip Agent

> 一个基于Avalanche的AI旅行管家Agent：用户说一句话，Agent 流式生成行程与报价单；用户确认行程通过钱包签名完成链上托管付款，Agent 自动向航司 / 酒店 / 门票 / 餐饮等服务商 Agent 分账，各家收到款后把凭证（ERC-721 NFT）发到用户钱包，用户凭二维码在商户端完成链下核销。

**统一口径（全站 DEMO 角标）**：行程与价格为演示数据，非真实可预订库存；钱包授权、支付、分账与凭证签发均为 **Avalanche Fuji 测试网上的真实交易**。

完整产品与技术方案见 [`ideas/ava-trip-agent-design.md`](./ideas/ava-trip-agent-design.md)。

---

## 目录结构

```
AvaTripAgent-DEV/
├── contract/ava_trip_agent/     # Foundry：4 个 Solidity 合约 + 部署脚本 + 测试
├── backend/                     # Hono + Node + TS：SSE 编排、分账、发券
├── frontend/                    # Next.js 16 + React 19 + Tailwind v4
├── deployments/fuji.json        # 部署产物（地址快照）
└── ideas/                       # 设计文档
```

**三端契约**：`backend/src/types.ts` 与 `frontend/lib/types.ts` 字段必须一致（SSE 事件协议）。

---

## 快速开始

### 1. 合约（`contract/ava_trip_agent`）

```bash
cd contract/ava_trip_agent
forge build
forge test            # 18 个测试
```

部署到 Fuji（需要 deployer 私钥与 5 个 Agent 地址）：

```bash
export PRIVATE_KEY=0x...
export ORCHESTRATOR_ADDRESS=0x...
export FLIGHT_AGENT_ADDRESS=0x...
export HOTEL_AGENT_ADDRESS=0x...
export ATTRACTION_AGENT_ADDRESS=0x...
export DINING_AGENT_ADDRESS=0x...
export VOUCHER_BASE_URI=https://<host>/api/vouchers/
export FUND_AGENT_AVAX=0.15      # 可选：给 5 个 Agent 各转 AVAX 作 gas

forge script script/Deploy.s.sol:Deploy --rpc-url fuji --broadcast
```

部署会把地址快照写入 `deployments/fuji.json`，并把 `deployed` 置为 `true`。

### 2. 后端（`backend`）

```bash
cd backend
npm install
cp .env.example .env     # 填入 OPENAI_API_KEY 与各 Agent 私钥
npm run dev              # http://localhost:3001
```

环境变量要点：

| 变量 | 作用 | 缺失时的行为 |
| --- | --- | --- |
| `OPENAI_API_KEY` | 真实 LLM 规划 | 自动走**确定性离线行程**，页面显示「模型降级」 |
| `ORCHESTRATOR_KEY` | 调用 `settle` 分账 | 分账走**模拟**（不发链上交易） |
| `*_AGENT_KEY` | 各服务商 Agent 发券 | 发券走**模拟**（凭证仅在后端生成） |
| `PUBLIC_BASE_URL` | 合约 `tokenURI` 基址 | NFT 在钱包里看不到 metadata |

`/health` 会报告模型与链的配置状态，以及 5 个 Agent 地址的 AVAX 余额。

### 3. 前端（`frontend`）

```bash
cd frontend
npm install
npm run dev              # http://localhost:3000
```

可选 `frontend/.env.local`：

```
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_FUJI_RPC=https://api.avax-test.network/ext/bc/C/rpc
```

---

## 端到端流程

```
① 自然语言需求
   ↓
② Orchestrator：理解 → 并行向 4 家询价 → 骨架 → 逐日并行展开 → 报价单（SSE 流式）
   ↓
③ 钱包签名 ×2：MockUSDC.approve → TripSettlement.createOrder（资金托管，状态 Funded）
   ↓
④ Orchestrator 私钥逐笔 settle ×N → 每笔发出 ProviderPaid（每笔都是可查的 Fuji 交易）
   ↓
⑤ 各 Provider Agent 收到款 → 用自己的私钥 issueVoucher → 凭证 NFT 到用户钱包
   ↓
⑥ 我的凭证（二维码）→ 扫码打开验证页（无需钱包）→ 商户端 redeem → 链上标记已核销
```

用户全程只签 **2 次**，第 ④ ⑤ 步的 gas 由后端 Agent 私钥承担。

---

## 合约一览

| 合约 | 职责 | 关键点 |
| --- | --- | --- |
| `MockUSDC` | 测试稳定币 tUSDC（6 decimals） | `faucet()` 每次 10,000 |
| `AgentRegistry` | 服务商 Agent 注册表 | `isActiveAgent` 供结算与凭证合约校验 |
| `TripSettlement` | 订单托管 + 分账 | 校验明细求和、provider 已注册且非本人；N 笔独立分账 |
| `TravelVoucher` | ERC-721 凭证 | 仅已注册 Agent 可 mint；仅发行者可 `redeem` / `void` |

---

## 前端页面

| 路由 | 说明 |
| --- | --- |
| `/` | 三栏工作台：需求输入 / Agent 流式过程 / 报价与结算 |
| `/vouchers` | 我的凭证（按品类分组 + 二维码 + Explorer） |
| `/verify/[tokenId]` | 扫码验证页，**无需连接钱包** |
| `/merchant` | 商户核销端（演示）：选 Provider 身份 → `redeem` |

## 视觉规范

浅色「晴空旅行簿」主题：蓝白主调、大圆角、柔和长阴影、玻璃质感卡片、轻微悬浮微动效。

- 字体：标题与数字用 **Fredoka**（活泼圆体），正文用 **Nunito**，中文回退「苹方-简 / 圆体-简」
- 主题 token 集中在 `frontend/app/globals.css` 的 `@theme` 块
- 全站尊重 `prefers-reduced-motion`

## 降级策略（现场稳）

| 故障 | 表现 |
| --- | --- |
| LLM 超时 / 输出不合法 | 骨架降级为确定性行程，逐日降级为占位叙述 |
| 后端不可达 | 前端直接播放内置预置流（`lib/demo-fixture.ts`），顶部显示「离线演示流」 |
| 合约未部署 | 支付按钮退化为「演示模式：模拟支付并分账」，凭证仅在后端生成 |
| Fuji RPC 抖动 | 分账用 receipt 驱动（非 WS 监听），UI 展示 tx hash 允许手工核对 |
