import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { getTenant } from './lib/db';
import { resolveSc } from './lib/tracking';
import { getSessionFromRequest, verifySession } from './lib/session';
import { getSubdomainSc, isAllowedSubdomainPath } from './lib/subdomain-routing';

const DEFAULT_TENANT = { id: 1, slug: 'aura', name: 'Aura St. Claire', domain: 'lp.aurastclaire.com' };

// Paths probed by WordPress scanners and other bots — return 404 immediately.
const BLOCKED_PATH_PATTERNS = [
  '/wp-includes/',
  '/wp-content/',
  '/wp-admin/',
  '/xmlrpc.php',
  '/wp-login.php',
  '/wp-cron.php',
  '/wp-config.php',
  '/.env',
  '/.git/',
  '/feed/',
];

function isBlockedPath(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return BLOCKED_PATH_PATTERNS.some((p) => lower.includes(p));
}

export const onRequest = defineMiddleware(async (context, next) => {
  const hostname = (context.request.headers.get('host') ?? 'localhost').split(':')[0];
  const pathname = new URL(context.request.url).pathname;

  // Block WordPress/CMS scanners and common bot probes immediately.
  if (isBlockedPath(pathname)) {
    return new Response(null, { status: 404 });
  }

  // www → apex redirect
  if (hostname.startsWith('www.')) {
    const redirectUrl = new URL(context.request.url);
    redirectUrl.hostname = hostname.slice(4);
    return Response.redirect(redirectUrl.toString(), 301);
  }

  // Subdomain source tracking: ig.domain.com → domain.com/?sc=ig
  const sub = getSubdomainSc(hostname);
  if (sub) {
    if (!isAllowedSubdomainPath(pathname)) {
      return new Response(null, { status: 404 });
    }
    const redirectUrl = new URL(context.request.url);
    redirectUrl.hostname = sub.mainHost;
    redirectUrl.searchParams.set('sc', sub.sc);
    return Response.redirect(redirectUrl.toString(), 302);
  }

  // Resolve source channel (param → cookie → referer)
  const sc = resolveSc(context.request);
  context.locals.sc = sc;

  const db = env.DB;
  try {
    context.locals.tenant = await getTenant(db, hostname);
  } catch {
    context.locals.tenant = DEFAULT_TENANT;
  }

  // Resolve session cookie → locals.user
  const sessionToken = getSessionFromRequest(context.request);
  if (sessionToken && env.SESSION_SECRET) {
    const payload = await verifySession(sessionToken, env.SESSION_SECRET);
    context.locals.user = payload ? { id: payload.userId, tenantId: payload.tenantId } : null;
  } else {
    context.locals.user = null;
  }

  const response = await next();

  // Set aff_sc cookie if sc resolved and not already in cookie
  if (sc) {
    const existingCookie = context.request.headers.get('cookie') ?? '';
    if (!existingCookie.includes('aff_sc=')) {
      response.headers.append(
        'Set-Cookie',
        `aff_sc=${encodeURIComponent(sc)}; Path=/; Max-Age=1800; SameSite=Lax`
      );
    }
  }

  return response;
});
