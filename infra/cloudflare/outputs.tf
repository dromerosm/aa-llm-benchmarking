output "managed_waf_ruleset_id" {
  description = "Zone-level managed WAF entrypoint ruleset ID."
  value       = cloudflare_ruleset.managed_waf_zone_entrypoint.id
}

output "api_rate_limit_ruleset_id" {
  description = "Zone-level rate limiting entrypoint ruleset ID."
  value       = cloudflare_ruleset.api_rate_limit_zone_entrypoint.id
}
