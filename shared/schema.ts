// Shared between the browser app and the Cloudflare sync function.

export const TABLES = {
  notebook_groups: ['id', 'name', 'color', 'sort_key', 'created_at', 'updated_at', 'deleted_at'],
  notebooks: ['id', 'group_id', 'name', 'color', 'icon', 'sort_key', 'created_at', 'updated_at', 'deleted_at'],
  sections: ['id', 'notebook_id', 'parent_id', 'name', 'color', 'sort_key', 'created_at', 'updated_at', 'deleted_at'],
  pages: [
    'id', 'section_id', 'parent_id', 'title', 'content', 'tags', 'favorite', 'purged',
    'sort_key', 'created_at', 'updated_at', 'deleted_at',
  ],
} as const;

export type TableName = keyof typeof TABLES;
export const TABLE_NAMES = Object.keys(TABLES) as TableName[];

/** Max changes the client sends per request (keeps D1 queries per request well under the free limit). */
export const PUSH_BATCH = 20;
/** Max rows per table the server returns per pull. */
export const PULL_LIMIT = 200;

export interface Base {
  id: string;
  sort_key: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  /** Server sequence of the last synced version (0 = never synced). Client only. */
  _seq?: number;
}

/** A folder of notebooks in the sidebar. */
export interface NotebookGroup extends Base {
  name: string;
  color: string | null;
}

export interface Notebook extends Base {
  group_id?: string | null;
  name: string;
  color: string | null;
  icon: string | null;
}

export interface Section extends Base {
  notebook_id: string;
  parent_id: string | null;
  name: string;
  color: string | null;
}

export interface Page extends Base {
  section_id: string;
  parent_id: string | null;
  title: string;
  content: string;
  tags: string[];
  favorite: number;
  purged: number;
}

export type AnyRow = NotebookGroup | Notebook | Section | Page;

export interface PushChange {
  table: TableName;
  id: string;
  baseSeq: number;
  row: Record<string, unknown>;
}

export interface SyncRequest {
  since: number;
  changes: PushChange[];
}

export interface SyncResponse {
  accepted: { table: TableName; id: string; seq: number }[];
  /** Server kept its own version; client must replace its local row with this. */
  conflicts: { table: TableName; row: Record<string, unknown> }[];
  changes: Record<TableName, Record<string, unknown>[]>;
  cursor: number;
  more: boolean;
}
