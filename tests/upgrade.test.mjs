// An existing v2 database (before notebook groups) upgrades in place without losing data.
import assert from 'node:assert/strict';
import { createD1 } from './d1-shim.mjs';
import { ensureSchema, resetSchemaCache } from './.build/auth-server.js';
import { handleSync } from './.build/sync-server.js';

const db = createD1(null);
const p = db.prepare; db.prepare = (sql) => { const s = p(sql); const w = (st) => ({ ...st, bind: (...a) => w(st.bind(...a)), all: () => st.all(), first: () => st.first(), run: async () => st.run(), _raw: st }); return w(s); };
const b = db.batch; db.batch = (stmts) => b(stmts.map((s) => s._raw ?? s));
db.raw.exec(`
  CREATE TABLE meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL);
  INSERT INTO meta VALUES ('seq', 5), ('schema', 2);
  CREATE TABLE notebooks (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', color TEXT, icon TEXT, sort_key TEXT NOT NULL DEFAULT 'a0', created_at INTEGER, updated_at INTEGER, deleted_at INTEGER, seq INTEGER NOT NULL, user_id TEXT);
  CREATE TABLE sections (id TEXT PRIMARY KEY, notebook_id TEXT NOT NULL, parent_id TEXT, name TEXT NOT NULL DEFAULT '', color TEXT, sort_key TEXT NOT NULL DEFAULT 'a0', created_at INTEGER, updated_at INTEGER, deleted_at INTEGER, seq INTEGER NOT NULL, user_id TEXT);
  CREATE TABLE pages (id TEXT PRIMARY KEY, section_id TEXT NOT NULL, parent_id TEXT, title TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]', favorite INTEGER NOT NULL DEFAULT 0, purged INTEGER NOT NULL DEFAULT 0, sort_key TEXT NOT NULL DEFAULT 'a0', created_at INTEGER, updated_at INTEGER, deleted_at INTEGER, seq INTEGER NOT NULL, user_id TEXT);
  INSERT INTO notebooks (id, name, sort_key, seq, user_id) VALUES ('keep', 'Existing', 'a0', 5, 'u1');
`);
resetSchemaCache();
await ensureSchema(db);
const r = await handleSync(db, { since: 0, changes: [] }, 'u1');
assert.equal(r.changes.notebooks[0].name, 'Existing');
assert.equal(r.changes.notebooks[0].group_id, null);
assert.deepEqual(r.changes.notebook_groups, []);
console.log('✓ v2 database upgrades to notebook groups without losing notes');
