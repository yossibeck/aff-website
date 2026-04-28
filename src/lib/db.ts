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
  curated_title: string;
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
  domain: 'lp.aurastclaire.com',
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
  const host = hostname.split(':')[0];
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

export async function getProductAffiliateUrl(
  db: D1Database,
  productId: string,
  tenantId: number
): Promise<string | null> {
  const row = await db
    .prepare(
      "SELECT affiliate_url FROM products WHERE product_id = ? AND tenant_id = ? AND status = 'published'"
    )
    .bind(productId, tenantId)
    .first<{ affiliate_url: string }>();
  return row?.affiliate_url ?? null;
}

// ── Users ──────────────────────────────────────────────────────────────────

export interface User {
  id: number;
  tenant_id: number;
  email: string;
  password_hash: string;
  pinterest_access_token: string | null;
  pinterest_refresh_token: string | null;
  pinterest_board_id: string | null;
}

export async function getUserByEmail(
  db: D1Database,
  email: string,
  tenantId: number
): Promise<User | null> {
  return db
    .prepare('SELECT * FROM users WHERE email = ? AND tenant_id = ?')
    .bind(email, tenantId)
    .first<User>();
}

export async function getUserById(
  db: D1Database,
  id: number,
  tenantId: number
): Promise<User | null> {
  return db
    .prepare('SELECT * FROM users WHERE id = ? AND tenant_id = ?')
    .bind(id, tenantId)
    .first<User>();
}

export async function createUser(
  db: D1Database,
  tenantId: number,
  email: string,
  passwordHash: string
): Promise<number> {
  const result = await db
    .prepare('INSERT INTO users (tenant_id, email, password_hash) VALUES (?, ?, ?)')
    .bind(tenantId, email, passwordHash)
    .run();
  return result.meta.last_row_id as number;
}

export async function updatePinterestTokens(
  db: D1Database,
  userId: number,
  tenantId: number,
  accessToken: string,
  refreshToken: string
): Promise<void> {
  await db
    .prepare(
      'UPDATE users SET pinterest_access_token = ?, pinterest_refresh_token = ? WHERE id = ? AND tenant_id = ?'
    )
    .bind(accessToken, refreshToken, userId, tenantId)
    .run();
}

export async function updatePinterestBoardId(
  db: D1Database,
  userId: number,
  tenantId: number,
  boardId: string
): Promise<void> {
  await db
    .prepare('UPDATE users SET pinterest_board_id = ? WHERE id = ? AND tenant_id = ?')
    .bind(boardId, userId, tenantId)
    .run();
}
