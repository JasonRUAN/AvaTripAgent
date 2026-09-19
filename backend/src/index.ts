import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { AGENT_NAMES } from "./agents/addresses";
import { agentBalances } from "./chain/clients";
import { env, hasChain, hasLLM } from "./env";
import { runPlan } from "./orchestrator/planner";
import { getOrderChannel, getRunChannel, touch } from "./sse";
import { orders, quotes, runs, vouchers, listVouchersByHolder } from "./store";
import type { Quote, SettlementEvent, StreamEvent, TripRequest } from "./types";

const app = new Hono();

const ALLOWED_ORIGINS = env.FRONTEND_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  "/api/*",
  cors({
    /**
     * 允许 FRONTEND_ORIGIN（可逗号分隔多个）。
     * 本地开发时前端端口不固定（3000/3010…），因此放行所有 localhost / 127.0.0.1。
     */
    origin: (origin) => {
      if (ALLOWED_ORIGINS.includes(origin)) return origin;
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
      return ALLOWED_ORIGINS[0] ?? origin;
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Cache-Control", "Accept"],
  })
);

// ---------------------------------------------------------------------- 健康检查

app.get("/health", async (c) => {
  const balances = hasChain ? await agentBalances().catch(() => null) : null;

  return c.json({
    ok: true,
    service: "avatrip-agent-backend",
    modelConfigured: hasLLM,
    chainConfigured: hasChain,
    model: env.OPENAI_MODEL,
    baseUrl: env.OPENAI_BASE_URL,
    agents: AGENT_NAMES,
    balances,
  });
});

// ---------------------------------------------------------------------- 规划流

app.post("/api/runs", async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | { request?: Partial<TripRequest>; rawText?: string }
    | null;

  const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const tripId = `trip_${runId.slice(4)}`;

  const request: TripRequest = {
    origin: "上海",
    destination: "东京",
    startDate: "2026-10-01",
    days: 5,
    pax: 2,
    budget: 8000,
    rooms: 1,
    preferences: [],
    rawText: "",
    ...(body?.request ?? {}),
    ...(body?.rawText ? { rawText: body.rawText } : {}),
  };

  runs.set(runId, { runId, tripId, request, createdAt: Date.now() });
  const channel = getRunChannel(runId);

  // 异步执行，SSE 连接随时可以接上来（通道带回放，不会丢已吐出的帧）
  void runPlan({ runId, tripId, request, emit })
    .then((result) => {
      const record = runs.get(runId);
      if (record) {
        record.request = result.request;
        record.quote = result.quote;
      }
      quotes.set(runId, result.quote);
      channel.push({ type: "run.done" } satisfies StreamEvent);
    })
    .catch((error: unknown) => {
      console.error("[runs] 规划失败:", error);
      channel.push({
        type: "run.error",
        code: "PLAN_FAILED",
        message: error instanceof Error ? error.message : "规划失败",
      } satisfies StreamEvent);
    });

  function emit(event: StreamEvent) {
    touch(runId);
    channel.push(event);
  }

  return c.json({ runId, tripId, request });
});

app.get("/api/runs/:runId/stream", async (c) => {
  const runId = c.req.param("runId");
  const channel = getRunChannel(runId);
  touch(runId);

  return drainChannel(c, channel, ["run.done", "run.error"]);
});

app.get("/api/quotes/:runId", (c) => {
  const quote = quotes.get(c.req.param("runId"));
  if (!quote) return c.json({ error: "QUOTE_NOT_READY" }, 404);
  return c.json(quote satisfies Quote);
});

// ---------------------------------------------------------------------- 结算流

app.post("/api/orders", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    runId?: string;
    orderId?: string;
    traveler?: `0x${string}`;
    txHash?: `0x${string}`;
    total?: string;
  } | null;

  if (!body?.runId || !body?.orderId) {
    return c.json({ error: "INVALID_REQUEST", message: "缺少 runId / orderId" }, 400);
  }

  const quote = quotes.get(body.runId);
  const run = runs.get(body.runId);

  orders.set(body.orderId, {
    orderId: body.orderId,
    runId: body.runId,
    tripId: run?.tripId ?? "",
    traveler: body.traveler ?? "0x0000000000000000000000000000000000000000",
    total: body.total ?? quote?.total ?? "0",
    createTxHash: body.txHash,
    status: "funded",
    createdAt: Date.now(),
  });

  // 触发分账（receipt 驱动，避免 WS 监听在 Fuji 上抖动）
  const { settleOrder } = await import("./chain/settlement");
  void settleOrder({
    orderId: body.orderId,
    runId: body.runId,
    quote,
    traveler: body.traveler ?? "0x0000000000000000000000000000000000000000",
  }).catch((error: unknown) => {
    console.error("[orders] 分账失败:", error);
    getOrderChannel(body.orderId!).push({
      type: "settlement.error",
      code: "SETTLE_FAILED",
      message: error instanceof Error ? error.message : "分账失败",
    } satisfies SettlementEvent);
  });

  return c.json({ orderId: body.orderId, status: "funded" });
});

