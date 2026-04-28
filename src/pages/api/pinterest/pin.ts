import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getUserById, getStory, updatePinterestTokens } from '../../../lib/db';

const SITE_ORIGIN = 'https://aurastclaire.com';
const PINS_URL = 'https://api.pinterest.com/v5/pins';
const TOKEN_URL = 'https://api.pinterest.com/v5/oauth/token';

async function refreshTokens(refreshToken: string): Promise<{ access_token: string; refresh_token: string } | null> {
  const basicAuth = btoa(`${env.PINTEREST_APP_ID}:${env.PINTEREST_APP_SECRET}`);
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: 'pins:write,boards:read',
    }).toString(),
  });
  if (!res.ok) return null;
  return res.json();
}

function absoluteImageUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${SITE_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
}

async function createPin(accessToken: string, payload: object): Promise<Response> {
  return fetch(PINS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export const POST: APIRoute = async ({ locals, request }) => {
  const json = () => (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  if (!locals.user) {
    return json()({ error: 'Not authenticated' }, 401);
  }

  let slug: string;
  try {
    const body = await request.json<{ slug: string }>();
    slug = body.slug;
  } catch {
    return json()({ error: 'Invalid request body' }, 400);
  }

  if (!slug) {
    return json()({ error: 'Missing slug' }, 400);
  }

  const db = env.DB;
  const { id: userId, tenantId } = locals.user;

  const [userRow, story] = await Promise.all([
    getUserById(db, userId, tenantId),
    getStory(db, tenantId, slug),
  ]);

  if (!userRow) return json()({ error: 'User not found' }, 404);
  if (!story) return json()({ error: 'Story not found' }, 404);

  if (!userRow.pinterest_access_token) {
    return json()({ error: 'Pinterest not connected', redirect: '/pinterest/connect' }, 403);
  }
  if (!userRow.pinterest_board_id) {
    return json()({ error: 'No Pinterest board selected', redirect: '/pinterest/boards' }, 403);
  }

  const pinPayload = {
    board_id: userRow.pinterest_board_id,
    title: story.social_title,
    description: story.intro_text ?? '',
    link: `${SITE_ORIGIN}/story/${slug}`,
    media_source: {
      source_type: 'image_url',
      url: absoluteImageUrl(story.social_img),
    },
  };

  let accessToken = userRow.pinterest_access_token;
  let pinRes = await createPin(accessToken, pinPayload);

  // Token expired — attempt refresh once
  if (pinRes.status === 401 && userRow.pinterest_refresh_token) {
    const refreshed = await refreshTokens(userRow.pinterest_refresh_token);
    if (refreshed) {
      await updatePinterestTokens(db, userId, tenantId, refreshed.access_token, refreshed.refresh_token);
      accessToken = refreshed.access_token;
      pinRes = await createPin(accessToken, pinPayload);
    }
  }

  if (!pinRes.ok) {
    const text = await pinRes.text();
    console.error('Pinterest pin creation failed:', text);
    return json()({ error: 'Pinterest API error. Please try again.' }, 502);
  }

  return json()({ success: true });
};
