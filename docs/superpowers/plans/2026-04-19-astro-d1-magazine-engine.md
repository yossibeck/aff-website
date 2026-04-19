# Astro + D1 Magazine Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the static HTML fashion site in `/aff-website` into a dynamic Astro SSR project backed by the existing Cloudflare D1 database, preserving all existing CSS/layout/animations exactly.

**Architecture:** Astro SSR with `@astrojs/cloudflare` adapter. A single `middleware.ts` detects the tenant by hostname from D1 and stores it in `Astro.locals`. Each page reads `Astro.locals.tenant` and queries D1 for its content. The three HTML files become three Astro pages sharing a `Base.astro` layout.

**Tech Stack:** Astro, `@astrojs/cloudflare`, Cloudflare D1, Cloudflare Pages, Vitest, TypeScript, Tailwind CDN, Wrangler CLI

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `astro.config.mjs` | Create | SSR output + cloudflare adapter |
| `wrangler.toml` | Modify | D1 binding + pages build dir |
| `tsconfig.json` | Modify | Add `@cloudflare/workers-types` |
| `package.json` | Create (via scaffold) | Deps + scripts |
| `.gitignore` | Create | Exclude node_modules, dist, local DB backup |
| `src/env.d.ts` | Create | Type `Astro.locals` with tenant + D1 runtime |
| `src/lib/db.ts` | Create | All D1 query functions + TS interfaces |
| `src/lib/db.test.ts` | Create | Vitest unit tests for pure functions |
| `src/middleware.ts` | Create | Tenant detection → `Astro.locals.tenant` |
| `src/layouts/Base.astro` | Create | Shared nav, fonts, Tailwind, footer (white + dark modes) |
| `src/pages/index.astro` | Create | Hero landing (site_config) + category pills + story grids |
| `src/pages/archive.astro` | Create | Dark-bg story gallery, `?cat=` filter |
| `src/pages/p/[productId].astro` | Create | Product→story redirect via story_products |
| `src/pages/story/[slug].astro` | Create | Social anchor + intro + product sections |
| `db/migrations/001_add_stories_site_config.sql` | Create | Create new tables |
| `db/seed_sample.sql` | Create | Insert sample row for local testing |
| `public/` | Populate | Move mp4/png assets from root |

---

## Task 1: Scaffold Astro Project

**Files:**
- Create: `package.json`, `astro.config.mjs`, `tsconfig.json`, `src/env.d.ts` (via scaffold)

- [ ] **Step 1: Run the Astro scaffold inside `/aff-website`**

```bash
cd /Users/yossibeck/dev/yb/aff-website
npm create astro@latest . -- --template minimal --typescript strict --no-git --install
```

When prompted: accept defaults. This creates `package.json`, `astro.config.mjs`, `tsconfig.json`, and a minimal `src/pages/index.astro` placeholder.

- [ ] **Step 2: Install Cloudflare adapter and types**

```bash
cd /Users/yossibeck/dev/yb/aff-website
npx astro add cloudflare
npm install --save-dev @cloudflare/workers-types vitest
```

- [ ] **Step 3: Verify scaffold output**

```bash
ls src/ && cat package.json | grep '"scripts"' -A 6
```

Expected: `src/pages/` exists, scripts include `"dev"`, `"build"`, `"preview"`.

- [ ] **Step 4: Commit scaffold**

```bash
cd /Users/yossibeck/dev/yb/aff-website
git add package.json package-lock.json astro.config.mjs tsconfig.json src/
git commit -m "feat: scaffold Astro project with Cloudflare adapter"
```

---

## Task 2: Configure astro.config.mjs, wrangler.toml, tsconfig.json

**Files:**
- Modify: `astro.config.mjs`
- Modify: `wrangler.toml`
- Modify: `tsconfig.json`

- [ ] **Step 1: Write `astro.config.mjs`**

Replace the contents of `astro.config.mjs` with:

```js
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
});
```

- [ ] **Step 2: Write `wrangler.toml`**

Replace the entire contents of `wrangler.toml` with:

```toml
name = "aff-website"
compatibility_date = "2024-09-23"
pages_build_output_dir = "dist"

[[d1_databases]]
binding = "DB"
database_name = "aff-story-db"
database_id = "b55e548c-cad5-41ae-a89d-e613dd1909bc"
```

- [ ] **Step 3: Update `tsconfig.json`**

Replace the contents of `tsconfig.json` with:

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "types": ["@cloudflare/workers-types"]
  }
}
```

- [ ] **Step 4: Add vitest script to `package.json`**

In `package.json`, add `"test": "vitest"` to the `"scripts"` block. The scripts section should look like:

```json
"scripts": {
  "dev": "astro dev",
  "build": "astro build",
  "preview": "astro preview",
  "test": "vitest"
}
```

- [ ] **Step 5: Commit**

```bash
git add astro.config.mjs wrangler.toml tsconfig.json package.json
git commit -m "feat: configure Cloudflare adapter, D1 binding, TS types"
```

---

## Task 3: Create .gitignore

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Write `.gitignore`**

Create `/Users/yossibeck/dev/yb/aff-website/.gitignore` with:

```
# Dependencies
node_modules/

# Build output
dist/

# Wrangler local state
.wrangler/

# Local D1 export — contains real product data, do not commit
db/remote-backup.sql

