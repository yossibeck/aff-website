# Design: Static → Astro + D1 Magazine Engine

**Date:** 2026-04-19  
**Project:** aff-website  
**Status:** Approved

---

## Goal

Convert the static HTML fashion site (`aff-website`) into a dynamic, multi-tenant Astro SSR project backed by the existing Cloudflare D1 database (`aff-story-db`). The existing CSS, layout, and UI are frozen — this is purely a data-integration migration.

---

## Constraints

- All CSS, layout, and animations are taken as-is from `index.html`, `single-story.html`, and `archive.html`. No redesign.
- The existing `aff-story` Worker project must remain untouched.
- Local development uses a local D1 SQLite copy seeded from the remote DB before testing.
- `hero_video_url` in `site_config` is used as-is (relative filename or full CDN URL).

---

## Architecture

### Project Structure

```
aff-website/
├── public/
│   ├── pullover.mp4, blue-zoom.mp4, o.mp4
│   ├── 1st-duck.png, heidi-in-bg.png, not-heidi.png
│   └── ...
├── src/
│   ├── env.d.ts                  ← Astro.locals type augmentation
│   ├── middleware.ts             ← tenant detection → Astro.locals.tenant
│   ├── lib/
│   │   └── db.ts                ← D1 query functions + TS interfaces
│   ├── layouts/
│   │   └── Base.astro           ← shared nav, fonts, Tailwind, footer
│   └── pages/
│       ├── index.astro          ← hero + category pills (site_config)
│       ├── archive.astro        ← story card grid (?cat= filter)
│       └── story/
│           └── [slug].astro     ← social anchor + intro + product sections
├── db/
│   ├── migrations/
│   │   └── 001_add_stories_site_config.sql
│   └── .gitignore               ← excludes remote-backup.sql
├── astro.config.mjs             ← output: 'server', adapter: cloudflare()
├── wrangler.toml                ← D1 binding, Cloudflare Pages config
└── package.json
```

### Multi-tenancy: Option A (Middleware)

`src/middleware.ts` runs on every SSR request:
1. Reads hostname from `request.headers.get('host')`
2. Calls `getTenant(db, hostname)` — queries `tenant_domains` table
3. Falls back to tenant `id: 1` (Aura St. Claire) when hostname is `localhost` or unrecognised
4. Stores result in `Astro.locals.tenant`

Every page reads `Astro.locals.tenant` — no repeated tenant lookups.

---

## Database

### Existing tables (remote, untouched)
- `tenants` — `id`, `slug`, `name`, `domain`
- `tenant_domains` — `domain`, `tenant_id`
- `products` — `product_id`, `alias`, `title`, `affiliate_url`, `selected_image_url`, `price`, `tenant_id`

### New tables (migration `001`)

```sql
CREATE TABLE IF NOT EXISTS stories (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id    INTEGER NOT NULL,
  slug         TEXT    NOT NULL,
  category     TEXT    NOT NULL,
  social_title TEXT    NOT NULL,
  social_img   TEXT    NOT NULL,
  intro_text   TEXT    NOT NULL,
  sections_json TEXT   NOT NULL,
  UNIQUE(tenant_id, slug)
);

CREATE TABLE IF NOT EXISTS site_config (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id      INTEGER NOT NULL,
  category       TEXT    NOT NULL,
  hero_video_url TEXT    NOT NULL,
  hero_title     TEXT    NOT NULL,
  UNIQUE(tenant_id, category)
);
```

### Local dev seeding workflow

```bash
# 1. Export remote DB (schema + existing products)
wrangler d1 export aff-story-db --remote --output=db/remote-backup.sql

# 2. Seed local DB
wrangler d1 execute aff-story-db --local --file=db/remote-backup.sql

# 3. Apply new migration locally
wrangler d1 execute aff-story-db --local --file=db/migrations/001_add_stories_site_config.sql
```

`db/remote-backup.sql` is gitignored. Only `db/migrations/` is version-controlled.

When ready for production, run step 3 with `--remote` only.

---

## Data Layer (`src/lib/db.ts`)

