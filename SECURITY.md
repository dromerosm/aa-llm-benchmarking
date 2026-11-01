# Security Policy

## Reporting a Vulnerability

Please do **not** open a public GitHub issue for security problems.

Report vulnerabilities privately through GitHub's
[Report a vulnerability](https://github.com/dromerosm/aa-llm-benchmarking/security/advisories/new)
flow (Security → Advisories). Include steps to reproduce and the affected route
or component. You can expect an initial acknowledgement within a few days.

## Security Analysis

This document summarizes the current security posture of the project after the Cloudflare refactor.

## Scope

The application is a read-only Cloudflare Worker that:

- serves static frontend assets
- fetches public benchmark data from Artificial Analysis using a private API key
- exposes a normalized `/api/models` endpoint

There is no user authentication, user-generated content submission, or persistent database in the current architecture.

## Threat Model

Primary risks for this application:

1. Leakage of the Artificial Analysis API key
2. XSS through upstream model data rendered in the frontend
3. Clickjacking or overly permissive embedding
4. Browser-side misuse of responses due to weak content typing or framing controls
5. Overexposure of upstream error details
6. Cache misuse or stale data behavior at the edge
7. Abuse of the public endpoint through scraping or excessive request volume

## Implemented Controls

### Secret Management

- The application expects `API_KEY_AA` as a Worker secret
- Local development uses `.dev.vars` rather than committed credentials
- `.dev.vars*` and `.env*` are ignored in git, while example files remain committable

Result:

- accidental deploys without the required secret are less likely
- committed plaintext secrets are avoided by default

### Response Hardening

The Worker adds:

- `Content-Security-Policy`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`
- `Strict-Transport-Security` on HTTPS requests

Result:

- reduced clickjacking exposure
- reduced MIME confusion risk
- tighter browser isolation defaults

### Input and Rendering Safety

- Upstream model strings are escaped before being inserted into HTML template strings
- External links now use `rel="noopener noreferrer"`
- The frontend consumes only same-origin `/api/models`

Result:

- reduced risk of markup injection from upstream fields
- reduced reverse-tabnabbing risk

### API Behavior Restrictions

- `/api/models` only allows `GET` and `HEAD`
- asset routes also reject unsupported methods with `405`
- upstream failures return a generic error body plus a generated `errorId`

Result:

- narrower request surface
- reduced leakage of upstream diagnostics

### Caching Controls

- normalized API responses are cached in memory and at the Cloudflare edge
- stale edge cache is used only as a fallback when upstream fetches fail

Result:

- lower upstream request volume
- more resilient read behavior under transient upstream failures

### Content Security Policy

HTML responses get this policy (`src/security.js`), with a fresh nonce per request that the Worker adds to every `<script>` element:

- `default-src 'self'`
- `base-uri 'self'`
- `connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com`
- `font-src 'self'`
- `form-action 'self'`
- `frame-ancestors 'none'`
- `img-src 'self' data: https://*.google-analytics.com https://www.googletagmanager.com`
- `object-src 'none'`
- `script-src 'self' 'nonce-<per-request>' https://static.cloudflareinsights.com https://www.googletagmanager.com`
- `style-src 'self' 'unsafe-inline'`
- `upgrade-insecure-requests` on HTTPS requests

## Current Security Tradeoffs

### Third-Party Analytics

Every HTML page loads Google Analytics 4 (`G-B8118TCBQY`). The configuration lives in the same-origin `public/analytics.js`, so no inline script is needed. That file adds the `gtag.js` loader from `www.googletagmanager.com` only on `diegoromero.es` hosts and only after the visitor accepts the cookie notice. Its notice is styled through the DOM, so the CSP needs no `unsafe-inline` for it.

The CSP allows only what GA4 needs:

- `script-src`: `https://www.googletagmanager.com`
- `connect-src`: `https://*.google-analytics.com`, `https://*.analytics.google.com`, `https://www.googletagmanager.com`
- `img-src`: `https://*.google-analytics.com`, `https://www.googletagmanager.com`

GA4 runs with `anonymize_ip`, Google signals off, and ad personalization signals off.

Impact:

- a third party can run script on the page, so a compromise of the Google Tag Manager origin would affect this site
- visitor page views and basic device data are sent to Google

Recommended future improvement:

- drop GA4, or switch to a cookieless first-party measurement option, if stricter isolation is required

### CSP Allows Inline Styles

The current `Content-Security-Policy` uses:

- `style-src 'self' 'unsafe-inline'`

Reason:

- the current frontend performs runtime style updates for tooltip placement and chart interaction states

Impact:

- this is weaker than a fully nonce/hash-based or inline-free policy

Recommended future improvement:

- refactor tooltip positioning and interaction styling away from inline style writes
- then remove `'unsafe-inline'` from `style-src`

### Public Read Endpoint

`/api/models` is intentionally public.

Impact:

- it can be scraped or called at high volume

Recommended Cloudflare-side mitigation:

- enable WAF managed rules
- add rate limiting on `/api/models`
- optionally add bot management protections depending on traffic profile

### Third-Party Fonts

The frontend loads Google Fonts:

- `fonts.googleapis.com`
- `fonts.gstatic.com`

Impact:

- introduces a third-party dependency for rendering
- requires CSP allowances for those domains

Recommended future improvement:

- self-host fonts in `public/` if stricter isolation is required

## Residual Risks

- data integrity still depends on the upstream Artificial Analysis API
- edge cache persistence is best-effort and data-center-local when using the Cache API
- there is no built-in rate limiting in Worker code
- there is no authentication layer because the product is designed as a public read application

## Deployment Recommendations

For a production Cloudflare deployment, enable or review:

1. Cloudflare WAF managed rules
2. Rate limiting for `/api/models`
3. HTTPS-only custom domain routing
4. Secret rotation process for `API_KEY_AA`
5. Observability and error monitoring in the Workers dashboard

Items 1 and 2 are now implemented as Terraform infrastructure in:

- [infra/cloudflare/main.tf](infra/cloudflare/main.tf)
- [infra/cloudflare/README.md](infra/cloudflare/README.md)

Current implementation:

- zone-level `http_request_firewall_managed` ruleset
- Cloudflare Managed Ruleset execution
- Cloudflare OWASP Core Ruleset execution with a safer default profile
- zone-level `http_ratelimit` ruleset
- `429` JSON blocking response for `/api/models` when the configured threshold is exceeded

## Incident Response Guidance

If `API_KEY_AA` is exposed:

1. Rotate the key at Artificial Analysis
2. Update the Worker secret with `npx wrangler secret put API_KEY_AA`
3. Redeploy the Worker
4. Review recent request patterns in Cloudflare logs

If suspicious abuse is observed:

1. Apply or tighten rate limits on `/api/models`
2. Review WAF and bot mitigation settings
3. Consider caching adjustments to further reduce upstream dependency
