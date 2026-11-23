// All writes go through here: update the local row + record it in the outbox, then schedule a sync.
import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import { db } from './db';
import type { AnyRow, Notebook, Page, Section, TableName } from '../../shared/schema';
import { scheduleSync } from './sync';

export const COLORS = ['#2F6FEB', '#22A06B', '#8B5CF6', '#E5793B', '#14B8A6', '#EAB308', '#E5484D', '#6B7280'];
export const MAX_DEPTH = 2; // page > subpage > sub-subpage

export const uid = () => crypto.randomUUID();
const now = () => Date.now();
const rev = () => Math.random().toString(36).slice(2) + now().toString(36);

export function bySort<T extends { sort_key: string; id: string }>(a: T, b: T) {
  if (a.sort_key < b.sort_key) return -1;
  if (a.sort_key > b.sort_key) return 1;
  return a.id < b.id ? -1 : 1;
}

/** A key that sorts between a and b (either may be null). Falls back gracefully on ties. */
export function keyBetween(a: string | null | undefined, b: string | null | undefined): string {
  a = a || null; b = b || null;
  if (a && b && a >= b) return generateKeyBetween(a, null);
  return generateKeyBetween(a, b);
}
export const keysAfter = (a: string | null | undefined, n: number) => generateNKeysBetween(a || null, null, n);

/** Write rows locally and queue them for sync, in one transaction. */
export async function saveRows(table: TableName, rows: AnyRow[], opts: { touch?: boolean } = {}) {
  if (!rows.length) return;
  const t = db.table(table);
  await db.transaction('rw', t, db.outbox, async () => {
    for (const row of rows) {
      if (opts.touch !== false) row.updated_at = now();
      const key = `${table}:${row.id}`;
      const prev = await db.outbox.get(key);
      await t.put(row);
      await db.outbox.put({ key, table, id: row.id, baseSeq: prev ? prev.baseSeq : row._seq || 0, rev: rev(), ts: now() });
    }
  });
  scheduleSync();
}

const alive = <T extends { deleted_at: number | null }>(r: T | undefined): r is T => !!r && !r.deleted_at;

// ---------- Notebooks ----------
export async function listNotebooks() {
  return (await db.notebooks.toArray()).filter(alive).sort(bySort);
}

export async function createNotebook(name: string, color?: string) {
  const nbs = await listNotebooks();
  const t = now();
  const notebook: Notebook = {
    id: uid(), name: name.trim() || 'Untitled notebook', color: color || COLORS[nbs.length % COLORS.length], icon: null,
    sort_key: keyBetween(nbs.at(-1)?.sort_key, null), created_at: t, updated_at: t, deleted_at: null, _seq: 0,
  };
  await saveRows('notebooks', [notebook]);
  const section = await createSection(notebook.id, 'General');
  return { notebook, section };
}

export async function updateNotebook(id: string, patch: Partial<Notebook>) {
  const nb = await db.notebooks.get(id);
  if (nb) await saveRows('notebooks', [{ ...nb, ...patch }]);
}

export async function deleteNotebook(id: string) {
  const nb = await db.notebooks.get(id);
  if (!nb) return;
  const t = now();
  const sections = (await db.sections.where('notebook_id').equals(id).toArray()).filter(alive);
  for (const s of sections) await deleteSection(s.id, t);
  await saveRows('notebooks', [{ ...nb, deleted_at: t }]);
}

// ---------- Sections ----------
export async function listSections(notebookId: string) {
  return (await db.sections.where('notebook_id').equals(notebookId).toArray()).filter(alive).sort(bySort);
}

export async function createSection(notebookId: string, name: string, color?: string) {
  const secs = await listSections(notebookId);
  const t = now();
  const section: Section = {
    id: uid(), notebook_id: notebookId, parent_id: null, name: name.trim() || 'Untitled section',
    color: color || COLORS[(secs.length + 4) % COLORS.length],
    sort_key: keyBetween(secs.at(-1)?.sort_key, null), created_at: t, updated_at: t, deleted_at: null, _seq: 0,
  };
  await saveRows('sections', [section]);
  return section;
}

