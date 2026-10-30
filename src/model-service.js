import { ApiError } from "./error.js";

const UPSTREAM_URL = "https://artificialanalysis.ai/api/v2/language/models/free";
// The free tier allows 100 requests per 24 hours, shared with the media endpoints.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const DAILY_UPSTREAM_LIMIT = 80;
// Each page is one upstream request. The list had 4 pages of 200 models in October 2026.
const MAX_UPSTREAM_PAGES = 6;
const CLIENT_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=120";
const EDGE_CACHE_PATH = "/__cache/models";
const EDGE_CACHE_CONTROL = "public, max-age=31536000";
const UPSTREAM_BUDGET_OBJECT = "artificial-analysis-api";
const INFLIGHT_RETRY_DELAY_MS = 1_000;
const MIN_UPSTREAM_REQUEST_INTERVAL_MS = 3_000;

let memoryCache = {
  data: null,
  expiresAt: 0,
};

let inflightRefresh = null;

function normalizeOptionalMetric(value) {
  return value && value > 0 ? value : null;
}

// The free endpoint has no blended price, so rebuild the 3:1 input:output blend
// Artificial Analysis uses for price_1m_blended_3_to_1.
function blendedPrice(input, output) {
  if (input === null || input === undefined || output === null || output === undefined) {
    return null;
  }

  return Math.round(((3 * input + output) / 4) * 1000) / 1000;
}

function normalizeModel(model) {
  const evaluations = model.evaluations || {};
  const pricing = model.pricing || {};
  const performance = model.performance || {};
  const priceInput = pricing.price_1m_input_tokens ?? null;
  const priceOutput = pricing.price_1m_output_tokens ?? null;

  return {
    id: model.id,
    slug: model.slug,
    name: model.name,
    creatorId: model.model_creator?.id || "",
    creator: model.model_creator?.name || "Unknown",
    releaseDate: model.release_date || null,
    intelligence: evaluations.artificial_analysis_intelligence_index ?? null,
    coding: evaluations.artificial_analysis_coding_index ?? null,
    priceBlended: blendedPrice(priceInput, priceOutput),
    priceInput,
    priceOutput,
    outputSpeed: normalizeOptionalMetric(performance.median_output_tokens_per_second),
    latency: normalizeOptionalMetric(performance.median_time_to_first_token_seconds),
    firstAnswerToken: normalizeOptionalMetric(performance.median_time_to_first_answer_token_seconds),
    detailsUrl: model.slug
      ? `https://artificialanalysis.ai/models/${model.slug}`
      : null,
  };
}

function createClientResponse(corePayload, cacheInfo, init = {}) {
  return Response.json(
    {
      ...corePayload,
      cache: cacheInfo,
    },
    {
      status: init.status ?? 200,
      headers: {
        "Cache-Control": CLIENT_CACHE_CONTROL,
        ...init.headers,
      },
    },
  );
}

function staleMemoryEntry() {
  if (!memoryCache.data) {
    return null;
  }

  return {
    payload: memoryCache.data,
    expiresAt: memoryCache.expiresAt || null,
  };
}

function getCacheKey(request) {
  return new Request(new URL(EDGE_CACHE_PATH, request.url).toString(), {
    method: "GET",
  });
}

async function readEdgeCache(request) {
  const cachedResponse = await caches.default.match(getCacheKey(request));

  if (!cachedResponse) {
    return null;
  }

  const expiresAt = cachedResponse.headers.get("x-aa-cache-expires-at");
  const parsedExpiresAt = expiresAt ? Date.parse(expiresAt) : NaN;
  const payload = await cachedResponse.json();

  return {
    payload,
    expiresAt: Number.isNaN(parsedExpiresAt) ? null : parsedExpiresAt,
  };
}

function persistEdgeCache(request, payload, expiresAtIso, ctx) {
  const response = new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": EDGE_CACHE_CONTROL,
      "x-aa-cache-expires-at": expiresAtIso,
    },
  });

  ctx.waitUntil(caches.default.put(getCacheKey(request), response));
}

function createStaleResponse(payload, expiresAt, layer, persistent) {
  return createClientResponse(payload, {
    hit: true,
    layer,
    persistent,
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
  });
}

