import { applySecurityHeaders } from "./security.js";

const BOOTSTRAP_CONFIG = {
  "/": {
    scriptId: "aa-models-payload",
    serviceUrl: "https://models.internal/models",
  },
  "/evolution": {
    scriptId: "aa-models-payload",
    serviceUrl: "https://models.internal/models",
  },
  "/speech-image-video": {
    scriptId: "aa-media-payload",
    serviceUrl: "https://models.internal/media",
  },
};

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

class PayloadInjector {
  constructor(payload, nonce, scriptId) {
    this.payload = payload;
    this.nonce = nonce;
    this.scriptId = scriptId;
  }

  element(element) {
    element.append(
      `<script id="${this.scriptId}" type="application/json" nonce="${this.nonce}">${serializeBootstrapPayload(this.payload)}</script>`,
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
  return Object.hasOwn(BOOTSTRAP_CONFIG, pathname);
}

async function fetchBootstrapPayload(env, serviceUrl) {
  const response = await env.MODELS_SERVICE.fetch(
    new Request(serviceUrl, {
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
    const config = BOOTSTRAP_CONFIG[url.pathname];
    const payload = await fetchBootstrapPayload(env, config.serviceUrl);
    return rewriter
      .on("head", new PayloadInjector(payload, nonce, config.scriptId))
      .transform(assetResponse);
  } catch (error) {
    console.error("Failed to bootstrap page payload", {
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
