// Local database (IndexedDB via Dexie). This is the app's source of truth; the server is a sync target.
import Dexie, { type Table } from 'dexie';
import type { Notebook, NotebookGroup, Section, Page, TableName } from '../../shared/schema';

export interface OutboxEntry {
  key: string;          // `${table}:${id}`
  table: TableName;
  id: string;
  baseSeq: number;      // server seq the local edits are based on
  rev: string;          // changes on every local edit (detects edits made while a sync is in flight)
  ts: number;
}

export interface MetaEntry { k: string; v: unknown }

class NotesDB extends Dexie {
  notebook_groups!: Table<NotebookGroup, string>;
  notebooks!: Table<Notebook, string>;
  sections!: Table<Section, string>;
  pages!: Table<Page, string>;
  outbox!: Table<OutboxEntry, string>;
  meta!: Table<MetaEntry, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      notebooks: 'id, sort_key',
      sections: 'id, notebook_id, sort_key',
      pages: 'id, section_id, parent_id, updated_at',
      outbox: 'key, ts',
      meta: 'k',
    });
    this.version(2).stores({
      notebook_groups: 'id, sort_key',
      notebooks: 'id, sort_key',
      sections: 'id, notebook_id, sort_key',
      pages: 'id, section_id, parent_id, updated_at',
      outbox: 'key, ts',
      meta: 'k',
    });
  }
}

const dbName = (userId: string) => `mynotes-${userId}`;

/** The signed-in user's local database (each user gets their own, so accounts never mix on a device). */
export let db: NotesDB = null as unknown as NotesDB;

export async function openUserDb(userId: string) {
  if (db && db.name === dbName(userId)) return db;
  db?.close();
  db = new NotesDB(dbName(userId));
  await db.open();
  return db;
}

export function closeUserDb() {
  db?.close();
}

export function deleteUserDb(userId: string) {
  return Dexie.delete(dbName(userId));
}

export async function getMeta<T>(k: string, fallback: T): Promise<T> {
  const m = await db.meta.get(k);
  return m ? (m.v as T) : fallback;
}

export function setMeta(k: string, v: unknown) {
  return db.meta.put({ k, v });
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch { /* ignore */ }
}