app.get("/api/orders/:orderId/stream", async (c) => {
  const orderId = c.req.param("orderId");
  const channel = getOrderChannel(orderId);
  touch(orderId);

  return drainChannel(c, channel, ["settlement.done", "settlement.error"]);
});

// ---------------------------------------------------------------------- 凭证

app.get("/api/vouchers", (c) => {
  const address = c.req.query("address");
  if (!address) return c.json({ vouchers: [] });
  return c.json({ vouchers: listVouchersByHolder(address) });
});

app.get("/api/vouchers/:tokenId", (c) => {
  const voucher = vouchers.get(c.req.param("tokenId"));
  if (!voucher) return c.json({ error: "VOUCHER_NOT_FOUND" }, 404);
  return c.json(voucher);
});

/** 商户核销端：以指定服务商 Agent 的身份调用 redeem */
app.post("/api/vouchers/:tokenId/redeem", async (c) => {
  const tokenId = c.req.param("tokenId");
  const body = (await c.req.json().catch(() => null)) as { provider?: string } | null;
  const which = body?.provider;

  if (which !== "flight" && which !== "hotel" && which !== "attraction" && which !== "dining") {
    return c.json({ error: "INVALID_PROVIDER" }, 400);
  }

  if (!vouchers.has(tokenId)) {
    return c.json({ error: "VOUCHER_NOT_FOUND" }, 404);
  }

  try {
    const { redeemVoucher } = await import("./chain/voucher");
    const result = await redeemVoucher(tokenId, which);
    return c.json({ tokenId, ...result });
  } catch (error) {
    console.error("[redeem] 核销失败:", error);
    return c.json(
      { error: "REDEEM_FAILED", message: error instanceof Error ? error.message : "核销失败" },
      500
    );
  }
});

/** ERC-721 metadata —— 合约 tokenURI 指向这里 */
app.get("/api/vouchers/:tokenId/metadata", (c) => {
  const voucher = vouchers.get(c.req.param("tokenId"));
  if (!voucher?.metadata) return c.json({ error: "METADATA_NOT_FOUND" }, 404);
  return c.json(voucher.metadata);
});

// ---------------------------------------------------------------------- SSE 辅助

/**
 * 把通道里的事件顺序写给客户端。
 *
 * 事件先入队再逐条 await 写出：通道结束时要保证缓冲里的帧全部落盘，
 * 否则「规划已经跑完、前端才连上」的场景会丢掉最后几帧。
 */
function drainChannel(
  c: Parameters<typeof streamSSE>[0],
  channel: { subscribe: (cb: (event: unknown) => void) => () => void; isClosed: boolean },
  terminalTypes: string[]
) {
  return streamSSE(c, async (stream) => {
    const queue: unknown[] = [];
    let finished = false;

    const unsubscribe = channel.subscribe((event) => {
      queue.push(event);
      const type = (event as { type?: string })?.type;
      if (type && terminalTypes.includes(type)) finished = true;
    });

    try {
      while (true) {
        const next = queue.shift();
        if (next !== undefined) {
          await stream.writeSSE({ data: JSON.stringify(next) });
          continue;
        }
        if (finished || channel.isClosed) break;
        await stream.sleep(300);
        await stream.write(": ping\n\n");
      }
    } finally {
      unsubscribe();
    }

    await stream.close();
  });
}

// ---------------------------------------------------------------------- 错误兜底

app.onError((error, c) => {
  console.error("请求处理失败:", c.req.path, error);
  return c.json({ error: "INTERNAL_ERROR", message: "服务暂时不可用" }, 500);
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`AvaTrip Agent backend → http://localhost:${info.port}`);
  console.log(
    `  LLM: ${hasLLM ? `已配置（${env.OPENAI_MODEL} @ ${env.OPENAI_BASE_URL}）` : "未配置，规划将走离线兜底"}`
  );
  console.log(`  Chain: ${hasChain ? "已连接 Fuji" : "未部署，结算将走模拟"}`);
});
