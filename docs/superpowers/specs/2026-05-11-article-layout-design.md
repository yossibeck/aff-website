# Article Layout Design

**Date:** 2026-05-11
**Status:** Approved

## Overview

Add a `content_type` field to the `stories` table so individual stories can render as either the existing animated card-reveal layout (`story`) or a new reading-first long-form article layout (`article`). No new routes. The same `/story/[slug]` page branches on `content_type`.

## Database Migration (`migrations/002-add-article-fields.sql`)

```sql
ALTER TABLE stories ADD COLUMN content_type TEXT NOT NULL DEFAULT 'story';
ALTER TABLE stories ADD COLUMN hero_desktop_url TEXT;
ALTER TABLE stories ADD COLUMN hero_mobile_url TEXT;

UPDATE stories SET content_type = 'article' WHERE id = 38;
```

All three columns are nullable/defaulted — safe to run against live data. Existing stories remain `story` layout with no changes.

## Type Changes (`src/lib/db.ts`)

Add three fields to `StoryRow`:

```ts
content_type: string;
hero_desktop_url: string | null;
hero_mobile_url: string | null;
```

`StoryWithSections` inherits these automatically via the existing `Omit<StoryRow, 'sections_json'>` spread.

## Page Branching (`src/pages/story/[slug].astro`)

After `getStory()` returns, check `story.content_type`:

- `'article'` → render article template (see below), return early
- anything else → existing story template, unchanged

The Pinterest `pinState` logic runs before the branch so it's available to both layouts if needed in future.

## Article Layout

### 1. Compact Hero

A `<picture>` element with:
- `<source media="(min-width: 768px)" srcset={story.hero_desktop_url}>` (desktop image)
- `<img src={story.hero_mobile_url}>` fallback (mobile image)

Container: fixed height (`h-56 md:h-72`), `object-cover`, `w-full`. No animation, no box-shadow.

### 2. Article Header

`social_title` as `<h1>` below the hero. Centered, `max-w-2xl mx-auto`, large serif, normal weight.

### 3. Intro Prose

`intro_text` split on `\n\n` → `<p>` elements. Style: `max-w-2xl mx-auto`, `text-lg leading-relaxed text-neutral-700`.

### 4. Section Loop

For each section in `story.sections`:
- `story_text` split on `\n\n` → prose paragraphs (same style as intro)
- Product image: `<a href="/story/[slug]/click/[product_id]">` wrapping `<img src={section.display_image}>`
- Product title label: small uppercase tracking, `text-neutral-400`
- "Shop" button: same markup as existing `Shop the Look` CTA (`bg-neutral-900`, uppercase, tracking)
- Thin `border-b border-neutral-200` separator between sections, `last:border-0`

No reveal animations. No IntersectionObserver. Static render only.

### 5. Pinterest Stub

```html
<!-- Pinterest: coming soon -->
```

No rendered UI for now.

## Out of Scope

- Admin UI for setting `content_type`, `hero_desktop_url`, `hero_mobile_url`
- Pinterest integration in article layout
- New routes or URL changes
- Changes to existing story layout behavior
