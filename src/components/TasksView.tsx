import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { updatePage } from '../data/actions';
import { useUI } from '../store';
import { Icon } from './Icon';
import { parseTasks, toggleTaskLine } from '../lib/text';

/** Every checkbox from every page, in one place. */
export function TasksView() {
  const ui = useUI();
  const [showDone, setShowDone] = useState(false);
  const data = useLiveQuery(async () => {
    const [pages, sections, notebooks] = await Promise.all([db.pages.toArray(), db.sections.toArray(), db.notebooks.toArray()]);
    const nb = new Map(notebooks.map((n) => [n.id, n.name]));
    const sec = new Map(sections.map((s) => [s.id, s]));
    return pages
      .filter((p) => !p.deleted_at && p.content.includes('['))
      .map((p) => {
        const s = sec.get(p.section_id);
        return { page: p, crumb: `${nb.get(s?.notebook_id || '') ?? ''} › ${s?.name ?? ''}`, notebookId: s?.notebook_id, tasks: parseTasks(p.content) };
      })
      .filter((g) => g.tasks.length)
      .sort((a, b) => b.page.updated_at - a.page.updated_at);
  }, []) || [];

  const open = data.reduce((n, g) => n + g.tasks.filter((t) => !t.done).length, 0);

  return (
    <main className="ed tasks-view">
      <div className="bar">
        <button className="mobile-back inline" onClick={() => ui.set({ pane: 'nav' })}><Icon name="back" />Notebooks</button>
        <div className="r">
          <label className="check-label"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />Show completed</label>
        </div>
      </div>
      <div className="scroll">
        <article className="doc">
          <h1 className="view-title">Tasks</h1>
          <div className="date">{open} open task{open === 1 ? '' : 's'} across your notes</div>
          {data.map((g) => {
            const tasks = g.tasks.filter((t) => showDone || !t.done);
            if (!tasks.length) return null;
            return (
              <section key={g.page.id} className="task-group">
                <button className="task-page" onClick={() => { ui.set({ view: 'section' }); ui.openPage(g.page.id, { notebookId: g.notebookId, sectionId: g.page.section_id }); }}>
                  {g.page.title || 'Untitled'} <span className="muted">{g.crumb}</span>
                </button>
                <ul className="task-list">
                  {tasks.map((t) => (
                    <li key={t.line}>
                      <input type="checkbox" checked={t.done} aria-label={t.text}
                        onChange={() => updatePage(g.page.id, { content: toggleTaskLine(g.page.content, t.line) })} />
                      <span className={t.done ? 'done' : ''}>{t.text}</span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {!data.length && <p className="muted">No tasks yet. Type <kbd>/</kbd> then “To-do list” in any page.</p>}
        </article>
      </div>
    </main>
  );
}
