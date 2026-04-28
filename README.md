# aff-website

A multi-tenant fashion editorial site serving affiliate-linked product stories. A single Astro SSR codebase serves multiple brand sites (e.g. Aura St. Claire), with the active tenant resolved per-request by hostname.

Built on **Astro SSR** + **Cloudflare Pages** + **Cloudflare D1** (SQLite).

---

## What it does

- **`/`** — Hero landing with a per-category video crossfade switcher (Wellness / Street / Beauty)
- **`/archive`** — Story card grid, filterable by category
- **`/story/[slug]`** — Single story: editorial sections, product images, and "SHOP THE LOOK" affiliate buttons
- **`/p/[productId]`** — Redirect from product ID → story slug (used by affiliate tracking)

---

## Architecture

- **Multi-tenancy** — `src/middleware.ts` reads the request hostname, queries `tenant_domains` in D1, and stores the resolved tenant in `Astro.locals.tenant`. All pages read from there — no repeated lookups.
- **Database** — Cloudflare D1 (`aff-story-db`). Tables: `tenants`, `tenant_domains`, `products`, `stories`, `site_config`, `story_products`.
- **Data layer** — `src/lib/db.ts` contains all query functions and TypeScript interfaces. No ORM.
- **Layout** — CSS/animations are frozen from the original static HTML. The migration to Astro was data-only, no redesign.
- **Affiliate Worker** — a separate `aff-story` Cloudflare Worker handles pixel tracking and analytics. This repo does not touch it.

```
src/
├── middleware.ts          ← tenant detection
├── lib/db.ts              ← D1 query functions + TS interfaces
├── layouts/Base.astro     ← shared nav, fonts, footer
└── pages/
    ├── index.astro
    ├── archive.astro
    ├── p/[productId].astro
    └── story/[slug].astro
```

---

## Local development

```bash
# 1. Export remote DB
wrangler d1 export aff-story-db --remote --output=db/remote-backup.sql

# 2. Seed local DB
wrangler d1 execute aff-story-db --local --file=db/remote-backup.sql

# 3. Apply migrations locally
wrangler d1 execute aff-story-db --local --file=db/migrations/001_add_stories_site_config.sql

# 4. Start dev server
npm run dev
```

| Command             | Action                                      |
| :------------------ | :------------------------------------------ |
| `npm run dev`       | Start local dev server at `localhost:4321`  |
| `npm run build`     | Build for production                        |
| `npm run preview`   | Preview production build locally            |

---

## Full spec

See [`docs/superpowers/specs/2026-04-19-astro-d1-magazine-engine-design.md`](docs/superpowers/specs/2026-04-19-astro-d1-magazine-engine-design.md) for the complete architecture design including DB schema, query functions, and page-by-page breakdown.
