# Click & View Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add story/product click tracking, page view tracking, Microsoft Clarity, and subdomain `?sc=` attribution to aff-website using the shared `aff-story-db` D1 database.

**Architecture:** Middleware handles subdomain redirects, sc resolution, and cookie writing. A new `src/lib/tracking.ts` module provides `trackPageView` / `trackClick` helpers (using `ctx.waitUntil` so they never block responses). Pages call `trackPageView` in their frontmatter; a new API route `/story/[slug]/click/[productId]` logs product clicks then redirects to the affiliate URL.

**Tech Stack:** Astro SSR, Cloudflare Workers runtime, D1 (shared `aff-story-db`), Vitest

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `migrations/001-add-story-slug.sql` | Create | DDL — adds `story_slug` to both log tables |
| `src/env.d.ts` | Modify | Add `sc` to `App.Locals`, `CLARITY_ID` to `Env` |
| `src/lib/tracking.ts` | Create | `hashIp`, `normalizeReferer`, `getCookieSc`, `resolveSc`, `trackPageView`, `trackClick` |
| `src/lib/tracking.test.ts` | Create | Unit tests for all pure functions |
| `src/lib/db.ts` | Modify | Add `getProductAffiliateUrl` |
| `src/lib/db.test.ts` | Modify | Tests for `getProductAffiliateUrl` |
| `src/middleware.ts` | Modify | Subdomain redirect, sc resolution, cookie set |
| `src/pages/index.astro` | Modify | Call `trackPageView` |
| `src/pages/styles.astro` | Modify | Call `trackPageView` |
| `src/pages/story/[slug].astro` | Modify | Call `trackPageView`, update product links to click route |
| `src/pages/story/[slug]/click/[productId].ts` | Create | Log click → redirect to affiliate URL |
| `src/layouts/Base.astro` | Modify | Inject Clarity script when `CLARITY_ID` is set |
| `wrangler.toml` | Modify | Add ig/tt/x/pin subdomain routes |

---

## Task 1: DB Migration

**Files:**
- Create: `migrations/001-add-story-slug.sql`

- [ ] **Step 1: Create migration file**

Create `migrations/001-add-story-slug.sql`:

```sql
-- Add story_slug to page_view_log and click_log
-- Safe to run against shared aff-story-db — both columns are nullable

ALTER TABLE page_view_log ADD COLUMN story_slug TEXT;
ALTER TABLE click_log     ADD COLUMN story_slug TEXT;

CREATE INDEX IF NOT EXISTS idx_page_view_log_story ON page_view_log (story_slug);
CREATE INDEX IF NOT EXISTS idx_click_log_story     ON click_log     (story_slug);
```

- [ ] **Step 2: Run migration against remote DB**

```bash
npx wrangler d1 execute aff-story-db --remote --file=migrations/001-add-story-slug.sql
```

Expected output: `✅ Done` (no errors). If you see "duplicate column name", the migration already ran — that's fine.

- [ ] **Step 3: Commit**

```bash
git add migrations/001-add-story-slug.sql
git commit -m "chore: add story_slug columns to click/view log tables"
```

---

## Task 2: Update Type Declarations

**Files:**
- Modify: `src/env.d.ts`

- [ ] **Step 1: Add `CLARITY_ID` to Env and `sc` to App.Locals**

Replace the contents of `src/env.d.ts` with:

```typescript
/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

declare module 'cloudflare:workers' {
  interface Env {
    DB: D1Database;
    CLARITY_ID?: string;
  }
  export const env: Env;
}

declare namespace App {
  interface Locals {
    tenant: import('./lib/db').Tenant;
    sc: string | null;
    runtime: {
      cf?: Request['cf'];
      ctx: ExecutionContext;
    };
  }
}
```

- [ ] **Step 2: Verify TypeScript is happy**

```bash
npx astro check 2>&1 | tail -5
```

Expected: `Found 0 errors` (or only pre-existing errors unrelated to this change).

- [ ] **Step 3: Commit**

```bash
git add src/env.d.ts
git commit -m "chore: add CLARITY_ID to Env and sc to App.Locals"
```

---

## Task 3: Tracking Helper

