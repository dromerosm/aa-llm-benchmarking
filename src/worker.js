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

function createScriptNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  return btoa(String.fromCharCode(...bytes));
}

class ModelsPayloadInjector {
  constructor(payload, nonce) {
    this.payload = payload;
    this.nonce = nonce;
  }

  element(element) {
    element.append(
      `<script id="${MODEL_BOOTSTRAP_ID}" type="application/json" nonce="${this.nonce}">${serializeBootstrapPayload(this.payload)}</script>`,
      { html: true },
    );
  }
}

class ScriptNonceInjector {
  constructor(nonce) {
    this.nonce = nonce;
  }

  element(element) {
    element.setAttribute("nonce", this.nonce);
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

async function handleAssetRequest(request, env, nonce) {
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

  if (request.method === "HEAD" || !assetResponse.headers.get("content-type")?.includes("text/html")) {
    return assetResponse;
  }

  const rewriter = new HTMLRewriter().on("script", new ScriptNonceInjector(nonce));

  if (!isBootstrapDocument(url.pathname)) {
    return rewriter.transform(assetResponse);
  }

  try {
    const payload = await fetchModelsPayload(env);
    return rewriter
      .on("head", new ModelsPayloadInjector(payload, nonce))
      .transform(assetResponse);
  } catch (error) {
    console.error("Failed to bootstrap models payload", {
      message: error instanceof Error ? error.message : String(error),
      pathname: url.pathname,
    });
    return rewriter.transform(assetResponse);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const nonce = createScriptNonce();
    const response = url.pathname === "/api/models"
      ? notFoundResponse()
      : await handleAssetRequest(request, env, nonce);

    return applySecurityHeaders(response, request, { nonce });
  },
};
