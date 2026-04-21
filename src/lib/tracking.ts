export async function hashIp(ip: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(buf))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function normalizeReferer(referer: string): string | null {
  if (/l?\.?instagram\.com/i.test(referer)) return 'ig';
  if (/tiktok\.com/i.test(referer))         return 'tt';
  if (/twitter\.com|x\.com/i.test(referer)) return 'x';
  if (/pinterest\.com/i.test(referer))      return 'pin';
  return null;
}

export function getCookieSc(cookieHeader: string): string | null {
  const match = cookieHeader.match(/(?:^|;\s*)aff_sc=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function resolveSc(request: Request): string | null {
  const url = new URL(request.url);
  const param = url.searchParams.get('sc');
  if (param) return param;
  const fromCookie = getCookieSc(request.headers.get('cookie') ?? '');
  if (fromCookie) return fromCookie;
  return normalizeReferer(request.headers.get('referer') ?? '');
}

export async function trackPageView(
  db: D1Database,
  ctx: ExecutionContext,
  opts: {
    tenantId: number;
    storySlug?: string | null;
    sc: string | null;
    request: Request;
  }
): Promise<void> {
  const ipHash = await hashIp(
    opts.request.headers.get('cf-connecting-ip') ??
    opts.request.headers.get('x-forwarded-for') ??
    ''
  );
  const ua = (opts.request.headers.get('user-agent') ?? '').slice(0, 200);
  ctx.waitUntil(
    db
      .prepare(
        'INSERT INTO page_view_log (product_id, story_slug, sc, ip_hash, ua, tenant_id) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(null, opts.storySlug ?? null, opts.sc, ipHash, ua, opts.tenantId)
      .run()
      .catch(() => {})
  );
}

export async function trackClick(
  db: D1Database,
  ctx: ExecutionContext,
  opts: {
    tenantId: number;
    productId: string;
    storySlug: string;
    sc: string | null;
    request: Request;
  }
): Promise<void> {
  const ipHash = await hashIp(
    opts.request.headers.get('cf-connecting-ip') ??
    opts.request.headers.get('x-forwarded-for') ??
    ''
  );
  const ua = (opts.request.headers.get('user-agent') ?? '').slice(0, 200);
  ctx.waitUntil(
    db
      .prepare(
        'INSERT INTO click_log (product_id, story_slug, sc, ip_hash, ua, tenant_id) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(opts.productId, opts.storySlug, opts.sc, ipHash, ua, opts.tenantId)
      .run()
      .catch(() => {})
  );
}
