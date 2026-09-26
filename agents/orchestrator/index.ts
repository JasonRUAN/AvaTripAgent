import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { deployment, env, hasChain, hasLLM } from "../shared/env";
import { accessLog, type AppEnv } from "../shared/access-log";
import { createLogger, installProcessGuards, startTimer } from "../shared/logger";
import { walletBalance } from "../shared/clients";
import { getOrderChannel, getRunChannel, pruneChannels, touch } from "../shared/sse";
import { getItinerary, listVouchersByHolder, orders, quotes, runs, saveItinerary } from "../shared/store";
import { generateTripSummary, type TripSummaryVoucherInput } from "../shared/trip-summary";
import type {
  ItineraryDay,
  ProviderSelectionInput,
  Quote,
  RecommendMode,
  SettlementEvent,
  StreamEvent,
  TripRequest,
} from "../shared/types";
import { parseRecommendMode } from "../shared/types";
import { runPlan } from "./planner";
import { listAgentProfiles, listReviews, RegistryError } from "./registry";
import { settleOrder } from "./settlement";
import { ensureVoucher, redeemViaProvider } from "./voucher";

const log = createLogger("orchestrator");
const app = new Hono<AppEnv>();
const ALLOWED_ORIGINS = env.FRONTEND_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use("/api/*", accessLog("orchestrator"));

app.use(
  "/api/*",
  cors({
    origin: (origin) => {
      if (ALLOWED_ORIGINS.includes(origin)) return origin;
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
      return ALLOWED_ORIGINS[0] ?? origin;
    },
    allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Cache-Control", "Accept", "x-internal-token"],
  })
);

app.get("/health", async (c) => {
  const orch = deployment?.orchestrator as `0x${string}` | undefined;
  const balances = orch ? [await walletBalance("orchestrator", orch)] : null;
  return c.json({
    ok: true,
    service: "avatrip-orchestrator",
    modelConfigured: hasLLM,
    chainConfigured: hasChain,
    model: env.OPENAI_MODEL,
    balances,
  });
});

app.get("/api/agents", async (c) => {
  const agents = await listAgentProfiles();
  return c.json({ agents });
});

app.get("/api/agents/:address/reviews", async (c) => {
  const reviews = await listReviews(c.req.param("address") as `0x${string}`);
  return c.json({ reviews });
});

app.post("/api/runs", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    request?: Partial<TripRequest>;
    rawText?: string;
    providers?: ProviderSelectionInput;
    recommendMode?: RecommendMode;
  } | null;

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

  const recommendMode = parseRecommendMode(body?.recommendMode);
  runs.set(runId, { runId, tripId, request, createdAt: Date.now() });
  const channel = getRunChannel(runId);
  const reqLog = log.child({ reqId: c.get("reqId"), runId });

  reqLog.info("受理规划请求", {
    tripId,
    destination: request.destination,
    origin: request.origin,
    days: request.days,
    pax: request.pax,
    budget: request.budget,
    recommendMode,
    rawText: Boolean(request.rawText),
    providers: body?.providers ? Object.keys(body.providers) : "默认",
  });

  const elapsed = startTimer();
  void runPlan({
    runId,
    tripId,
    request,
    providers: body?.providers,
    recommendMode,
    emit,
  })
    .then((result) => {
      const record = runs.get(runId);
      if (record) {
        record.request = result.request;
        record.quote = result.quote;
        record.days = result.days;
        record.selectedOfferIds = result.days.flatMap((day) =>
          day.items.flatMap((item) => (item.offerId ? [item.offerId] : []))
        );
      }
      quotes.set(runId, result.quote);
      channel.push({ type: "run.done" } satisfies StreamEvent);
      reqLog.info("规划完成", {
        ms: elapsed(),
        days: result.days.length,
        totalUsd: result.quote?.totalUsd,
        degraded: result.degraded,
      });
    })
    .catch((error: unknown) => {
      // 服务商注册表类的失败带专属 code：前端按 code 出本地化文案，
      // 统一成 PLAN_FAILED 会让「链上没注册服务商」退化成一句笼统的规划失败
      const registryError = error instanceof RegistryError ? error : null;
      reqLog.error("规划失败", { ms: elapsed(), code: registryError?.code ?? "PLAN_FAILED" }, error);
      channel.push({
        type: "run.error",
        code: registryError?.code ?? "PLAN_FAILED",
        message: error instanceof Error ? error.message : "规划失败",
        details: registryError?.details,
      } satisfies StreamEvent);
    });

  function emit(event: StreamEvent) {
    touch(runId);
    // agent.delta 是打字机分片（每 18ms 一帧），刷屏且无排查价值
    if (event.type !== "agent.delta") reqLog.debug("推送事件", { type: event.type });
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
  const runId = c.req.param("runId");
  const quote = quotes.get(runId);
  if (!quote) {
    log.warn("报价未就绪", { reqId: c.get("reqId"), runId, known: runs.has(runId) });
    return c.json({ error: "QUOTE_NOT_READY" }, 404);
  }
  return c.json(quote satisfies Quote);
});

