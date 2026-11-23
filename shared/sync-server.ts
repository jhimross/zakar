// Server-side sync logic. Runtime-agnostic: works with Cloudflare D1 (or any object with the same API).
import {
  TABLES, TABLE_NAMES, PUSH_BATCH, PULL_LIMIT,
  type TableName, type PushChange, type SyncRequest, type SyncResponse,
} from './schema';

// Minimal subset of the D1 API we use.
export interface Stmt {
  bind(...values: unknown[]): Stmt;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}
export interface DB {
  prepare(sql: string): Stmt;
  batch(stmts: Stmt[]): Promise<unknown[]>;
}

type Row = Record<string, unknown>;

const isTable = (t: unknown): t is TableName => typeof t === 'string' && (TABLE_NAMES as string[]).includes(t);

/** Convert a DB row to the wire format (tags JSON -> array, drop nothing). */
function fromDb(table: TableName, r: Row): Row {
  if (table === 'pages' && typeof r.tags === 'string') {
    try { r = { ...r, tags: JSON.parse(r.tags as string) }; } catch { r = { ...r, tags: [] }; }
  }
  return r;
}

/** Keep only known columns and normalise values for storage. */
function clean(table: TableName, row: Row): Row {
  const out: Row = {};
  for (const col of TABLES[table]) {
    let v = row[col];
    if (v === undefined) v = null;
    if (col === 'tags') v = JSON.stringify(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
    if (col === 'content' || col === 'title' || col === 'name') v = typeof v === 'string' ? v : '';
    if (col === 'favorite' || col === 'purged') v = v ? 1 : 0;
    if (col === 'sort_key') v = typeof v === 'string' && v ? v : 'a0';
    out[col] = v;
  }
  return out;
}

function upsert(db: DB, table: TableName, row: Row, seq: number): Stmt {
  const cols = [...TABLES[table], 'seq'];
  const placeholders = cols.map(() => '?').join(',');
  const updates = cols.filter((c) => c !== 'id').map((c) => `${c}=excluded.${c}`).join(',');
  const sql = `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updates}`;
  return db.prepare(sql).bind(...cols.map((c) => (c === 'seq' ? seq : row[c])));
}

function newId(): string {
  return crypto.randomUUID();
}

export async function handleSync(db: DB, body: SyncRequest): Promise<SyncResponse> {
  const since = Number.isFinite(body?.since) ? Number(body.since) : 0;
  const changes: PushChange[] = Array.isArray(body?.changes)
    ? body.changes.filter((c) => c && isTable(c.table) && typeof c.id === 'string' && c.row && typeof c.row === 'object').slice(0, PUSH_BATCH)
    : [];

  const accepted: SyncResponse['accepted'] = [];
  const conflicts: SyncResponse['conflicts'] = [];

  if (changes.length) {
    // 1. Load the current server versions of everything being pushed (one query per table).
    const existing = new Map<string, Row>();
    for (const table of TABLE_NAMES) {
      const ids = changes.filter((c) => c.table === table).map((c) => c.id);
      if (!ids.length) continue;
      const { results } = await db
        .prepare(`SELECT * FROM ${table} WHERE id IN (${ids.map(() => '?').join(',')})`)
        .bind(...ids)
        .all<Row>();
      for (const r of results) existing.set(`${table}:${r.id}`, r);
    }

    // 2. Decide what to write.
    const writes: { table: TableName; row: Row; acceptId?: string }[] = [];
    for (const c of changes) {
      const row = clean(c.table, { ...c.row, id: c.id });
      const server = existing.get(`${c.table}:${c.id}`);
      const baseSeq = Number(c.baseSeq) || 0;

      if (!server || Number(server.seq) <= baseSeq) {
        writes.push({ table: c.table, row, acceptId: c.id }); // fast-forward
        continue;
      }

      // Conflict: the row changed on the server since this client last saw it.
      const bothAlive = !row.deleted_at && !server.deleted_at;
      if (c.table === 'pages' && bothAlive && row.content !== server.content) {
        // Never lose writing: keep the server version, save the client's version as a copy.
        const copy = {
          ...row,
          id: newId(),
          title: `${row.title || 'Untitled'} (conflict copy)`,
          parent_id: server.parent_id ?? null,
          section_id: server.section_id,
          created_at: Date.now(),
        };
        writes.push({ table: 'pages', row: clean('pages', copy) });
        conflicts.push({ table: c.table, row: fromDb(c.table, server) });
      } else if (Number(row.updated_at) > Number(server.updated_at)) {
        writes.push({ table: c.table, row, acceptId: c.id }); // last write wins
      } else {
        conflicts.push({ table: c.table, row: fromDb(c.table, server) });
      }
    }

    // 3. Reserve sequence numbers and write everything in one batch (a transaction in D1).
    if (writes.length) {
      const reserved = await db
        .prepare(`UPDATE meta SET v = v + ? WHERE k = 'seq' RETURNING v`)
        .bind(writes.length)
        .first<{ v: number }>();
      let seq = Number(reserved?.v ?? 0) - writes.length;
      const stmts = writes.map((w) => {
        seq += 1;
        if (w.acceptId) accepted.push({ table: w.table, id: w.acceptId, seq });
        return upsert(db, w.table, w.row, seq);
      });
      await db.batch(stmts);
    }
  }

  // 4. Pull everything that changed since the client's cursor.
  const out = { notebooks: [], sections: [], pages: [] } as SyncResponse['changes'];
  let cursor = since;
  let limitCursor = Infinity;
  let more = false;
  for (const table of TABLE_NAMES) {
    const { results } = await db
      .prepare(`SELECT * FROM ${table} WHERE seq > ? ORDER BY seq LIMIT ?`)
      .bind(since, PULL_LIMIT)
      .all<Row>();
    out[table] = results.map((r) => fromDb(table, r));
    if (results.length) cursor = Math.max(cursor, Number(results[results.length - 1].seq));
    if (results.length === PULL_LIMIT) {
      more = true;
      limitCursor = Math.min(limitCursor, Number(results[results.length - 1].seq));
    }
  }
  if (more) cursor = limitCursor; // rows beyond this are re-sent next time (applying twice is harmless)

  return { accepted, conflicts, changes: out, cursor, more };
}
