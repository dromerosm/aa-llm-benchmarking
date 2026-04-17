const HTML_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self'",
  "font-src 'self' https://fonts.gstatic.com",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data:",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "upgrade-insecure-requests",
].join("; ");

function isHtmlResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("text/html");
}

export function applySecurityHeaders(response, request) {
  const headers = new Headers(response.headers);

  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set(
    "Permissions-Policy",
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()",
  );
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");

  if (request.url.startsWith("https://")) {
    headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }

  if (isHtmlResponse(response)) {
    headers.set("Content-Security-Policy", HTML_CSP);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