# Environment secrets
.env
.env.local
.dev.vars
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: add .gitignore"
```

---

## Task 4: Create DB Migration and Seed Files

**Files:**
- Create: `db/migrations/001_add_stories_site_config.sql`
- Create: `db/seed_sample.sql`

- [ ] **Step 1: Create migration directory**

```bash
mkdir -p /Users/yossibeck/dev/yb/aff-website/db/migrations
```

- [ ] **Step 2: Write migration `001_add_stories_site_config.sql`**

Create `/Users/yossibeck/dev/yb/aff-website/db/migrations/001_add_stories_site_config.sql`:

```sql
CREATE TABLE IF NOT EXISTS stories (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id     INTEGER NOT NULL,
  slug          TEXT    NOT NULL,
  category      TEXT    NOT NULL,
  social_title  TEXT    NOT NULL,
  social_img    TEXT    NOT NULL,
  intro_text    TEXT    NOT NULL,
  sections_json TEXT    NOT NULL,
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

CREATE TABLE IF NOT EXISTS story_products (
  story_id   INTEGER NOT NULL,
  product_id TEXT    NOT NULL,
  tenant_id  INTEGER NOT NULL,
  PRIMARY KEY (story_id, product_id),
  FOREIGN KEY (story_id) REFERENCES stories(id)
  -- product_id FK omitted: products.product_id is not a standalone PK in SQLite
);
```

- [ ] **Step 3: Write seed file `db/seed_sample.sql`**

Create `/Users/yossibeck/dev/yb/aff-website/db/seed_sample.sql`:

```sql
-- Site config: one row per category for tenant 1 (Aura St. Claire)
INSERT OR IGNORE INTO site_config (tenant_id, category, hero_video_url, hero_title)
VALUES
  (1, 'wellness', 'pullover.mp4', 'The Wellness Issue'),
  (1, 'street',   'o.mp4',        'The Street Issue'),
  (1, 'beauty',   'blue-zoom.mp4','The Beauty Issue');

-- Sample story using the product already in the remote DB
INSERT OR IGNORE INTO stories (tenant_id, slug, category, social_title, social_img, intro_text, sections_json)
VALUES (
  1,
  'morning-glow-routine',
  'wellness',
  'The 5 AM Glow-Up Routine',
  '/heidi-in-bg.png',
  'True beauty starts with a calm morning. Here is how I set my intention for the day with these essentials.',
  '[{"product_id":"ali_12345","story_text":"I start with this silk dress. It feels like a second skin and makes me feel elegant even before my first coffee.","display_image":"/1st-duck.png"}]'
);

-- Populate story_products mapping table for the sample story
-- story_id 1 = morning-glow-routine (first inserted story)
INSERT OR IGNORE INTO story_products (story_id, product_id, tenant_id)
VALUES (1, 'ali_12345', 1);
```

- [ ] **Step 4: Commit**

```bash
git add db/
git commit -m "feat: add DB migration and local seed data"
```

---

## Task 5: Seed Local D1

**Files:** none (shell commands only)

- [ ] **Step 1: Export remote DB to local file**

```bash
cd /Users/yossibeck/dev/yb/aff-website
wrangler d1 export aff-story-db --remote --output=db/remote-backup.sql
```

Expected: `Successfully exported db/remote-backup.sql` (file contains CREATE TABLE + INSERT statements for existing products/tenants).

- [ ] **Step 2: Seed local D1 with remote data**

```bash
wrangler d1 execute aff-story-db --local --file=db/remote-backup.sql
```

Expected: `Successfully executed db/remote-backup.sql` (no errors).

- [ ] **Step 3: Run migration locally**

```bash
wrangler d1 execute aff-story-db --local --file=db/migrations/001_add_stories_site_config.sql
```

Expected: `Successfully executed` with no errors.

- [ ] **Step 4: Insert sample data**

```bash
wrangler d1 execute aff-story-db --local --file=db/seed_sample.sql
```

Expected: `Successfully executed`.

- [ ] **Step 5: Verify local data**

```bash
wrangler d1 execute aff-story-db --local --command "SELECT * FROM site_config;"
wrangler d1 execute aff-story-db --local --command "SELECT id, slug, social_title FROM stories;"
wrangler d1 execute aff-story-db --local --command "SELECT product_id, title FROM products LIMIT 5;"
```

Expected: 3 site_config rows, 1 story row, ≥1 product rows.

---

## Task 6: Move Static Assets to public/

**Files:**
- Move: `*.mp4`, `*.png` → `public/`

- [ ] **Step 1: Create public/ and move assets**

```bash
cd /Users/yossibeck/dev/yb/aff-website
mkdir -p public
mv pullover.mp4 blue-zoom.mp4 o.mp4 original.mp4 public/ 2>/dev/null || true
mv 1st-duck.png heidi-in-bg.png not-heidi.png public/ 2>/dev/null || true
```

- [ ] **Step 2: Verify**

```bash
ls public/
```

Expected: mp4 and png files are now in `public/`.

- [ ] **Step 3: Commit**

```bash
git add public/ && git rm --cached *.mp4 *.png 2>/dev/null || true
git commit -m "chore: move static assets to public/"
```

---

## Task 7: Create src/env.d.ts

**Files:**
- Create: `src/env.d.ts`

- [ ] **Step 1: Write env.d.ts**

Create `/Users/yossibeck/dev/yb/aff-website/src/env.d.ts`:

```typescript
/// <reference types="astro/client" />

interface Env {
  DB: D1Database;
}

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {
    tenant: import('./lib/db').Tenant;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/env.d.ts
git commit -m "feat: add Astro.locals type augmentation for tenant + D1"
```

---

## Task 8: Create src/lib/db.ts with Unit Tests

**Files:**
- Create: `src/lib/db.ts`
- Create: `src/lib/db.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `/Users/yossibeck/dev/yb/aff-website/src/lib/db.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseSections, mergeSectionsWithProducts } from './db';

describe('parseSections', () => {
  it('parses valid sections_json', () => {
    const json = JSON.stringify([
      { product_id: 'ali_123', story_text: 'Great product', display_image: 'img.jpg' },
    ]);
    expect(parseSections(json)).toEqual([
      { product_id: 'ali_123', story_text: 'Great product', display_image: 'img.jpg' },
    ]);
  });

  it('returns empty array on invalid JSON', () => {
    expect(parseSections('not-json')).toEqual([]);
  });

  it('returns empty array on empty string', () => {
    expect(parseSections('')).toEqual([]);
  });
});

describe('getStoryByProductId (unit-testable wrapper)', () => {
  it('returns slug when product is in story_products', async () => {
    const mockDb = {
      prepare: () => ({
        bind: () => ({
          first: async () => ({ slug: 'morning-glow-routine' }),
        }),
      }),
    } as unknown as D1Database;
    const result = await getStorySlugByProductId(mockDb, 1, 'ali_12345');
    expect(result).toBe('morning-glow-routine');
  });

  it('returns null when product has no story', async () => {
    const mockDb = {
      prepare: () => ({
        bind: () => ({
          first: async () => null,
        }),
      }),
    } as unknown as D1Database;
    const result = await getStorySlugByProductId(mockDb, 1, 'unknown');
    expect(result).toBeNull();
  });
});

describe('mergeSectionsWithProducts', () => {
  it('merges affiliate_url and product_title from product map', () => {
    const sections = [{ product_id: 'ali_123', story_text: 'text', display_image: 'img.jpg' }];
    const productMap = new Map([
      ['ali_123', { product_id: 'ali_123', title: 'Silk Dress', affiliate_url: 'https://aff.link/1', selected_image_url: '' }],
    ]);
    const result = mergeSectionsWithProducts(sections, productMap);
    expect(result).toEqual([
      { product_id: 'ali_123', story_text: 'text', display_image: 'img.jpg', affiliate_url: 'https://aff.link/1', product_title: 'Silk Dress' },
    ]);
  });

  it('falls back to "#" affiliate_url when product not found', () => {
    const sections = [{ product_id: 'missing', story_text: 'text', display_image: 'img.jpg' }];
    const result = mergeSectionsWithProducts(sections, new Map());
    expect(result[0].affiliate_url).toBe('#');
    expect(result[0].product_title).toBe('');
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

```bash
cd /Users/yossibeck/dev/yb/aff-website/.worktrees/feat-astro-d1
npm test -- --run
```

Expected: FAIL — `parseSections`, `mergeSectionsWithProducts`, and `getStorySlugByProductId` are not defined.

- [ ] **Step 3: Write `src/lib/db.ts`**

Create `/Users/yossibeck/dev/yb/aff-website/src/lib/db.ts`:

```typescript
export interface Tenant {
  id: number;
  slug: string;
  name: string;
  domain: string;
}

export interface SiteConfig {
  id: number;
  tenant_id: number;
  category: string;
  hero_video_url: string;
  hero_title: string;
}

export interface StoryRow {
  id: number;
  tenant_id: number;
  slug: string;
  category: string;
  social_title: string;
  social_img: string;
  intro_text: string;
  sections_json: string;
}

export interface StorySection {
  product_id: string;
  story_text: string;
  display_image: string;
}

export interface Product {
  product_id: string;
  title: string;
  affiliate_url: string;
  selected_image_url: string;
}

export interface ResolvedSection {
  product_id: string;
  story_text: string;
  display_image: string;
  affiliate_url: string;
  product_title: string;
}

export interface StoryWithSections extends Omit<StoryRow, 'sections_json'> {
  sections: ResolvedSection[];
}

const DEFAULT_TENANT: Tenant = {
  id: 1,
  slug: 'aura',
  name: 'Aura St. Claire',
  domain: 'aurastclaire.com',
};

export function parseSections(sectionsJson: string): StorySection[] {
  try {
    return JSON.parse(sectionsJson) as StorySection[];
  } catch {
    return [];
  }
}

export function mergeSectionsWithProducts(
  sections: StorySection[],
  productMap: Map<string, Product>
): ResolvedSection[] {
  return sections.map((s) => {
    const product = productMap.get(s.product_id);
    return {
      ...s,
      affiliate_url: product?.affiliate_url ?? '#',
      product_title: product?.title ?? '',
    };
  });
}

export async function getTenant(db: D1Database, hostname: string): Promise<Tenant> {
  const host = hostname.split(':')[0]; // strip port for local dev
  const result = await db
    .prepare(
      `SELECT t.id, t.slug, t.name, t.domain
       FROM tenants t
       JOIN tenant_domains td ON t.id = td.tenant_id
       WHERE td.domain = ?`
    )
    .bind(host)
    .first<Tenant>();
  return result ?? DEFAULT_TENANT;
}

export async function getSiteConfigs(db: D1Database, tenantId: number): Promise<SiteConfig[]> {
  const result = await db
    .prepare('SELECT * FROM site_config WHERE tenant_id = ? ORDER BY id ASC')
    .bind(tenantId)
    .all<SiteConfig>();
  return result.results ?? [];
}

export async function getStories(
  db: D1Database,
  tenantId: number,
  category?: string
): Promise<StoryRow[]> {
  if (category) {
    const result = await db
      .prepare('SELECT * FROM stories WHERE tenant_id = ? AND category = ? ORDER BY id DESC')
      .bind(tenantId, category)
      .all<StoryRow>();
    return result.results ?? [];
  }
  const result = await db
    .prepare('SELECT * FROM stories WHERE tenant_id = ? ORDER BY id DESC')
    .bind(tenantId)
    .all<StoryRow>();
  return result.results ?? [];
}

export async function getStorySlugByProductId(
  db: D1Database,
  tenantId: number,
  productId: string
): Promise<string | null> {
  const result = await db
    .prepare(
      `SELECT s.slug
       FROM story_products sp
       JOIN stories s ON s.id = sp.story_id
       WHERE sp.product_id = ? AND sp.tenant_id = ?
       LIMIT 1`
    )
    .bind(productId, tenantId)
    .first<{ slug: string }>();
  return result?.slug ?? null;
}

export async function getStory(
  db: D1Database,
  tenantId: number,
  slug: string
): Promise<StoryWithSections | null> {
  const row = await db
    .prepare('SELECT * FROM stories WHERE tenant_id = ? AND slug = ?')
    .bind(tenantId, slug)
    .first<StoryRow>();

  if (!row) return null;

  const sections = parseSections(row.sections_json);

  if (sections.length === 0) {
    return { ...row, sections: [] };
  }

  const productIds = sections.map((s) => s.product_id);
  const placeholders = productIds.map(() => '?').join(', ');

  const productsResult = await db
    .prepare(
      `SELECT product_id, title, affiliate_url, selected_image_url
       FROM products
       WHERE product_id IN (${placeholders}) AND tenant_id = ?`
    )
    .bind(...productIds, tenantId)
    .all<Product>();

  const productMap = new Map<string, Product>(
    (productsResult.results ?? []).map((p) => [p.product_id, p])
  );

  return {
    ...row,
    sections: mergeSectionsWithProducts(sections, productMap),
  };
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
npm test -- --run
```

Expected: PASS — all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts src/lib/db.test.ts
git commit -m "feat: add D1 query functions with unit tests"
```

---

## Task 8b: Create src/pages/p/[productId].astro

**Files:**
- Create: `src/pages/p/[productId].astro`

Thin redirect page. Receives a `product_id` URL param, queries `story_products` via `getStorySlugByProductId`, and issues a 302 to `/story/{slug}`. Falls back to `/archive` if no story found. Renders no HTML.

- [ ] **Step 1: Write `src/pages/p/[productId].astro`**

Create `/Users/yossibeck/dev/yb/aff-website/.worktrees/feat-astro-d1/src/pages/p/[productId].astro`:

```astro
---
import { getStorySlugByProductId } from '../../lib/db';

const { tenant } = Astro.locals;
const db = Astro.locals.runtime.env.DB;

const { productId } = Astro.params;
const slug = await getStorySlugByProductId(db, tenant.id, productId!);

return Astro.redirect(slug ? `/story/${slug}` : '/archive', 302);
---
```

- [ ] **Step 2: Commit**

```bash
cd /Users/yossibeck/dev/yb/aff-website/.worktrees/feat-astro-d1
git add src/pages/p/
git commit -m "feat: add /p/[productId] redirect page via story_products table"
```

---

## Task 9: Create src/middleware.ts

**Files:**
- Create: `src/middleware.ts`

- [ ] **Step 1: Write `src/middleware.ts`**

Create `/Users/yossibeck/dev/yb/aff-website/src/middleware.ts`:

```typescript
import { defineMiddleware } from 'astro:middleware';
import { getTenant } from './lib/db';

export const onRequest = defineMiddleware(async (context, next) => {
  const db = context.locals.runtime.env.DB;
  const hostname = context.request.headers.get('host') ?? 'localhost';
  context.locals.tenant = await getTenant(db, hostname);
  return next();
});
```

- [ ] **Step 2: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: add middleware for multi-tenant detection via D1"
```

---

## Task 10: Create src/layouts/Base.astro

**Files:**
- Create: `src/layouts/Base.astro`

Extracts the shared nav, fonts, Tailwind CDN config, global CSS, and footer from all three HTML pages. Accepts a `dark` prop for the archive page's dark-background layout.

- [ ] **Step 1: Write `src/layouts/Base.astro`**

Create `/Users/yossibeck/dev/yb/aff-website/src/layouts/Base.astro`:

```astro
---
interface Props {
  title?: string;
  dark?: boolean;
}
const { title = 'Aura St. Claire', dark = false } = Astro.props;
const { tenant } = Astro.locals;
---
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            serif: ['"Playfair Display"', 'Georgia', 'serif'],
            sans: ['Inter', 'system-ui', 'sans-serif'],
          },
        },
      },
    };
  </script>
  <style>
    html { scroll-behavior: smooth; }
    .site-nav-glass {
      background: rgba(255, 255, 255, 0.55);
      -webkit-backdrop-filter: blur(16px);
      backdrop-filter: blur(16px);
    }
    .nav-dropdown-panel { display: none; }
    .nav-dropdown-panel.is-open { display: block; }
    .anchor-section { scroll-margin-top: 6rem; }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      .js-hero-kicker, .js-hero-title, .js-reveal-story,
      .js-reveal-collection-title, .js-reveal-card {
        opacity: 1 !important;
        transform: none !important;
        transition: none !important;
      }
      .hero-video-layer { transition: none !important; }
    }
  </style>
  <slot name="head" />