**Files:**
- Create: `src/lib/tracking.ts`
- Create: `src/lib/tracking.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/tracking.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import {
  hashIp,
  normalizeReferer,
  getCookieSc,
  resolveSc,
  trackPageView,
  trackClick,
} from './tracking';

describe('hashIp', () => {
  it('returns a 16-char lowercase hex string', async () => {
    const hash = await hashIp('1.2.3.4');
    expect(hash).toHaveLength(16);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('is deterministic', async () => {
    expect(await hashIp('1.2.3.4')).toBe(await hashIp('1.2.3.4'));
  });

  it('differs for different IPs', async () => {
    expect(await hashIp('1.2.3.4')).not.toBe(await hashIp('5.6.7.8'));
  });

  it('handles empty string', async () => {
    const hash = await hashIp('');
    expect(hash).toHaveLength(16);
  });
});

describe('normalizeReferer', () => {
  it('returns ig for instagram.com', () => {
    expect(normalizeReferer('https://www.instagram.com/reel/abc')).toBe('ig');
  });
  it('returns ig for l.instagram.com', () => {
    expect(normalizeReferer('https://l.instagram.com/?u=...')).toBe('ig');
  });
  it('returns tt for tiktok.com', () => {
    expect(normalizeReferer('https://www.tiktok.com/@user')).toBe('tt');
  });
  it('returns x for twitter.com', () => {
    expect(normalizeReferer('https://twitter.com/i/web')).toBe('x');
  });
  it('returns x for x.com', () => {
    expect(normalizeReferer('https://x.com/home')).toBe('x');
  });
  it('returns pin for pinterest.com', () => {
    expect(normalizeReferer('https://pinterest.com/pin/123')).toBe('pin');
  });
  it('returns null for unknown referer', () => {
    expect(normalizeReferer('https://google.com')).toBeNull();
  });
  it('returns null for empty string', () => {
    expect(normalizeReferer('')).toBeNull();
  });
});

describe('getCookieSc', () => {
  it('extracts aff_sc cookie', () => {
    expect(getCookieSc('aff_sc=ig; other=val')).toBe('ig');
  });
  it('extracts when cookie is last', () => {
    expect(getCookieSc('other=val; aff_sc=tt')).toBe('tt');
  });
  it('decodes URI components', () => {
    expect(getCookieSc('aff_sc=some%20value')).toBe('some value');
  });
  it('returns null when cookie absent', () => {
    expect(getCookieSc('other=val')).toBeNull();
  });
  it('returns null for empty string', () => {
    expect(getCookieSc('')).toBeNull();
  });
});

describe('resolveSc', () => {
  function makeRequest(url: string, headers: Record<string, string> = {}): Request {
    return new Request(url, { headers });
  }

  it('prefers ?sc= query param', () => {
    const req = makeRequest('https://aurastclaire.com/?sc=ig', { cookie: 'aff_sc=tt' });
    expect(resolveSc(req)).toBe('ig');
  });

  it('falls back to cookie when no query param', () => {
    const req = makeRequest('https://aurastclaire.com/', { cookie: 'aff_sc=tt' });
    expect(resolveSc(req)).toBe('tt');
  });

  it('falls back to referer when no param or cookie', () => {
    const req = makeRequest('https://aurastclaire.com/', { referer: 'https://www.instagram.com/' });
    expect(resolveSc(req)).toBe('ig');
  });

  it('returns null when no source found', () => {
    const req = makeRequest('https://aurastclaire.com/');
    expect(resolveSc(req)).toBeNull();
  });
});

describe('trackPageView', () => {
  it('calls ctx.waitUntil with a promise', async () => {
    const mockRun = vi.fn().mockResolvedValue({});
    const mockDb = {
      prepare: () => ({ bind: () => ({ run: mockRun }) }),
    } as unknown as D1Database;
    const waitUntil = vi.fn();
    const mockCtx = { waitUntil } as unknown as ExecutionContext;

    await trackPageView(mockDb, mockCtx, {
      tenantId: 1,
      storySlug: 'morning-glow',
      sc: 'ig',
      request: new Request('https://aurastclaire.com/story/morning-glow'),
    });

    expect(waitUntil).toHaveBeenCalledOnce();
  });
});

describe('trackClick', () => {
  it('calls ctx.waitUntil with a promise', async () => {
    const mockRun = vi.fn().mockResolvedValue({});
    const mockDb = {
      prepare: () => ({ bind: () => ({ run: mockRun }) }),
    } as unknown as D1Database;
    const waitUntil = vi.fn();
    const mockCtx = { waitUntil } as unknown as ExecutionContext;

    await trackClick(mockDb, mockCtx, {
      tenantId: 1,
      productId: 'ali_123',
      storySlug: 'morning-glow',
      sc: 'ig',
      request: new Request('https://aurastclaire.com/story/morning-glow/click/ali_123'),
    });

    expect(waitUntil).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- tracking.test.ts
```

