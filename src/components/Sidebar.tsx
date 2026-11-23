import { db } from '../data/db';
import { openDailyNote } from '../data/actions';
import { useUI, type View } from '../store';
import { Icon } from './Icon';
import { NotebookTree } from './NotebookTree';
import { SyncBadge } from './SyncBadge';
import { AccountButton } from './AccountDialogs';
import { exportAll } from '../import/exporter';

export function Sidebar() {
  const ui = useUI();

  const go = (view: View) => ui.set({ view, pane: 'list' });

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

      <NotebookTree />

      <nav className="nav mt">
        <button onClick={() => ui.set({ importOpen: true })}><Icon name="download" />Import .md</button>
        <button onClick={() => exportAll()}><Icon name="upload" />Export .zip</button>
        <button className={ui.view === 'trash' ? 'on' : ''} onClick={() => go('trash')}><Icon name="trash" />Trash</button>
      </nav>
      <div className="foot"><SyncBadge /><AccountButton /></div>
    </aside>
  );
}
