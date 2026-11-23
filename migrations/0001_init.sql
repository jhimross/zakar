CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL);
INSERT OR IGNORE INTO meta (k, v) VALUES ('seq', 0);
CREATE TABLE IF NOT EXISTS notebooks (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', color TEXT, icon TEXT, sort_key TEXT NOT NULL DEFAULT 'a0', created_at INTEGER, updated_at INTEGER, deleted_at INTEGER, seq INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_notebooks_seq ON notebooks(seq);
CREATE TABLE IF NOT EXISTS sections (id TEXT PRIMARY KEY, notebook_id TEXT NOT NULL, parent_id TEXT, name TEXT NOT NULL DEFAULT '', color TEXT, sort_key TEXT NOT NULL DEFAULT 'a0', created_at INTEGER, updated_at INTEGER, deleted_at INTEGER, seq INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_sections_seq ON sections(seq);
CREATE TABLE IF NOT EXISTS pages (id TEXT PRIMARY KEY, section_id TEXT NOT NULL, parent_id TEXT, title TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]', favorite INTEGER NOT NULL DEFAULT 0, purged INTEGER NOT NULL DEFAULT 0, sort_key TEXT NOT NULL DEFAULT 'a0', created_at INTEGER, updated_at INTEGER, deleted_at INTEGER, seq INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_pages_seq ON pages(seq);
