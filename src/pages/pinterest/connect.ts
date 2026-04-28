import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

const REDIRECT_URI = 'https://aurastclaire.com/pinterest/callback';

export const GET: APIRoute = ({ locals }) => {
  if (!locals.user) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/login?next=/pinterest/connect' },
    });
  }

  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: env.PINTEREST_APP_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'pins:write,boards:read',
    state,
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://www.pinterest.com/oauth/?${params.toString()}`,
      'Set-Cookie': `pint_state=${encodeURIComponent(state)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
};
