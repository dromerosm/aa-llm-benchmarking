resource "cloudflare_ruleset" "managed_waf_zone_entrypoint" {
  zone_id     = var.cloudflare_zone_id
  name        = "Managed WAF for aa-llm-benchmarking"
  description = "Zone-level managed WAF rules for the Worker deployment"
  kind        = "zone"
  phase       = "http_request_firewall_managed"

  dynamic "rules" {
    for_each = var.enable_cloudflare_managed_ruleset ? [1] : []

    content {
      ref         = "execute_cloudflare_managed_ruleset"
      description = "Execute Cloudflare Managed Ruleset for the whole zone"
      expression  = "true"
      action      = "execute"

      action_parameters {
        id = var.cloudflare_managed_ruleset_id
      }
    }
  }

  dynamic "rules" {
    for_each = var.enable_owasp_core_ruleset ? [1] : []

    content {
      ref         = "execute_cloudflare_owasp_core_ruleset"
      description = "Execute Cloudflare OWASP Core Ruleset for the whole zone"
      expression  = "true"
      action      = "execute"

      action_parameters {
        id = var.cloudflare_owasp_core_ruleset_id

        overrides {
          categories {
            category = "paranoia-level-3"
            enabled  = false
          }

          categories {
            category = "paranoia-level-4"
            enabled  = false
          }

          rules {
            id              = "6179ae15870a4bb7b2d480d4843b323c"
            action          = var.owasp_terminal_action
            score_threshold = var.owasp_score_threshold
          }
        }
      }
    }
  }
}

resource "cloudflare_ruleset" "api_rate_limit_zone_entrypoint" {
  zone_id     = var.cloudflare_zone_id
  name        = "Rate limiting for aa-llm-benchmarking API"
  description = "Zone-level rate limiting for /api/models"
  kind        = "zone"
  phase       = "http_ratelimit"

  rules {
    ref         = "rate_limit_api_models_by_ip"
    description = "Rate limit requests to /api/models by IP and Cloudflare colo"
    expression  = var.api_rate_limit_expression
    action      = var.api_rate_limit_action

    action_parameters {
      response {
        status_code  = 429
        content_type = "application/json"
        content      = jsonencode({ error = "Too many requests" })
      }
    }

    ratelimit {
      characteristics     = ["cf.colo.id", "ip.src"]
      period              = var.api_rate_limit_period
      requests_per_period = var.api_rate_limit_requests_per_period
      mitigation_timeout  = var.api_rate_limit_mitigation_timeout
    }
  }
}