Expected: multiple failures with "Cannot find module './tracking'" or similar.

- [ ] **Step 3: Create `src/lib/tracking.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- tracking.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tracking.ts src/lib/tracking.test.ts
git commit -m "feat: add tracking helper (hashIp, resolveSc, trackPageView, trackClick)"
```

---

## Task 4: Add `getProductAffiliateUrl` to db.ts

**Files:**
- Modify: `src/lib/db.ts`
- Modify: `src/lib/db.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/lib/db.test.ts`:

```typescript
import { getProductAffiliateUrl } from './db';

describe('getProductAffiliateUrl', () => {
  it('returns affiliate_url when product exists', async () => {
    const mockDb = {
      prepare: () => ({
        bind: () => ({
          first: async () => ({ affiliate_url: 'https://aff.link/123' }),
        }),
      }),
    } as unknown as D1Database;
    const result = await getProductAffiliateUrl(mockDb, 'ali_123', 1);
    expect(result).toBe('https://aff.link/123');
  });

  it('returns null when product not found', async () => {
    const mockDb = {
      prepare: () => ({
        bind: () => ({
          first: async () => null,
        }),
      }),
    } as unknown as D1Database;
    const result = await getProductAffiliateUrl(mockDb, 'missing', 1);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- db.test.ts
```

Expected: `getProductAffiliateUrl is not a function` or import error.

- [ ] **Step 3: Add `getProductAffiliateUrl` to `src/lib/db.ts`**

Append to the end of `src/lib/db.ts`:

```typescript
export async function getProductAffiliateUrl(
  db: D1Database,
  productId: string,
  tenantId: number
): Promise<string | null> {
  const row = await db
    .prepare(
      "SELECT affiliate_url FROM products WHERE product_id = ? AND tenant_id = ? AND status = 'published'"
    )
    .bind(productId, tenantId)
    .first<{ affiliate_url: string }>();
  return row?.affiliate_url ?? null;
}
```

- [ ] **Step 4: Run all tests to confirm they pass**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts src/lib/db.test.ts
git commit -m "feat: add getProductAffiliateUrl to db helpers"
```

---

## Task 5: Update Middleware

**Files:**
- Modify: `src/middleware.ts`

- [ ] **Step 1: Replace `src/middleware.ts` with the updated version**

```typescript
import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { getTenant } from './lib/db';
import { resolveSc } from './lib/tracking';

const DEFAULT_TENANT = { id: 1, slug: 'aura', name: 'Aura St. Claire', domain: 'lp.aurastclaire.com' };

function getSubdomainSc(hostname: string): { sc: string; mainHost: string } | null {
  const match = hostname.match(/^(ig|tt|x|pin)\.(.+)$/);
  if (!match) return null;
  return { sc: match[1], mainHost: match[2] };
}

export const onRequest = defineMiddleware(async (context, next) => {
  const hostname = (context.request.headers.get('host') ?? 'localhost').split(':')[0];

  // Subdomain source tracking: ig.domain.com → domain.com/?sc=ig
  const sub = getSubdomainSc(hostname);
  if (sub) {
    const redirectUrl = new URL(context.request.url);
    redirectUrl.hostname = sub.mainHost;
    redirectUrl.searchParams.set('sc', sub.sc);
    return Response.redirect(redirectUrl.toString(), 302);
  }

  // Resolve source channel (param → cookie → referer)
  const sc = resolveSc(context.request);
  context.locals.sc = sc;

  const db = env.DB;
  try {
    context.locals.tenant = await getTenant(db, hostname);
  } catch {
    context.locals.tenant = DEFAULT_TENANT;
  }

  const response = await next();

  // Set aff_sc cookie if sc resolved and not already in cookie
  if (sc) {
    const existingCookie = context.request.headers.get('cookie') ?? '';
    if (!existingCookie.includes('aff_sc=')) {
      response.headers.append(
        'Set-Cookie',
        `aff_sc=${encodeURIComponent(sc)}; Path=/; Max-Age=1800; SameSite=Lax`
      );
    }
  }

  return response;
});
```

- [ ] **Step 2: Verify TypeScript is happy**

```bash
npx astro check 2>&1 | tail -5
```

Expected: `Found 0 errors`.

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: add subdomain sc redirect, sc cookie handling to middleware"
```

---

## Task 6: Page View Tracking in Pages

