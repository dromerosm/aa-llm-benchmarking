const UPSTREAM_URL = "https://artificialanalysis.ai/api/v2/data/llms/models";
const CACHE_TTL_MS = 10 * 60 * 1000;
const CLIENT_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=120";
const EDGE_CACHE_PATH = "/__cache/models";
const EDGE_CACHE_CONTROL = "public, max-age=31536000";

let memoryCache = {
  data: null,
  expiresAt: 0,
};

let inflightRefresh = null;

function normalizeOptionalMetric(value) {
  return value && value > 0 ? value : null;
}

function hydrateModel(model) {
  return {
    hle: null,
    scicode: null,
    math500: null,
    aime: null,
    creatorId: "",
    ...model,
  };
}

function normalizeModel(model) {
  const evaluations = model.evaluations || {};
  const pricing = model.pricing || {};

  return hydrateModel({
    id: model.id,
    slug: model.slug,
    name: model.name,
    creatorId: model.model_creator?.id || "",
    creator: model.model_creator?.name || "Unknown",
    creatorSlug: model.model_creator?.slug || "",
    releaseDate: model.release_date || null,
    intelligence: evaluations.artificial_analysis_intelligence_index ?? null,
    coding: evaluations.artificial_analysis_coding_index ?? null,
    math: evaluations.artificial_analysis_math_index ?? null,
    gpqa: evaluations.gpqa ?? null,
    mmluPro: evaluations.mmlu_pro ?? null,
    liveCodeBench: evaluations.livecodebench ?? null,
    hle: evaluations.hle ?? null,
    scicode: evaluations.scicode ?? null,
    math500: evaluations.math_500 ?? null,
    aime: evaluations.aime ?? null,
    priceBlended: pricing.price_1m_blended_3_to_1 ?? null,
    priceInput: pricing.price_1m_input_tokens ?? null,
    priceOutput: pricing.price_1m_output_tokens ?? null,
    outputSpeed: normalizeOptionalMetric(model.median_output_tokens_per_second),
    latency: normalizeOptionalMetric(model.median_time_to_first_token_seconds),
    firstAnswerToken: normalizeOptionalMetric(model.median_time_to_first_answer_token),
    detailsUrl: model.slug
      ? `https://artificialanalysis.ai/models/${model.slug}`
      : null,
  });
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

async function refreshFromUpstream(env) {
  if (!env.API_KEY_AA) {
    throw new Error("Missing required secret API_KEY_AA");
  }

  const response = await fetch(UPSTREAM_URL, {
    headers: {
      "x-api-key": env.API_KEY_AA,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Artificial Analysis upstream error ${response.status}`);
  }

  const payload = await response.json();

  return {
    apiStatus: payload.status ?? null,
    refreshedAt: new Date().toISOString(),
    promptOptions: payload.prompt_options || {},
    models: (payload.data || []).map(normalizeModel),
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

  try {
    const freshPayload = await getFreshPayload(env);
    const expiresAt = now + CACHE_TTL_MS;
    const expiresAtIso = new Date(expiresAt).toISOString();

    memoryCache = {
      data: freshPayload,
      expiresAt,
    };

    persistEdgeCache(request, freshPayload, expiresAtIso, ctx);

    return createClientResponse(freshPayload, {
      hit: false,
      layer: "network",
      persistent: true,
      expiresAt: expiresAtIso,
    });
  } catch (error) {
    if (edgeEntry?.payload) {
      return createClientResponse(edgeEntry.payload, {
        hit: true,
        layer: "stale-edge",
        persistent: true,
        expiresAt: edgeEntry.expiresAt ? new Date(edgeEntry.expiresAt).toISOString() : null,
      });
    }

    throw error;
  }
}
