import { defineMiddleware } from 'astro:middleware';
import { getTenant } from './lib/db';

export const onRequest = defineMiddleware(async (context, next) => {
  const db = context.locals.runtime.env.DB;
  const hostname = context.request.headers.get('host') ?? 'localhost';
  context.locals.tenant = await getTenant(db, hostname);
  return next();
});
