import { describe, it, expect } from 'vitest';
import { parseSections, mergeSectionsWithProducts, getStorySlugByProductId, getProductAffiliateUrl } from './db';

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

