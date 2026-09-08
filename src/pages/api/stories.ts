import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getStoriesPage } from '../../lib/db';

const PAGE_SIZE = 30;
const MAX_LIMIT = 60;

export const GET: APIRoute = async (context) => {
  const { tenant } = context.locals;
  const db = env.DB;
  const url = context.url;

  const category = url.searchParams.get('cat') ?? undefined;
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10) || 0);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(url.searchParams.get('limit') ?? String(PAGE_SIZE), 10) || PAGE_SIZE)
  );

  const { stories, hasMore } = await getStoriesPage(db, tenant.id, { category, limit, offset });

  return new Response(JSON.stringify({ stories, hasMore }), {
    headers: { 'content-type': 'application/json' },
  });
};
