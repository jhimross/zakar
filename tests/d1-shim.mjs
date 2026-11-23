// Minimal D1-compatible wrapper around node:sqlite, for testing sync logic locally.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function createD1(migrationPath) {
  const db = new DatabaseSync(':memory:');
  if (migrationPath) db.exec(readFileSync(migrationPath, 'utf8'));
  const norm = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
  class Stmt {
    constructor(sql, params = []) { this.sql = sql; this.params = params; }
    bind(...p) { return new Stmt(this.sql, p.map(norm)); }
    async all() { return { results: db.prepare(this.sql).all(...this.params).map((r) => ({ ...r })) }; }
    async first() { const r = db.prepare(this.sql).get(...this.params); return r ? { ...r } : null; }
    run() { return db.prepare(this.sql).run(...this.params); }
    // D1's run() is async; batch() below calls the sync version directly.
  }
  return {
    raw: db,
    prepare: (sql) => new Stmt(sql),
    async batch(stmts) {
      db.exec('BEGIN');
      try { const r = stmts.map((s) => s.run()); db.exec('COMMIT'); return r; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}
