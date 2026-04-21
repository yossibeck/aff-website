import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { getTenant } from './lib/db';
import { resolveSc } from './lib/tracking';

const DEFAULT_TENANT = { id: 1, slug: 'aura', name: 'Aura St. Claire', domain: 'lp.aurastclaire.com' };

function getSubdomainSc(hostname: string): { sc: string; mainHost: string } | null {
  const match = hostname.match(/^(ig|tt|x|pin)\.(.+)$/);
  if (!match) return null;
  return { sc: match[1], mainHost: match[2] };
}

export const onRequest = defineMiddleware(async (context, next) => {
  const hostname = (context.request.headers.get('host') ?? 'localhost').split(':')[0];

  // Subdomain source tracking: ig.domain.com → domain.com/?sc=ig
  const sub = getSubdomainSc(hostname);
  if (sub) {
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