</head>
<body class={dark ? 'min-h-[100dvh] font-sans text-neutral-900 antialiased' : 'bg-white font-sans text-neutral-900 antialiased'}>
  {dark && (
    <div class="pointer-events-none fixed inset-0 z-0 bg-neutral-950" aria-hidden="true">
      <img
        src="/heidi-in-bg.png"
        alt=""
        class="absolute inset-0 h-full w-full object-cover opacity-90"
        width="1920"
        height="1080"
      />
      <div class="absolute inset-0 bg-black/45"></div>
    </div>
  )}
  <div class={dark ? 'relative z-10' : ''}>
    <header class="site-nav-glass sticky top-0 z-50 w-full border-b border-black/5">
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <a href="/" class="font-serif text-lg font-semibold tracking-[0.2em] text-neutral-900 sm:text-xl">AURA</a>
        <nav class="flex items-center gap-1 text-sm font-medium text-neutral-800 sm:gap-3" aria-label="Primary">
          <a href="/" class="rounded-full px-3 py-2 transition hover:bg-white/60">Home</a>
          <a href="/archive" class="rounded-full px-3 py-2 transition hover:bg-white/60">Archive</a>
          <div class="relative" id="nav-categories-wrap">
            <button
              type="button"
              id="nav-categories-btn"
              class="flex items-center gap-1 rounded-full px-3 py-2 transition hover:bg-white/60"
              aria-expanded="false"
              aria-haspopup="true"
              aria-controls="nav-categories-panel"
            >
              Categories
              <span class="text-xs text-neutral-500" aria-hidden="true">▾</span>
            </button>
            <div
              id="nav-categories-panel"
              class="nav-dropdown-panel absolute right-0 mt-2 min-w-[11rem] rounded-xl border border-black/5 bg-white/95 py-2 shadow-lg backdrop-blur-md"
              style="-webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px);"
              role="menu"
              aria-hidden="true"
            >
              <a href="/archive?cat=wellness" class="block px-4 py-2 text-left text-sm hover:bg-neutral-100/80" role="menuitem">Wellness</a>
              <a href="/archive?cat=street" class="block px-4 py-2 text-left text-sm hover:bg-neutral-100/80" role="menuitem">Street</a>
              <a href="/archive?cat=beauty" class="block px-4 py-2 text-left text-sm hover:bg-neutral-100/80" role="menuitem">Beauty</a>
            </div>
          </div>
        </nav>
      </div>
    </header>

    <slot />

    <footer class={`border-t py-10 text-center text-sm ${dark ? 'border-white/20 text-white/60' : 'border-neutral-200 text-neutral-500'}`}>
      {tenant.name}
    </footer>
  </div>

  <script>
    (function () {
      var navBtn = document.getElementById('nav-categories-btn');
      var navPanel = document.getElementById('nav-categories-panel');
      function setNavOpen(open: boolean) {
        if (!navPanel || !navBtn) return;
        navPanel.classList.toggle('is-open', open);
        navBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        navPanel.setAttribute('aria-hidden', open ? 'false' : 'true');
      }
      if (navBtn && navPanel) {
        navBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          setNavOpen(!navPanel.classList.contains('is-open'));
        });
        document.addEventListener('click', function () { setNavOpen(false); });
        navPanel.addEventListener('click', function (e) { e.stopPropagation(); });
      }
    })();
  </script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add src/layouts/Base.astro