**Files:**
- Modify: `src/pages/index.astro` (frontmatter only)
- Modify: `src/pages/styles.astro` (frontmatter only)
- Modify: `src/pages/story/[slug].astro` (frontmatter only)

- [ ] **Step 1: Update `src/pages/index.astro` frontmatter**

The current frontmatter starts with:
```
---
import Base from '../layouts/Base.astro';
import { getSiteConfigs, getStories } from '../lib/db';
import { env } from 'cloudflare:workers';

const { tenant } = Astro.locals;
const db = env.DB;
```

Replace it with:
```
---
import Base from '../layouts/Base.astro';
import { getSiteConfigs, getStories } from '../lib/db';
import { trackPageView } from '../lib/tracking';
import { env } from 'cloudflare:workers';

const { tenant, sc, runtime } = Astro.locals;
const db = env.DB;

await trackPageView(db, runtime.ctx, { tenantId: tenant.id, sc, request: Astro.request });
```

- [ ] **Step 2: Update `src/pages/styles.astro` frontmatter**

The current frontmatter starts with:
```
---
import Base from '../layouts/Base.astro';
import { getStories } from '../lib/db';
import { env } from 'cloudflare:workers';

const { tenant } = Astro.locals;
const db = env.DB;
```

Replace it with:
```
---
import Base from '../layouts/Base.astro';
import { getStories } from '../lib/db';
import { trackPageView } from '../lib/tracking';
import { env } from 'cloudflare:workers';

const { tenant, sc, runtime } = Astro.locals;
const db = env.DB;

await trackPageView(db, runtime.ctx, { tenantId: tenant.id, sc, request: Astro.request });
```

- [ ] **Step 3: Update `src/pages/story/[slug].astro` frontmatter**

The current frontmatter:
```
---
import Base from '../../layouts/Base.astro';
import { getStory } from '../../lib/db';
import { env } from 'cloudflare:workers';

const { tenant } = Astro.locals;
const db = env.DB;

const { slug } = Astro.params;
const story = await getStory(db, tenant.id, slug!);

if (!story) {
  return Astro.redirect('/', 302);
}
---
```

Replace with:
```
---
import Base from '../../layouts/Base.astro';
import { getStory } from '../../lib/db';
import { trackPageView } from '../../lib/tracking';
import { env } from 'cloudflare:workers';

const { tenant, sc, runtime } = Astro.locals;
const db = env.DB;

const { slug } = Astro.params;
const story = await getStory(db, tenant.id, slug!);

if (!story) {
  return Astro.redirect('/', 302);
}

await trackPageView(db, runtime.ctx, { tenantId: tenant.id, storySlug: slug, sc, request: Astro.request });
---
```

- [ ] **Step 4: Verify TypeScript is happy**

```bash
npx astro check 2>&1 | tail -5
```

Expected: `Found 0 errors`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/index.astro src/pages/styles.astro src/pages/story/[slug].astro
git commit -m "feat: add page view tracking to index, styles, and story pages"
```

---

## Task 7: Product Click Endpoint + Update Story Links

**Files:**
- Create: `src/pages/story/[slug]/click/[productId].ts`
- Modify: `src/pages/story/[slug].astro` (template links only)

- [ ] **Step 1: Create the click endpoint**

Create `src/pages/story/[slug]/click/[productId].ts`:

```typescript
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
```

- [ ] **Step 2: Update product links in `src/pages/story/[slug].astro`**

Find this block in the template (two `href={section.affiliate_url}` usages):

```astro
              <a
                href={section.affiliate_url}
                target="_blank"
                rel="noopener noreferrer"
                class="mt-12 block overflow-hidden bg-neutral-50"
                tabindex="-1"
                aria-hidden="true"
              >
