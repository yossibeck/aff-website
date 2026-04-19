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
  FOREIGN KEY (story_id)   REFERENCES stories(id),
  FOREIGN KEY (product_id) REFERENCES products(product_id)
);
