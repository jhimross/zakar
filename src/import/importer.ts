// Browser side of import: read files (picker, folder, .zip, drag & drop) and write the plan to the local DB.
import JSZip from 'jszip';
import { db } from '../data/db';
import { bySort, COLORS, keyBetween, keysAfter, saveRows, sidebarSiblings, uid } from '../data/actions';
import type { Notebook, Page, Section } from '../../shared/schema';
import type { ExistingNotebook, ImportPlan, PlanPage, SourceFile } from './plan';

const TEXT = /\.(md|markdown|mdown)$/i;

async function readZip(file: File): Promise<SourceFile[]> {
  const zip = await JSZip.loadAsync(file);
  const out: SourceFile[] = [];
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  for (const e of entries) {
    out.push({ path: e.name, text: TEXT.test(e.name) ? await e.async('string') : '', lastModified: e.date?.getTime() });
  }
  return out;
}

/** Files from <input type=file> (multiple or webkitdirectory). Zips are expanded. */
export async function readFileList(list: FileList | File[]): Promise<SourceFile[]> {
  const out: SourceFile[] = [];
  for (const f of Array.from(list)) {
    const path = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    if (/\.zip$/i.test(f.name)) out.push(...(await readZip(f)));
    else out.push({ path, text: TEXT.test(f.name) ? await f.text() : '', lastModified: f.lastModified });
  }
  return out;
}

/** Drag & drop, including whole folders. */
export async function readDataTransfer(dt: DataTransfer): Promise<SourceFile[]> {
  const entries = Array.from(dt.items).map((i) => i.webkitGetAsEntry?.()).filter(Boolean) as FileSystemEntry[];
  if (!entries.length) return readFileList(dt.files);
  const files: File[] = [];
  const paths = new Map<File, string>();
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      files.push(file); paths.set(file, prefix + file.name);
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      let batch: FileSystemEntry[];
      do {
        batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        for (const child of batch) await walk(child, `${prefix}${entry.name}/`);
      } while (batch.length);
    }
  };
  for (const e of entries) await walk(e, '');
  const out: SourceFile[] = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) out.push(...(await readZip(f)));
    else out.push({ path: paths.get(f)!, text: TEXT.test(f.name) ? await f.text() : '', lastModified: f.lastModified });
  }
  return out;
}

export async function existingStructure(): Promise<ExistingNotebook[]> {
  const [nbs, secs, pages] = await Promise.all([db.notebooks.toArray(), db.sections.toArray(), db.pages.toArray()]);
  return nbs.filter((n) => !n.deleted_at).map((n) => ({
    id: n.id, name: n.name,
    sections: secs.filter((s) => s.notebook_id === n.id && !s.deleted_at).map((s) => ({
      id: s.id, name: s.name,
      titles: new Set(pages.filter((p) => p.section_id === s.id && !p.deleted_at).map((p) => p.title.trim().toLowerCase())),
    })),
  }));
}

/** Write the plan to IndexedDB (and the sync outbox). Returns the first page created. */
export async function commitPlan(plan: ImportPlan, opts: { skipDuplicates: boolean }): Promise<{ count: number; first?: Page }> {
  const t = Date.now();
  const newNbs: Notebook[] = []; const newSecs: Section[] = []; const newPages: Page[] = [];
  const nbsNow = (await db.notebooks.toArray()).filter((n) => !n.deleted_at).sort(bySort);
  let lastNbKey = (await sidebarSiblings(null)).at(-1)?.sort_key ?? null;
  let colorIdx = nbsNow.length;

  for (const nb of plan.notebooks) {
    let nbId = nb.existingId;
    if (!nbId) {
      lastNbKey = keyBetween(lastNbKey, null);
      const row: Notebook = { id: uid(), group_id: null, name: nb.name, color: COLORS[colorIdx++ % COLORS.length], icon: null, sort_key: lastNbKey, created_at: t, updated_at: t, deleted_at: null, _seq: 0 };
      newNbs.push(row); nbId = row.id;
    }
    const secsNow = (await db.sections.where('notebook_id').equals(nbId).toArray()).filter((s) => !s.deleted_at).sort(bySort);
    let lastSecKey = secsNow.at(-1)?.sort_key ?? null;
    for (const sec of nb.sections) {
      let secId = sec.existingId;
      if (!secId) {
        lastSecKey = keyBetween(lastSecKey, null);
        const row: Section = { id: uid(), notebook_id: nbId, parent_id: null, name: sec.name, color: COLORS[(newSecs.length + 4) % COLORS.length], sort_key: lastSecKey, created_at: t, updated_at: t, deleted_at: null, _seq: 0 };
        newSecs.push(row); secId = row.id;
      }
      const roots = (await db.pages.where('section_id').equals(secId).toArray()).filter((p) => !p.deleted_at && !p.parent_id).sort(bySort);
      addPages(sec.pages, secId, null, roots.at(-1)?.sort_key ?? null);
    }
  }

  function addPages(list: PlanPage[], sectionId: string, parentId: string | null, after: string | null) {
    const keep = list.filter((p) => !(opts.skipDuplicates && p.duplicate));
    const keys = keep.length ? keysAfter(after, keep.length) : [];
    keep.forEach((p, i) => {
      const row: Page = {
        id: uid(), section_id: sectionId, parent_id: parentId, title: p.title, content: p.content, tags: p.tags,
        favorite: 0, purged: 0, sort_key: keys[i], created_at: p.created_at, updated_at: p.updated_at, deleted_at: null, _seq: 0,
      };
      newPages.push(row);
      addPages(p.children, sectionId, row.id, null);
    });
  }

  await saveRows('notebooks', newNbs, { touch: false });
  await saveRows('sections', newSecs, { touch: false });
  await saveRows('pages', newPages, { touch: false });
  return { count: newPages.length, first: newPages[0] };
}