git commit -m "feat: add Base.astro layout with shared nav, fonts, Tailwind"
```

---

## Task 11: Create src/pages/archive.astro

**Files:**
- Create: `src/pages/archive.astro`

Dark-background gallery page. Cards are 9:16 tiles with desktop hover overlay. Category filter uses `?cat=` query param → server-side filter.

- [ ] **Step 1: Write `src/pages/archive.astro`**

Create `/Users/yossibeck/dev/yb/aff-website/src/pages/archive.astro`:

```astro
---
import Base from '../layouts/Base.astro';
import { getStories } from '../lib/db';

const { tenant } = Astro.locals;
const db = Astro.locals.runtime.env.DB;

const cat = Astro.url.searchParams.get('cat') ?? undefined;
const stories = await getStories(db, tenant.id, cat);

const activeFilter = cat ?? 'all';
const filterLabels = ['all', 'wellness', 'street', 'beauty'];
---
<Base title={`${tenant.name} — Archive`} dark={true}>
  <style slot="head">
    .archive-tile:focus-visible {
      outline: 2px solid rgba(255, 255, 255, 0.95);
      outline-offset: 2px;
    }
    .gallery-item__overlay {
      display: none;
    }
    @media (min-width: 1024px) and (hover: hover) {
      .gallery-item__overlay {
        display: flex;
        opacity: 0;
        transition: opacity 0.15s ease-out;
      }
      .archive-tile:hover .gallery-item__overlay,
      .archive-tile:focus-visible .gallery-item__overlay {
        opacity: 1;
      }
    }
    .filter-pill.is-active {
      background-color: rgb(23 23 23);
      color: white;
      border-color: rgb(23 23 23);
    }
    @media (prefers-reduced-motion: reduce) {
      .gallery-item__overlay { transition: none; }
    }
  </style>

  <main class="mx-auto max-w-7xl px-4 pb-20 pt-10 sm:px-6 lg:px-8 lg:pb-28 lg:pt-14">
    <div class="mx-auto max-w-2xl text-center">
      <p class="text-xs font-medium uppercase tracking-[0.35em] text-white/85">{tenant.name}</p>
      <h1 class="mt-3 font-serif text-4xl font-semibold text-white drop-shadow-sm sm:text-5xl">Archive</h1>
      <p class="mt-4 text-sm leading-relaxed text-white/85 sm:text-base">
        A quiet editorial wall — imagery, mood, and story in one place.
      </p>
    </div>

    <!-- Category filter pills -->
    <div
      class="mx-auto mt-10 flex max-w-3xl flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/40 bg-white/60 p-3 shadow-lg backdrop-blur-md sm:mt-12"
      style="-webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);"
      role="toolbar"
      aria-label="Filter by category"
    >
      {filterLabels.map((label) => (
        <a
          href={label === 'all' ? '/archive' : `/archive?cat=${label}`}
          class={`filter-pill rounded-full border border-neutral-900/10 bg-white/80 px-4 py-2 text-xs font-medium uppercase tracking-wide text-neutral-800 transition hover:border-neutral-900/30 sm:text-sm no-underline${activeFilter === label ? ' is-active' : ''}`}
          aria-current={activeFilter === label ? 'page' : undefined}
        >
          {label.charAt(0).toUpperCase() + label.slice(1)}
        </a>
      ))}
    </div>

    <!-- Story grid: 2 cols mobile, 5 cols desktop, 9:16 tiles -->
    {stories.length === 0 ? (
      <p class="mt-16 text-center text-white/60">No stories yet in this category.</p>
    ) : (
      <div class="mx-auto mt-10 grid max-w-7xl grid-cols-2 gap-2 lg:mt-12 lg:grid-cols-5" id="archive-grid">
        {stories.map((story) => (
          <div class="archive-grid__item min-w-0">
            <a
              href={`/story/${story.slug}`}
              class="archive-tile relative block overflow-hidden rounded-sm bg-neutral-900 no-underline"
              data-category={story.category}
              aria-label={`${story.social_title} — open story`}
            >
              <div class="relative aspect-[9/16] w-full">
                <img
                  src={story.social_img}
                  alt=""
                  class="h-full w-full object-cover"
                  width="600"
                  height="1067"
                  decoding="async"
                />
                <div class="gallery-item__overlay pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-black/65 via-black/20 to-transparent px-2 pb-2 pt-12">
                  <span class="font-serif text-xs font-semibold leading-tight text-white sm:text-sm">
                    {story.social_title}
                  </span>
                </div>
              </div>
            </a>
          </div>
        ))}
      </div>
    )}
  </main>
