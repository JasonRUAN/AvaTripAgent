import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { deployment, env, hasChain, hasLLM } from "../shared/env";
import { walletBalance } from "../shared/clients";
import { getOrderChannel, getRunChannel, touch } from "../shared/sse";
import { listVouchersByHolder, orders, quotes, runs } from "../shared/store";
import { generateTripSummary, type TripSummaryVoucherInput } from "../shared/trip-summary";
import type { Quote, SettlementEvent, StreamEvent, TripRequest } from "../shared/types";
import { runPlan } from "./planner";
import { listAgentProfiles, listReviews } from "./registry";
import { settleOrder } from "./settlement";
import { ensureVoucher, redeemViaProvider } from "./voucher";

const app = new Hono();
const ALLOWED_ORIGINS = env.FRONTEND_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  "/api/*",
  cors({
    origin: (origin) => {
      if (ALLOWED_ORIGINS.includes(origin)) return origin;
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
      return ALLOWED_ORIGINS[0] ?? origin;
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
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
    providers?: Partial<Record<"flight" | "hotel" | "attraction" | "dining", `0x${string}`>>;
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

  runs.set(runId, { runId, tripId, request, createdAt: Date.now() });
  const channel = getRunChannel(runId);

  void runPlan({ runId, tripId, request, providers: body?.providers, emit })
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

app.get("/api/vouchers", (c) => {
  const address = c.req.query("address");
  if (!address) return c.json({ vouchers: [] });
  return c.json({ vouchers: listVouchersByHolder(address) });
});

app.get("/api/vouchers/:tokenId", async (c) => {
  const voucher = await ensureVoucher(c.req.param("tokenId"));
  if (!voucher) return c.json({ error: "VOUCHER_NOT_FOUND" }, 404);
  return c.json(voucher);
});

app.post("/api/vouchers/:tokenId/redeem", async (c) => {
  const tokenId = c.req.param("tokenId");
  const detail = await ensureVoucher(tokenId);
  if (!detail) return c.json({ error: "VOUCHER_NOT_FOUND" }, 404);
  try {
    const result = await redeemViaProvider(tokenId, detail.provider);
    return c.json({ tokenId, ...result });
  } catch (error) {
    return c.json(
      { error: "REDEEM_FAILED", message: error instanceof Error ? error.message : "核销失败" },
      500
    );
  }
});

app.get("/api/vouchers/:tokenId/metadata", async (c) => {
  const voucher = await ensureVoucher(c.req.param("tokenId"));
  if (!voucher?.metadata) return c.json({ error: "METADATA_NOT_FOUND" }, 404);
  return c.json(voucher.metadata);
});

app.post("/api/ai/trip-summary", async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | { tripId?: string; vouchers?: unknown }
    | null;
  if (!body?.tripId || !Array.isArray(body.vouchers)) {
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
    return c.json({ error: "INVALID_REQUEST", message: "vouchers 为空" }, 400);
  }
  try {
    const summary = await generateTripSummary(body.tripId, vouchers);
    return c.json({ tripId: body.tripId, ...summary });
  } catch (error) {
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

app.onError((error, c) => {
  console.error("请求处理失败:", c.req.path, error);
  return c.json({ error: "INTERNAL_ERROR", message: "服务暂时不可用" }, 500);
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`AvaTrip Orchestrator → http://localhost:${info.port}`);
  console.log(`  LLM: ${hasLLM ? env.OPENAI_MODEL : "未配置"}`);
  console.log(`  Chain: ${hasChain ? "Fuji" : "模拟"}`);
});
