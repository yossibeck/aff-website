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
