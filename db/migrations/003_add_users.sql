CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  pinterest_access_token TEXT,
  pinterest_refresh_token TEXT,
  pinterest_board_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(email, tenant_id)
);