```

and:

```astro
                <a
                  href={section.affiliate_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="mt-10 inline-flex min-h-[52px] w-full items-center justify-center bg-neutral-900 px-8 py-3 text-center text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-neutral-800 sm:w-auto"
                >
                  Shop the Look
                </a>
```

For both, replace `href={section.affiliate_url}` with:

```astro
href={`/story/${slug}/click/${section.product_id}${sc ? `?sc=${encodeURIComponent(sc)}` : ''}`}
```

Also remove `target="_blank"` and `rel="noopener noreferrer"` from both links (the click route handles the redirect server-side, so these attributes no longer make sense).

- [ ] **Step 3: Verify TypeScript is happy**

```bash
npx astro check 2>&1 | tail -5
```

Expected: `Found 0 errors`.

- [ ] **Step 4: Smoke-test locally**

```bash
npm run dev
```

Open `http://localhost:4321/story/<a-slug>` in a browser. Click "Shop the Look". Verify you get redirected to the affiliate URL (not a 404 or error). Check the terminal for any D1 errors (remote DB is used in dev via `remote: true` in wrangler.toml).

- [ ] **Step 5: Commit**

```bash
git add src/pages/story/[slug]/click/[productId].ts src/pages/story/[slug].astro
git commit -m "feat: add product click endpoint and update story links to track clicks"
```

---

## Task 8: Microsoft Clarity

**Files:**
- Modify: `src/layouts/Base.astro`

- [ ] **Step 1: Add Clarity script to `src/layouts/Base.astro`**

In `src/layouts/Base.astro`, add the import at the top of the frontmatter:

```astro
---
import '../styles/global.css';
import { env } from 'cloudflare:workers';

interface Props {
  title?: string;
  dark?: boolean;
}
const { title = 'Aura St. Claire', dark = false } = Astro.props;
const { tenant } = Astro.locals;
const clarityId = env.CLARITY_ID ?? '';
---
```

Then in `<head>`, just before `<slot name="head" />`, add:

```astro
  {clarityId && (
    <script is:inline define:vars={{ clarityId }}>
      (function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script",clarityId);
    </script>
  )}
  <slot name="head" />
```

- [ ] **Step 2: Verify TypeScript is happy**

```bash
npx astro check 2>&1 | tail -5
```

Expected: `Found 0 errors`.

- [ ] **Step 3: Commit**

```bash
git add src/layouts/Base.astro
git commit -m "feat: inject Clarity analytics script from CLARITY_ID env secret"
```

---

## Task 9: Add Subdomain Routes to wrangler.toml

**Files:**
- Modify: `wrangler.toml`

- [ ] **Step 1: Add subdomain custom domain routes**

Append to `wrangler.toml`:

```toml
# Subdomain source tracking — middleware redirects to main domain + ?sc=<platform>
[[routes]]
pattern = "ig.aurastclaire.com"
custom_domain = true

[[routes]]
pattern = "tt.aurastclaire.com"
custom_domain = true

[[routes]]
pattern = "x.aurastclaire.com"
custom_domain = true

[[routes]]
pattern = "pin.aurastclaire.com"
custom_domain = true
```

- [ ] **Step 2: Commit**

```bash
git add wrangler.toml
git commit -m "chore: add ig/tt/x/pin subdomain custom domain routes"
```

---

## Task 10: Wire CLARITY_ID Secret

- [ ] **Step 1: Set the secret in Cloudflare**

```bash
npx wrangler secret put CLARITY_ID
```

When prompted, paste the Clarity project ID (found in the Microsoft Clarity dashboard under Settings → Setup).

- [ ] **Step 2: Deploy and verify**

```bash
npm run build-deploy:prod
```

After deploy, open the live site and check DevTools → Network for a request to `www.clarity.ms/tag/...`. Verify it loads.

- [ ] **Step 3: Verify click tracking end-to-end**

1. Open the live site via `https://ig.aurastclaire.com` — confirm redirect to `aurastclaire.com/?sc=ig`
2. Open a story page — confirm `aff_sc=ig` cookie is set in DevTools → Application → Cookies
3. Click "Shop the Look" — confirm redirect goes to the affiliate URL (not a 404)
4. In Cloudflare D1 console, run:
   ```sql
   SELECT * FROM click_log ORDER BY clicked_at DESC LIMIT 5;
   ```
   Confirm `story_slug` and `sc` are populated.
5. Run same for `page_view_log`:
   ```sql
   SELECT * FROM page_view_log ORDER BY viewed_at DESC LIMIT 5;
   ```
   Confirm `story_slug` is populated for story views.

---

## Self-Review

**Spec coverage check:**
- ✅ DB migration (Task 1)
- ✅ Story page view tracking (Task 6, `story/[slug].astro`)
- ✅ Homepage + archive view tracking (Task 6, `index.astro` + `styles.astro`)
- ✅ Product affiliate click tracking via server-side redirect (Tasks 7)
- ✅ Microsoft Clarity (Task 8)
- ✅ Subdomain `?sc=` redirect (Task 5 middleware)
- ✅ `sc` cookie set/read (Task 5 middleware)
- ✅ `story_slug` on click_log for story attribution (Task 3 `trackClick`)
- ✅ `env.d.ts` types updated (Task 2)
- ✅ wrangler.toml subdomain routes (Task 9)
- ✅ CLARITY_ID secret wired (Task 10)
