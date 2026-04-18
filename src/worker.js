import { applySecurityHeaders } from "./security.js";

const MODEL_BOOTSTRAP_ID = "aa-models-payload";
const MODELS_SERVICE_URL = "https://models.internal/models";

function notFoundResponse() {
  return new Response("Not Found", {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function serializeBootstrapPayload(payload) {
  return JSON.stringify(payload).replaceAll("<", "\\u003c");
}

class ModelsPayloadInjector {
  constructor(payload) {
    this.payload = payload;
  }

  element(element) {
    element.append(
      `<script id="${MODEL_BOOTSTRAP_ID}" type="application/json">${serializeBootstrapPayload(this.payload)}</script>`,
      { html: true },
    );
  }
}

function isBootstrapDocument(pathname) {
  return pathname === "/" || pathname === "/evolution";
}

async function fetchModelsPayload(env) {
  const response = await env.MODELS_SERVICE.fetch(
    new Request(MODELS_SERVICE_URL, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    }),
  );

  if (!response.ok) {
    throw new Error(`Models service error ${response.status}`);
  }

  return response.json();
}

async function handleAssetRequest(request, env) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, {
      status: 405,
      headers: {
        Allow: "GET, HEAD",
      },
    });
  }

  const url = new URL(request.url);
  const assetResponse = await env.ASSETS.fetch(request);

  if (request.method === "HEAD" || !isBootstrapDocument(url.pathname)) {
    return assetResponse;
  }

  try {
    const payload = await fetchModelsPayload(env);
    return new HTMLRewriter().on("head", new ModelsPayloadInjector(payload)).transform(assetResponse);
  } catch (error) {
    console.error("Failed to bootstrap models payload", {
      message: error instanceof Error ? error.message : String(error),
      pathname: url.pathname,
    });
    return assetResponse;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const response = url.pathname === "/api/models"
      ? notFoundResponse()
      : await handleAssetRequest(request, env);

    return applySecurityHeaders(response, request);
  },
};
