import { defineMiddleware } from 'astro:middleware';
import { getTenant } from './lib/db';

const DEFAULT_TENANT = { id: 1, slug: 'aura', name: 'Aura St. Claire', domain: 'lp.aurastclaire.com' };

export const onRequest = defineMiddleware(async (context, next) => {
  const db = context.locals.runtime.env.DB;
  const hostname = context.request.headers.get('host') ?? 'localhost';
  try {
    context.locals.tenant = await getTenant(db, hostname);
  } catch {
    context.locals.tenant = DEFAULT_TENANT;
  }
  return next();
});
