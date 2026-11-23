// Turns a set of Markdown files (with folder paths) into notebooks › sections › pages. Pure, testable.
import { parseNote } from './parse';

export interface SourceFile { path: string; text: string; lastModified?: number }

export interface ExistingSection { id: string; name: string; titles: Set<string> }
export interface ExistingNotebook { id: string; name: string; sections: ExistingSection[] }

export interface PlanPage {
  key: string; // source path
  title: string;
  content: string;
  tags: string[];
  created_at: number;
  updated_at: number;
  duplicate: boolean;
  children: PlanPage[];
}
export interface PlanSection { name: string; existingId?: string; pages: PlanPage[] }
export interface PlanNotebook { name: string; existingId?: string; sections: PlanSection[] }

export interface ImportPlan {
  notebooks: PlanNotebook[];
  pageCount: number;
  duplicateCount: number;
  skipped: string[];   // non-markdown / hidden files
  warnings: string[];
  hasCommonRoot: boolean;
}

export interface PlanOptions {
  /** Treat the shared top folder as the collection (its subfolders become notebooks). */
  stripRoot: boolean;
  /** Notebook for files that aren't inside any folder. */
  looseNotebook: string;
  now?: number;
}

const MD = /\.(md|markdown|mdown)$/i;
const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.?\/+/, '').replace(/\/+/g, '/');
const lc = (s: string) => s.trim().toLowerCase();

export function commonRoot(paths: string[]): string | null {
  const parts = paths.map((p) => norm(p).split('/'));
  if (!parts.length || parts.some((p) => p.length < 2)) return null;
  const first = parts[0][0];
  return parts.every((p) => p[0] === first) ? first : null;
}

export function buildPlan(files: SourceFile[], existing: ExistingNotebook[], opts: PlanOptions): ImportPlan {
  const now = opts.now ?? Date.now();
  const skipped: string[] = [];
  const warnings: string[] = [];
  const md: SourceFile[] = [];
  for (const f of files) {
    const p = norm(f.path);
    if (p.split('/').some((seg) => seg.startsWith('.') || seg === '__MACOSX' || seg === 'node_modules')) continue;
    if (!MD.test(p)) { skipped.push(p); continue; }
    md.push({ ...f, path: p });
  }

  const root = commonRoot(md.map((f) => f.path));
  const strip = opts.stripRoot && root !== null;
  const rel = (p: string) => (strip ? p.split('/').slice(1).join('/') : p);
  const fileSet = new Set(md.map((f) => rel(f.path).toLowerCase()));

  type Placed = { nb: string; section: string; parentKey: string | null; key: string; file: SourceFile };
  const placed: Placed[] = [];

  for (const f of md) {
    const r = rel(f.path);
    const segs = r.split('/');
    const fileName = segs.pop()!;
    void fileName;
    let nb = opts.looseNotebook || 'Imported';
    let section = 'General';
    let parentKey: string | null = null;
    if (segs.length >= 1) nb = segs[0];
    if (segs.length >= 2) {
      section = segs[1];
      let dir = `${segs[0]}/${segs[1]}`;
      let depth = 0;
      for (const folder of segs.slice(2)) {
        const candidate = `${dir}/${folder}.md`.toLowerCase();
        if (fileSet.has(candidate)) {
          if (depth < 2) { parentKey = candidate; depth++; }
        } else if (parentKey === null) {
          section = `${section} / ${folder}`;
        }
        dir = `${dir}/${folder}`;
      }
    }
    placed.push({ nb, section, parentKey, key: r.toLowerCase(), file: f });
  }

  // Build the tree.
  const notebooks: PlanNotebook[] = [];
  const pageByKey = new Map<string, { page: PlanPage; section: PlanSection }>();
  let pageCount = 0; let duplicateCount = 0;

  const getNb = (name: string) => {
    let n = notebooks.find((x) => lc(x.name) === lc(name));
    if (!n) {
      const ex = existing.find((e) => lc(e.name) === lc(name));
      n = { name: ex?.name ?? name, existingId: ex?.id, sections: [] };
      notebooks.push(n);
    }
    return n;
  };
  const getSec = (nb: PlanNotebook, name: string) => {
    let s = nb.sections.find((x) => lc(x.name) === lc(name));
    if (!s) {
      const ex = existing.find((e) => e.id === nb.existingId)?.sections.find((e) => lc(e.name) === lc(name));
      s = { name: ex?.name ?? name, existingId: ex?.id, pages: [] };
      nb.sections.push(s);
    }
    return s;
  };

  // Parents first so children can attach to them.
  placed.sort((a, b) => a.key.split('/').length - b.key.split('/').length || a.key.localeCompare(b.key));
  for (const pl of placed) {
    const nb = getNb(pl.nb);
    const sec = getSec(nb, pl.section);
    const parsed = parseNote(pl.file.text, pl.file.path, pl.file.lastModified);
    parsed.warnings.forEach((w) => warnings.push(`${pl.file.path}: ${w}`));
    const exSec = existing.find((e) => e.id === nb.existingId)?.sections.find((e) => e.id === sec.existingId);
    const duplicate = !!exSec?.titles.has(lc(parsed.title));
    const page: PlanPage = {
      key: pl.key, title: parsed.title, content: parsed.body, tags: parsed.tags,
      created_at: parsed.created ?? now, updated_at: parsed.updated ?? parsed.created ?? now, duplicate, children: [],
    };
    pageCount++; if (duplicate) duplicateCount++;
    const parent = pl.parentKey ? pageByKey.get(pl.parentKey) : undefined;
    if (parent && parent.section === sec) parent.page.children.push(page);
    else sec.pages.push(page);
    pageByKey.set(pl.key, { page, section: sec });
  }

  const sortPages = (ps: PlanPage[]) => { ps.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true })); ps.forEach((p) => sortPages(p.children)); };
  notebooks.forEach((n) => { n.sections.sort((a, b) => (a.name === 'General' ? -1 : b.name === 'General' ? 1 : a.name.localeCompare(b.name))); n.sections.forEach((s) => sortPages(s.pages)); });

  return { notebooks, pageCount, duplicateCount, skipped, warnings, hasCommonRoot: root !== null };
}
