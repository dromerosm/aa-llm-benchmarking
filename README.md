# AA LLM Benchmarking

A Cloudflare Worker application that visualizes LLM benchmark data from the Artificial Analysis API.

The project serves a static frontend from Cloudflare Assets and exposes a Worker-backed `/api/models` endpoint that normalizes upstream data, applies edge-aware caching, and returns a frontend-friendly JSON payload.

## What This Project Includes

- `Leaderboard` view with filtering, sorting, pagination, and expandable metrics
- `Intelligence Timeline` view with an SVG scatter plot by release date and intelligence
- Cloudflare Worker runtime entrypoint for API and asset handling
- Wrangler configuration for local development and deployment
- Edge caching and in-isolate memory caching for normalized API responses
- Durable Object coordination to cap upstream refreshes at 750 requests per UTC day
- Security hardening through response headers, secret handling, and method restrictions

## Cloudflare Architecture

This project is designed for Cloudflare Workers with static assets:

- Static files are served from `public/`
- Application logic runs in `src/worker.js`
- The Worker intercepts requests and serves:
  - `/api/models` from Worker code
  - all frontend assets through the `ASSETS` binding

Key runtime files:

- [src/worker.js](/Users/diego/GitHub/cloudflare/aa-llm-benchmarking/src/worker.js)
- [src/model-service.js](/Users/diego/GitHub/cloudflare/aa-llm-benchmarking/src/model-service.js)
- [src/security.js](/Users/diego/GitHub/cloudflare/aa-llm-benchmarking/src/security.js)
- [src/upstream-budget.js](/Users/diego/GitHub/cloudflare/aa-llm-benchmarking/src/upstream-budget.js)
- [wrangler.jsonc](/Users/diego/GitHub/cloudflare/aa-llm-benchmarking/wrangler.jsonc)

## Requirements

- Node.js 18 or newer
- npm
- A valid Artificial Analysis API key
- A Cloudflare account for deployment

## Installation

```bash
npm ci
```

Wrangler is installed as a project dev dependency and is used for local development and deployment.

## Local Development

Cloudflare recommends storing local Worker secrets in `.dev.vars` or `.env`. This project is configured to require `API_KEY_AA`.

Create a local secrets file:

```bash
cp .dev.vars.example .dev.vars
```

Then update `.dev.vars`:

```env
API_KEY_AA="your_artificial_analysis_api_key"
```

### Run Locally

From the project root:

1. Install dependencies:

```bash
npm ci
```

2. Create local secrets:

```bash
cp .dev.vars.example .dev.vars
```

3. Set your Artificial Analysis API key in `.dev.vars`:

```env
API_KEY_AA="your_artificial_analysis_api_key"
```

4. Start the local Cloudflare Worker runtime:

```bash
npm run dev
```

5. Open the application:

- `http://localhost:8787/`
- `http://localhost:8787/evolution`

6. Optional quick API check:

```bash
curl http://localhost:8787/api/models
```

Wrangler will automatically serve static assets from `public/` and run the Worker from `src/worker.js`.

Start the Worker locally:

```bash
npm run dev
```

Wrangler serves the app locally on:

- `http://localhost:8787/`
- `http://localhost:8787/evolution`

## Deploying to Cloudflare

Log in to Cloudflare if needed:

```bash
npx wrangler login
```

Set the production secret:

```bash
npx wrangler secret put API_KEY_AA
```

Deploy:

```bash
npm run deploy
```

Wrangler will deploy:

- the Worker code
- the static assets in `public/`

## Cloudflare Security Deployment

The production recommendations from [SECURITY.md](/Users/diego/GitHub/cloudflare/aa-llm-benchmarking/SECURITY.md) for:

1. WAF managed rules
2. Rate limiting for `/api/models`

are implemented as Terraform infrastructure in:

- [infra/cloudflare/README.md](/Users/diego/GitHub/cloudflare/aa-llm-benchmarking/infra/cloudflare/README.md)
- [infra/cloudflare/main.tf](/Users/diego/GitHub/cloudflare/aa-llm-benchmarking/infra/cloudflare/main.tf)

This adds:

- zone-level Cloudflare Managed Ruleset execution
- zone-level Cloudflare OWASP Core Ruleset execution
- zone-level rate limiting for `GET` and `HEAD` requests to `/api/models`

Basic workflow:

