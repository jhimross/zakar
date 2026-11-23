// Background sync between IndexedDB and Cloudflare D1 (via /api/sync).
import { create } from 'zustand';
import { db, getMeta, setMeta } from './db';
import { PUSH_BATCH, TABLE_NAMES, type PushChange, type SyncResponse, type TableName } from '../../shared/schema';

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error' | 'auth';

interface SyncStatus {
  state: SyncState;
  lastSynced: number | null;
  error: string | null;
  set: (s: Partial<SyncStatus>) => void;
}

export const useSync = create<SyncStatus>((set) => ({
  state: navigator.onLine ? 'idle' : 'offline',
  lastSynced: null,
  error: null,
  set: (s) => set(s),
}));

let running = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Debounced sync after local edits (batches keystrokes into few D1 writes). */
export function scheduleSync(delay = 2000) {
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delay);
}

function stripLocal(row: Record<string, unknown>) {
  const { _seq, ...rest } = row;
  void _seq;
  return rest;
}

export async function syncNow(): Promise<void> {
  if (running) { again = true; return; }
  if (!navigator.onLine) { useSync.getState().set({ state: 'offline' }); return; }
  running = true;
  const status = useSync.getState();
  status.set({ state: 'syncing', error: null });
  try {
    for (let round = 0; round < 100; round++) {
      const since = await getMeta<number>('cursor', 0);
      const entries = await db.outbox.orderBy('ts').limit(PUSH_BATCH).toArray();
      const changes: PushChange[] = [];
      for (const e of entries) {
        const row = await db.table(e.table).get(e.id);
        if (!row) { await db.outbox.delete(e.key); continue; }
        changes.push({ table: e.table, id: e.id, baseSeq: e.baseSeq, row: stripLocal(row) });
      }
      const sentRev = new Map(entries.map((e) => [e.key, e.rev]));

      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ since, changes }),
        credentials: 'same-origin',
      });
      if (res.status === 401 || res.status === 403) { status.set({ state: 'auth', error: 'Sign in again to sync' }); return; }
      const ctype = res.headers.get('content-type') || '';
      if (!res.ok || !ctype.includes('application/json')) throw new Error(`Sync failed (${res.status})`);
      const data = (await res.json()) as SyncResponse;

      await applyResponse(data, sentRev);

      const pending = await db.outbox.count();
      if (!data.more && (pending === 0 || changes.length === 0)) break;
    }
    status.set({ state: 'idle', lastSynced: Date.now() });
    await setMeta('lastSynced', Date.now());
  } catch (err) {
    status.set({ state: navigator.onLine ? 'error' : 'offline', error: err instanceof Error ? err.message : String(err) });
  } finally {
    running = false;
    if (again) { again = false; scheduleSync(500); }
  }
}

async function applyResponse(data: SyncResponse, sentRev: Map<string, string>) {
  const tables = TABLE_NAMES.map((t) => db.table(t));
  await db.transaction('rw', [...tables, db.outbox, db.meta], async () => {
    // 1. Our pushed rows were accepted.
    for (const a of data.accepted) {
      const key = `${a.table}:${a.id}`;
      const entry = await db.outbox.get(key);
      if (entry) {
        if (entry.rev === sentRev.get(key)) await db.outbox.delete(key);
        else await db.outbox.put({ ...entry, baseSeq: a.seq }); // edited again mid-flight: keep, rebase
      }
      const row = await db.table(a.table).get(a.id);
      if (row) await db.table(a.table).put({ ...row, _seq: a.seq });
    }

    // 2. Server kept its version (a conflict copy of ours may arrive in `changes`).
    for (const c of data.conflicts) {
      const key = `${c.table}:${c.row.id}`;
      const entry = await db.outbox.get(key);
      const seq = Number(c.row.seq);
      if (entry && entry.rev !== sentRev.get(key)) {
        await db.outbox.put({ ...entry, baseSeq: seq }); // newer local edit wins next round
      } else {
        if (entry) await db.outbox.delete(key);
        await db.table(c.table).put(toLocal(c.table, c.row));
      }
    }

    // 3. Changes from other devices. Pending local edits take priority until pushed.
    for (const table of TABLE_NAMES) {
      for (const row of data.changes[table] || []) {
        if (await db.outbox.get(`${table}:${row.id}`)) continue;
        await db.table(table).put(toLocal(table, row));
      }
    }
    await db.meta.put({ k: 'cursor', v: data.cursor });
  });
}

function toLocal(table: TableName, row: Record<string, unknown>) {
  const { seq, ...rest } = row;
  const out: Record<string, unknown> = { ...rest, _seq: Number(seq) || 0 };
  if (table === 'pages' && !Array.isArray(out.tags)) out.tags = [];
  return out;
}

let started = false;

/** Start background sync triggers (once). */
export function startSync() {
  if (started) return;
  started = true;
  const onOnline = () => { useSync.getState().set({ state: 'idle' }); void syncNow(); };
  const onOffline = () => useSync.getState().set({ state: 'offline' });
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void syncNow(); });
  setInterval(() => { if (document.visibilityState === 'visible') void syncNow(); }, 60_000);
  void getMeta<number | null>('lastSynced', null).then((t) => useSync.getState().set({ lastSynced: t }));
  void syncNow();
}
