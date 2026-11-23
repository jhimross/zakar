import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { bySort, createNotebook, deleteNotebook, listSections, openDailyNote, updateNotebook } from '../data/actions';
import { ask, confirmDialog, useUI, type View } from '../store';
import { Icon } from './Icon';
import { useMenu } from './Overlays';
import { SyncBadge } from './SyncBadge';
import { AccountButton } from './AccountDialogs';
import { exportAll } from '../import/exporter';

export function Sidebar() {
  const ui = useUI();
  const notebooks = useLiveQuery(async () => (await db.notebooks.toArray()).filter((n) => !n.deleted_at).sort(bySort), []) || [];
  const [menu, openMenu] = useMenu();

  const go = (view: View) => ui.set({ view, pane: 'list' });

  const newNotebook = async () => {
    const name = await ask('New notebook', '', 'Create');
    if (name === null) return;
    const { notebook, section } = await createNotebook(name);
    ui.openNotebook(notebook.id, section.id);
  };

  const openNb = async (id: string) => {
    const secs = await listSections(id);
    const keep = secs.find((s) => s.id === ui.sectionId);
    ui.openNotebook(id, keep?.id ?? secs[0]?.id ?? null);
  };

  const daily = async () => {
    const page = await openDailyNote();
    const sec = await db.sections.get(page.section_id);
    ui.set({ view: 'section' });
    ui.openPage(page.id, { notebookId: sec?.notebook_id, sectionId: page.section_id });
  };

  const themeNext = { system: 'light', light: 'dark', dark: 'system' } as const;
  const themeIcon = { system: 'monitor', light: 'sun', dark: 'moon' }[ui.theme];

  return (
    <aside className="side">
      <div className="brand">
        <div className="logo">M</div>MyNotes
        <button className="icon-btn ml-auto" title={`Theme: ${ui.theme}`} onClick={() => ui.set({ theme: themeNext[ui.theme] })}>
          <Icon name={themeIcon} />
        </button>
      </div>
      <button className="search" onClick={() => ui.set({ paletteOpen: true })}>
        <Icon name="search" />Search<kbd>⌘K</kbd>
      </button>
      <nav className="nav">
        <button className={ui.view === 'recent' ? 'on' : ''} onClick={() => go('recent')}><Icon name="clock" />Recent</button>
        <button className={ui.view === 'favorites' ? 'on' : ''} onClick={() => go('favorites')}><Icon name="star" />Favorites</button>
        <button onClick={daily}><Icon name="calendar" />Daily note</button>
        <button className={ui.view === 'tasks' ? 'on' : ''} onClick={() => go('tasks')}><Icon name="tasks" />Tasks</button>
      </nav>

      <div className="label">
        <span>Notebooks</span>
        <button className="icon-btn tiny" title="New notebook" onClick={newNotebook}><Icon name="plus" size={13} /></button>
      </div>
      <div className="notebooks">
        {notebooks.map((nb) => (
          <div key={nb.id}
            className={`nb ${ui.view === 'section' && ui.notebookId === nb.id ? 'on' : ''}`}
            onClick={() => openNb(nb.id)}
            onContextMenu={(e) => openMenu(e, nbMenu(nb.id, nb.name))}
            role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') openNb(nb.id); }}>
            <span className="dot" style={{ background: nb.color || '#999' }} />
            <span className="truncate">{nb.name}</span>
            <button className="icon-btn tiny hover-only ml-auto" aria-label="Notebook options"
              onClick={(e) => openMenu(e, nbMenu(nb.id, nb.name))}><Icon name="more" size={13} /></button>
          </div>
        ))}
        {!notebooks.length && <button className="nb muted" onClick={newNotebook}><Icon name="plus" />Create a notebook</button>}
      </div>

      <nav className="nav mt">
        <button onClick={() => ui.set({ importOpen: true })}><Icon name="download" />Import .md</button>
        <button onClick={() => exportAll()}><Icon name="upload" />Export .zip</button>
        <button className={ui.view === 'trash' ? 'on' : ''} onClick={() => go('trash')}><Icon name="trash" />Trash</button>
      </nav>
      <div className="foot"><SyncBadge /><AccountButton /></div>
      {menu}
    </aside>
  );

  function nbMenu(id: string, name: string) {
    return [
      { label: 'Rename', icon: 'edit', onClick: async () => { const v = await ask('Rename notebook', name); if (v) await updateNotebook(id, { name: v.trim() }); } },
      { colors: (c: string) => void updateNotebook(id, { color: c }) },
      { divider: true },
      { label: 'Delete notebook', icon: 'trash', danger: true, onClick: async () => {
        if (await confirmDialog(`Delete “${name}”?`, 'Its pages move to Trash, where you can restore them.')) {
          await deleteNotebook(id);
          if (ui.notebookId === id) ui.set({ notebookId: null, sectionId: null, pageId: null });
        }
      } },
    ];
  }
}
