// Export notes back to plain Markdown, mirroring the import folder layout (no lock-in).
import JSZip from 'jszip';
import { db } from '../data/db';
import { bySort, todayTitle } from '../data/actions';
import type { Page } from '../../shared/schema';
import { safeFileName, toMarkdownFile } from './parse';

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function buildExportZip(): Promise<JSZip> {
  const [nbs, secs, pages] = await Promise.all([db.notebooks.toArray(), db.sections.toArray(), db.pages.toArray()]);
  const zip = new JSZip();
  const root = zip.folder('Zakar')!;
  const used = new Set<string>();
  const unique = (path: string) => {
    let p = path; let i = 2;
    while (used.has(p.toLowerCase())) p = path.replace(/(\.md)?$/, ` (${i++})$1`);
    used.add(p.toLowerCase());
    return p;
  };

  for (const nb of nbs.filter((n) => !n.deleted_at).sort(bySort)) {
    const nbDir = unique(safeFileName(nb.name));
    for (const s of secs.filter((x) => x.notebook_id === nb.id && !x.deleted_at).sort(bySort)) {
      const secDir = unique(`${nbDir}/${safeFileName(s.name)}`);
      const inSec = pages.filter((p) => p.section_id === s.id && !p.deleted_at);
      const write = (list: Page[], dir: string) => {
        for (const p of list.sort(bySort)) {
          const base = unique(`${dir}/${safeFileName(p.title)}.md`);
          root.file(base, toMarkdownFile(p));
          const kids = inSec.filter((c) => c.parent_id === p.id);
          if (kids.length) write(kids, base.replace(/\.md$/, ''));
        }
      };
      write(inSec.filter((p) => !p.parent_id || !inSec.some((x) => x.id === p.parent_id)), secDir);
    }
  }
  return zip;
}

export async function exportAll() {
  const zip = await buildExportZip();
  download(await zip.generateAsync({ type: 'blob' }), `Zakar-${todayTitle()}.zip`);
}

export async function exportPage(id: string) {
  const p = await db.pages.get(id);
  if (!p) return;
  download(new Blob([toMarkdownFile(p)], { type: 'text/markdown' }), `${safeFileName(p.title)}.md`);
}