app.get("/api/runs/:runId", (c) => {
  const runId = c.req.param("runId");
  const run = runs.get(runId);
  if (!run) {
    log.warn("查询不到规划记录", { reqId: c.get("reqId"), runId });
    return c.json({ error: "RUN_NOT_FOUND" }, 404);
  }
  return c.json({
    runId: run.runId,
    tripId: run.tripId,
    request: run.request,
    days: run.days ?? [],
    selectedOfferIds: run.selectedOfferIds ?? [],
    quote: run.quote ?? quotes.get(run.runId),
  });
});

app.patch("/api/runs/:runId/selection", async (c) => {
  const runId = c.req.param("runId");
  const run = runs.get(runId);
  if (!run) {
    log.warn("更新选择失败：规划记录不存在", { reqId: c.get("reqId"), runId });
    return c.json({ error: "RUN_NOT_FOUND" }, 404);
  }

  const body = (await c.req.json().catch(() => null)) as {
    selectedOfferIds?: string[];
    days?: ItineraryDay[];
    quote?: Quote;
  } | null;

  if (!body) {
    log.warn("更新选择失败：请求体不是合法 JSON", { reqId: c.get("reqId"), runId });
    return c.json({ error: "INVALID_REQUEST" }, 400);
  }

  if (Array.isArray(body.selectedOfferIds)) run.selectedOfferIds = body.selectedOfferIds;
  if (Array.isArray(body.days)) run.days = body.days;
  if (body.quote && Array.isArray(body.quote.lineItems)) {
    run.quote = body.quote;
    quotes.set(runId, body.quote);
  }

  return c.json({
    runId,
    selectedOfferIds: run.selectedOfferIds ?? [],
    days: run.days ?? [],
    quote: run.quote ?? quotes.get(runId),
  });
});

app.post("/api/orders", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    runId?: string;
    orderId?: string;
    traveler?: `0x${string}`;
    txHash?: `0x${string}`;
    total?: string;
    quote?: Quote;
    days?: ItineraryDay[];
  } | null;
  if (!body?.runId || !body?.orderId) {
    log.warn("下单请求缺少必要字段", { reqId: c.get("reqId"), hasRunId: Boolean(body?.runId), hasOrderId: Boolean(body?.orderId) });
    return c.json({ error: "INVALID_REQUEST", message: "缺少 runId / orderId" }, 400);
  }
  if (body.quote && Array.isArray(body.quote.lineItems)) {
    quotes.set(body.runId, body.quote);
  }
  const quote = quotes.get(body.runId);
  const run = runs.get(body.runId);
  const orderLog = log.child({ reqId: c.get("reqId"), orderId: body.orderId, runId: body.runId });

  orderLog.info("受理下单", {
    traveler: body.traveler ?? "0x0000000000000000000000000000000000000000",
    total: body.total ?? quote?.total ?? "0",
    lineItems: quote?.lineItems.length ?? 0,
    createTxHash: body.txHash,
    days: body.days?.length ?? run?.days?.length ?? 0,
    quoteReady: Boolean(quote),
  });
  if (!quote) {
    orderLog.warn("下单时报价单缺失，分账将直接报错", { knownRun: Boolean(run) });
  }

  if (body.quote && run) run.quote = body.quote;
  if (Array.isArray(body.days) && run) run.days = body.days;
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
  saveItinerary({
    orderId: body.orderId,
    runId: body.runId,
    days: body.days ?? run?.days ?? [],
    quote,
    request: run?.request,
  });
  void settleOrder({
    orderId: body.orderId,
    runId: body.runId,
    quote,
    traveler: body.traveler ?? "0x0000000000000000000000000000000000000000",
  }).catch((error: unknown) => {
    orderLog.error("分账失败", {}, error);
    getOrderChannel(body.orderId!).push({
      type: "settlement.error",
      code: "SETTLE_FAILED",
      message: error instanceof Error ? error.message : "分账失败",
      details: error instanceof Error ? error.message : undefined,
    } satisfies SettlementEvent);
  });
  return c.json({ orderId: body.orderId, status: "funded" });
});

