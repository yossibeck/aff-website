terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token with Zone / Firewall Services / Edit permission"
  type        = string
  sensitive   = true
}

variable "zone_id" {
  description = "Cloudflare zone ID for aurastclaire.com"
  type        = string
  default     = "4e3faad2a8e9dc89b3d2d90f4c6a4557"
}
