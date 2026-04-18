import { ApiError } from "./error.js";
import { getMediaApiResponse } from "./media-service.js";
import { getModelsApiResponse } from "./model-service.js";
import { applySecurityHeaders } from "./security.js";
import { UpstreamBudgetCoordinator } from "./upstream-budget.js";

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

async function handleModelsRequest(request, env, ctx) {
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
    console.error("Failed to serve internal models payload", {
      errorId,
      message: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof ApiError) {
      return jsonError(error.message, error.status, {
        errorId,
        ...error.extra,
      });
    }

    return jsonError("Failed to fetch data from Artificial Analysis API", 502, { errorId });
  }
}

async function handleMediaRequest(request, env, ctx) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, {
      status: 405,
      headers: {
        Allow: "GET, HEAD",
      },
    });
  }

  try {
    const response = await getMediaApiResponse(request, env, ctx);
    return request.method === "HEAD" ? withoutBody(response) : response;
  } catch (error) {
    const errorId = crypto.randomUUID();
    console.error("Failed to serve internal media payload", {
      errorId,
      message: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof ApiError) {
      return jsonError(error.message, error.status, {
        errorId,
        ...error.extra,
      });
    }

    return jsonError("Failed to fetch data from Artificial Analysis API", 502, { errorId });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const response = url.pathname === "/models"
      ? await handleModelsRequest(request, env, ctx)
      : url.pathname === "/media"
        ? await handleMediaRequest(request, env, ctx)
        : new Response("Not Found", { status: 404 });

    return applySecurityHeaders(response, request);
  },
};

export { UpstreamBudgetCoordinator };
