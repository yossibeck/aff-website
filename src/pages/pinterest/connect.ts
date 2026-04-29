import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const GET: APIRoute = ({ locals, request }) => {
  if (!locals.user) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/login?next=/pinterest/connect' },
    });
  }

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/pinterest/callback`;
  const isHttps = origin.startsWith('https://');

  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: env.PINTEREST_APP_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'pins:read pins:write boards:read boards:write',
    state,
  });

  const securePart = isHttps ? '; Secure' : '';
  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://www.pinterest.com/oauth/?${params.toString()}`,
      'Set-Cookie': `pint_state=${encodeURIComponent(state)}; Path=/; HttpOnly${securePart}; SameSite=Lax; Max-Age=600`,
    },
  });
};
