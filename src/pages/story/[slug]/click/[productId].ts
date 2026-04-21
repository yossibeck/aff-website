import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getProductAffiliateUrl } from '../../../../lib/db';
import { trackClick } from '../../../../lib/tracking';

export const GET: APIRoute = async (context) => {
  const { slug, productId } = context.params as { slug: string; productId: string };
  const db = env.DB;
  const { tenant, sc, runtime } = context.locals;

  const affiliateUrl = await getProductAffiliateUrl(db, productId, tenant.id);
  if (!affiliateUrl) {
    return context.redirect(`/story/${slug}`, 302);
  }

  await trackClick(db, runtime.ctx, {
    tenantId: tenant.id,
    productId,
    storySlug: slug,
    sc,
    request: context.request,
  });

  return context.redirect(affiliateUrl, 302);
};