</Base>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/archive.astro
git commit -m "feat: add dynamic archive page with D1 story grid and category filter"
```

---

## Task 12: Create src/pages/story/[slug].astro

**Files:**
- Create: `src/pages/story/[slug].astro`

Social anchor image + title at top, intro text, then one article block per section (story_text → display_image → "SHOP THE LOOK" button → affiliate_url). Returns 404 if story not found.

- [ ] **Step 1: Write `src/pages/story/[slug].astro`**

Create `/Users/yossibeck/dev/yb/aff-website/src/pages/story/[slug].astro`:

```astro
---
import Base from '../../layouts/Base.astro';
import { getStory } from '../../lib/db';

const { tenant } = Astro.locals;
const db = Astro.locals.runtime.env.DB;

const { slug } = Astro.params;
const story = await getStory(db, tenant.id, slug!);

if (!story) {
  return Astro.redirect('/archive', 302);
}
---
<Base title={`${tenant.name} — ${story.social_title}`}>
  <style slot="head">
    .connection-image-wrap {
      box-shadow: 0 24px 48px -12px rgb(0 0 0 / 0.12), 0 12px 24px -8px rgb(0 0 0 / 0.08);
    }
    .js-hero-kicker { opacity: 0; }
    .js-hero-kicker.active { opacity: 1; }
    .js-hero-title {
      opacity: 0;
      transform: translateX(-2.75rem);
    }
    .js-hero-title.active {
      opacity: 1;
      transform: translateX(0);
    }
    .js-reveal-story {
      opacity: 0;
      transform: translateY(60px);
      transition: opacity 700ms ease-out, transform 700ms ease-out;
    }
    .js-reveal-story.active {
      opacity: 1;
      transform: translateY(0);
    }
    .js-reveal-card {
      opacity: 0;
      transform: translateY(60px) scale(0.95);
      box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.08), 0 8px 10px -6px rgb(0 0 0 / 0.06);
      transition: opacity 700ms ease-out, transform 700ms ease-out, box-shadow 300ms ease-out;
    }
    .js-reveal-card.active {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    .js-reveal-card.active:hover {
      transform: translateY(-8px) scale(1);
      box-shadow: 0 26px 50px -12px rgb(0 0 0 / 0.28), 0 14px 28px -14px rgb(0 0 0 / 0.18);
    }
  </style>

  <!-- Social anchor: image + title -->
  <section class="border-b border-neutral-200/90 bg-white" aria-labelledby="social-title-text">
    <div class="mx-auto max-w-6xl px-5 py-12 sm:px-8 md:py-16 lg:px-10">
      <div class="flex flex-col gap-10 md:flex-row md:items-center md:gap-14 lg:gap-20">
        <div class="w-full shrink-0 md:w-1/2">
          <div class="connection-image-wrap overflow-hidden rounded-sm bg-neutral-100">
            <img
              src={story.social_img}
              alt=""
              class="h-auto w-full object-cover"
              width="900"
              height="1200"
              decoding="async"
            />
          </div>
        </div>
        <div class="w-full md:w-1/2 md:flex md:flex-col md:justify-center">
          <p class="js-hero-kicker text-[10px] font-medium uppercase tracking-[0.35em] text-neutral-500">
            {tenant.name}'s Curation
          </p>
          <h1
            id="social-title-text"
            class="js-hero-title mt-5 font-serif text-[1.65rem] font-normal leading-[1.2] text-neutral-900 sm:text-4xl md:text-[2.35rem] md:leading-[1.15] lg:text-[2.65rem]"
          >
            {story.social_title}
          </h1>
        </div>
      </div>
    </div>
  </section>

  <div class="relative z-10 min-h-0">
    <main class="mx-auto max-w-3xl space-y-16 px-5 pb-20 pt-12 sm:px-8 md:space-y-20 md:pb-28 md:pt-16 lg:px-10">

      <!-- Editorial intro -->
      <article class="js-reveal-story">
        <p class="text-xs font-medium uppercase tracking-[0.35em] text-neutral-500">{tenant.name}</p>
        <h2 class="mt-8 font-serif text-2xl font-semibold text-neutral-900 sm:text-3xl">Editorial Note</h2>
        <p class="mt-6 text-base leading-[1.75] text-neutral-600 sm:text-lg">
          {story.intro_text}
        </p>
      </article>

      <!-- Product sections -->
      <section class="js-reveal-collection" aria-labelledby="curated-heading">
        <div class="text-center md:text-left">
          <h2 id="curated-heading" class="js-reveal-collection-title font-serif text-2xl font-semibold text-neutral-900 sm:text-3xl">
            The curated edit
          </h2>
        </div>

        <div class="mt-14 space-y-20 md:mt-16 md:space-y-24">
          {story.sections.map((section, i) => (
            <article
              class="js-reveal-card border-b border-neutral-200/80 pb-20 last:border-0 last:pb-0 md:pb-24"
              data-bundle-index={i}
            >
              {section.product_title && (
                <h3 class="font-serif text-xl font-semibold text-neutral-900 sm:text-2xl">
                  {section.product_title}
                </h3>
              )}
              <p class="mt-4 text-base leading-[1.75] text-neutral-700 sm:text-[1.05rem]">
                {section.story_text}
              </p>
              <div class="mt-12 overflow-hidden bg-neutral-50">
                <img
                  src={section.display_image}
                  alt={section.product_title}
                  class="h-auto w-full object-cover"
                  width="900"
                  height="1200"
                  decoding="async"
                />
              </div>
              <a
                href={section.affiliate_url}
                target="_blank"
                rel="noopener noreferrer"
                class="mt-10 inline-flex min-h-[52px] w-full items-center justify-center bg-neutral-900 px-8 py-3 text-center text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-neutral-800 sm:w-auto"
              >
                Shop the Look
              </a>
            </article>
          ))}
        </div>
      </section>
    </main>
  </div>

  <script>
    (function () {
      var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      function revealHero() {
        var kicker = document.querySelector('.js-hero-kicker');
        var title = document.querySelector('.js-hero-title');
        if (reduced) {
          if (kicker) kicker.classList.add('active');
          if (title) title.classList.add('active');
          return;
        }
        requestAnimationFrame(function () {
          if (kicker) { kicker.style.transitionDelay = '0ms'; kicker.classList.add('active'); }
          if (title) { title.style.transitionDelay = '500ms'; title.classList.add('active'); }
        });
      }

      var story = document.querySelector('.js-reveal-story');
      var collection = document.querySelector('.js-reveal-collection');
      var collectionTitle = document.querySelector('.js-reveal-collection-title');
      var cards = document.querySelectorAll('.js-reveal-card');

      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var t = entry.target;
          if (t === story) {
            t.classList.add('active');
            observer.unobserve(t);
          } else if (t === collection) {
            if (collectionTitle) collectionTitle.classList.add('active');
            if (reduced) {
              cards.forEach(function (c) { c.classList.add('active'); });
            } else {
              cards.forEach(function (card, i) {
                window.setTimeout(function () { card.classList.add('active'); }, i * 150);
              });
            }
            observer.unobserve(t);
          }
        });
      }, { root: null, rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

      if (story) observer.observe(story);
      if (collection) observer.observe(collection);

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', revealHero);
      } else {
        revealHero();
      }
    })();
  </script>
