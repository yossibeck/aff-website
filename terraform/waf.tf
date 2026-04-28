# Block WordPress bot probes hitting wp-* paths and xmlrpc.php.
#
# Exclusions:
#   - Social subdomains: ig/tt/x/pin.aurastclaire.com (legit traffic sources)
#   - Social referrers: Instagram, TikTok, Twitter/X, Pinterest
#   - Direct /ig /tt /x /pin path hits (middleware carve-out)
#
# aurastclaire.com and www are intentionally NOT excluded — bots hit those directly.

resource "cloudflare_ruleset" "block_wp_bots" {
  zone_id     = var.zone_id
  name        = "Block WordPress bot probes"
  description = "Drop requests targeting wp- paths and xmlrpc.php, with carve-outs for social traffic"
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  rules {
    action      = "block"
    description = "Block wp-* and xmlrpc.php bot probes"
    enabled     = true

    expression = "(http.request.uri.path contains \"wp-\" or http.request.uri.path contains \"xmlrpc.php\") and not (http.host in {\"ig.aurastclaire.com\" \"tt.aurastclaire.com\" \"x.aurastclaire.com\" \"pin.aurastclaire.com\"} or http.request.uri.path in {\"/ig\" \"/tt\" \"/x\" \"/pin\"} or http.referer contains \"instagram.com\" or http.referer contains \"tiktok.com\" or http.referer contains \"twitter.com\" or http.referer contains \"x.com\" or http.referer contains \"pinterest.com\" or http.referer contains \"pinterest.co.uk\" or http.referer contains \"pinterest.fr\" or http.referer contains \"pinterest.de\")"
  }
}