export async function updateSection(id: string, patch: Partial<Section>) {
  const s = await db.sections.get(id);
  if (s) await saveRows('sections', [{ ...s, ...patch }]);
}

export async function deleteSection(id: string, stamp = now()) {
  const s = await db.sections.get(id);
  if (!s) return;
  const pages = (await db.pages.where('section_id').equals(id).toArray()).filter(alive);
  await saveRows('pages', pages.map((p) => ({ ...p, deleted_at: stamp })));
  await saveRows('sections', [{ ...s, deleted_at: stamp }]);
}

// ---------- Pages ----------
export async function sectionPages(sectionId: string) {
  return (await db.pages.where('section_id').equals(sectionId).toArray()).filter(alive).sort(bySort);
}

export function childrenOf(pages: Page[], parentId: string | null) {
  return pages.filter((p) => (p.parent_id || null) === parentId).sort(bySort);
}

export function descendantsOf(pages: Page[], id: string): Page[] {
  const out: Page[] = [];
  const walk = (pid: string) => pages.filter((p) => p.parent_id === pid).forEach((c) => { out.push(c); walk(c.id); });
  walk(id);
  return out;
}

export function depthOf(pages: Page[], page: Page): number {
  let d = 0; let cur = page;
  const byId = new Map(pages.map((p) => [p.id, p]));
  while (cur.parent_id && byId.has(cur.parent_id) && d < 10) { d++; cur = byId.get(cur.parent_id)!; }
  return d;
}

/** Height of the subtree below a page (0 = no children). */
export function subtreeHeight(pages: Page[], id: string): number {
  const kids = pages.filter((p) => p.parent_id === id);
  return kids.length ? 1 + Math.max(...kids.map((k) => subtreeHeight(pages, k.id))) : 0;
}

export async function createPage(sectionId: string, opts: { parentId?: string | null; title?: string; content?: string; tags?: string[] } = {}) {
  const pages = await sectionPages(sectionId);
  const siblings = childrenOf(pages, opts.parentId || null);
  const t = now();
  const page: Page = {
    id: uid(), section_id: sectionId, parent_id: opts.parentId || null, title: opts.title ?? '', content: opts.content ?? '',
    tags: opts.tags ?? [], favorite: 0, purged: 0, sort_key: keyBetween(siblings.at(-1)?.sort_key, null),
    created_at: t, updated_at: t, deleted_at: null, _seq: 0,
  };
  await saveRows('pages', [page]);
  return page;
}

export async function updatePage(id: string, patch: Partial<Page>) {
  const p = await db.pages.get(id);
  if (p) await saveRows('pages', [{ ...p, ...patch }]);
}

export async function deletePage(id: string) {
  const p = await db.pages.get(id);
  if (!p) return;
  const t = now();
  const all = await sectionPages(p.section_id);
  await saveRows('pages', [p, ...descendantsOf(all, id)].map((x) => ({ ...x, deleted_at: t })));
}

export async function restorePage(id: string) {
  const p = await db.pages.get(id);
  if (!p || !p.deleted_at) return;
  const stamp = p.deleted_at;
  const sec = await db.sections.get(p.section_id);
  if (sec?.deleted_at) {
    const nb = await db.notebooks.get(sec.notebook_id);
    if (nb?.deleted_at) await saveRows('notebooks', [{ ...nb, deleted_at: null }]);
    await saveRows('sections', [{ ...sec, deleted_at: null }]);
  }
  // Restore the page plus anything deleted together with it.
  const inSection = await db.pages.where('section_id').equals(p.section_id).toArray();
  const together = descendantsOf(inSection, id).filter((x) => x.deleted_at === stamp);
  const parent = p.parent_id ? inSection.find((x) => x.id === p.parent_id) : null;
  const restored = { ...p, deleted_at: null, parent_id: parent && !parent.deleted_at ? p.parent_id : null };
  await saveRows('pages', [restored, ...together.map((x) => ({ ...x, deleted_at: null }))]);
}

