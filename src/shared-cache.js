import { ApiError } from "./error.js";

// A cron trigger refreshes from upstream every 6 hours and stores the payload in
// the budget Durable Object. Requests only read: memory, then the edge cache of
// their data center, then the Durable Object. They never call upstream.
export const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
// The cron runs every 15 minutes, so a refresh is due a little before the mark.
const REFRESH_SLACK_MS = 5 * 60 * 1000;
// Copies stay valid until the next refresh has landed.
const SERVE_TTL_MS = REFRESH_INTERVAL_MS + 30 * 60 * 1000;
// When only stale data exists, ask the Durable Object again after this long.
const STALE_RECHECK_MS = 5 * 60 * 1000;
// The free tier allows 100 requests per 24 hours, shared by the model list and media.
export const DAILY_UPSTREAM_LIMIT = 80;
const MIN_UPSTREAM_REQUEST_INTERVAL_MS = 3_000;
const CLIENT_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=120";
const EDGE_CACHE_CONTROL = "public, max-age=31536000";
const UPSTREAM_BUDGET_OBJECT = "artificial-analysis-api";

function getBudgetStub(env) {
  return env.UPSTREAM_BUDGET.getByName(UPSTREAM_BUDGET_OBJECT);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Keeps at least MIN_UPSTREAM_REQUEST_INTERVAL_MS between upstream requests.
export async function paceUpstreamRequest(env) {
  const upstreamWindow = await getBudgetStub(env).scheduleUpstreamRequest({
    now: Date.now(),
    minIntervalMs: MIN_UPSTREAM_REQUEST_INTERVAL_MS,
  });

  if (upstreamWindow.waitMs > 0) {
    await sleep(upstreamWindow.waitMs);
  }
}

function createClientResponse(payload, cacheInfo) {
  return Response.json(
    {
      ...payload,
      cache: cacheInfo,
    },
    {
      headers: {
        "Cache-Control": CLIENT_CACHE_CONTROL,
      },
    },
  );
}

export function createSharedCache({ key, label }) {
  let memoryCache = {
    data: null,
    expiresAt: 0,
  };

  function getCacheKey(request) {
    return new Request(new URL(`/__cache/${key}`, request.url).toString(), {
      method: "GET",
    });
  }

  async function readEdgeCache(request) {
    const cachedResponse = await caches.default.match(getCacheKey(request));

    if (!cachedResponse) {
      return null;
    }

    const expiresAt = Date.parse(cachedResponse.headers.get("x-aa-cache-expires-at") || "");

    return {
      payload: await cachedResponse.json(),
      expiresAt: Number.isNaN(expiresAt) ? 0 : expiresAt,
    };
  }

  function persistEdgeCache(request, payload, expiresAt, ctx) {
    const response = new Response(JSON.stringify(payload), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": EDGE_CACHE_CONTROL,
        "x-aa-cache-expires-at": new Date(expiresAt).toISOString(),
      },
    });

    ctx.waitUntil(caches.default.put(getCacheKey(request), response));
  }

  async function respond(request, env, ctx) {
    const now = Date.now();

    if (memoryCache.data && memoryCache.expiresAt > now) {
      return createClientResponse(memoryCache.data, {
        hit: true,
        layer: "memory",
        persistent: false,
        expiresAt: new Date(memoryCache.expiresAt).toISOString(),
      });
    }

    const edgeEntry = await readEdgeCache(request);
    if (edgeEntry && edgeEntry.expiresAt > now) {
      memoryCache = { data: edgeEntry.payload, expiresAt: edgeEntry.expiresAt };

      return createClientResponse(edgeEntry.payload, {
        hit: true,
        layer: "edge",
        persistent: true,
        expiresAt: new Date(edgeEntry.expiresAt).toISOString(),
      });
    }

    const shared = await getBudgetStub(env).getSharedPayload({ cacheKey: key });
    if (shared && shared.expiresAt > now) {
      memoryCache = { data: shared.payload, expiresAt: shared.expiresAt };
      persistEdgeCache(request, shared.payload, shared.expiresAt, ctx);

      return createClientResponse(shared.payload, {
        hit: true,
        layer: "shared",
        persistent: true,
        expiresAt: new Date(shared.expiresAt).toISOString(),
      });
    }

    // Nothing fresh anywhere: the scheduled refresh is late or failing.
    const stale = shared
      ? { payload: shared.payload, expiresAt: shared.expiresAt, layer: "stale-shared" }
      : edgeEntry
        ? { payload: edgeEntry.payload, expiresAt: edgeEntry.expiresAt, layer: "stale-edge" }
        : memoryCache.data
          ? { payload: memoryCache.data, expiresAt: memoryCache.expiresAt, layer: "stale-memory" }
          : null;

    if (!stale) {
      throw new ApiError(`${label} data is not available yet`, 503);
    }

    memoryCache = { data: stale.payload, expiresAt: now + STALE_RECHECK_MS };

    return createClientResponse(stale.payload, {
      hit: true,
      layer: stale.layer,
      persistent: stale.layer !== "stale-memory",
      expiresAt: stale.expiresAt ? new Date(stale.expiresAt).toISOString() : null,
    });
  }

  return { respond };
}

// Called by the cron trigger. Refreshes from upstream only when the shared
// payload is due, and stores the result in the Durable Object.
export async function refreshShared(env, { key, cost, fetchPayload }) {
  const stub = getBudgetStub(env);
  const now = Date.now();
  const shared = await stub.getSharedPayload({ cacheKey: key });

  if (shared?.refreshedAt && now < shared.refreshedAt + REFRESH_INTERVAL_MS - REFRESH_SLACK_MS) {
    return { key, refreshed: false, reason: "fresh" };
  }

  if (!env.API_KEY_AA) {
    console.error("Missing required secret API_KEY_AA");
    return { key, refreshed: false, reason: "missing-key" };
  }

  const slot = await stub.acquireRefreshSlot({ now, dailyLimit: DAILY_UPSTREAM_LIMIT, cost });

  if (!slot.allowed) {
    console.warn("Scheduled refresh skipped", { key, reason: slot.reason, usedToday: slot.usedToday });
    return { key, refreshed: false, reason: slot.reason };
  }

  const usage = { requests: 0 };

  try {
    const payload = await fetchPayload(env, usage);
    const refreshedAt = Date.now();

    await stub.finishRefresh({
      token: slot.token,
      now: refreshedAt,
      dailyLimit: DAILY_UPSTREAM_LIMIT,
      usedCost: usage.requests,
      cacheKey: key,
      payload,
      refreshedAt,
      expiresAt: refreshedAt + SERVE_TTL_MS,
    });

    console.log("Scheduled refresh completed", { key, upstreamRequests: usage.requests });
    return { key, refreshed: true, upstreamRequests: usage.requests };
  } catch (error) {
    await stub.finishRefresh({
      token: slot.token,
      now: Date.now(),
      dailyLimit: DAILY_UPSTREAM_LIMIT,
      usedCost: usage.requests,
    });

    console.error("Scheduled refresh failed", {
      key,
      upstreamRequests: usage.requests,
      message: error instanceof Error ? error.message : String(error),
    });
    return { key, refreshed: false, reason: "error" };
  }
}
