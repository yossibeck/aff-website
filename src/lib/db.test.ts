import { describe, it, expect } from 'vitest';
import {
  parseSections,
  mergeSectionsWithProducts,
  getStorySlugByProductId,
  getProductAffiliateUrl,
  getStoriesPage,
} from './db';

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

describe('getStorySlugByProductId', () => {
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

function _mockDbReturning(rows: unknown[]) {
  const calls: { sql: string; args: unknown[] }[] = [];
  const mockDb = {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => {
        calls.push({ sql, args });
        return { all: async () => ({ results: rows }) };
      },
    }),
  } as unknown as D1Database;
  return { mockDb, calls };
}

describe('getStoriesPage', () => {
  it('reports hasMore=false and returns everything when fewer rows than the limit', async () => {
    const rows = [
      { slug: 'a', category: 'street', social_img: 'a.jpg', social_title: 'A' },
      { slug: 'b', category: 'street', social_img: 'b.jpg', social_title: 'B' },
    ];
    const { mockDb } = _mockDbReturning(rows);
    const result = await getStoriesPage(mockDb, 1, { limit: 30, offset: 0 });
    expect(result.hasMore).toBe(false);
    expect(result.stories).toHaveLength(2);
  });

  it('reports hasMore=true and trims the extra probe row when more rows exist than the limit', async () => {
    const rows = Array.from({ length: 4 }, (_, i) => ({
      slug: `s${i}`, category: 'street', social_img: `${i}.jpg`, social_title: `S${i}`,
    }));
    const { mockDb } = _mockDbReturning(rows); // limit=3, DB returns limit+1=4
    const result = await getStoriesPage(mockDb, 1, { limit: 3, offset: 0 });
    expect(result.hasMore).toBe(true);
    expect(result.stories).toHaveLength(3);
    expect(result.stories.map((s) => s.slug)).toEqual(['s0', 's1', 's2']);
  });

  it('requests limit+1 rows and the given offset, without a category filter', async () => {
    const { mockDb, calls } = _mockDbReturning([]);
    await getStoriesPage(mockDb, 1, { limit: 30, offset: 60 });
    expect(calls[0].sql).not.toMatch(/AND category = \?/i);
    expect(calls[0].args).toEqual([1, 31, 60]);
  });

  it('filters by category when given, binding it between tenant and limit', async () => {
    const { mockDb, calls } = _mockDbReturning([]);
    await getStoriesPage(mockDb, 1, { category: 'beauty', limit: 30, offset: 0 });
    expect(calls[0].sql).toMatch(/AND category = \?/i);
    expect(calls[0].args).toEqual([1, 'beauty', 31, 0]);
  });

  it('only selects the four fields the archive grid actually renders', async () => {
    const { mockDb, calls } = _mockDbReturning([]);
    await getStoriesPage(mockDb, 1, { limit: 30, offset: 0 });
    expect(calls[0].sql).toMatch(/SELECT slug, category, social_img, social_title FROM stories/);
  });
});

