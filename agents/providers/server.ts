import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { privateKeyToAccount } from "viem/accounts";
import { KEY_TO_CATEGORY, deployment, env, type AgentKey } from "../shared/env";
import {
  searchAttractions,
  searchFlights,
  searchHotels,
  searchRestaurants,
} from "../shared/inventory";
import type { CategoryCode, TripRequest } from "../shared/types";
import { ensureVoucher, issueVoucher, redeemVoucher } from "./voucher";

function agentAddress(): `0x${string}` {
  if (env.AGENT_KEY) return privateKeyToAccount(env.AGENT_KEY).address;
  return (deployment?.agents?.[env.AGENT_CATEGORY] ??
    "0x0000000000000000000000000000000000000000") as `0x${string}`;
}

function assertInternal(c: { req: { header: (n: string) => string | undefined } }) {
  const token = c.req.header("x-internal-token");
  return token === env.INTERNAL_TOKEN;
}

function supportedKeys(): AgentKey[] {
  return env.AGENT_CATEGORIES.length ? [...env.AGENT_CATEGORIES] : [env.AGENT_CATEGORY];
}

function parseRequestedKey(raw: unknown): AgentKey {
  if (typeof raw === "number" && raw >= 0 && raw <= 3) {
    return (["flight", "hotel", "attraction", "dining"] as const)[raw];
  }
  if (typeof raw === "string") {
    const lower = raw.toLowerCase();
    if (lower === "flight" || lower === "hotel" || lower === "attraction" || lower === "dining") {
      return lower;
    }
  }
  return supportedKeys()[0] ?? env.AGENT_CATEGORY;
}

async function rfq(request: TripRequest, tripId: string, key: AgentKey) {
  const provider = agentAddress();
  if (key === "flight") return searchFlights(request, tripId, provider);
  if (key === "hotel") return searchHotels(request, tripId, provider);
  if (key === "attraction") return searchAttractions(request, tripId, provider);
  return searchRestaurants(request, tripId, provider);
}

const app = new Hono();
app.use("/*", cors());

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: env.AGENT_NAME,
    category: env.AGENT_CATEGORY,
    categories: supportedKeys(),
    address: agentAddress(),
    chain: Boolean(deployment?.deployed && env.AGENT_KEY),
  })
);

app.post("/v1/rfq", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    tripId?: string;
    request?: TripRequest;
    category?: CategoryCode | AgentKey;
  } | null;
  if (!body?.request || !body.tripId) {
    return c.json({ error: "INVALID_REQUEST" }, 400);
  }
  const key = parseRequestedKey(body.category);
  if (!supportedKeys().includes(key)) {
    return c.json({ agentAddress: agentAddress(), category: KEY_TO_CATEGORY[key], items: [], ms: 0 });
  }
  const result = await rfq(body.request, body.tripId, key);
  return c.json({
    agentAddress: agentAddress(),
    category: KEY_TO_CATEGORY[key],
    items: result.items,
    ms: result.ms,
  });
});

app.post("/v1/vouchers/issue", async (c) => {
  if (!assertInternal(c)) return c.json({ error: "UNAUTHORIZED" }, 401);
  const body = (await c.req.json().catch(() => null)) as Parameters<typeof issueVoucher>[0] | null;
  if (!body?.holder || !body.orderId) return c.json({ error: "INVALID_REQUEST" }, 400);
  const issued = await issueVoucher(body);
  return c.json(issued);
});

app.post("/v1/vouchers/redeem", async (c) => {
  if (!assertInternal(c)) return c.json({ error: "UNAUTHORIZED" }, 401);
  const body = (await c.req.json().catch(() => null)) as { tokenId?: string } | null;
  if (!body?.tokenId) return c.json({ error: "INVALID_REQUEST" }, 400);
  try {
    const result = await redeemVoucher(body.tokenId);
    return c.json(result);
  } catch (error) {
    return c.json(
      { error: "REDEEM_FAILED", message: error instanceof Error ? error.message : "核销失败" },
      500
    );
  }
});

app.get("/v1/vouchers/:tokenId", async (c) => {
  const voucher = await ensureVoucher(c.req.param("tokenId"));
  if (!voucher) return c.json({ error: "VOUCHER_NOT_FOUND" }, 404);
  return c.json(voucher);
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(
    `${env.AGENT_NAME} (${supportedKeys().join(",")}) → http://localhost:${info.port}`
  );
});
