import { describe, it, expect } from 'vitest';
import { getSubdomainSc, isAllowedSubdomainPath } from './subdomain-routing';

describe('getSubdomainSc', () => {
  it('extracts sc and main host from a tracking subdomain', () => {
    expect(getSubdomainSc('tt.aurastclaire.com')).toEqual({
      sc: 'tt',
      mainHost: 'aurastclaire.com',
    });
  });

  it('returns null for a non-tracking host', () => {
    expect(getSubdomainSc('aurastclaire.com')).toBeNull();
    expect(getSubdomainSc('admin.aurastclaire.com')).toBeNull();
  });
});

describe('isAllowedSubdomainPath', () => {
  it('allows the root path', () => {
    expect(isAllowedSubdomainPath('/')).toBe(true);
  });

  it('allows a story path', () => {
    expect(
      isAllowedSubdomainPath(
        '/story/the-quiet-pull-of-dressing-for-the-ceremony-you-almost-missed'
      )
    ).toBe(true);
  });

  it('allows a story click-through path', () => {
    expect(isAllowedSubdomainPath('/story/some-slug/click/abc123')).toBe(true);
  });

  it('allows a product deep link', () => {
    expect(isAllowedSubdomainPath('/p/WhitePants-1')).toBe(true);
  });

  it('allows the styles archive, with or without a trailing slash', () => {
    expect(isAllowedSubdomainPath('/styles')).toBe(true);
    expect(isAllowedSubdomainPath('/styles/')).toBe(true);
  });

  it('rejects WordPress scanner probes not on the static blocklist', () => {
    expect(isAllowedSubdomainPath('/wp-json/')).toBe(false);
    expect(isAllowedSubdomainPath('/readme.html')).toBe(false);
    expect(isAllowedSubdomainPath('/wp-config-sample.php')).toBe(false);
    expect(isAllowedSubdomainPath('/.well-known/pki-validation/x.txt')).toBe(false);
  });

  it('rejects other non-content paths, including robots.txt/sitemap.xml', () => {
    expect(isAllowedSubdomainPath('/robots.txt')).toBe(false);
    expect(isAllowedSubdomainPath('/sitemap.xml')).toBe(false);
    expect(isAllowedSubdomainPath('/login')).toBe(false);
    expect(isAllowedSubdomainPath('/pinterest/connect')).toBe(false);
  });
});
