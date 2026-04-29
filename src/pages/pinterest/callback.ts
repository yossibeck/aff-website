import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getCookieValue } from '../../lib/session';
import { updatePinterestTokens } from '../../lib/db';

const API_BASE = 'https://api-sandbox.pinterest.com';
const TOKEN_URL = `${API_BASE}/v5/oauth/token`;

export const GET: APIRoute = async ({ locals, request }) => {
  if (!locals.user) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/login?next=/pinterest/connect' },
    });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const pinterestError = url.searchParams.get('error');
  const expectedState = getCookieValue(request, 'pint_state');
  const isHttps = url.protocol === 'https:';
  const securePart = isHttps ? '; Secure' : '';
  const clearStateCookie = `pint_state=; Path=/; HttpOnly${securePart}; SameSite=Lax; Max-Age=0`;

  // Pinterest returned an error (e.g. user denied access)
  if (pinterestError) {
    console.error('[pinterest/callback] Pinterest error:', pinterestError, url.searchParams.get('error_description'));
    return new Response(null, {
      status: 302,
      headers: {
        Location: `/pinterest/connect?error=${encodeURIComponent(pinterestError)}`,
        'Set-Cookie': clearStateCookie,
      },
    });
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    console.error('[pinterest/callback] state mismatch or missing code', {
      hasCode: !!code,
      hasState: !!state,
      hasExpectedState: !!expectedState,
      stateMatch: state === expectedState,
    });
    return new Response('Invalid OAuth state or missing code.', {
      status: 400,
      headers: { 'Set-Cookie': clearStateCookie },
    });
  }

  const redirectUri = `${url.origin}/pinterest/callback`;

  // Exchange code for tokens
  const basicAuth = btoa(`${env.PINTEREST_APP_ID}:${env.PINTEREST_APP_SECRET}`);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    console.error('Pinterest token exchange failed:', text);
    return new Response(null, {
      status: 302,
      headers: {
        Location: '/pinterest/connect?error=token_exchange_failed',
        'Set-Cookie': clearStateCookie,
      },
    });
  }

  const tokens = await tokenRes.json<{ access_token: string; refresh_token: string }>();
  const db = env.DB;
  await updatePinterestTokens(db, locals.user.id, locals.user.tenantId, tokens.access_token, tokens.refresh_token);

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/pinterest/boards',
      'Set-Cookie': clearStateCookie,
    },
  });
};
