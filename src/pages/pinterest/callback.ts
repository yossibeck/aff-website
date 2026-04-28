import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getCookieValue } from '../../lib/session';
import { updatePinterestTokens } from '../../lib/db';

const REDIRECT_URI = 'https://aurastclaire.com/pinterest/callback';
const TOKEN_URL = 'https://api.pinterest.com/v5/oauth/token';

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
  const expectedState = getCookieValue(request, 'pint_state');
  const clearStateCookie = 'pint_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';

  if (!code || !state || !expectedState || state !== expectedState) {
    return new Response('Invalid OAuth state or missing code.', {
      status: 400,
      headers: { 'Set-Cookie': clearStateCookie },
    });
  }

  // Exchange code for tokens
  const basicAuth = btoa(`${env.PINTEREST_APP_ID}:${env.PINTEREST_APP_SECRET}`);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
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
