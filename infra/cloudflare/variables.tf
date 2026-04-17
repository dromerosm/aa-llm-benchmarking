variable "cloudflare_api_token" {
  description = "Cloudflare API token with permissions to manage rulesets for the target zone."
  type        = string
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for the deployed application."
  type        = string
}

variable "cloudflare_managed_ruleset_id" {
  description = "Cloudflare Managed Ruleset ID. Default from Cloudflare docs."
  type        = string
  default     = "efb7b8c949ac4650a09736fc376e9aee"
}

variable "cloudflare_owasp_core_ruleset_id" {
  description = "Cloudflare OWASP Core Ruleset ID. Default from Cloudflare docs."
  type        = string
  default     = "4814384a9e5d4991b9815dcfc25d2f1f"
}

variable "enable_cloudflare_managed_ruleset" {
  description = "Whether to deploy the Cloudflare Managed Ruleset."
  type        = bool
  default     = true
}

variable "enable_owasp_core_ruleset" {
  description = "Whether to deploy the Cloudflare OWASP Core Ruleset."
  type        = bool
  default     = true
}

variable "owasp_score_threshold" {
  description = "OWASP score threshold used by the terminal OWASP scoring rule."
  type        = number
  default     = 60
}

variable "owasp_terminal_action" {
  description = "Action for the OWASP terminal scoring rule."
  type        = string
  default     = "managed_challenge"
}

variable "api_rate_limit_expression" {
  description = "Cloudflare expression selecting the API route to protect."
  type        = string
  default     = "(http.request.uri.path matches \"^/api/models/?$\") and (http.request.method in {\"GET\" \"HEAD\"})"
}

variable "api_rate_limit_requests_per_period" {
  description = "Allowed requests per period before mitigation is triggered."
  type        = number
  default     = 120
}

variable "api_rate_limit_period" {
  description = "Rate limit period in seconds. Cloudflare supports 10 or 60."
  type        = number
  default     = 60
}

variable "api_rate_limit_mitigation_timeout" {
  description = "How long Cloudflare mitigates after a client exceeds the threshold."
  type        = number
  default     = 600
}

variable "api_rate_limit_action" {
  description = "Action to apply when the rate limit is exceeded."
  type        = string
  default     = "block"
}
