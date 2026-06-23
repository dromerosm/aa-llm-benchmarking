# Contributing

Thanks for your interest in improving AA LLM Benchmarking. This is a small
Cloudflare Workers project, so the workflow is intentionally lightweight.

## Conventions

Repository conventions for both humans and coding agents are documented in
[AGENTS.md](AGENTS.md). In short:

- Use English for all code, comments, copy, and documentation.
- Target Cloudflare Workers and prefer web-standard APIs (`fetch`, `Request`, `Response`).
- Avoid heavy frameworks and new runtime dependencies without a clear justification.
- Preserve visible attribution to Artificial Analysis in the UI and docs.

## Local setup

```bash
npm ci
cp .dev.vars.example .dev.vars   # then add your API_KEY_AA
npm run dev
```

See the [README](README.md#local-development) for the full local development and
validation steps.

## Before opening a pull request

1. Make sure both Workers still build:

   ```bash
   npx wrangler deploy --dry-run -c wrangler.models.jsonc
   npx wrangler deploy --dry-run -c wrangler.jsonc
   ```

2. Verify the public routes locally:

   - `/`, `/evolution`, `/speech-image-video` return `200`
   - `/api/models` returns `404`

3. Keep changes surgical and scoped to the task. Note any tradeoffs or
   follow-ups in the PR description.

## Security

Please do not open public issues for security problems. See
[SECURITY.md](SECURITY.md) for how to report vulnerabilities responsibly.

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE).
