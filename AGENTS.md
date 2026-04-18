# AGENTS.md

Repository instructions for humans and coding agents working on this project.

## Language

- Use English for all user-facing copy.
- Use English for code comments, README updates, commit messages, pull request text, and any new documentation.
- Keep naming consistent and readable in English.

## Deployment Target

- This project is intended to be deployed on Cloudflare.
- Prefer solutions that are compatible with Cloudflare Workers and Cloudflare Pages.
- Avoid introducing new runtime dependencies that assume a traditional long-lived Node.js server unless explicitly approved.
- Prefer web-standard APIs such as `fetch`, `Request`, `Response`, and URL-based routing patterns when possible.
- Use Wrangler for local development, secrets management, and deployment workflows.

## Architecture Guidance

- Keep the frontend static-first when possible.
- If backend logic changes, design it so it can be migrated cleanly to a Cloudflare edge runtime.
- Minimize server-side state. If caching is needed, keep the strategy simple and portable.
- Do not add heavy frameworks unless there is a clear justification.

## Data and Attribution

- This project depends on Artificial Analysis data.
- Preserve visible attribution to Artificial Analysis in the UI and documentation.
- Do not remove methodology or source links unless they are replaced with an equivalent or better attribution path.

## Secrets and Environment

- Never commit secrets, API keys, `.env` files, or private credentials.
- Prefer `.dev.vars` for local Worker secrets and Wrangler secrets for deployed environments.
- Document any new environment variables in `README.md`.
- Keep local development setup simple and explicit.

## Changes and Quality

- Make focused changes that match the current product direction.
- Preserve the existing visual language unless a redesign is explicitly requested.
- Validate important user flows locally before finishing work.
- Do not claim that a UI flow works unless it has been verified against the running app with the tools requested by the user.
- If the user requests Playwright and DevTools validation, run both before reporting success. If DevTools MCP is unavailable or cannot attach to a page, state that explicitly instead of implying the check was completed.
- When behavior changes, update documentation in the same change.

## Lighthouse Process

- Google Lighthouse is part of the contributor and agent workflow, not product documentation.
- Run `npm run lighthouse` before `git commit`, before `git push`, and before `npm run deploy`.
- The repository enforces this through `.githooks/pre-commit`, `.githooks/pre-push`, and the `predeploy` script.
- The default audit targets are `http://127.0.0.1:8787/` and `http://127.0.0.1:8787/evolution`.
- If nothing is running on port `8787`, the audit script starts `npm run dev` automatically and stops it after the audit completes.
- Current minimum thresholds are `performance >= 75`, `accessibility >= 90`, `best-practices >= 90`, and `seo >= 90`.
- To audit the deployed site explicitly, run `LIGHTHOUSE_BASE_URL=https://llm-benchmarks.diegoromero.es npm run lighthouse`.
- Supported environment variables for the audit script are `LIGHTHOUSE_BASE_URL`, `LIGHTHOUSE_HOST`, `LIGHTHOUSE_PORT`, `LIGHTHOUSE_CHROME_PORT`, and `LIGHTHOUSE_SERVER_TIMEOUT_MS`.
- Production Lighthouse results may differ from local results because Cloudflare can inject additional scripts or headers at the edge.

## Definition of Done

- New copy is in English.
- The change remains aligned with Cloudflare deployment constraints.
- Artificial Analysis attribution is still present where relevant.
- Documentation is updated if setup, behavior, or environment requirements changed.
