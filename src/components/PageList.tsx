import { useState, type DragEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import {
  bySort, childrenOf, createPage, createSection, deletePage, deleteSection, depthOf, descendantsOf, emptyTrash,
  indentPage, MAX_DEPTH, movePage, outdentPage, purgePage, restorePage, subtreeHeight, updatePage, updateSection,
} from '../data/actions';
import type { Page } from '../../shared/schema';
import { ask, confirmDialog, useUI } from '../store';
import { Icon } from './Icon';
import { useMenu, toast } from './Overlays';
import { relTime, snippet } from '../lib/text';

export function PageList() {
  const view = useUI((s) => s.view);
  if (view === 'section') return <SectionView />;
  return <FlatView />;
}

function MobileBack({ label }: { label: string }) {
  const set = useUI((s) => s.set);
  return <button className="mobile-back" onClick={() => set({ pane: 'nav' })}><Icon name="back" />{label}</button>;
}

// ---------------- Section view: tabs + page tree ----------------
function SectionView() {
  const ui = useUI();
  const notebook = useLiveQuery(() => (ui.notebookId ? db.notebooks.get(ui.notebookId) : undefined), [ui.notebookId]);
  const sections = useLiveQuery(async () => ui.notebookId
    ? (await db.sections.where('notebook_id').equals(ui.notebookId).toArray()).filter((s) => !s.deleted_at).sort(bySort)
    : [], [ui.notebookId]) || [];
  const section = sections.find((s) => s.id === ui.sectionId) || sections[0];
  const pages = useLiveQuery(async () => section
    ? (await db.pages.where('section_id').equals(section.id).toArray()).filter((p) => !p.deleted_at)
    : [], [section?.id]) || [];
  const [menu, openMenu] = useMenu();
  const [drag, setDrag] = useState<{ id: string } | null>(null);
  const [drop, setDrop] = useState<{ id: string; pos: 'before' | 'after' | 'inside' } | null>(null);
  const [tabDrop, setTabDrop] = useState<string | null>(null);

  if (!notebook || notebook.deleted_at) {
    return <section className="list"><MobileBack label="Notebooks" /><div className="empty-small">Select or create a notebook.</div></section>;
  }

  const addSection = async () => {
    const name = await ask('New section', '', 'Create');
    if (name === null) return;
    const s = await createSection(notebook.id, name);
    ui.openSection(notebook.id, s.id);
  };

  const addPage = async (parentId: string | null = null) => {
    if (!section) return;
    const p = await createPage(section.id, { parentId });
    if (parentId && ui.collapsed[parentId]) ui.toggleCollapsed(parentId);
    ui.set({ focusTitle: p.id });
    ui.openPage(p.id, { notebookId: notebook.id, sectionId: section.id });
  };

  // Flatten the visible tree.
  const rows: { page: Page; depth: number; hasKids: boolean }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const p of childrenOf(pages, parentId)) {
      const hasKids = pages.some((c) => c.parent_id === p.id);
      rows.push({ page: p, depth, hasKids });
      if (hasKids && !ui.collapsed[p.id]) walk(p.id, depth + 1);
    }
  };
  walk(null, 0);
  // Orphans (parent deleted/moved) appear at root.
  pages.filter((p) => p.parent_id && !pages.some((x) => x.id === p.parent_id)).forEach((p) => rows.push({ page: p, depth: 0, hasKids: false }));

  // ---- Drag & drop ----
  const onDragOver = (e: DragEvent, target: Page) => {
    if (!drag || drag.id === target.id) return;
    if (descendantsOf(pages, drag.id).some((d) => d.id === target.id)) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    const canNest = depthOf(pages, target) + 1 + subtreeHeight(pages, drag.id) <= MAX_DEPTH;
    const pos = y < 0.3 ? 'before' : y > 0.7 || !canNest ? 'after' : 'inside';
    setDrop({ id: target.id, pos });
  };
  const onDrop = async (e: DragEvent, target: Page) => {
    e.preventDefault();
    if (!drag || !drop || !section) return finish();
    if (drop.pos === 'inside') {
      await movePage(drag.id, { sectionId: section.id, parentId: target.id });
      if (ui.collapsed[target.id]) ui.toggleCollapsed(target.id);
    } else {
      await movePage(drag.id, { sectionId: section.id, parentId: target.parent_id || null, [drop.pos === 'before' ? 'beforeId' : 'afterId']: target.id });
    }
    finish();
  };
  const onTabDrop = async (e: DragEvent, sectionId: string) => {
    e.preventDefault();
    if (drag && sectionId !== section?.id) {
      await movePage(drag.id, { sectionId, parentId: null });
      const s = sections.find((x) => x.id === sectionId);
      toast(`Moved to ${s?.name}`);
    }
    finish();
  };
  const finish = () => { setDrag(null); setDrop(null); setTabDrop(null); };

  const pageMenu = (p: Page) => [
    { label: 'Add subpage', icon: 'sub', disabled: depthOf(pages, p) >= MAX_DEPTH, onClick: () => addPage(p.id) },
    { label: p.favorite ? 'Remove from favorites' : 'Add to favorites', icon: 'star', onClick: () => updatePage(p.id, { favorite: p.favorite ? 0 : 1 }) },
    { label: 'Indent (make subpage)', icon: 'indent', onClick: async () => { if (!(await indentPage(p.id))) toast("Can't indent this page further"); } },
    { label: 'Outdent', icon: 'outdent', disabled: !p.parent_id, onClick: () => outdentPage(p.id) },
    { label: 'Move to…', icon: 'move', onClick: () => ui.set({ moveOpen: p.id }) },
    { divider: true },
    { label: 'Delete', icon: 'trash', danger: true, onClick: async () => { await deletePage(p.id); if (ui.pageId === p.id) ui.set({ pageId: null }); toast('Moved to Trash'); } },
  ];

  const sectionMenu = (id: string, name: string) => [
    { label: 'Rename', icon: 'edit', onClick: async () => { const v = await ask('Rename section', name); if (v) await updateSection(id, { name: v.trim() }); } },
    { colors: (c: string) => void updateSection(id, { color: c }) },
    { divider: true },
    { label: 'Delete section', icon: 'trash', danger: true, onClick: async () => {
      if (await confirmDialog(`Delete “${name}”?`, 'Its pages move to Trash, where you can restore them.')) await deleteSection(id);
    } },
  ];

  return (
    <section className="list">
      <MobileBack label="Notebooks" />
      <h2 className="mobile-title">{notebook.name}</h2>
      <div className="tabs" role="tablist">
        {sections.map((s) => (
          <button key={s.id} role="tab" aria-selected={s.id === section?.id}
            className={`tab ${s.id === section?.id ? 'on' : ''} ${tabDrop === s.id ? 'drop' : ''}`}
            onClick={() => ui.openSection(notebook.id, s.id)}
            onContextMenu={(e) => openMenu(e, sectionMenu(s.id, s.name))}
            onDoubleClick={(e) => openMenu(e, sectionMenu(s.id, s.name))}
            onDragOver={(e) => { if (drag) { e.preventDefault(); setTabDrop(s.id); } }}
            onDragLeave={() => setTabDrop(null)}
            onDrop={(e) => onTabDrop(e, s.id)}>
            <span className="dot" style={{ background: s.color || '#999' }} />{s.name}
          </button>
        ))}
        <button className="tab add" title="New section" onClick={addSection}><Icon name="plus" size={13} /></button>
      </div>

      <div className="lh">
        <h3>{section?.name || 'No sections'}</h3>
        <div className="row-actions">
          {section && <button className="icon-btn" title="Section options" onClick={(e) => openMenu(e, sectionMenu(section.id, section.name))}><Icon name="more" /></button>}
          {section && <button className="icon-btn" title="New page" onClick={() => addPage()}><Icon name="plus" /></button>}
        </div>
      </div>

      <div className="pages" onDragEnd={finish}>
        {rows.map(({ page: p, depth, hasKids }) => (
          <div key={p.id}
            className={`pg ${p.id === ui.pageId ? 'on' : ''} ${drop?.id === p.id ? `drop-${drop.pos}` : ''} ${drag?.id === p.id ? 'dragging' : ''}`}
            style={{ marginLeft: depth * 16 }}
            data-depth={depth}
            draggable
            onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', p.id); setDrag({ id: p.id }); }}
            onDragOver={(e) => onDragOver(e, p)}
            onDragLeave={() => setDrop((d) => (d?.id === p.id ? null : d))}
            onDrop={(e) => onDrop(e, p)}
            onClick={() => ui.openPage(p.id, { notebookId: notebook.id, sectionId: section!.id })}
            onContextMenu={(e) => openMenu(e, pageMenu(p))}>
            <div className="t">
              {hasKids ? (
                <button className={`caret ${ui.collapsed[p.id] ? 'closed' : ''}`} aria-label="Toggle subpages"
                  onClick={(e) => { e.stopPropagation(); ui.toggleCollapsed(p.id); }}><Icon name="chevron" size={12} /></button>
              ) : depth > 0 ? <span className="caret-space" /> : null}
              <span className="truncate">{p.title || 'Untitled'}</span>
              {p.favorite ? <Icon name="star" size={11} className="fav" /> : null}
              <button className="icon-btn tiny hover-only ml-auto" aria-label="Page options" onClick={(e) => openMenu(e, pageMenu(p))}><Icon name="more" size={13} /></button>
            </div>
            <div className="s">{snippet(p.content, 70) || <span className="muted">No content</span>}</div>
          </div>
        ))}
        {section && !rows.length && (
          <div className="empty-small">
            <p>No pages yet.</p>
            <button className="btn" onClick={() => addPage()}><Icon name="plus" />New page</button>
          </div>
        )}
        {!section && <div className="empty-small"><button className="btn" onClick={addSection}><Icon name="plus" />Add a section</button></div>}
      </div>
      {section && <button className="fab" aria-label="New page" onClick={() => addPage()}><Icon name="plus" size={22} /></button>}
      {menu}
    </section>
  );
}

