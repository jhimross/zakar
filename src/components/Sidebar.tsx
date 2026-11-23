import { useUI, type View } from '../store';
import { Icon } from './Icon';
import { NotebookTree } from './NotebookTree';
import { BrandMark, Wordmark } from './Brand';
import { SyncBadge } from './SyncBadge';
import { AccountButton } from './AccountDialogs';
import { InstallButton } from './Install';
import { exportAll } from '../import/exporter';

export function Sidebar() {
  const ui = useUI();

  const go = (view: View) => ui.set({ view, pane: 'list' });

  const themeNext = { system: 'light', light: 'dark', dark: 'system' } as const;
  const themeIcon = { system: 'monitor', light: 'sun', dark: 'moon' }[ui.theme];

  return (
    <aside className="side">
      <div className="brand">
        <BrandMark size={24} /><Wordmark height={17} />
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
      </nav>

      <NotebookTree />

      <nav className="nav mt">
        <button onClick={() => ui.set({ importOpen: true })}><Icon name="download" />Import .md</button>
        <button onClick={() => exportAll()}><Icon name="upload" />Export .zip</button>
        <button className={ui.view === 'trash' ? 'on' : ''} onClick={() => go('trash')}><Icon name="trash" />Trash</button>
      </nav>
      <div className="foot"><InstallButton variant="sidebar" /><SyncBadge /><AccountButton /></div>
    </aside>
  );
}
