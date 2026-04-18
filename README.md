# AA LLM Benchmarking

A Cloudflare Worker application that visualizes LLM plus speech, image, and video benchmark data from the Artificial Analysis API.

The project serves a static frontend from Cloudflare Assets and keeps model retrieval behind an internal Worker-to-Worker service binding. The browser does not call the upstream-backed data service directly.

## What This Project Includes

- `Leaderboard` view with filtering, sorting, pagination, and expandable metrics
- `Intelligence Timeline` view with an SVG scatter plot by release date and intelligence
- `Speech, Image & Video` view aggregating the remaining Artificial Analysis free API media endpoints
- Cloudflare Worker runtime entrypoint for public asset handling
- Internal models Worker reachable only through a service binding
- Wrangler configuration for local development and deployment
- Edge caching and in-isolate memory caching for normalized API responses
- Durable Object coordination to cap upstream refreshes at 1,000 requests per UTC day
- Durable Object pacing to keep at least 3 seconds between upstream API requests
- Security hardening through response headers, secret handling, and method restrictions
- CSP headers that stay compatible with Cloudflare challenge and analytics script injection

## Cloudflare Architecture

This project is designed for Cloudflare Workers with static assets and a private internal data service:

- Static files are served from `public/`
- Public request handling runs in `src/worker.js`
- Internal upstream retrieval runs in `src/models-worker.js`
- The public Worker serves frontend assets through the `ASSETS` binding
- The public Worker fetches LLM and media payloads from the internal Worker through the `MODELS_SERVICE` service binding
- The internal Worker owns the Artificial Analysis API key, edge cache, and upstream budget Durable Object
- `/api/models` is intentionally not exposed publicly

Key runtime files:

- [src/worker.js](/Users/diego/GitHub/cloudflare/aa-llm-benchmarking/src/worker.js)
- [src/models-worker.js](/Users/diego/GitHub/cloudflare/aa-llm-benchmarking/src/models-worker.js)
- [src/model-service.js](/Users/diego/GitHub/cloudflare/aa-llm-benchmarking/src/model-service.js)
- [src/media-service.js](/Users/diego/GitHub/cloudflare/aa-llm-benchmarking/src/media-service.js)
- [src/security.js](/Users/diego/GitHub/cloudflare/aa-llm-benchmarking/src/security.js)
- [src/upstream-budget.js](/Users/diego/GitHub/cloudflare/aa-llm-benchmarking/src/upstream-budget.js)
- [wrangler.jsonc](/Users/diego/GitHub/cloudflare/aa-llm-benchmarking/wrangler.jsonc)
- [wrangler.models.jsonc](/Users/diego/GitHub/cloudflare/aa-llm-benchmarking/wrangler.models.jsonc)

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

`npm install` also configures the repository to use the versioned Git hooks in `.githooks/`.

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
- `http://localhost:8787/speech-image-video`

6. Verify the public routes:

```bash
curl -I http://localhost:8787/
curl -I http://localhost:8787/evolution
curl -I http://localhost:8787/speech-image-video
curl -I http://localhost:8787/api/models
```

Expected local behavior:

- `/` returns `200`
- `/evolution` returns `200`
- `/speech-image-video` returns `200`
- `/api/models` returns `404`

Wrangler will automatically serve static assets from `public/`, run the public Worker from `src/worker.js`, and connect it to `src/models-worker.js` through a local service binding.

Start the Worker locally:

```bash
npm run dev
```

Wrangler serves the app locally on:

- `http://localhost:8787/`
- `http://localhost:8787/evolution`
- `http://localhost:8787/speech-image-video`

## Deploying to Cloudflare

Log in to Cloudflare if needed:

```bash
npx wrangler login
```

Set the production secret on the internal models Worker:

```bash
npx wrangler secret put API_KEY_AA -c wrangler.models.jsonc
```

Deploy:

```bash
npm run deploy
```

`npm run deploy` now runs a Lighthouse check against `/` and `/evolution` before pushing the Workers to Cloudflare.

Wrangler will deploy:

- the internal models Worker first
- the public Worker second
- the static assets in `public/`
- the custom domain `llm-benchmarks.diegoromero.es`

Production URLs:

- `https://llm-benchmarks.diegoromero.es/`
- `https://llm-benchmarks.diegoromero.es/evolution`
- `https://llm-benchmarks.diegoromero.es/speech-image-video`

## Cloudflare Security Deployment

The production recommendations from [SECURITY.md](/Users/diego/GitHub/cloudflare/aa-llm-benchmarking/SECURITY.md) for:

1. WAF managed rules
2. Rate limiting for a public data endpoint if you reintroduce one

are implemented as Terraform infrastructure in:

- [infra/cloudflare/README.md](/Users/diego/GitHub/cloudflare/aa-llm-benchmarking/infra/cloudflare/README.md)
- [infra/cloudflare/main.tf](/Users/diego/GitHub/cloudflare/aa-llm-benchmarking/infra/cloudflare/main.tf)

This adds:

- zone-level Cloudflare Managed Ruleset execution
- zone-level Cloudflare OWASP Core Ruleset execution
- optional zone-level rate limiting for `GET` and `HEAD` requests to `/api/models`

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
| `npm run prepare` | `node ./scripts/install-git-hooks.mjs` | Configure Git to use the repository's versioned hooks in `.githooks`. |
| `npm run dev` | `wrangler dev -c wrangler.jsonc -c wrangler.models.jsonc` | Run the public Worker and the private models Worker together in local development. |
| `npm start` | `wrangler dev -c wrangler.jsonc -c wrangler.models.jsonc` | Alias for local development. |
| `npm run lighthouse` | `node ./scripts/run-lighthouse-check.mjs` | Run Lighthouse against `/` and `/evolution`, starting `wrangler dev` automatically if needed. |
| `npm run deploy` | `wrangler deploy -c wrangler.models.jsonc --secrets-file .env && wrangler deploy -c wrangler.jsonc` | Deploy the internal models Worker first and then the public Worker. |
| `npm run deploy:public` | `wrangler deploy -c wrangler.jsonc` | Deploy only the public Worker. |
| `npm run deploy:models` | `wrangler deploy -c wrangler.models.jsonc --secrets-file .env` | Deploy only the private models Worker with secrets. |
| `npm run types` | `wrangler types -c wrangler.jsonc -c wrangler.models.jsonc` | Generate Cloudflare runtime types from both Worker configs. |

## Project Structure

```text
.
├── public/
│   ├── index.html
│   ├── evolution.html
│   ├── speech-image-video.html
│   ├── app.js
│   ├── evolution.js
│   ├── speech-image-video.js
│   ├── styles.css
│   └── favicon.svg
├── src/
│   ├── model-service.js
│   ├── media-service.js
│   ├── models-worker.js
│   ├── error.js
│   ├── security.js
│   ├── upstream-budget.js
│   └── worker.js
├── .dev.vars.example
├── AGENTS.md
├── README.md
├── SECURITY.md
├── package.json
├── wrangler.jsonc
└── wrangler.models.jsonc
```

## Application Routes

| Route | Method | Description |
| --- | --- | --- |
| `/` | `GET` | Main leaderboard page. |
| `/evolution` | `GET` | Timeline chart page. |
| `/speech-image-video` | `GET` | Aggregated speech, image, and video page. |
| `/api/models` | `GET`, `HEAD` | Intentionally unavailable from the public Worker and returns `404`. |

All other non-asset or unsupported methods return the appropriate Worker response status.

## Data Model

The internal models Worker returns normalized upstream data shaped for the frontend and injects it into the HTML payload served by the public Worker:

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
- a private service binding between the public Worker and the internal models Worker
- `workers_dev: false` on the internal models Worker so it is not reachable on a public `workers.dev` URL
- `404` for the former public `/api/models` route
- `GET` and `HEAD` restriction on the internal models endpoint
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
- a time range combo with 7 days, 30 days, 3 months, and Max
- search and minimum intelligence filters
- priced-only toggle
- interactive labels and tooltip
- SVG chart rendering without external charting libraries

### Speech, Image & Video

The media view includes:

- one aggregated table across text-to-image, image-editing, text-to-speech, text-to-video, and image-to-video
- endpoint and creator filters
- category-breakdown toggle
- sortable ELO, appearances, release date, and rank columns
- expandable columns for CI95, modality, and category previews
- pagination

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
curl -I http://localhost:8787/
curl -I http://localhost:8787/evolution
curl -I http://localhost:8787/speech-image-video
curl -I http://localhost:8787/api/models
```

Expected:

- `/` => `200`
- `/evolution` => `200`
- `/speech-image-video` => `200`
- `/api/models` => `404`

And open:

- `http://localhost:8787/`
- `http://localhost:8787/evolution`
- `http://localhost:8787/speech-image-video`

If Playwright browser binaries are missing:

```bash
npx playwright install chromium
```

Terraform configuration for WAF and rate limiting was added, but it was not applied from this environment because that requires your Cloudflare zone credentials and state ownership decisions for rulesets.

## Troubleshooting

### `wrangler dev` fails because a secret is missing

Set local secrets in `.dev.vars` or use Wrangler secrets in a deployed environment.

### The page renders but upstream data is missing

Common causes:

- invalid `API_KEY_AA` on the internal models Worker
- upstream Artificial Analysis outage or rate limit
- outbound network issue
- the shared daily upstream refresh budget was exhausted before the next UTC reset
- the public Worker could not reach the `MODELS_SERVICE` binding

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
