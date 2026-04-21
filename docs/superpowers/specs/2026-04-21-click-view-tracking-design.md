# Click & View Tracking — Design Spec
**Date:** 2026-04-21
**Project:** aff-website (Astro + Cloudflare Workers)
**DB:** Shared `aff-story-db` D1 instance

---

## Goal

Implement the same click/view tracking that exists in `aff-story` into `aff-website`, using the same DB tables and patterns. Additionally add:
- Story page view tracking (distinct from product clicks)
- Product affiliate click tracking via server-side redirect (log → redirect)
- Microsoft Clarity analytics injection
- Subdomain → `?sc=` source attribution (same as aff-story)

---

## 1. DB Migration

Run against the shared `aff-story-db` D1 database:

```sql
ALTER TABLE page_view_log ADD COLUMN story_slug TEXT;
ALTER TABLE click_log     ADD COLUMN story_slug TEXT;

CREATE INDEX IF NOT EXISTS idx_page_view_log_story ON page_view_log (story_slug);
CREATE INDEX IF NOT EXISTS idx_click_log_story     ON click_log     (story_slug);
```

Both columns are nullable — existing aff-story rows are unaffected.

**Analytics interpretation:**
- `story_slug IS NOT NULL` → story page view
- `story_slug IS NULL AND product_id IS NULL` → homepage or archive view
- `product_id IS NOT NULL` in `click_log` → affiliate link click (with `story_slug` = originating story)

---

## 2. Middleware (`src/middleware.ts`)

Three new responsibilities, added before/after the existing tenant lookup:

### 2a. Subdomain redirect (before tenant lookup)
If `host` matches `^(ig|tt|x|pin)\.(.+)$`, redirect 302 to `https://<main-domain>/?sc=<platform>`. Identical to aff-story logic.

### 2b. sc resolution
Resolve source channel in priority order:
1. `?sc=` query param
2. `aff_sc` cookie
3. Referer header normalization (instagram.com → `ig`, tiktok.com → `tt`, twitter.com/x.com → `x`, pinterest.com → `pin`)
4. `null` (direct)

Store result in `context.locals.sc: string | null`.

### 2c. Cookie set (after `next()`)
If `sc` is non-null and not already in cookie, append to response:
```
Set-Cookie: aff_sc=<sc>; Path=/; Max-Age=1800; SameSite=Lax
```

### Locals type update (`src/env.d.ts`)
Add `sc: string | null` to `App.Locals`.

---

## 3. Tracking Helper (`src/lib/tracking.ts`, new file)

Shared utilities called from pages and the click endpoint.

```ts
export async function trackPageView(
  db: D1Database,
  ctx: { waitUntil: (p: Promise<unknown>) => void },
  opts: { tenantId: number; storySlug?: string; sc: string | null; request: Request }
): Promise<void>

export async function trackClick(
  db: D1Database,
  ctx: { waitUntil: (p: Promise<unknown>) => void },
  opts: { tenantId: number; productId: string; storySlug: string; sc: string | null; request: Request }
): Promise<void>

async function hashIp(ip: string): Promise<string>  // SHA-256, first 8 bytes hex
```

Both tracking functions use `ctx.waitUntil(...)` so they never block the response. IP hash is SHA-256 truncated to 8 bytes (same as aff-story).

`trackPageView` inserts into `page_view_log(product_id, story_slug, sc, ip_hash, ua, tenant_id)` with `product_id=null`.
`trackClick` inserts into `click_log(product_id, story_slug, sc, ip_hash, ua, tenant_id)`.

---

## 4. Page View Instrumentation

Each SSR page calls `trackPageView` in its frontmatter after fetching data. All have access to `Astro.locals.tenant` and `Astro.locals.sc` (set by middleware).

| File | `story_slug` | `product_id` |
|---|---|---|
| `src/pages/index.astro` | null | null |
| `src/pages/styles.astro` | null | null |
| `src/pages/story/[slug].astro` | `slug` param | null |

`ctx` is obtained from `Astro.locals.runtime.ctx` (Cloudflare Workers runtime context, exposes `waitUntil`).

---

## 5. Product Click Endpoint

**New file:** `src/pages/story/[slug]/click/[productId].ts`

This is an Astro API route (`export const GET`).

**Flow:**
1. Extract `slug` and `productId` from params, `tenantId` from `locals.tenant`, `sc` from `locals.sc` or `?sc=` query param.
2. Query `products` table: `SELECT affiliate_url FROM products WHERE product_id = ? AND tenant_id = ? AND status = 'published'`
3. If not found → redirect 302 to `/story/${slug}`
4. Call `trackClick(db, ctx, { tenantId, productId, storySlug: slug, sc, request })` via `waitUntil`
5. Redirect 302 → `affiliate_url`

**`story/[slug].astro` link change:**
All "Shop the Look" `href` values change from `section.affiliate_url` to:
```
/story/${slug}/click/${section.product_id}${sc ? `?sc=${encodeURIComponent(sc)}` : ''}
```
The image link (currently `href={section.affiliate_url}`) gets the same treatment.

---

## 6. Microsoft Clarity

**Secret:** `CLARITY_ID` added as a Worker secret via `wrangler secret put CLARITY_ID` (same as aff-story). Also add `CLARITY_ID: string` to the `Env` interface in `src/env.d.ts`.

**Injection:** In `src/layouts/Base.astro`, import `env` from `cloudflare:workers` and inject the standard Clarity snippet in `<head>` when `env.CLARITY_ID` is set:

```html
<script>
  (function(c,l,a,r,i,t,y){...})(window,document,"clarity","script","<CLARITY_ID>");
</script>
```

Script is omitted entirely when `CLARITY_ID` is not set (dev/test environments).

---

## 7. wrangler.toml — Subdomain Routes

Add four custom domain routes for source-tracking subdomains:

```toml
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

The middleware redirect handles these at runtime; the routes just ensure Cloudflare routes traffic to this Worker.

---

## Files Changed / Created

| File | Action |
|---|---|
| `src/middleware.ts` | Update — subdomain redirect, sc resolution, cookie set |
| `src/env.d.ts` | Update — add `sc: string | null` to `App.Locals` |
| `src/lib/tracking.ts` | Create — `trackPageView`, `trackClick`, `hashIp` |
| `src/pages/index.astro` | Update — call `trackPageView` |
| `src/pages/styles.astro` | Update — call `trackPageView` |
| `src/pages/story/[slug].astro` | Update — call `trackPageView`, update `href` to click route |
| `src/pages/story/[slug]/click/[productId].ts` | Create — log click, redirect to affiliate |
| `src/layouts/Base.astro` | Update — inject Clarity script |
| `wrangler.toml` | Update — add subdomain routes |
| `worker/schema.sql` (aff-story) | Update — document the new columns (migration runs against shared DB) |

---

## Out of Scope

- Admin analytics UI changes (separate project)
- Meta Pixel / TikTok Pixel (not present in aff-website, add later if needed)
- `aff-story` worker changes (tracking already works there)
