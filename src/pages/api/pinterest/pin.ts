import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getUserById, getStory, updatePinterestTokens } from '../../../lib/db';

const SITE_ORIGIN = 'https://aurastclaire.com';
const API_BASE = 'https://api.pinterest.com';
const PINS_URL = `${API_BASE}/v5/pins`;
const TOKEN_URL = `${API_BASE}/v5/oauth/token`;

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
      scope: 'pins:read pins:write boards:read boards:write',
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

  const storyUrl = `${SITE_ORIGIN}/story/${slug}`;
  const boardId = userRow.pinterest_board_id;

  // Refresh token once if needed — reuse for all pins in this request
  let accessToken = userRow.pinterest_access_token;
  async function postPin(payload: object): Promise<Response> {
    let res = await createPin(accessToken, payload);
    if (res.status === 401 && userRow!.pinterest_refresh_token) {
      const refreshed = await refreshTokens(userRow!.pinterest_refresh_token);
      if (refreshed) {
        await updatePinterestTokens(db, userId, tenantId, refreshed.access_token, refreshed.refresh_token);
        accessToken = refreshed.access_token;
        res = await createPin(accessToken, payload);
      }
    }
    return res;
  }

  // Build pin list: hero pin first, then one pin per section that has a pin image
  const pins: { imageUrl: string; title: string; description: string }[] = [];

  if (story.social_img) {
    pins.push({
      imageUrl: story.social_img,
      title: story.social_title ?? story.article_title ?? slug,
      description: story.intro_text ?? '',
    });
  }

  for (const section of story.sections) {
    if (section.section_pin_url) {
      pins.push({
        imageUrl: section.section_pin_url,
        title: section.mini_title ?? story.social_title ?? slug,
        description: section.story_text?.slice(0, 500) ?? '',
      });
    }
  }

  if (pins.length === 0) {
    return json()({ error: 'No pin images available for this story' }, 422);
  }

  const results: { ok: boolean; title: string }[] = [];
  for (const pin of pins) {
    const payload = {
      board_id: boardId,
      title: pin.title,
      description: pin.description,
      link: storyUrl,
      media_source: {
        source_type: 'image_url',
        url: absoluteImageUrl(pin.imageUrl),
      },
    };
    const res = await postPin(payload);
    if (!res.ok) {
      const text = await res.text();
      console.error(`Pinterest pin failed [${pin.title}]:`, text);
    }
    results.push({ ok: res.ok, title: pin.title });
  }

  const failed = results.filter(r => !r.ok);
  if (failed.length === results.length) {
    return json()({ error: 'All pins failed. Please try again.' }, 502);
  }

  return json()({ success: true, pinned: results.length - failed.length, failed: failed.length });
};
