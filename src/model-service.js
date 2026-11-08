import { createSharedCache, paceUpstreamRequest, refreshShared } from "./shared-cache.js";

const UPSTREAM_URL = "https://artificialanalysis.ai/api/v2/language/models/free";
const SHARED_CACHE_KEY = "models";
// Each page is one upstream request. The list had 4 pages of 200 models in October 2026.
const MAX_UPSTREAM_PAGES = 6;

const sharedCache = createSharedCache({ key: SHARED_CACHE_KEY, label: "Model" });

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

async function fetchUpstreamPage(env, page, usage) {
  await paceUpstreamRequest(env);

  const url = new URL(UPSTREAM_URL);
  url.searchParams.set("page", String(page));

  usage.requests += 1;
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

async function fetchModelsPayload(env, usage) {
  const models = [];
  let payload = null;

  for (let page = 1; page <= MAX_UPSTREAM_PAGES; page += 1) {
    payload = await fetchUpstreamPage(env, page, usage);
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

export function getModelsApiResponse(request, env, ctx) {
  return sharedCache.respond(request, env, ctx);
}

export function refreshModels(env) {
  return refreshShared(env, {
    key: SHARED_CACHE_KEY,
    cost: MAX_UPSTREAM_PAGES,
    fetchPayload: fetchModelsPayload,
  });
}