// ---------------- Recent / Favorites / Trash ----------------
function FlatView() {
  const ui = useUI();
  const sections = useLiveQuery(() => db.sections.toArray(), []) || [];
  const notebooks = useLiveQuery(() => db.notebooks.toArray(), []) || [];
  const pages = useLiveQuery(async () => {
    if (ui.view === 'recent') return (await db.pages.orderBy('updated_at').reverse().limit(200).toArray()).filter((p) => !p.deleted_at).slice(0, 50);
    if (ui.view === 'favorites') return (await db.pages.toArray()).filter((p) => p.favorite && !p.deleted_at).sort((a, b) => b.updated_at - a.updated_at);
    if (ui.view === 'trash') return (await db.pages.toArray()).filter((p) => p.deleted_at && !p.purged).sort((a, b) => (b.deleted_at || 0) - (a.deleted_at || 0));
    return [];
  }, [ui.view]) || [];
  const secMap = new Map(sections.map((s) => [s.id, s]));
  const nbMap = new Map(notebooks.map((n) => [n.id, n]));
  const title = { recent: 'Recent', favorites: 'Favorites', trash: 'Trash', tasks: 'Tasks', section: '' }[ui.view];
  const crumb = (p: Page) => { const s = secMap.get(p.section_id); const n = s && nbMap.get(s.notebook_id); return [n?.name, s?.name].filter(Boolean).join(' › '); };

  return (
    <section className="list">
      <MobileBack label="Notebooks" />
      <div className="lh first">
        <h3>{title}</h3>
        {ui.view === 'trash' && pages.length > 0 && (
          <button className="btn small danger-text" onClick={async () => {
            if (await confirmDialog('Empty trash?', `${pages.length} page(s) will be deleted forever.`, 'Empty trash')) await emptyTrash();
          }}>Empty</button>
        )}
      </div>
      <div className="pages">
        {pages.map((p) => (
          <div key={p.id} className={`pg ${p.id === ui.pageId ? 'on' : ''}`}
            onClick={() => { const s = secMap.get(p.section_id); ui.openPage(p.id, { notebookId: s?.notebook_id, sectionId: p.section_id }); }}>
            <div className="t"><span className="truncate">{p.title || 'Untitled'}</span></div>
            <div className="s">{crumb(p)} · {relTime(ui.view === 'trash' ? p.deleted_at! : p.updated_at)}</div>
            {ui.view === 'trash' && (
              <div className="trash-actions">
                <button className="btn small" onClick={(e) => { e.stopPropagation(); void restorePage(p.id).then(() => toast('Restored')); }}><Icon name="restore" />Restore</button>
                <button className="btn small danger-text" onClick={async (e) => {
                  e.stopPropagation();
                  if (await confirmDialog('Delete forever?', `“${p.title || 'Untitled'}” can't be recovered.`)) await purgePage(p.id);
                }}>Delete forever</button>
              </div>
            )}
          </div>
        ))}
        {!pages.length && <div className="empty-small">{{ recent: 'No pages yet.', favorites: 'Star a page to see it here.', trash: 'Trash is empty.', tasks: '', section: '' }[ui.view]}</div>}
      </div>
    </section>
  );
}
