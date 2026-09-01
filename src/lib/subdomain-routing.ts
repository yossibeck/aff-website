// Source-tracking subdomains (ig./tt./x./pin.<domain>) redirect to the main
// domain with ?sc=<platform> set. Pulled out of middleware.ts so it can be
// unit-tested without pulling in the astro:middleware / cloudflare:workers
// runtime modules.

export function getSubdomainSc(hostname: string): { sc: string; mainHost: string } | null {
  const match = hostname.match(/^(ig|tt|x|pin)\.(.+)$/);
  if (!match) return null;
  return { sc: match[1], mainHost: match[2] };
}

// These subdomains only ever legitimately link to shareable content — the
// homepage, the styles/category archive, a story, or a product deep link.
// Query strings (e.g. ?cat=beauty) don't affect this — it's matched against
// pathname only. Any other path (the vast majority of what WordPress/CMS
// scanners probe for) should 404 instead of redirect, so scanner traffic
// never reaches the real site or touches D1.
const SUBDOMAIN_PATH_ALLOWLIST =
  /^\/(styles\/?|story\/[A-Za-z0-9_-]+(\/click\/[A-Za-z0-9_-]+)?|p\/[A-Za-z0-9_-]+)?$/;

export function isAllowedSubdomainPath(pathname: string): boolean {
  return SUBDOMAIN_PATH_ALLOWLIST.test(pathname);
}
