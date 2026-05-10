# Article Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `content_type` column to `stories` and render a reading-first article layout (hero + prose + product interruptions) when `content_type = 'article'`, leaving the existing story layout untouched.

**Architecture:** Single-page branch in `[slug].astro` — after `getStory()`, an `if (story.content_type === 'article')` block returns the article template early; the existing template renders as the `else` path. The article template is inline in the same file (no new component file — there's no `src/components/` directory and the codebase favors inline Astro templates). Three new DB columns land in one migration file.

**Tech Stack:** Cloudflare D1 (SQLite), Wrangler CLI, Astro SSR, Tailwind CSS v4

---

## File Map

| Action | Path | What changes |
|--------|------|-------------|
| Create | `migrations/002-add-article-fields.sql` | Adds `content_type`, `hero_desktop_url`, `hero_mobile_url`; sets story 38 to `'article'` |
| Modify | `src/lib/db.ts` | Add three fields to `StoryRow` interface |
| Modify | `src/pages/story/[slug].astro` | Add article layout branch (early return); existing template unchanged |

---

## Task 1: Write the migration file

**Files:**
- Create: `migrations/002-add-article-fields.sql`

- [ ] **Step 1: Create the migration**

```sql
-- Add article layout support to stories
-- Safe to run against live data: columns are nullable / have defaults

ALTER TABLE stories ADD COLUMN content_type TEXT NOT NULL DEFAULT 'story';
ALTER TABLE stories ADD COLUMN hero_desktop_url TEXT;
ALTER TABLE stories ADD COLUMN hero_mobile_url TEXT;

-- Mark story 38 as the first article
UPDATE stories SET content_type = 'article' WHERE id = 38;
```

- [ ] **Step 2: Commit**

```bash
git add migrations/002-add-article-fields.sql
git commit -m "feat: migration — add content_type and hero image columns to stories"
```

---

## Task 2: Apply migration locally

**Files:** none (runtime state only)

- [ ] **Step 1: Apply to local D1**

```bash
wrangler d1 execute aff-story-db --local --file=migrations/002-add-article-fields.sql
```

Expected output: lines like `Executing on local database...` with no errors. If the database hasn't been seeded locally yet, run `npm run db:refresh` first, then re-run the command above.

- [ ] **Step 2: Verify columns exist**

```bash
wrangler d1 execute aff-story-db --local --command="SELECT id, content_type, hero_desktop_url, hero_mobile_url FROM stories WHERE id = 38"
```

Expected: one row with `content_type = article`, `hero_desktop_url = null`, `hero_mobile_url = null`.

---

## Task 3: Update StoryRow type

**Files:**
- Modify: `src/lib/db.ts:16-26`

- [ ] **Step 1: Add three fields to the `StoryRow` interface**

Replace the current `StoryRow` interface:

```ts
export interface StoryRow {
  id: number;
  tenant_id: number;
  slug: string;
  category: string;
  social_title: string;
  social_img: string;
  intro_text: string;
  sections_json: string;
  curated_title: string;
  content_type: string;
  hero_desktop_url: string | null;
  hero_mobile_url: string | null;
}
```

`StoryWithSections` already uses `Omit<StoryRow, 'sections_json'>` spread so it inherits the new fields automatically — no other changes needed in `db.ts`.

- [ ] **Step 2: Type-check**

```bash
npx astro check
```

Expected: 0 errors. If you see "Property 'content_type' does not exist", the interface edit didn't save correctly — retry.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: add content_type and hero image fields to StoryRow type"
```

---

## Task 4: Add article layout to [slug].astro

**Files:**
- Modify: `src/pages/story/[slug].astro`

The article layout is added as an early-return branch immediately after the Pinterest `pinState` block (line 31). Everything after that return is the unchanged existing template.

- [ ] **Step 1: Add the article branch**

After the closing `}` of the Pinterest pinState block (currently line 31), insert the following block. It must come **before** the `---` closing fence of the frontmatter and the existing `<Base>` template.

```astro
// Article layout — early return
if (story.content_type === 'article') {
  return new Response(
    await Astro.slots.render('default'),
    { headers: { 'Content-Type': 'text/html' } }
  );
}
```

Wait — Astro SSR pages don't use `Response` returns for conditional template switching. Instead, use a conditional in the template itself. The correct pattern is:

The frontmatter stays as-is. In the template, wrap the existing content and add an article branch using `{story.content_type === 'article' ? ( ... ) : ( ... )}`. However, the existing template is too large for a ternary. The cleanest Astro approach is to use an early `Response` redirect — but that's not applicable here.

**Correct approach for Astro:** Use a top-level conditional in the template. Structure the file as:

```astro
---
// [all existing frontmatter unchanged — lines 1–31]
---
{story.content_type === 'article' ? (
  <!-- ARTICLE LAYOUT -->
  <Base title={`${tenant.name} — ${story.social_title}`}>
    <!-- hero -->
    <div class="w-full overflow-hidden bg-neutral-100" style="height: clamp(14rem, 30vw, 18rem);">
      <picture>
        <source media="(min-width: 768px)" srcset={story.hero_desktop_url ?? ''} />
        <img
          src={story.hero_mobile_url ?? ''}
          alt=""
          class="h-full w-full object-cover"
          width="1200"
          height="630"
          decoding="async"
        />
      </picture>
    </div>

    <main class="mx-auto max-w-2xl px-5 pb-20 pt-10 sm:px-8 lg:px-10">
      <!-- article title -->
      <h1 class="font-serif text-3xl font-normal leading-snug text-neutral-900 sm:text-4xl">
        {story.social_title}
      </h1>

      <!-- intro prose -->
      <div class="mt-8 space-y-5">
        {story.intro_text.split('\n\n').map((para) => (
          <p class="text-lg leading-relaxed text-neutral-700">{para}</p>
        ))}
      </div>

      <!-- product sections -->
      <div class="mt-16 space-y-20">
        {story.sections.map((section, i) => (
          <article class="border-b border-neutral-200 pb-20 last:border-0 last:pb-0">
            <!-- story prose -->
            <div class="space-y-5">
              {section.story_text.split('\n\n').map((para) => (
                <p class="text-lg leading-relaxed text-neutral-700">{para}</p>
              ))}
            </div>

            <!-- product image -->
            <a
              href={`/story/${slug}/click/${section.product_id}${sc ? `?sc=${encodeURIComponent(sc)}` : ''}`}
              class="mt-10 block overflow-hidden bg-neutral-50"
              tabindex="-1"
              aria-hidden="true"
            >
              <img
                src={section.display_image}
                alt={section.product_title}
                class="h-auto w-full object-cover"
                width="900"
                height="1200"
                decoding="async"
              />
            </a>

            <!-- product label + shop button -->
            {section.product_title && (
              <p class="mt-6 text-[10px] font-medium uppercase tracking-[0.3em] text-neutral-400">
                {section.product_title}
              </p>
            )}
            <a
              href={`/story/${slug}/click/${section.product_id}${sc ? `?sc=${encodeURIComponent(sc)}` : ''}`}
              class="mt-3 inline-flex min-h-[52px] w-full items-center justify-center bg-neutral-900 px-8 py-3 text-center text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-neutral-800 sm:w-auto"
            >
              Shop
            </a>
          </article>
        ))}
      </div>

      <!-- Pinterest: coming soon -->
    </main>
  </Base>
) : (
  <!-- EXISTING STORY LAYOUT — unchanged -->
  <Base title={`${tenant.name} — ${story.social_title}`}>
    [paste entire existing <Base>...</Base> block here verbatim]
  </Base>
)}
```

**In practice:** Open `src/pages/story/[slug].astro`. The template currently starts at line 33 with `<Base title=...>` and ends at line 274 with `</Base>`. Make the following exact edit:

Replace line 33 (`<Base title=...>`) through line 274 (`</Base>`) with the full conditional block shown above, where the `: (` branch contains the complete original lines 33–274 verbatim.

The complete file after the edit looks like this (frontmatter lines 1–32 unchanged):

```astro
---
import Base from '../../layouts/Base.astro';
import { getStory, getUserById } from '../../lib/db';
import { trackPageView } from '../../lib/tracking';
import { env } from 'cloudflare:workers';

const { tenant, sc, cfContext, user } = Astro.locals;
const db = env.DB;

const { slug } = Astro.params;
const story = await getStory(db, tenant.id, slug!);

if (!story) {
  return Astro.redirect('/', 302);
}

await trackPageView(db, cfContext, { tenantId: tenant.id, storySlug: slug, sc, request: Astro.request });

// Determine Pinterest button state
type PinState = 'guest' | 'no_pinterest' | 'no_board' | 'ready';
let pinState: PinState = 'guest';
if (user) {
  const userRow = await getUserById(db, user.id, tenant.id);
  if (!userRow?.pinterest_access_token) {
    pinState = 'no_pinterest';
  } else if (!userRow?.pinterest_board_id) {
    pinState = 'no_board';
  } else {
    pinState = 'ready';
  }
}
---
{story.content_type === 'article' ? (
<Base title={`${tenant.name} — ${story.social_title}`}>
  <div class="w-full overflow-hidden bg-neutral-100" style="height: clamp(14rem, 30vw, 18rem);">
    <picture>
      <source media="(min-width: 768px)" srcset={story.hero_desktop_url ?? ''} />
      <img
        src={story.hero_mobile_url ?? ''}
        alt=""
        class="h-full w-full object-cover"
        width="1200"
        height="630"
        decoding="async"
      />
    </picture>
  </div>

  <main class="mx-auto max-w-2xl px-5 pb-20 pt-10 sm:px-8 lg:px-10">
    <h1 class="font-serif text-3xl font-normal leading-snug text-neutral-900 sm:text-4xl">
      {story.social_title}
    </h1>

    <div class="mt-8 space-y-5">
      {story.intro_text.split('\n\n').map((para) => (
        <p class="text-lg leading-relaxed text-neutral-700">{para}</p>
      ))}
    </div>

    <div class="mt-16 space-y-20">
      {story.sections.map((section) => (
        <article class="border-b border-neutral-200 pb-20 last:border-0 last:pb-0">
          <div class="space-y-5">
            {section.story_text.split('\n\n').map((para) => (
              <p class="text-lg leading-relaxed text-neutral-700">{para}</p>
            ))}
          </div>
          <a
            href={`/story/${slug}/click/${section.product_id}${sc ? `?sc=${encodeURIComponent(sc)}` : ''}`}
            class="mt-10 block overflow-hidden bg-neutral-50"
            tabindex="-1"
            aria-hidden="true"
          >
            <img
              src={section.display_image}
              alt={section.product_title}
              class="h-auto w-full object-cover"
              width="900"
              height="1200"
              decoding="async"
            />
          </a>
          {section.product_title && (
            <p class="mt-6 text-[10px] font-medium uppercase tracking-[0.3em] text-neutral-400">
              {section.product_title}
            </p>
          )}
          <a
            href={`/story/${slug}/click/${section.product_id}${sc ? `?sc=${encodeURIComponent(sc)}` : ''}`}
            class="mt-3 inline-flex min-h-[52px] w-full items-center justify-center bg-neutral-900 px-8 py-3 text-center text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-neutral-800 sm:w-auto"
          >
            Shop
          </a>
        </article>
      ))}
    </div>

    <!-- Pinterest: coming soon -->
  </main>
</Base>
) : (
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

      <!-- Product sections -->
      <section class="js-reveal-collection" aria-labelledby="curated-heading">
        <div class="text-center md:text-left">
          <h2 id="curated-heading" class="js-reveal-collection-title font-serif text-2xl font-semibold text-neutral-900 sm:text-3xl">
            {story.curated_title}
          </h2>
        </div>

        <div class="mt-14 space-y-20 md:mt-16 md:space-y-24">
          {story.sections.map((section, i) => (
            <article
              class="js-reveal-card border-b border-neutral-200/80 pb-20 last:border-0 last:pb-0 md:pb-24"
              data-bundle-index={i}
            >
              <div class="px-4 sm:px-5 space-y-4">
                {section.story_text.split('\n\n').map((para) => (
                  <p class="text-base leading-[1.75] text-neutral-700 sm:text-[1.05rem]">
                    {para}
                  </p>
                ))}
              </div>
              <a
                href={`/story/${slug}/click/${section.product_id}${sc ? `?sc=${encodeURIComponent(sc)}` : ''}`}
                class="mt-12 block overflow-hidden bg-neutral-50"
                tabindex="-1"
                aria-hidden="true"
              >
                <img
                  src={section.display_image}
                  alt={section.product_title}
                  class="h-auto w-full object-cover transition-transform duration-500 hover:scale-[1.02]"
                  width="900"
                  height="1200"
                  decoding="async"
                />
              </a>
              <div class="px-4 sm:px-5">
                {section.product_title && (
                  <p class="mt-8 text-[10px] font-medium uppercase tracking-[0.3em] text-neutral-400">
                    {section.product_title}
                  </p>
                )}
                <a
                  href={`/story/${slug}/click/${section.product_id}${sc ? `?sc=${encodeURIComponent(sc)}` : ''}`}
                  class="mt-3 inline-flex min-h-[52px] w-full items-center justify-center bg-neutral-900 px-8 py-3 text-center text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-neutral-800 sm:w-auto"
                >
                  Shop the Look
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <!-- Save to Pinterest -->
      <section class="border-t border-neutral-200 pt-12 text-center">
        <p class="mb-5 text-xs font-medium uppercase tracking-[0.3em] text-neutral-400">Share this story</p>
        {pinState === 'guest' && (
          <a
            href={`/login?next=/story/${slug}`}
            class="inline-flex min-h-[52px] items-center justify-center gap-2.5 bg-[#e60023] px-8 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-[#c0001d]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/></svg>
            Sign in to Save
          </a>
        )}
        {pinState === 'no_pinterest' && (
          <a
            href="/pinterest/connect"
            class="inline-flex min-h-[52px] items-center justify-center gap-2.5 bg-[#e60023] px-8 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-[#c0001d]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/></svg>
            Connect Pinterest
          </a>
        )}
        {pinState === 'no_board' && (
          <a
            href="/pinterest/boards"
            class="inline-flex min-h-[52px] items-center justify-center gap-2.5 bg-[#e60023] px-8 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-[#c0001d]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/></svg>
            Choose a Board
          </a>
        )}
        {pinState === 'ready' && (
          <button
            id="pin-btn"
            data-slug={slug}
            class="inline-flex min-h-[52px] items-center justify-center gap-2.5 bg-[#e60023] px-8 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-[#c0001d] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/></svg>
            <span id="pin-btn-label">Save to Pinterest</span>
          </button>
        )}
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

      var collection = document.querySelector('.js-reveal-collection');
      var collectionTitle = document.querySelector('.js-reveal-collection-title');
      var cards = document.querySelectorAll('.js-reveal-card');

      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          if (collectionTitle) collectionTitle.classList.add('active');
          if (reduced) {
            cards.forEach(function (c) { c.classList.add('active'); });
          } else {
            cards.forEach(function (card, i) {
              window.setTimeout(function () { card.classList.add('active'); }, i * 150);
            });
          }
          observer.unobserve(entry.target);
        });
      }, { root: null, rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

      if (collection) observer.observe(collection);

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', revealHero);
      } else {
        revealHero();
      }
    })();

    // Save to Pinterest
    (function () {
      var btn = document.getElementById('pin-btn') as HTMLButtonElement | null;
      var label = document.getElementById('pin-btn-label');
      if (!btn || !label) return;
      btn.addEventListener('click', async function () {
        btn!.disabled = true;
        label!.textContent = 'Saving…';
        try {
          var res = await fetch('/api/pinterest/pin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: btn!.dataset.slug }),
          });
          var data: { success?: boolean; error?: string; redirect?: string } = await res.json();
          if (data.redirect) {
            window.location.href = data.redirect;
            return;
          }
          if (data.success) {
            label!.textContent = 'Saved!';
          } else {
            label!.textContent = data.error ?? 'Error — try again';
            btn!.disabled = false;
          }
        } catch {
          label!.textContent = 'Error — try again';
          btn!.disabled = false;
        }
      });
    })();
  </script>