function getBudgetStub(env) {
  return env.UPSTREAM_BUDGET.getByName(UPSTREAM_BUDGET_OBJECT);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchUpstreamPage(env, page) {
  const upstreamWindow = await getBudgetStub(env).scheduleUpstreamRequest({
    now: Date.now(),
    minIntervalMs: MIN_UPSTREAM_REQUEST_INTERVAL_MS,
  });

  if (upstreamWindow.waitMs > 0) {
    await sleep(upstreamWindow.waitMs);
  }

  const url = new URL(UPSTREAM_URL);
  url.searchParams.set("page", String(page));

  const response = await fetch(url.toString(), {
    headers: {
      "x-api-key": env.API_KEY_AA,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Artificial Analysis upstream error ${response.status} for page ${page}`);
  }

  return response.json();
}

async function refreshFromUpstream(env, usage) {
  if (!env.API_KEY_AA) {
    throw new Error("Missing required secret API_KEY_AA");
  }

  const models = [];
  let payload = null;

  for (let page = 1; page <= MAX_UPSTREAM_PAGES; page += 1) {
    usage.requests += 1;
    payload = await fetchUpstreamPage(env, page);
    models.push(...(payload.data || []).map(normalizeModel));

    if (!payload.pagination?.has_more) {
      break;
    }
  }

  if (payload?.pagination?.has_more) {
    console.warn("Artificial Analysis model list truncated", {
      pages: MAX_UPSTREAM_PAGES,
      totalPages: payload.pagination.total_pages,
    });
  }

  return {
    apiStatus: 200,
    apiTier: payload?.tier ?? null,
    intelligenceIndexVersion: payload?.intelligence_index_version ?? null,
    refreshedAt: new Date().toISOString(),
    models,
  };
}

async function getFreshPayload(env, usage) {
  if (!inflightRefresh) {
    inflightRefresh = refreshFromUpstream(env, usage).finally(() => {
      inflightRefresh = null;
    });
  }

  return inflightRefresh;
}

async function acquireUpstreamSlot(env, now) {
  return getBudgetStub(env).acquireRefreshSlot({
    now,
    dailyLimit: DAILY_UPSTREAM_LIMIT,
    cost: MAX_UPSTREAM_PAGES,
  });
}

async function finishUpstreamSlot(env, token, usedCost) {
  if (!token) {
    return;
  }

  await getBudgetStub(env).finishRefresh({
    token,
    now: Date.now(),
    dailyLimit: DAILY_UPSTREAM_LIMIT,
    usedCost,
  });
}

export async function getModelsApiResponse(request, env, ctx) {
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
  if (edgeEntry?.payload && edgeEntry.expiresAt && edgeEntry.expiresAt > now) {
    memoryCache = {
      data: edgeEntry.payload,
      expiresAt: edgeEntry.expiresAt,
    };

    return createClientResponse(edgeEntry.payload, {
      hit: true,
      layer: "edge",
      persistent: true,
      expiresAt: new Date(edgeEntry.expiresAt).toISOString(),
    });
  }

  const memoryFallback = staleMemoryEntry();
  const staleFallback = edgeEntry?.payload
    ? {
        payload: edgeEntry.payload,
        expiresAt: edgeEntry.expiresAt,
        layer: "stale-edge",
      }
    : memoryFallback
      ? {
          payload: memoryFallback.payload,
          expiresAt: memoryFallback.expiresAt,
          layer: "stale-memory",
        }
      : null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const slot = await acquireUpstreamSlot(env, Date.now());

    if (!slot.allowed) {
      if (slot.reason === "inflight" && attempt === 0) {
        await sleep(INFLIGHT_RETRY_DELAY_MS);

        const retriedAt = Date.now();
        if (memoryCache.data && memoryCache.expiresAt > retriedAt) {
          return createClientResponse(memoryCache.data, {
            hit: true,
            layer: "memory",
            persistent: false,
            expiresAt: new Date(memoryCache.expiresAt).toISOString(),
          });
        }

        const retriedEdgeEntry = await readEdgeCache(request);
        if (
          retriedEdgeEntry?.payload &&
          retriedEdgeEntry.expiresAt &&
          retriedEdgeEntry.expiresAt > retriedAt
        ) {
          memoryCache = {
            data: retriedEdgeEntry.payload,
            expiresAt: retriedEdgeEntry.expiresAt,
          };

          return createClientResponse(retriedEdgeEntry.payload, {
            hit: true,
            layer: "edge",
            persistent: true,
            expiresAt: new Date(retriedEdgeEntry.expiresAt).toISOString(),
          });
        }

        continue;
      }

      if (staleFallback) {
        return createStaleResponse(
          staleFallback.payload,
          staleFallback.expiresAt,
          staleFallback.layer,
          staleFallback.layer !== "stale-memory",
        );
      }

      if (slot.reason === "inflight") {
        throw new ApiError("Model refresh already in progress", 503);
      }

      throw new ApiError("Upstream refresh budget exhausted for today", 503, {
        limit: DAILY_UPSTREAM_LIMIT,
        resetAt: slot.resetAt,
      });
    }

    const usage = { requests: 0 };

    try {
      const freshPayload = await getFreshPayload(env, usage);
      const expiresAt = Date.now() + CACHE_TTL_MS;
      const expiresAtIso = new Date(expiresAt).toISOString();

      memoryCache = {
        data: freshPayload,
        expiresAt,
      };

      persistEdgeCache(request, freshPayload, expiresAtIso, ctx);
      await finishUpstreamSlot(env, slot.token, usage.requests);

      return createClientResponse(freshPayload, {
        hit: false,
        layer: "network",
        persistent: true,
        expiresAt: expiresAtIso,
      });
    } catch (error) {
      await finishUpstreamSlot(env, slot.token, usage.requests);

      if (staleFallback) {
        return createStaleResponse(
          staleFallback.payload,
          staleFallback.expiresAt,
          staleFallback.layer,
          staleFallback.layer !== "stale-memory",
        );
      }

      throw error;
    }
  }

  if (staleFallback) {
    return createStaleResponse(
      staleFallback.payload,
      staleFallback.expiresAt,
      staleFallback.layer,
      staleFallback.layer !== "stale-memory",
    );
  }

  throw new ApiError("Model refresh already in progress", 503);
}
