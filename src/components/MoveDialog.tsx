import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { bySort, movePage } from '../data/actions';
import { useUI } from '../store';
import { Modal, toast } from './Overlays';

export function MoveDialog() {
  const ui = useUI();
  const pageId = ui.moveOpen!;
  const page = useLiveQuery(() => db.pages.get(pageId), [pageId]);
  const notebooks = useLiveQuery(async () => (await db.notebooks.toArray()).filter((n) => !n.deleted_at).sort(bySort), []) || [];
  const sections = useLiveQuery(async () => (await db.sections.toArray()).filter((s) => !s.deleted_at).sort(bySort), []) || [];
  const [nb, setNb] = useState<string>('');
  const [sec, setSec] = useState<string>('');

  useEffect(() => {
    if (page && !nb) {
      const s = sections.find((x) => x.id === page.section_id);
      if (s) { setNb(s.notebook_id); setSec(s.id); }
    }
  }, [page, sections, nb]);

  const close = () => ui.set({ moveOpen: null });
  const nbSections = sections.filter((s) => s.notebook_id === nb);

  return (
    <Modal onClose={close} className="small">
      <form onSubmit={async (e) => {
        e.preventDefault();
        if (!sec || !page) return;
        await movePage(page.id, { sectionId: sec, parentId: null });
        if (ui.pageId === page.id) ui.set({ notebookId: nb, sectionId: sec });
        toast('Page moved');
        close();
      }}>
        <h3>Move “{page?.title || 'Untitled'}”</h3>
        <label className="field">Notebook
          <select className="input" value={nb} onChange={(e) => { setNb(e.target.value); setSec(sections.find((s) => s.notebook_id === e.target.value)?.id || ''); }}>
            {notebooks.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </label>
        <label className="field">Section
          <select className="input" value={sec} onChange={(e) => setSec(e.target.value)}>
            {nbSections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <p className="muted small">Subpages move with it.</p>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={close}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!sec}>Move</button>
        </div>
      </form>
    </Modal>
  );
}
