import { ApiError } from "./error.js";

const MEDIA_ENDPOINTS = [
  {
    id: "text-to-image",
    label: "Text to Image",
    modality: "Image",
    includeCategories: true,
  },
  {
    id: "image-editing",
    label: "Image Editing",
    modality: "Image",
    includeCategories: false,
  },
  {
    id: "text-to-speech",
    label: "Text to Speech",
    modality: "Speech",
    includeCategories: false,
  },
  {
    id: "text-to-video",
    label: "Text to Video",
    modality: "Video",
    includeCategories: true,
  },
  {
    id: "image-to-video",
    label: "Image to Video",
    modality: "Video",
    includeCategories: true,
  },
];

const UPSTREAM_BASE_URL = "https://artificialanalysis.ai/api/v2/data/media";
const CACHE_TTL_MS = 10 * 60 * 1000;
const DAILY_UPSTREAM_LIMIT = 1_000;
const CLIENT_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=120";
const EDGE_CACHE_PATH = "/__cache/media";
const EDGE_CACHE_CONTROL = "public, max-age=31536000";
const UPSTREAM_BUDGET_OBJECT = "artificial-analysis-api";
const INFLIGHT_RETRY_DELAY_MS = 1_000;
const MIN_UPSTREAM_REQUEST_INTERVAL_MS = 3_000;

let memoryCache = {
  data: null,
  expiresAt: 0,
};

let inflightRefresh = null;

function buildEndpointUrl(endpoint) {
  const url = new URL(`${UPSTREAM_BASE_URL}/${endpoint.id}`);
  if (endpoint.includeCategories) {
    url.searchParams.set("include_categories", "true");
  }

  return url.toString();
}

function normalizeMediaEntry(endpoint, entry) {
  const categories = Array.isArray(entry.categories) ? entry.categories : [];

  return {
    ...entry,
    endpointId: endpoint.id,
    endpointLabel: endpoint.label,
    modality: endpoint.modality,
    supportsCategories: endpoint.includeCategories,
    creatorId: entry.model_creator?.id || "",
    creator: entry.model_creator?.name || "Unknown",
    creatorSlug: entry.model_creator?.slug || "",
    elo: entry.elo ?? null,
    rank: entry.rank ?? null,
    ci95: entry.ci95 ?? null,
    appearances: entry.appearances ?? null,
    releaseDate: entry.release_date ?? null,
    categories,
    categoryCount: categories.length,
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

async function fetchUpstreamEndpoint(endpoint, env) {
  const upstreamWindow = await getBudgetStub(env).scheduleUpstreamRequest({
    now: Date.now(),
    minIntervalMs: MIN_UPSTREAM_REQUEST_INTERVAL_MS,
  });

  if (upstreamWindow.waitMs > 0) {
    await sleep(upstreamWindow.waitMs);
  }

  const response = await fetch(buildEndpointUrl(endpoint), {
    headers: {
      "x-api-key": env.API_KEY_AA,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Artificial Analysis upstream error ${response.status} for ${endpoint.id}`);
  }

  return response.json();
}

async function refreshFromUpstream(env) {
  if (!env.API_KEY_AA) {
    throw new Error("Missing required secret API_KEY_AA");
  }

  const responses = [];

  for (const endpoint of MEDIA_ENDPOINTS) {
    responses.push({
      endpoint,
      payload: await fetchUpstreamEndpoint(endpoint, env),
    });
  }

  const entries = responses.flatMap(({ endpoint, payload }) =>
    (payload.data || []).map((entry) => normalizeMediaEntry(endpoint, entry)),
  );

  return {
    apiStatus: responses.every(({ payload }) => payload.status === 200) ? 200 : 207,
    refreshedAt: new Date().toISOString(),
    endpoints: responses.map(({ endpoint, payload }) => ({
      id: endpoint.id,
      label: endpoint.label,
      modality: endpoint.modality,
      includeCategories: endpoint.includeCategories,
      count: Array.isArray(payload.data) ? payload.data.length : 0,
      status: payload.status ?? null,
    })),
    entries,
  };
}

async function getFreshPayload(env) {
  if (!inflightRefresh) {
    inflightRefresh = refreshFromUpstream(env).finally(() => {
      inflightRefresh = null;
    });
  }

  return inflightRefresh;
}

async function acquireUpstreamSlot(env, now) {
  return getBudgetStub(env).acquireRefreshSlot({
    now,
    dailyLimit: DAILY_UPSTREAM_LIMIT,
    cost: MEDIA_ENDPOINTS.length,
  });
}

async function finishUpstreamSlot(env, token) {
  if (!token) {
    return;
  }

  await getBudgetStub(env).finishRefresh({
    token,
    now: Date.now(),
    dailyLimit: DAILY_UPSTREAM_LIMIT,
  });
}

export async function getMediaApiResponse(request, env, ctx) {
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
        throw new ApiError("Media refresh already in progress", 503);
      }

      throw new ApiError("Upstream refresh budget exhausted for today", 503, {
        limit: DAILY_UPSTREAM_LIMIT,
        resetAt: slot.resetAt,
      });
    }

    try {
      const freshPayload = await getFreshPayload(env);
      const expiresAt = Date.now() + CACHE_TTL_MS;
      const expiresAtIso = new Date(expiresAt).toISOString();

      memoryCache = {
        data: freshPayload,
        expiresAt,
      };

      persistEdgeCache(request, freshPayload, expiresAtIso, ctx);
      await finishUpstreamSlot(env, slot.token);

      return createClientResponse(freshPayload, {
        hit: false,
        layer: "network",
        persistent: true,
        expiresAt: expiresAtIso,
      });
    } catch (error) {
      await finishUpstreamSlot(env, slot.token);

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

  throw new ApiError("Media refresh already in progress", 503);
}