</Base>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/story/
git commit -m "feat: add dynamic story page with D1 product sections and affiliate links"
```

---

## Task 13: Create src/pages/index.astro

**Files:**
- Create: `src/pages/index.astro`

Hero with video crossfade driven by `site_config` rows. Category pills and story preview grids below.

- [ ] **Step 1: Write `src/pages/index.astro`**

Create `/Users/yossibeck/dev/yb/aff-website/src/pages/index.astro`:

```astro
---
import Base from '../layouts/Base.astro';
import { getSiteConfigs, getStories } from '../lib/db';

const { tenant } = Astro.locals;
const db = Astro.locals.runtime.env.DB;

const [configs, stories] = await Promise.all([
  getSiteConfigs(db, tenant.id),
  getStories(db, tenant.id),
]);

// Build the data objects the crossfade JS expects
const heroCategories: Record<string, { title: string; video: string; link: string }> = {};
const categoryOrder: string[] = [];
for (const cfg of configs) {
  heroCategories[cfg.category] = {
    title: cfg.hero_title,
    video: cfg.hero_video_url,
    link: `/archive?cat=${cfg.category}`,
  };
  categoryOrder.push(cfg.category);
}

const firstCategory = categoryOrder[0] ?? 'wellness';
const firstConfig = heroCategories[firstCategory];

// Group stories by category for section previews
const storiesByCategory: Record<string, typeof stories> = {};
for (const story of stories) {
  if (!storiesByCategory[story.category]) storiesByCategory[story.category] = [];
  storiesByCategory[story.category].push(story);
}

