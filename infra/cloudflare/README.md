# Cloudflare Security Rules

This directory implements the production deployment recommendations from the project `SECURITY.md`:

1. Enable Cloudflare managed WAF rules
2. Apply rate limiting to `/api/models`

It uses Terraform and the official `cloudflare_ruleset` resources for zone-level deployment.

## What It Creates

- A zone-level `http_request_firewall_managed` ruleset entrypoint
  - Cloudflare Managed Ruleset
  - Cloudflare OWASP Core Ruleset
- A zone-level `http_ratelimit` ruleset entrypoint
  - rate limiting for `GET` and `HEAD` requests to `/api/models`
  - JSON `429` response when the threshold is exceeded

## Requirements

- Terraform `>= 1.6.0`
- Cloudflare API token with ruleset management permissions
- Cloudflare zone ID

## Important Cloudflare Constraint

Cloudflare documents that Terraform assumes control over the relevant zone/account rulesets. If you already manage WAF or rate limiting rules in the target zone, import the existing rulesets before applying these files, or reconcile them into a single Terraform-managed configuration.

## Usage

Copy the example variables file:

```bash
cp terraform.tfvars.example terraform.tfvars
```

Edit:

- `cloudflare_api_token`
- `cloudflare_zone_id`

Initialize and review:

```bash
terraform init
terraform plan
```

Apply:

```bash
terraform apply
```

## Defaults

- `/api/models` is limited to `120` requests per `60` seconds
- mitigation timeout is `600` seconds
- OWASP runs in a safer profile by disabling paranoia levels 3 and 4
- OWASP terminal action is `managed_challenge`
- OWASP score threshold is `60`

## Plan Compatibility

According to Cloudflare’s WAF availability documentation:

- `Cloudflare Managed Ruleset` and `Cloudflare OWASP Core Ruleset` require a paid plan
- Free plans only have access to the Cloudflare Free Managed Ruleset

If you are deploying on a Free plan, do not apply the defaults unchanged. Replace the managed ruleset selection with one supported by your plan before `terraform apply`.