export async function purgePage(id: string) {
  const p = await db.pages.get(id);
  if (p) await saveRows('pages', [{ ...p, purged: 1, title: '', content: '', tags: [], deleted_at: p.deleted_at || now() }]);
}

export async function trashedPages() {
  return (await db.pages.toArray()).filter((p) => p.deleted_at && !p.purged).sort((a, b) => (b.deleted_at || 0) - (a.deleted_at || 0));
}

export async function emptyTrash() {
  const pages = await trashedPages();
  await saveRows('pages', pages.map((p) => ({ ...p, purged: 1, title: '', content: '', tags: [] })));
}

/** Move a page (with its subpages) to a position. */
export async function movePage(id: string, target: { sectionId: string; parentId: string | null; beforeId?: string | null; afterId?: string | null }) {
  const page = await db.pages.get(id);
  if (!page) return;
  const pages = await sectionPages(target.sectionId);
  const siblings = childrenOf(pages, target.parentId).filter((p) => p.id !== id);
  let a: string | null = null; let b: string | null = null;
  if (target.beforeId) {
    const i = siblings.findIndex((s) => s.id === target.beforeId);
    a = siblings[i - 1]?.sort_key ?? null; b = siblings[i]?.sort_key ?? null;
  } else if (target.afterId) {
    const i = siblings.findIndex((s) => s.id === target.afterId);
    a = siblings[i]?.sort_key ?? null; b = siblings[i + 1]?.sort_key ?? null;
  } else {
    a = siblings.at(-1)?.sort_key ?? null;
  }
  const updates: Page[] = [{ ...page, section_id: target.sectionId, parent_id: target.parentId, sort_key: keyBetween(a, b) }];
  if (page.section_id !== target.sectionId) {
    const old = await sectionPages(page.section_id);
    descendantsOf(old, id).forEach((d) => updates.push({ ...d, section_id: target.sectionId }));
  }
  await saveRows('pages', updates);
}

export async function indentPage(id: string) {
  const page = await db.pages.get(id);
  if (!page) return false;
  const pages = await sectionPages(page.section_id);
  const sibs = childrenOf(pages, page.parent_id || null);
  const prev = sibs[sibs.findIndex((s) => s.id === id) - 1];
  if (!prev) return false;
  if (depthOf(pages, prev) + 1 + subtreeHeight(pages, id) > MAX_DEPTH) return false;
  await movePage(id, { sectionId: page.section_id, parentId: prev.id });
  return true;
}

export async function outdentPage(id: string) {
  const page = await db.pages.get(id);
  if (!page?.parent_id) return false;
  const parent = await db.pages.get(page.parent_id);
  if (!parent) return false;
  await movePage(id, { sectionId: page.section_id, parentId: parent.parent_id || null, afterId: parent.id });
  return true;
}

// ---------- Daily note ----------
export function todayTitle(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function openDailyNote(): Promise<Page> {
  let nb = (await listNotebooks()).find((n) => n.name.toLowerCase() === 'journal');
  let section: Section | undefined;
  if (!nb) {
    const created = await createNotebook('Journal', '#E5793B');
    nb = created.notebook;
    await updateSection(created.section.id, { name: 'Daily' });
    section = (await db.sections.get(created.section.id))!;
  } else {
    section = (await listSections(nb.id)).find((s) => s.name.toLowerCase() === 'daily') || (await createSection(nb.id, 'Daily'));
  }
  const title = todayTitle();
  const existing = (await sectionPages(section.id)).find((p) => p.title === title);
  return existing || createPage(section.id, { title, content: '' });
}

// ---------- Tags ----------
export function normalizeTag(t: string) {
  return t.trim().replace(/^#/, '').replace(/\s+/g, '-');
}
