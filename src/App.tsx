import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, requestPersistentStorage } from './data/db';
import { startSync, useSync } from './data/sync';
import { createNotebook } from './data/actions';
import { ask, useUI } from './store';
import { Sidebar } from './components/Sidebar';
import { PageList } from './components/PageList';
import { EditorPane } from './components/Editor';
import { TasksView } from './components/TasksView';
import { CommandPalette } from './components/CommandPalette';
import { MoveDialog } from './components/MoveDialog';
import { DialogHost, Toast } from './components/Overlays';
import { ImportDialog } from './import/ImportDialog';
import { Icon } from './components/Icon';
import { initAuth, useAuth } from './data/auth';
import { LoadingScreen, LoginScreen, SetupScreen } from './components/AuthScreens';
import { PasswordDialog, UsersDialog } from './components/AccountDialogs';

export default function Root() {
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);
  const theme = useUI((s) => s.theme);
  useEffect(() => { void initAuth(); }, []);
  useEffect(() => { if (status === 'ready' && user) useUI.getState().resetForUser(user.id); }, [status, user]);
  useTheme(theme);
  if (status === 'loading') return <LoadingScreen />;
  if (status === 'setup') return <SetupScreen />;
  if (status === 'login') return <LoginScreen />;
  return <App />;
}

function useTheme(theme: string) {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#191918' : '#FBFBFA');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

function App() {
  const ui = useUI();
  const syncState = useSync((s) => s.state);
  const notebookCount = useLiveQuery(async () => (await db.notebooks.toArray()).filter((n) => !n.deleted_at).length, []);

  useEffect(() => { startSync(); void requestPersistentStorage(); }, []);

  // Shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); ui.set({ paletteOpen: !useUI.getState().paletteOpen }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep a valid selection when notebooks change (e.g. after first sync).
  useEffect(() => {
    void (async () => {
      if (ui.notebookId) {
        const nb = await db.notebooks.get(ui.notebookId);
        if (nb && !nb.deleted_at) return;
      }
      const first = (await db.notebooks.toArray()).filter((n) => !n.deleted_at).sort((a, b) => (a.sort_key < b.sort_key ? -1 : 1))[0];
      if (first) ui.set({ notebookId: first.id, sectionId: null });
    })();
  }, [notebookCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const firstRun = notebookCount === 0;

  return (
    <div className={`app pane-${ui.pane} view-${ui.view}`}>
      <Sidebar />
      {firstRun ? (
        <Welcome syncing={syncState === 'syncing'} />
      ) : ui.view === 'tasks' ? (
        <TasksView />
      ) : (
        <>
          <PageList />
          <EditorPane />
        </>
      )}
      {ui.paletteOpen && <CommandPalette />}
      {ui.importOpen && <ImportDialog />}
      {ui.moveOpen && <MoveDialog />}
      {ui.usersOpen && <UsersDialog />}
      {ui.passwordOpen && <PasswordDialog />}
      <DialogHost />
      <Toast />
    </div>
  );
}

function Welcome({ syncing }: { syncing: boolean }) {
  const ui = useUI();
  return (
    <main className="welcome">
      <div className="welcome-card">
        <div className="empty-mark">M</div>
        <h1>Welcome to MyNotes</h1>
        <p className="muted">Notebooks, sections and pages, like OneNote. Works offline and syncs when you're back online.</p>
        {syncing && <p className="muted small">Checking for notes from your other devices…</p>}
        <div className="row gap center">
          <button className="btn primary" onClick={async () => {
            const name = await ask('Name your first notebook', 'My Notebook', 'Create');
            if (name === null) return;
            const { notebook, section } = await createNotebook(name);
            ui.openNotebook(notebook.id, section.id);
          }}><Icon name="plus" />Create a notebook</button>
          <button className="btn" onClick={() => ui.set({ importOpen: true })}><Icon name="download" />Import .md files</button>
        </div>
      </div>
    </main>
  );
}