```bash
cd infra/cloudflare
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

Important:

- If you already manage Cloudflare rulesets for the target zone, import and reconcile them before applying Terraform.
- The default WAF configuration assumes a paid Cloudflare plan because it uses the Cloudflare Managed Ruleset and OWASP Core Ruleset.

## Available Scripts

| Script | Command | Purpose |
| --- | --- | --- |
| `npm run dev` | `wrangler dev` | Run the Worker locally with Cloudflare tooling. |
| `npm start` | `wrangler dev` | Alias for local development. |
| `npm run deploy` | `wrangler deploy` | Deploy the Worker and static assets. |
| `npm run types` | `wrangler types` | Generate Cloudflare runtime types from config. |

## Project Structure

```text
.
├── public/
│   ├── index.html
│   ├── evolution.html
│   ├── app.js
│   ├── evolution.js
│   ├── styles.css
│   └── favicon.svg
├── src/
│   ├── model-service.js
│   ├── error.js
│   ├── security.js
│   ├── upstream-budget.js
│   └── worker.js
├── .dev.vars.example
├── AGENTS.md
├── README.md
├── SECURITY.md
├── package.json
└── wrangler.jsonc
```

## Application Routes

| Route | Method | Description |
| --- | --- | --- |
| `/` | `GET` | Main leaderboard page. |
| `/evolution` | `GET` | Timeline chart page. |
| `/api/models` | `GET`, `HEAD` | Normalized Artificial Analysis data. |

All other non-asset or unsupported methods return the appropriate Worker response status.

## Data Model

`/api/models` returns normalized upstream data shaped for the frontend:

```json
{
  "apiStatus": 200,
  "refreshedAt": "2026-04-17T13:52:07.019Z",
  "promptOptions": {
    "parallel_queries": 1,
    "prompt_length": 1000
  },
  "models": [
    {
      "id": "uuid",
      "slug": "gpt-5-4-nano",
      "name": "GPT-5.4 nano (xhigh)",
      "creatorId": "uuid",
      "creator": "OpenAI",
      "creatorSlug": "openai",
      "releaseDate": "2026-03-17",
      "intelligence": 44,
      "coding": 43.9,
      "math": null,
      "gpqa": 0.817,
      "mmluPro": null,
      "liveCodeBench": null,
      "hle": 0.265,
      "scicode": 0.469,
      "math500": null,
      "aime": null,
      "priceBlended": 0.463,
      "priceInput": 0.2,
      "priceOutput": 1.25,
      "outputSpeed": 157.828,
      "latency": 2.444,
      "firstAnswerToken": 2.444,
      "detailsUrl": "https://artificialanalysis.ai/models/gpt-5-4-nano"
    }
  ],
  "cache": {
    "hit": true,
    "layer": "edge",
    "persistent": true,
    "expiresAt": "2026-04-17T14:02:07.019Z"
  }
}
```

Notes:

- Missing upstream values are normalized to `null`
- `detailsUrl` points to the public Artificial Analysis model page
- `cache.layer` can be `memory`, `edge`, `network`, `stale-edge`, or `stale-memory`

## Caching Strategy

The Worker uses two data-serving caches and one coordination layer:

1. In-isolate memory cache
2. Cloudflare Cache API (`caches.default`)
3. `UpstreamBudgetCoordinator` Durable Object

Current behavior:

- cache TTL is 10 minutes
- memory cache is used first when valid
- edge cache is used when memory cache is cold
- upstream is fetched on cache miss or expiry
- all upstream refresh attempts are coordinated through a Durable Object
- upstream refreshes are capped at `750` requests per UTC day across all colos
- stale edge cache is used as fallback if the upstream request fails
- stale memory cache is used as a final local fallback when available

Important Cloudflare note:

- Cache API entries are not globally replicated between data centers in the same way as tiered caching
- stale fallback depends on cache retention and is best-effort

This behavior is based on Cloudflare’s Cache API and Workers cache guidance:

- [Configuration - Wrangler](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [How the Cache works](https://developers.cloudflare.com/workers/reference/how-the-cache-works/)
- [Static Assets](https://developers.cloudflare.com/workers/static-assets/)

## Security Hardening

This refactor includes:

- secret-based API key handling through Wrangler and Worker bindings
- no committed runtime secrets
- `GET` and `HEAD` restriction on the API route
- `405` responses for unsupported methods
- security headers for HTML and API responses
- CSP for HTML responses
- `noopener noreferrer` on external links
- sanitized upstream values before HTML injection paths
- generic upstream failure responses with generated error IDs instead of leaking raw upstream response bodies

See [SECURITY.md](/Users/diego/GitHub/cloudflare/aa-llm-benchmarking/SECURITY.md) for the full security analysis.

## Security Headers

The Worker applies these defensive headers:

- `Content-Security-Policy`
- `Cross-Origin-Opener-Policy`
- `Cross-Origin-Resource-Policy`
- `Permissions-Policy`
- `Referrer-Policy`
- `Strict-Transport-Security` on HTTPS
- `X-Content-Type-Options`
- `X-Frame-Options`

One deliberate tradeoff remains:

- `style-src` allows `'unsafe-inline'`

Reason:

- the current UI uses runtime style updates for tooltip positioning and interaction states

If you want a stricter CSP later, the next step is to refactor those DOM style writes away from inline style updates.

## Frontend Features

### Leaderboard

The main view includes:

- summary cards
- a top-5 model panel
- sortable table
- creator, price, search, and scored-only filters
- expandable secondary metrics
- pagination

### Intelligence Timeline

The timeline view includes:

- creator multi-select
- search and minimum intelligence filters
- priced-only toggle
- interactive labels and tooltip
- SVG chart rendering without external charting libraries

## Validation

Recommended local validation:

```bash
npm ci
cp .dev.vars.example .dev.vars
# add API_KEY_AA
npm run dev
```

Then check:

```bash
curl http://localhost:8787/api/models
```

And open:

- `http://localhost:8787/`
- `http://localhost:8787/evolution`

If Playwright browser binaries are missing:

```bash
npx playwright install chromium
```

Terraform configuration for WAF and rate limiting was added, but it was not applied from this environment because that requires your Cloudflare zone credentials and state ownership decisions for rulesets.

## Troubleshooting

### `wrangler dev` fails because a secret is missing

Set local secrets in `.dev.vars` or use Wrangler secrets in a deployed environment.

### `/api/models` returns `502`

Common causes:

- invalid `API_KEY_AA`
- upstream Artificial Analysis outage or rate limit
- outbound network issue
- the shared daily upstream refresh budget was exhausted before the next UTC reset

### The timeline shows fewer models than the table

This is expected. The timeline only plots models with both:

- `releaseDate`
- `intelligence`

## Attribution

This project depends on Artificial Analysis data and methodology.

References:

- https://artificialanalysis.ai/
- https://artificialanalysis.ai/leaderboards/models
- https://artificialanalysis.ai/methodology
- https://artificialanalysis.ai/api-reference

## License

The current `package.json` declares the license as `ISC`.
