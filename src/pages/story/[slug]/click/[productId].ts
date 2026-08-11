import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getProductAffiliateUrl } from '../../../../lib/db';
import { trackClick } from '../../../../lib/tracking';

const BOT_UA_RE = /claudebot|jscrawler|bot|crawler|spider|scrapy|python-requests|iPhone OS 13_2_3/i;

export const GET: APIRoute = async (context) => {
  const { slug, productId } = context.params as { slug: string; productId: string };
  const db = env.DB;
  const { tenant, sc } = context.locals;

  const affiliateUrl = await getProductAffiliateUrl(db, productId, tenant.id);
  if (!affiliateUrl) {
    return context.redirect(`/story/${slug}`, 302);
  }

  const ua = context.request.headers.get('user-agent') ?? '';
  const isBot = BOT_UA_RE.test(ua);

  const clickId = isBot ? null : await trackClick(db, {
    tenantId: tenant.id,
    productId,
    storySlug: slug,
    sc,
    request: context.request,
  });

  const destination = new URL(affiliateUrl);
  if (clickId !== null) {
    destination.searchParams.set('dp', `clickid:${clickId}`);
  }

  return context.redirect(destination.toString(), 302);
};