### TypeScript interfaces

```ts
interface Tenant       { id: number; slug: string; name: string; domain: string }
interface SiteConfig   { tenant_id: number; category: string; hero_video_url: string; hero_title: string }
interface Story        { id: number; tenant_id: number; slug: string; category: string;
                         social_title: string; social_img: string; intro_text: string; sections_json: string }
interface StorySection { product_id: string; story_text: string; display_image: string }
interface Product      { product_id: string; affiliate_url: string; selected_image_url: string }
interface StoryWithSections extends Omit<Story, 'sections_json'> {
  sections: (StorySection & { affiliate_url: string })[]
}
```

### Query functions

| Function | SQL | Used by |
|---|---|---|
| `getTenant(db, hostname)` | `SELECT t.* FROM tenants t JOIN tenant_domains td ON t.id = td.tenant_id WHERE td.domain = ?` | middleware |
| `getSiteConfigs(db, tenantId)` | `SELECT * FROM site_config WHERE tenant_id = ?` | index.astro |
| `getStories(db, tenantId, category?)` | `SELECT * FROM stories WHERE tenant_id = ? [AND category = ?] ORDER BY id DESC` | archive.astro |
| `getStory(db, tenantId, slug)` | fetch story, parse `sections_json`, batch-fetch products by `product_id` list, merge `affiliate_url` | story/[slug].astro |

`getStory` parses `sections_json` server-side (JSON.parse), extracts all `product_id` values, runs one `SELECT … WHERE product_id IN (…)` query, then merges `affiliate_url` onto each section before returning.

---

## Pages

### `index.astro` — Hero Landing

- Fetches all `site_config` rows for tenant
- Server-renders the category config object the existing crossfade JS expects:
  ```js
  const HERO_CATEGORIES = { wellness: { title, video, link }, ... }
  ```
  This replaces the hardcoded object in `index.html` — the video switcher JS is otherwise identical.
- Category pills rendered from DB rows (not hardcoded)
- Hero full-bleed link and "CLICK TO DISCOVER" button point to `/archive?cat={first_category}`

### `archive.astro` — Story Grid

- Fetches stories filtered by `?cat=` query param (or all if absent)
- Renders existing card grid layout from `index.html`
- Card: `social_img` as image, `social_title` as title, link to `/story/{slug}`
- Category filter tabs rendered from distinct categories in result

### `story/[slug].astro` — Single Story

Mirrors `single-story.html` layout exactly:

```
[social_img — 50% width]  [social_title — 50% width]
──────────────────────────────────────────────────
intro_text (editorial note)
──────────────────────────────────────────────────
For each section in sections_json:
  story_text
  display_image (full width)
  [SHOP THE LOOK] → affiliate_url (opens _blank)
```

- Returns 404 if story not found for this tenant+slug
- `affiliate_url` resolved server-side; button rendered as `<a href="{affiliate_url}">` — no client-side join

### `Base.astro` — Shared Layout

Extracts from all three HTML files:
- Google Fonts `<link>` (Playfair Display + Inter)
- Tailwind CDN `<script>` + config (fontFamily extend)
- Shared custom CSS (`.site-nav-glass`, `.nav-dropdown-panel`, scroll-reveal classes)
- Glass-blur `<header>` nav with dropdown (Wellness / Street / Beauty)
- `<footer>`
- Nav dropdown JS (identical across all three pages)

---

## Infrastructure

### `astro.config.mjs`

```js
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
});
```

### `wrangler.toml`

```toml
name = "aff-website"
compatibility_date = "2024-09-23"

[[d1_databases]]
binding = "DB"
database_name = "aff-story-db"
database_id = "b55e548c-cad5-41ae-a89d-e613dd1909bc"

[build]
command = "npm run build"

[[pages_build_output_dir]]
path = "dist"
```

---

## Out of Scope

- The `aff-story` Worker project — untouched
- Any redesign of existing CSS/layout/animations
- Admin UI for inserting stories or site_config rows
- Analytics / pixel tracking (handled by `aff-story`)
