import type { DbAdapter } from './adapter';

export const SCHEMA_VERSION = 3;

const V1 = `
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('list','fact','place')),
  split_on_spaces INTEGER NOT NULL DEFAULT 0,
  sensitive INTEGER NOT NULL DEFAULT 0,
  photo_uri TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS categories_key_live ON categories(key) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  key TEXT,
  value TEXT,
  value_enc TEXT,
  sensitive INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS entries_category ON entries(category_id);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS notes_created ON notes(created_at);
CREATE TABLE IF NOT EXISTS aliases (
  alias TEXT PRIMARY KEY,
  target TEXT NOT NULL,
  builtin INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS timers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  fires_at INTEGER NOT NULL,
  notification_id TEXT,
  created_at INTEGER NOT NULL,
  done INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export async function migrate(db: DbAdapter): Promise<void> {
  await db.exec('PRAGMA journal_mode = WAL;');
  const rows = await db.all<{ user_version: number }>('PRAGMA user_version');
  const v = rows[0]?.user_version ?? 0;
  if (v < 1) {
    await db.exec(V1);
    await db.exec('PRAGMA user_version = 1');
  }
  if (v < 2) {
    // v2: list item amounts ("eggs:5", "flour:1kg")
    await db.exec('ALTER TABLE entries ADD COLUMN amount TEXT');
    await db.exec('PRAGMA user_version = 2');
  }
  if (v < 3) {
    // v3: sub-lists, one level ("recipes/pancakes")
    await db.exec('ALTER TABLE categories ADD COLUMN parent_id INTEGER');
    await db.exec('PRAGMA user_version = 3');
  }
}
