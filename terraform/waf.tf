# Block WordPress bot probes hitting wp-* paths, xmlrpc.php, and any subdirectory
# probe under the social redirect paths (/ig/, /tt/, /x/, /pin/).
#
# Real users only ever hit the exact redirect paths (/ig, /tt, /x, /pin).
# Anything deeper (e.g. /ig/wp-includes/..., /x/robots.txt) is always a bot probe.
#
# Exclusions:
#   - Social subdomains: ig/tt/x/pin.aurastclaire.com (legit traffic sources)
#   - Social referrers: Instagram, TikTok, Twitter/X, Pinterest
#
# Note: The exact path carve-out (/ig /tt /x /pin) is no longer needed because
# starts_with uses a trailing slash — /ig alone never matches starts_with("/ig/").
#
# aurastclaire.com and www are intentionally NOT excluded — bots hit those directly.

resource "cloudflare_ruleset" "block_wp_bots" {
  zone_id     = var.zone_id
  name        = "Block WordPress bot probes"
  description = "Drop wp- paths, xmlrpc.php, and subdirectory probes under social redirect paths"
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  rules {
    action      = "block"
    description = "Block wp-* probes, xmlrpc.php, and subdirectory probes under /ig/ /tt/ /x/ /pin/"
    enabled     = true

    expression = "(http.request.uri.path contains \"wp-\" or http.request.uri.path contains \"xmlrpc.php\" or starts_with(http.request.uri.path, \"/ig/\") or starts_with(http.request.uri.path, \"/tt/\") or starts_with(http.request.uri.path, \"/x/\") or starts_with(http.request.uri.path, \"/pin/\")) and not (http.host in {\"ig.aurastclaire.com\" \"tt.aurastclaire.com\" \"x.aurastclaire.com\" \"pin.aurastclaire.com\"} or http.referer contains \"instagram.com\" or http.referer contains \"tiktok.com\" or http.referer contains \"twitter.com\" or http.referer contains \"x.com\" or http.referer contains \"pinterest.com\" or http.referer contains \"pinterest.co.uk\" or http.referer contains \"pinterest.fr\" or http.referer contains \"pinterest.de\")"
  }
}
