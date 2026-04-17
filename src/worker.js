import { getModelsApiResponse } from "./model-service.js";
import { applySecurityHeaders } from "./security.js";

function jsonError(message, status, extra = {}) {
  return Response.json(
    {
      error: message,
      ...extra,
    },
    { status },
  );
}

function withoutBody(response) {
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function handleModelsApi(request, env, ctx) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, {
      status: 405,
      headers: {
        Allow: "GET, HEAD",
      },
    });
  }

  try {
    const response = await getModelsApiResponse(request, env, ctx);
    return request.method === "HEAD" ? withoutBody(response) : response;
  } catch (error) {
    const errorId = crypto.randomUUID();
    console.error("Failed to serve /api/models", {
      errorId,
      message: error instanceof Error ? error.message : String(error),
    });

    return jsonError("Failed to fetch data from Artificial Analysis API", 502, {
      errorId,
    });
  }
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

  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const response = url.pathname === "/api/models"
      ? await handleModelsApi(request, env, ctx)
      : await handleAssetRequest(request, env);

    return applySecurityHeaders(response, request);
  },
};
