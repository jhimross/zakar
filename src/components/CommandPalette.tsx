import { useEffect, useMemo, useRef, useState } from 'react';
import MiniSearch from 'minisearch';
import { db } from '../data/db';
import { createNotebook, createPage, listNotebooks, primarySection } from '../data/actions';
import type { Page } from '../../shared/schema';
import { useUI } from '../store';
import { Icon } from './Icon';
import { Modal } from './Overlays';
import { plainText, snippet } from '../lib/text';
import { exportAll } from '../import/exporter';
import { installApp, useCanInstall } from '../lib/install';

interface Result { kind: 'page' | 'action'; id: string; title: string; sub?: string; icon: string; run: () => void }

export function CommandPalette() {
  const ui = useUI();
  const canInstall = useCanInstall();
  const [q, setQ] = useState('');
  const [index, setIndex] = useState(0);
  const [data, setData] = useState<{ pages: Page[]; crumbs: Map<string, string>; nbOf: Map<string, string> } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      const [pages, sections, notebooks, groups] = await Promise.all([db.pages.toArray(), db.sections.toArray(), db.notebooks.toArray(), db.notebook_groups.toArray()]);
      const gr = new Map(groups.filter((g) => !g.deleted_at).map((g) => [g.id, g.name]));
      const nb = new Map(notebooks.map((n) => [n.id, n]));
      const crumbs = new Map<string, string>(); const nbOf = new Map<string, string>();
      for (const s of sections) {
        const n = nb.get(s.notebook_id);
        crumbs.set(s.id, [n?.group_id ? gr.get(n.group_id) : null, n?.name].filter(Boolean).join(' › '));
        nbOf.set(s.id, s.notebook_id);
      }
      setData({ pages: pages.filter((p) => !p.deleted_at), crumbs, nbOf });
    })();
  }, []);

  const search = useMemo(() => {
    if (!data) return null;
    const ms = new MiniSearch<{ id: string; title: string; text: string; tags: string }>({
      fields: ['title', 'text', 'tags'],
      storeFields: ['id'],
      searchOptions: { boost: { title: 3, tags: 2 }, prefix: true, fuzzy: 0.2 },
    });
    ms.addAll(data.pages.map((p) => ({ id: p.id, title: p.title, text: plainText(p.content), tags: p.tags.join(' ') })));
    return ms;
  }, [data]);

  const close = () => ui.set({ paletteOpen: false });
  const open = (p: Page) => { ui.set({ view: 'section' }); ui.openPage(p.id, { notebookId: data?.nbOf.get(p.section_id), sectionId: p.section_id }); close(); };

  const actions: Result[] = [
    { kind: 'action', id: 'new-page', title: 'New page', icon: 'plus', run: async () => {
      // No notebook open (e.g. right after sign-in): use the first one, or make one, instead of doing nothing.
      const nbId = ui.notebookId ?? (await listNotebooks())[0]?.id ?? (await createNotebook('Notes')).notebook.id;
      const sec = await primarySection(nbId);
      const p = await createPage(sec.id); ui.set({ focusTitle: p.id, view: 'section' }); ui.openPage(p.id, { notebookId: nbId, sectionId: sec.id }); close();
    } },
    { kind: 'action', id: 'new-nb', title: 'New notebook', icon: 'book', run: async () => {
      const { notebook, section } = await createNotebook(q.replace(/^new notebook\s*/i, '') || 'New notebook'); ui.openNotebook(notebook.id, section.id); close();
    } },
    { kind: 'action', id: 'import', title: 'Import Markdown files', icon: 'download', run: () => ui.set({ paletteOpen: false, importOpen: true }) },
    { kind: 'action', id: 'export', title: 'Export all notes (.zip)', icon: 'upload', run: () => { void exportAll(); close(); } },
    ...(canInstall ? [{ kind: 'action' as const, id: 'install', title: 'Install app on this device', icon: 'install', run: () => { close(); void installApp(); } }] : []),
    { kind: 'action', id: 'theme', title: 'Toggle dark mode', icon: 'moon', run: () => {
      const dark = document.documentElement.classList.contains('dark'); ui.set({ theme: dark ? 'light' : 'dark' }); close();
    } },
  ];

  let results: Result[] = [];
  if (data) {
    const query = q.trim();
    let pages: Page[];
    if (!query) pages = [...data.pages].sort((a, b) => b.updated_at - a.updated_at).slice(0, 8);
    else if (query.startsWith('#')) {
      const tag = query.slice(1).toLowerCase();
      pages = data.pages.filter((p) => p.tags.some((t) => t.toLowerCase().startsWith(tag)) || p.content.toLowerCase().includes(query.toLowerCase())).slice(0, 30);
    } else {
      const byId = new Map(data.pages.map((p) => [p.id, p]));
      pages = (search?.search(query) || []).slice(0, 30).map((r) => byId.get(r.id as string)!).filter(Boolean);
    }
    results = pages.map((p) => ({
      kind: 'page', id: p.id, title: p.title || 'Untitled', icon: 'file',
      sub: `${data.crumbs.get(p.section_id) ?? ''}${p.content ? ' · ' + snippet(p.content, 60) : ''}`, run: () => open(p),
    }));
    const ql = query.toLowerCase();
    const acts = actions.filter((a) => !ql || a.title.toLowerCase().includes(ql) || (ql.startsWith('new') && a.id.startsWith('new')));
    results = [...results, ...acts];
  }

  useEffect(() => setIndex(0), [q]);
  useEffect(() => { listRef.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' }); }, [index]);

  return (
    <Modal onClose={close} className="palette">
      <div className="palette-input">
        <Icon name="search" />
        <input autoFocus placeholder="Search notes, #tags, or type a command…" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, results.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
            if (e.key === 'Enter') { e.preventDefault(); results[index]?.run(); }
          }} />
        <kbd>esc</kbd>
      </div>
      <div className="palette-list" ref={listRef}>
        {results[0]?.kind === 'page' && <div className="palette-group">{q ? 'Pages' : 'Recent'}</div>}
        {results.map((r, i) => (
          <div key={r.kind + r.id}>
            {i > 0 && r.kind === 'action' && results[i - 1].kind === 'page' && <div className="palette-group">Actions</div>}
            {i === 0 && r.kind === 'action' && <div className="palette-group">Actions</div>}
            <button className={`palette-item ${i === index ? 'on' : ''}`} onMouseEnter={() => setIndex(i)} onClick={r.run}>
              <Icon name={r.icon} />
              <span className="pi-main"><span className="pi-title">{r.title}</span>{r.sub && <span className="pi-sub">{r.sub}</span>}</span>
            </button>
          </div>
        ))}
        {data && q && !results.length && <div className="empty-small">No results for “{q}”.</div>}
      </div>
    </Modal>
  );
}