app.get("/api/orders/:orderId", (c) => {
  const orderId = c.req.param("orderId");
  const order = orders.get(orderId);
  const snapshot = getItinerary(orderId);
  if (!order && !snapshot) {
    log.warn("查询不到订单", { reqId: c.get("reqId"), orderId });
    return c.json({ error: "ORDER_NOT_FOUND" }, 404);
  }
  const run = order ? runs.get(order.runId) : snapshot ? runs.get(snapshot.runId) : undefined;
  return c.json({
    orderId,
    runId: order?.runId ?? snapshot?.runId,
    days: snapshot?.days ?? run?.days ?? [],
    quote: snapshot?.quote ?? run?.quote ?? (order ? quotes.get(order.runId) : undefined),
    request: snapshot?.request ?? run?.request,
  });
});

app.get("/api/orders/:orderId/stream", async (c) => {
  const orderId = c.req.param("orderId");
  const channel = getOrderChannel(orderId);
  touch(orderId);
  return drainChannel(c, channel, ["settlement.done", "settlement.error"]);
});

app.get("/api/vouchers", (c) => {
  const address = c.req.query("address");
  if (!address) return c.json({ vouchers: [] });
  return c.json({ vouchers: listVouchersByHolder(address) });
});

app.get("/api/vouchers/:tokenId", async (c) => {
  const tokenId = c.req.param("tokenId");
  const voucher = await ensureVoucher(tokenId);
  if (!voucher) {
    log.warn("查不到凭证", { reqId: c.get("reqId"), tokenId });
    return c.json({ error: "VOUCHER_NOT_FOUND" }, 404);
  }
  return c.json(voucher);
});

app.post("/api/vouchers/:tokenId/redeem", async (c) => {
  const tokenId = c.req.param("tokenId");
  const reqLog = log.child({ reqId: c.get("reqId"), tokenId });
  const detail = await ensureVoucher(tokenId);
  if (!detail) {
    reqLog.warn("核销失败：查不到凭证");
    return c.json({ error: "VOUCHER_NOT_FOUND" }, 404);
  }
  reqLog.info("发起核销", { provider: detail.provider, status: detail.status });
  try {
    const result = await redeemViaProvider(tokenId, detail.provider);
    reqLog.info("核销成功", { txHash: result.txHash, provider: detail.provider });
    return c.json({ tokenId, ...result });
  } catch (error) {
    reqLog.error("核销失败", { provider: detail.provider }, error);
    return c.json(
      { error: "REDEEM_FAILED", message: error instanceof Error ? error.message : "核销失败" },
      500
    );
  }
});

app.get("/api/vouchers/:tokenId/metadata", async (c) => {
  const tokenId = c.req.param("tokenId");
  const voucher = await ensureVoucher(tokenId);
  if (!voucher?.metadata) {
    log.warn("凭证 metadata 缺失", { reqId: c.get("reqId"), tokenId, found: Boolean(voucher) });
    return c.json({ error: "METADATA_NOT_FOUND" }, 404);
  }
  return c.json(voucher.metadata);
});

app.post("/api/ai/trip-summary", async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | { tripId?: string; vouchers?: unknown }
    | null;
  if (!body?.tripId || !Array.isArray(body.vouchers)) {
    log.warn("行程总结请求参数不合法", {
      reqId: c.get("reqId"),
      hasTripId: Boolean(body?.tripId),
      vouchersIsArray: Array.isArray(body?.vouchers),
    });
    return c.json({ error: "INVALID_REQUEST", message: "缺少 tripId 或 vouchers" }, 400);
  }
  const vouchers = (body.vouchers as unknown[])
    .filter(
      (item): item is TripSummaryVoucherInput =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as TripSummaryVoucherInput).title === "string"
    )
    .map((item) => ({
      title: item.title,
      categoryLabel: typeof item.categoryLabel === "string" ? item.categoryLabel : "其他",
      details:
        typeof item.details === "object" && item.details !== null
          ? (item.details as Record<string, string>)
          : {},
    }));
  if (vouchers.length === 0) {
    log.warn("行程总结请求 vouchers 为空", { reqId: c.get("reqId"), tripId: body.tripId });
    return c.json({ error: "INVALID_REQUEST", message: "vouchers 为空" }, 400);
  }
  const summaryLog = log.child({ reqId: c.get("reqId"), tripId: body.tripId });
  const elapsed = startTimer();
  try {
    const summary = await generateTripSummary(body.tripId, vouchers);
    // source=offline 意味着没走真实模型，演示时一眼可辨
    summaryLog.info("行程总结生成完成", { ms: elapsed(), source: summary.source, vouchers: vouchers.length });
    return c.json({ tripId: body.tripId, ...summary });
  } catch (error) {
    summaryLog.error("行程总结生成失败", { ms: elapsed() }, error);
    return c.json(
      { error: "SUMMARY_FAILED", message: error instanceof Error ? error.message : "行程总结生成失败" },
      500
    );
  }
});

