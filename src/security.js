function buildHtmlCsp({ isHttpsRequest, nonce }) {
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self'",
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "object-src 'none'",
    `script-src 'self' 'nonce-${nonce}' https://static.cloudflareinsights.com`,
    "style-src 'self' 'unsafe-inline'",
  ];

  if (isHttpsRequest) {
    directives.push("upgrade-insecure-requests");
  }

  return directives.join("; ");
}

function isHtmlResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("text/html");
}

export function applySecurityHeaders(response, request, options = {}) {
  const headers = new Headers(response.headers);
  const isHttpsRequest = request.url.startsWith("https://");
  const nonce = options.nonce || null;

  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set(
    "Permissions-Policy",
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()",
  );
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");

  if (isHttpsRequest) {
    headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }

  if (isHtmlResponse(response)) {
    headers.set("Content-Security-Policy", buildHtmlCsp({
      isHttpsRequest,
      nonce,
    }));
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
