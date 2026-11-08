import { createSharedCache, paceUpstreamRequest, refreshShared } from "./shared-cache.js";

const MEDIA_ENDPOINTS = [
  {
    id: "text-to-image",
    label: "Text to Image",
    modality: "Image",
  },
  {
    id: "image-editing",
    label: "Image Editing",
    modality: "Image",
  },
  {
    id: "text-to-speech",
    label: "Text to Speech",
    modality: "Speech",
  },
  {
    id: "text-to-video",
    label: "Text to Video",
    modality: "Video",
  },
  {
    id: "image-to-video",
    label: "Image to Video",
    modality: "Video",
  },
];

const UPSTREAM_BASE_URL = "https://artificialanalysis.ai/api/v2/media";
const SHARED_CACHE_KEY = "media";

const sharedCache = createSharedCache({ key: SHARED_CACHE_KEY, label: "Media" });

function buildEndpointUrl(endpoint) {
  return `${UPSTREAM_BASE_URL}/${endpoint.id}/models/free`;
}

function normalizeMediaEntry(endpoint, entry, rank) {
  return {
    id: entry.id,
    name: entry.name,
    slug: entry.slug,
    endpointId: endpoint.id,
    endpointLabel: endpoint.label,
    modality: endpoint.modality,
    creatorId: entry.model_creator?.id || "",
    creator: entry.model_creator?.name || "Unknown",
    elo: entry.elo ?? null,
    rank,
    ci95: entry.ci_95 ?? null,
  };
}

// The free endpoints no longer send a rank, so rank each leaderboard by Elo.
function rankEntries(endpoint, entries) {
  return [...entries]
    .sort((left, right) => (right.elo ?? -Infinity) - (left.elo ?? -Infinity))
    .map((entry, index) => normalizeMediaEntry(endpoint, entry, entry.elo === null || entry.elo === undefined ? null : index + 1));
}

async function fetchUpstreamEndpoint(endpoint, env, usage) {
  await paceUpstreamRequest(env);

  usage.requests += 1;
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

async function fetchMediaPayload(env, usage) {
  const responses = [];

  for (const endpoint of MEDIA_ENDPOINTS) {
    responses.push({
      endpoint,
      payload: await fetchUpstreamEndpoint(endpoint, env, usage),
    });
  }

  const entries = responses.flatMap(({ endpoint, payload }) =>
    rankEntries(endpoint, payload.data || []),
  );

  return {
    apiStatus: 200,
    apiTier: responses[0]?.payload.tier ?? null,
    refreshedAt: new Date().toISOString(),
    endpoints: responses.map(({ endpoint, payload }) => ({
      id: endpoint.id,
      label: endpoint.label,
      modality: endpoint.modality,
      count: Array.isArray(payload.data) ? payload.data.length : 0,
    })),
    entries,
  };
}

export function getMediaApiResponse(request, env, ctx) {
  return sharedCache.respond(request, env, ctx);
}

export function refreshMedia(env) {
  return refreshShared(env, {
    key: SHARED_CACHE_KEY,
    cost: MEDIA_ENDPOINTS.length,
    fetchPayload: fetchMediaPayload,
  });
}