function drainChannel(
  c: Parameters<typeof streamSSE>[0],
  channel: { subscribe: (cb: (event: unknown) => void) => () => void; isClosed: boolean },
  terminalTypes: string[]
) {
  const reqLog = log.child({ reqId: c.get("reqId"), path: c.req.path });
  return streamSSE(c, async (stream) => {
    const queue: unknown[] = [];
    let finished = false;
    let sent = 0;
    const unsubscribe = channel.subscribe((event) => {
      queue.push(event);
      const type = (event as { type?: string })?.type;
      if (type && terminalTypes.includes(type)) finished = true;
    });
    reqLog.info("SSE 连接建立", { terminalTypes });
    try {
      while (true) {
        const next = queue.shift();
        if (next !== undefined) {
          await stream.writeSSE({ data: JSON.stringify(next) });
          sent += 1;
          continue;
        }
        if (finished || channel.isClosed) break;
        await stream.sleep(300);
        await stream.write(": ping\n\n");
      }
    } catch (error) {
      // 客户端刷新/关页面时写流会抛错，属正常断连，但要知道断在哪一帧
      reqLog.warn("SSE 连接中断（客户端可能已断开）", { sent, finished }, error);
    } finally {
      unsubscribe();
      reqLog.info("SSE 连接关闭", { sent, finished, closed: channel.isClosed });
    }
    // 客户端已断开时 close() 也可能抛错，不能让它变成无人认领的 rejection
    await stream.close().catch((error: unknown) => {
      reqLog.debug("SSE 关闭时异常（通常表示客户端已断开）", { sent }, error);
    });
  });
}

app.onError((error, c) => {
  const context = { reqId: c.get("reqId"), method: c.req.method, path: c.req.path };
  if (error instanceof RegistryError) {
    log.error("服务商注册表不可用", { ...context, code: error.code }, error);
    return c.json({ error: error.code, message: error.message, details: error.details }, 503);
  }
  log.error("请求处理失败", context, error);
  return c.json({ error: "INTERNAL_ERROR", message: "服务暂时不可用" }, 500);
});

installProcessGuards("orchestrator");

// 通道只增不减会吃内存：定时回收已结束且超过 TTL 的通道
const CHANNEL_PRUNE_INTERVAL_MS = 10 * 60 * 1000;
setInterval(() => pruneChannels(), CHANNEL_PRUNE_INTERVAL_MS).unref();

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  log.info("AvaTrip Orchestrator 已启动", {
    url: `http://localhost:${info.port}`,
    port: info.port,
    llm: hasLLM ? env.OPENAI_MODEL : "未配置",
    chain: hasChain ? "Fuji" : "模拟",
    chainId: deployment?.chainId,
    settlement: deployment?.tripSettlement,
    orchestrator: deployment?.orchestrator,
    rpc: env.FUJI_RPC,
    providerEndpoints: {
      flight: env.FLIGHT_AGENT_ENDPOINT,
      hotel: env.HOTEL_AGENT_ENDPOINT,
      attraction: env.ATTRACTION_AGENT_ENDPOINT,
      dining: env.DINING_AGENT_ENDPOINT,
    },
    logLevel: process.env.LOG_LEVEL ?? "info",
  });
  if (!hasLLM) log.warn("未配置 OPENAI_API_KEY：需求解析与行程叙述将走确定性兜底");
  if (!hasChain) {
    log.warn("链上能力未启用：分账与发券将使用模拟哈希", {
      hasDeployment: Boolean(deployment?.deployed),
      hasOrchestratorKey: env.ORCHESTRATOR_KEY.length > 0,
    });
  }
});