const categoryGradients: Record<string, string> = {
  wellness: 'from-emerald-50 to-white',
  street:   'from-amber-50 to-white',
  beauty:   'from-rose-50 to-white',
};
const categoryTextColors: Record<string, string> = {
  wellness: 'text-emerald-900',
  street:   'text-amber-950',
  beauty:   'text-rose-950',
};
---
<Base title={`${tenant.name} — ${firstConfig?.title ?? ''}`}>
  <style slot="head">
    .js-hero-kicker { opacity: 0; }
    .js-hero-kicker.active { opacity: 1; transition: opacity 1000ms ease-out; }
    .js-hero-title {
      opacity: 0;
      transform: translateX(-2.75rem);
    }
    .js-hero-title.active {
      opacity: 1;
      transform: translateX(0);
      transition: opacity 1000ms ease-out, transform 1000ms ease-out;
    }
    .hero-video-layer {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      opacity: 0;
      transition: opacity 1s ease;
      z-index: 1;
      pointer-events: none;
    }
    .hero-video-layer.is-visible { opacity: 1; z-index: 2; }
    .hero-video-layer.is-on-top { z-index: 3; }
    .js-reveal-story, .js-reveal-collection-title {
      opacity: 0;
      transform: translateY(60px);
      transition: opacity 1000ms ease-out, transform 1000ms ease-out;
    }
    .js-reveal-story.active, .js-reveal-collection-title.active {
      opacity: 1;
      transform: translateY(0);
    }
    .js-reveal-card {
      opacity: 0;
      transform: translateY(60px) scale(0.95);
      box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
      transition: opacity 1000ms ease-out, transform 1000ms ease-out, box-shadow 300ms ease-out;
    }
    .js-reveal-card.active {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    .js-reveal-card.active:hover {
      transform: translateY(-8px) scale(1);
      box-shadow: 0 22px 44px -14px rgb(0 0 0 / 0.2), 0 12px 24px -10px rgb(0 0 0 / 0.12);
    }
  </style>

  <!-- Full-bleed hero -->
  <section
    class="relative min-h-[calc(100dvh-4rem)] w-full overflow-hidden bg-neutral-950"
    aria-label="Featured category"
  >
    <div class="absolute inset-0 z-0">
      <video
        id="hero-video-0"
        class="hero-video-layer is-visible is-on-top"
        autoplay
        muted
        playsinline
        preload="auto"
      >
        <source src={firstConfig?.video ?? ''} type="video/mp4" />
      </video>
      <video id="hero-video-1" class="hero-video-layer" muted playsinline preload="metadata"></video>
    </div>
    <a
      id="hero-full-link"
      href={firstConfig?.link ?? '/archive'}
      class="absolute inset-0 z-[1]"
      aria-label={`Discover ${firstConfig?.title ?? ''} — view the archive`}
    ></a>
    <div
      class="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-t from-black/60 via-black/10 to-black/30"
      aria-hidden="true"
    ></div>
    <div class="pointer-events-none relative z-10 flex min-h-[calc(100dvh-4rem)] w-full flex-col justify-end px-5 pb-12 pt-24 sm:px-10 sm:pb-16 md:px-14 lg:justify-center lg:px-16 lg:pb-20 xl:px-20">
      <p class="js-hero-kicker mb-3 text-xs font-medium uppercase tracking-[0.35em] text-white/85">
        {tenant.name}
      </p>
      <h1 class="js-hero-title max-w-4xl font-serif text-4xl font-semibold leading-[1.08] text-white sm:text-5xl md:text-6xl lg:text-7xl">
        {firstConfig?.title ?? ''}
      </h1>
      <a
        id="hero-discover-btn"
        href={firstConfig?.link ?? '/archive'}
        class="hero-discover-btn pointer-events-auto mt-10 inline-flex w-full max-w-md items-center justify-center border-2 border-white bg-white/10 px-10 py-4 text-center font-serif text-base font-normal uppercase tracking-[0.2em] text-white shadow-[0_16px_48px_rgba(0,0,0,0.45)] backdrop-blur-[6px] transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 sm:mt-12 sm:text-lg md:text-xl"
      >
        CLICK TO DISCOVER
      </a>
    </div>
  </section>

  <div class="w-full">
    <!-- Story category pills -->
    <section
      class="border-b border-neutral-200/80 bg-white/90 px-5 py-8 backdrop-blur-sm sm:px-8 lg:px-10 xl:px-14"
      aria-label="Story categories"
      style="-webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);"
    >
      <p class="text-center text-xs font-medium uppercase tracking-[0.3em] text-neutral-500 lg:text-left">Stories</p>
      <div class="mt-5 flex justify-center gap-8 overflow-x-auto pb-1 lg:justify-start lg:gap-10">
        {configs.map((cfg) => (
          <a
            href={`#section-${cfg.category}`}
            data-hero-cat={cfg.category}
            class="story-pill group flex min-w-[4.5rem] flex-col items-center gap-2 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
          >
            <span
              class={`flex h-16 w-16 items-center justify-center rounded-full border border-neutral-200 bg-gradient-to-br ${categoryGradients[cfg.category] ?? 'from-neutral-50 to-white'} text-sm font-semibold ${categoryTextColors[cfg.category] ?? 'text-neutral-900'} shadow-sm ring-neutral-900/10 transition group-hover:scale-105 group-hover:ring-2 sm:h-[4.5rem] sm:w-[4.5rem]`}
              aria-hidden="true"
            >
              {cfg.category.charAt(0).toUpperCase()}
            </span>
            <span class="text-xs font-medium text-neutral-700">
              {cfg.hero_title.replace('The ', '').replace(' Issue', '')}
            </span>
          </a>
        ))}
      </div>
    </section>

    <main class="mx-auto max-w-6xl px-5 py-12 text-center sm:px-8 md:py-16 lg:max-w-none lg:px-10 lg:py-14 lg:text-left xl:px-14">
      <div class="js-reveal-collection mt-14 space-y-16 md:mt-20 md:space-y-20 lg:mt-16">
        {configs.map((cfg) => {
          const catStories = storiesByCategory[cfg.category] ?? [];
          const label = cfg.hero_title.replace('The ', '').replace(' Issue', '');
          return (
            <section id={`section-${cfg.category}`} class="anchor-section" aria-labelledby={`${cfg.category}-heading`}>
              <div class="flex flex-col items-center gap-4 sm:flex-row sm:items-end sm:justify-between lg:items-end">
                <h2
                  id={`${cfg.category}-heading`}
                  class="js-reveal-collection-title font-serif text-2xl font-semibold transition-all duration-1000 ease-out sm:text-3xl text-center lg:text-left"
                >
                  {label}
                </h2>
                <a href={`/archive?cat=${cfg.category}`} class="text-sm font-medium text-neutral-600 underline-offset-4 transition hover:text-neutral-900 hover:underline">
                  View All
                </a>
              </div>

              {catStories.length === 0 ? (
                <p class="mt-8 text-sm text-neutral-400">No stories yet.</p>
              ) : (
                <div class="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-8 lg:grid-cols-3 lg:gap-x-6 lg:gap-y-10">
                  {catStories.slice(0, 3).map((story) => (
                    <a
                      href={`/story/${story.slug}`}
                      class="js-reveal-card group flex flex-col border border-neutral-200 bg-white text-neutral-900 shadow-sm no-underline outline-none transition-[box-shadow,transform] focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 active:scale-[0.98]"
                    >
                      <div class="aspect-[3/4] overflow-hidden bg-neutral-100">
                        <img
                          src={story.social_img}
                          alt=""
                          class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                          width="600"
                          height="800"
                          decoding="async"
                        />
                      </div>
                      <div class="flex flex-1 flex-col p-5 sm:p-6">
                        <h3 class="font-serif text-xl font-semibold">{story.social_title}</h3>
                        <p class="mt-2 flex-1 text-sm text-neutral-600 line-clamp-2">{story.intro_text}</p>
                        <span class="shop-look-btn mt-5 inline-flex min-h-[48px] items-center justify-center border border-neutral-900 bg-neutral-900 px-5 py-3 text-center text-sm font-medium tracking-wide text-white transition-all duration-300 group-hover:border-neutral-700 group-hover:bg-white group-hover:text-neutral-900 group-hover:shadow-lg sm:min-h-[52px] lg:w-full">
                          Shop the Look
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </main>
  </div>

  <script define:vars={{ heroCategories, categoryOrder }}>
    (function () {
      var HERO_CATEGORIES = heroCategories;
      var CATEGORY_ORDER = categoryOrder;
      var KEY_TO_INDEX = {};
      CATEGORY_ORDER.forEach(function (k, i) { KEY_TO_INDEX[k] = i; });

      var v0 = document.getElementById('hero-video-0');
      var v1 = document.getElementById('hero-video-1');
      var fullLink = document.getElementById('hero-full-link');
      var discoverBtn = document.getElementById('hero-discover-btn');
      var titleEl = document.querySelector('.js-hero-title');
      var pills = document.querySelectorAll('.story-pill[data-hero-cat]');

      if (!v0 || !v1 || !fullLink || !discoverBtn || !titleEl) return;

      var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var fadeMs = reduced ? 0 : 1000;
      var layers = [v0, v1];
      var activeLayer = 0;
      var categoryIndex = 0;
      var loopCount = 0;
      var crossfading = false;

      function getActiveVideo() { return layers[activeLayer]; }
      function getInactiveVideo() { return layers[1 - activeLayer]; }
      function cfgAtIndex(idx) { return HERO_CATEGORIES[CATEGORY_ORDER[idx]]; }

      function updateHeroUI(idx) {
        var c = cfgAtIndex(idx);
        titleEl.textContent = c.title;
        fullLink.href = c.link;
        fullLink.setAttribute('aria-label', 'Discover ' + c.title + ' — view the archive');
        discoverBtn.href = c.link;
      }

      function detachEndedListeners() {
        layers.forEach(function (v) { v.removeEventListener('ended', onVideoEnded); });
      }

      function onVideoEnded(e) {
        if (crossfading) return;
        var v = e.target;
        if (v !== getActiveVideo()) return;
        loopCount++;
        if (loopCount < 2) {
          v.currentTime = 0;
          var p = v.play();
          if (p && typeof p.catch === 'function') p.catch(function () {});
          return;
        }
        loopCount = 0;
        crossfadeToCategoryIndex((categoryIndex + 1) % CATEGORY_ORDER.length);
      }

      function attachEndedListener() {
        getActiveVideo().addEventListener('ended', onVideoEnded);
      }

      function crossfadeToCategoryIndex(targetIdx) {
        if (crossfading) return;
        if (targetIdx === categoryIndex) {
          loopCount = 0;
          var cur = getActiveVideo();
          cur.currentTime = 0;
          var pr = cur.play();
          if (pr && typeof pr.catch === 'function') pr.catch(function () {});
          return;
        }
        crossfading = true;
        detachEndedListeners();
        var outgoing = getActiveVideo();
        var incoming = getInactiveVideo();
        var cfg = cfgAtIndex(targetIdx);
        incoming.src = cfg.video;
        incoming.load();

        function beginTransition() {
          incoming.classList.add('is-on-top', 'is-visible');
          outgoing.classList.remove('is-visible', 'is-on-top');
          var p = incoming.play();
          if (p && typeof p.catch === 'function') p.catch(function () {});
          window.setTimeout(function () {
            outgoing.pause();
            activeLayer = 1 - activeLayer;
            categoryIndex = targetIdx;
            updateHeroUI(categoryIndex);
            loopCount = 0;
            getActiveVideo().classList.add('is-on-top');
            attachEndedListener();
            var playAgain = getActiveVideo().play();
            if (playAgain && typeof playAgain.catch === 'function') playAgain.catch(function () {});
            crossfading = false;
          }, fadeMs);
        }

        function onceCanPlay() {
          incoming.removeEventListener('canplay', onceCanPlay);
          beginTransition();
        }

        if (incoming.readyState >= 3) { beginTransition(); }
        else { incoming.addEventListener('canplay', onceCanPlay); }
      }

      updateHeroUI(0);
      attachEndedListener();
      var firstPlay = getActiveVideo().play();
      if (firstPlay && typeof firstPlay.catch === 'function') firstPlay.catch(function () {});

      pills.forEach(function (pill) {
        pill.addEventListener('click', function (e) {
          var key = pill.getAttribute('data-hero-cat');
          if (!key) return;
          var idx = KEY_TO_INDEX[key];
          if (idx === undefined) return;
          e.preventDefault();
          loopCount = 0;
          crossfadeToCategoryIndex(idx);
          var href = pill.getAttribute('href') || '';
          if (href.charAt(0) === '#') {
            var sec = document.getElementById(href.slice(1));
            if (sec) sec.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
          }
        });
      });

      // Scroll reveal
      var reduced2 = reduced;
      function revealHero() {
        var kicker = document.querySelector('.js-hero-kicker');
        var title = document.querySelector('.js-hero-title');
        if (reduced2) {
          if (kicker) kicker.classList.add('active');
          if (title) title.classList.add('active');
          return;
        }
        requestAnimationFrame(function () {
          if (kicker) { kicker.style.transitionDelay = '0ms'; kicker.classList.add('active'); }
          if (title) { title.style.transitionDelay = '500ms'; title.classList.add('active'); }
        });
      }

      var collectionEl = document.querySelector('.js-reveal-collection');
      var collectionTitles = document.querySelectorAll('.js-reveal-collection-title');
      var cards = document.querySelectorAll('.js-reveal-card');

      var obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var t = entry.target;
          collectionTitles.forEach(function (el) { el.classList.add('active'); });
          if (reduced2) {
            cards.forEach(function (c) { c.classList.add('active'); });
          } else {
            cards.forEach(function (card, i) {
              window.setTimeout(function () { card.classList.add('active'); }, i * 250);
            });
          }
          obs.unobserve(t);
        });
      }, { root: null, rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

      if (collectionEl) obs.observe(collectionEl);

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', revealHero);
      } else {
        revealHero();
      }
    })();
  </script>
</Base>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/index.astro
git commit -m "feat: add dynamic index page with D1 hero and story grid"
```

---

## Task 14: Build and Verify with wrangler pages dev

- [ ] **Step 1: Build the Astro project**

```bash
cd /Users/yossibeck/dev/yb/aff-website
npm run build
```

Expected: `dist/` directory created, no TypeScript errors, no build errors.

- [ ] **Step 2: Start local Pages dev server with D1**

```bash
npx wrangler pages dev dist
```

Expected: Server starts on `http://localhost:8788` (or similar). D1 binding is available.

- [ ] **Step 3: Verify index page**

Open `http://localhost:8788` in browser. Check:
- Hero video plays (pullover.mp4 from public/)
- Hero title reads "The Wellness Issue" (from site_config)
- "CLICK TO DISCOVER" button links to `/archive?cat=wellness`
- Category pills show Wellness / Street / Beauty
- Story grid shows the seeded story card for wellness

- [ ] **Step 4: Verify archive page**

Open `http://localhost:8788/archive`. Check:
- Dark background with heidi-in-bg.png
- Filter pills: All / Wellness / Street / Beauty
- Story card for "The 5 AM Glow-Up Routine" is visible
- Clicking `/archive?cat=wellness` shows only wellness stories
- Clicking `/archive?cat=street` shows "No stories yet in this category."

- [ ] **Step 5: Verify story page**

Open `http://localhost:8788/story/morning-glow-routine`. Check:
- Social anchor: heidi-in-bg.png image (50%) + "The 5 AM Glow-Up Routine" title (50%)
- Intro text: "True beauty starts with a calm morning..."
- Section: "Minimalist Silk Dress" title, story text, product image, "SHOP THE LOOK" button linking to aliexpress

- [ ] **Step 6: Verify 404 redirect**

Open `http://localhost:8788/story/does-not-exist`. Check: redirects to `/archive`.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: complete Astro + D1 migration — all three pages live"
```
