// Export notes back to plain Markdown, mirroring the import folder layout (no lock-in).
import JSZip from 'jszip';
import { db } from '../data/db';
import { bySort, todayTitle } from '../data/actions';
import type { Page } from '../../shared/schema';
import { safeFileName, toMarkdownFile } from './parse';
import { formatDate, markdownToText } from '../lib/text';

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
    const secIds = new Set(secs.filter((x) => x.notebook_id === nb.id).map((x) => x.id));
    const inNb = pages.filter((p) => secIds.has(p.section_id) && !p.deleted_at);
    const write = (list: Page[], dir: string) => {
      for (const p of list.sort(bySort)) {
        const base = unique(`${dir}/${safeFileName(p.title)}.md`);
        root.file(base, toMarkdownFile(p));
        const kids = inNb.filter((c) => c.parent_id === p.id);
        if (kids.length) write(kids, base.replace(/\.md$/, ''));
      }
    };
    write(inNb.filter((p) => !p.parent_id || !inNb.some((x) => x.id === p.parent_id)), nbDir);
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

async function noteContext(id: string) {
  const p = await db.pages.get(id);
  if (!p) return null;
  const sec = await db.sections.get(p.section_id);
  const nb = sec ? await db.notebooks.get(sec.notebook_id) : undefined;
  const g = nb?.group_id ? await db.notebook_groups.get(nb.group_id) : undefined;
  return { page: p, crumb: [g && !g.deleted_at ? g.name : null, nb?.name].filter(Boolean).join(' › ') };
}

/** Plain text (.txt): title, details, then the note with Markdown symbols turned into readable text. */
export async function exportPageText(id: string) {
  const ctx = await noteContext(id);
  if (!ctx) return;
  const { page: p, crumb } = ctx;
  const title = p.title || 'Untitled';
  const details = [crumb, formatDate(p.updated_at), p.tags.length ? p.tags.map((t) => '#' + t).join(' ') : ''].filter(Boolean).join('  ·  ');
  const text = `${title}\n${'='.repeat(Math.min(Math.max(title.length, 3), 60))}\n${details}\n\n${markdownToText(p.content)}`;
  download(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${safeFileName(title)}.txt`);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Build a print-ready HTML document for a note (used for PDF export). `bodyHtml` comes from the editor. */
export function printableHtml(o: { title: string; crumb: string; date: string; tags: string[]; bodyHtml: string; autoPrint: boolean }) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<style>
  @page { size: auto; margin: 18mm 16mm 20mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1F1F1D; font-size: 11.5pt; line-height: 1.6; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { max-width: 720px; margin: 0 auto; padding: 32px 24px 48px; }
  .brand { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 10pt; color: #24473B; letter-spacing: .02em; margin-bottom: 26px; }
  .brand i { display: inline-block; width: 14px; height: 14px; border-radius: 4px; background: #24473B; }
  h1.title { font-size: 24pt; line-height: 1.15; letter-spacing: -.02em; margin: 0 0 6px; }
  .meta { color: #77746E; font-size: 9.5pt; margin-bottom: 22px; padding-bottom: 14px; border-bottom: 1px solid #E9E8E4; }
  .meta .tag { background: #F0EFEB; border-radius: 999px; padding: 1px 7px; margin-left: 4px; color: #5F5E5A; }
  .content h1 { font-size: 16pt; margin: 22px 0 6px; } .content h2 { font-size: 13.5pt; margin: 20px 0 6px; } .content h3 { font-size: 12pt; margin: 16px 0 4px; }
  .content h1, .content h2, .content h3 { break-after: avoid; page-break-after: avoid; }
  .content p { margin: 0 0 8px; }
  .content ul, .content ol { margin: 0 0 8px; padding-left: 22px; } .content li { margin: 2px 0; } .content li p { margin: 0; }
  .content li, .content blockquote, .content pre { break-inside: avoid; page-break-inside: avoid; }
  .content blockquote { margin: 10px 0; padding: 2px 0 2px 14px; border-left: 3px solid #D9A43A; color: #3A3A37; font-style: italic; }
  .content pre { background: #F4F4F2; border-radius: 6px; padding: 10px 12px; white-space: pre-wrap; font-size: 9.5pt; }
  .content code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: .92em; }
  .content a { color: #24473B; }
  .content hr { border: 0; border-top: 1px solid #E9E8E4; margin: 16px 0; }
  .content img { max-width: 100%; }
  .content ul[data-type="taskList"] { list-style: none; padding-left: 0; }
  .content ul[data-type="taskList"] li { display: flex; gap: 8px; align-items: flex-start; }
  .content ul[data-type="taskList"] label { flex: none; margin-top: 3px; }
  .content ul[data-type="taskList"] input { width: 12px; height: 12px; margin: 0; accent-color: #24473B; }
  .content ul[data-type="taskList"] li[data-checked="true"] > div { color: #8A8781; text-decoration: line-through; }
  .content ul[data-type="taskList"] li > div { flex: 1; }
  .bar { position: sticky; top: 0; background: #24473B; color: #F6F1E6; padding: 10px 16px; display: flex; gap: 12px; align-items: center; justify-content: center; flex-wrap: wrap; font-size: 13px; }
  .bar button { font: inherit; font-weight: 600; background: #D9A43A; color: #1F1F1D; border: 0; border-radius: 8px; padding: 7px 14px; cursor: pointer; }
  .bar span { opacity: .85; }
  @media print { .bar { display: none; } .page { padding: 0; max-width: none; } }
</style></head><body>
<div class="bar"><button onclick="window.print()">Save as PDF</button><span>Choose “Save as PDF” as the printer. On iPhone/iPad: Print, then tap Share in the preview → Save to Files.</span></div>
<div class="page">
  <div class="brand"><i></i>Zakar</div>
  <h1 class="title">${esc(o.title)}</h1>
  <div class="meta">${esc([o.crumb, o.date].filter(Boolean).join(' · '))}${o.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}</div>
  <div class="content">${o.bodyHtml}</div>
</div>
${o.autoPrint ? '<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},400)})</script>' : ''}
</body></html>`;
}

/** PDF: shows a clean print view of the note; the browser's "Save as PDF" creates the file.
 *  `win` must be opened synchronously in the click handler (window.open('')) so pop-up blockers allow it. */
export async function exportPagePdf(id: string, bodyHtml: string, win: Window | null) {
  const ctx = await noteContext(id);
  if (!ctx) { win?.close(); return; }
  const { page: p, crumb } = ctx;
  const html = printableHtml({ title: p.title || 'Untitled', crumb, date: formatDate(p.updated_at), tags: p.tags, bodyHtml, autoPrint: true });
  if (win && !win.closed) {
    win.document.open();
    win.document.write(html);
    win.document.close();
    return;
  }
  // Pop-up not allowed (e.g. some installed-app modes): print from a hidden frame instead.
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  frame.srcdoc = html.replace(/<script>[\s\S]*?<\/script>/, '');
  document.body.appendChild(frame);
  frame.onload = () => { frame.contentWindow?.focus(); frame.contentWindow?.print(); setTimeout(() => frame.remove(), 60_000); };
}