</Base>
)}
```

- [ ] **Step 2: Type-check**

```bash
npx astro check
```

Expected: 0 errors. Common issue: Astro may complain about the top-level ternary wrapping two `<Base>` elements — if so, wrap the entire ternary in a `<Fragment>`:

```astro
<Fragment>
  {story.content_type === 'article' ? (
    <Base ...>...</Base>
  ) : (
    <Base ...>...</Base>
  )}
</Fragment>
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/story/[slug].astro
git commit -m "feat: add article layout branch to story page"
```

---

## Task 5: Verify in dev server

**Files:** none

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Check a known story-layout page still works**

Open any story slug in the browser that is NOT id=38. Confirm the existing reveal-card animation, hero image, and Pinterest section all render correctly. No regression.

- [ ] **Step 3: Check the article layout**

Look up the slug for story id=38:

```bash
wrangler d1 execute aff-story-db --local --command="SELECT slug FROM stories WHERE id = 38"
```

Open `/story/<that-slug>` in the browser. Confirm:
- Compact hero renders (will show broken image until `hero_desktop_url`/`hero_mobile_url` are populated, but the container should be visible)
- `social_title` shows as `<h1>` below hero
- `intro_text` renders as prose paragraphs
- Each section shows story text → product image → "Shop" button
- No Pinterest UI visible
- No reveal animations

---

## Task 6: Apply migration to remote D1

**Files:** none (remote DB state)

- [ ] **Step 1: Apply migration to production D1**

```bash
wrangler d1 execute aff-story-db --remote --file=migrations/002-add-article-fields.sql
```

Expected: no errors. The `DEFAULT 'story'` means all existing rows are unaffected. Story 38 gets `content_type = 'article'`.

- [ ] **Step 2: Verify remotely**

```bash
wrangler d1 execute aff-story-db --remote --command="SELECT id, slug, content_type FROM stories WHERE id = 38"
```

Expected: `content_type = article`.

- [ ] **Step 3: Deploy**

```bash
npm run deploy
```

Expected: build succeeds and Wrangler reports successful deployment. Verify the live article page loads at the slug for story 38.

---

## Self-Review

**Spec coverage:**
- ✅ `content_type TEXT DEFAULT 'story'` column — Task 1
- ✅ `hero_desktop_url TEXT`, `hero_mobile_url TEXT` columns — Task 1
- ✅ `StoryRow` type updated — Task 3
- ✅ `[slug].astro` branches on `content_type` — Task 4
- ✅ Article layout: hero, h1, intro prose, section loop (story_text + image + Shop button) — Task 4
- ✅ Pinterest stub comment — Task 4
- ✅ Story 38 set to `content_type = 'article'` in migration SQL — Task 1
- ✅ Existing story layout unchanged — Task 4 (verbatim copy in else branch)
- ✅ Remote D1 migration — Task 6

**No placeholders found.**

**Type consistency:** `story.content_type`, `story.hero_desktop_url`, `story.hero_mobile_url` — all defined in Task 3 `StoryRow` and used in Task 4 template. `section.story_text`, `section.display_image`, `section.product_id`, `section.product_title` — all pre-existing fields on `ResolvedSection`, unchanged.
