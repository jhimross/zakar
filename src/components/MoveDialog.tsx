import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { bySort, movePage, primarySection } from '../data/actions';
import { useUI } from '../store';
import { Modal, toast } from './Overlays';

/** Move a page (and its subpages) to another notebook. */
export function MoveDialog() {
  const ui = useUI();
  const pageId = ui.moveOpen!;
  const page = useLiveQuery(() => db.pages.get(pageId), [pageId]);
  const notebooks = useLiveQuery(async () => (await db.notebooks.toArray()).filter((n) => !n.deleted_at).sort(bySort), []) || [];
  const groups = useLiveQuery(async () => (await db.notebook_groups.toArray()).filter((g) => !g.deleted_at), []) || [];
  const current = useLiveQuery(async () => (page ? (await db.sections.get(page.section_id))?.notebook_id : undefined), [page?.section_id]);
  const [nb, setNb] = useState('');

  useEffect(() => { if (current && !nb) setNb(current); }, [current, nb]);

  const close = () => ui.set({ moveOpen: null });
  const groupName = (id?: string | null) => groups.find((g) => g.id === id)?.name;

  return (
    <Modal onClose={close} className="small">
      <form onSubmit={async (e) => {
        e.preventDefault();
        if (!nb || !page) return;
        const sec = await primarySection(nb);
        await movePage(page.id, { sectionId: sec.id, parentId: null });
        if (ui.pageId === page.id) ui.set({ notebookId: nb, sectionId: sec.id });
        toast(`Moved to ${notebooks.find((n) => n.id === nb)?.name ?? 'notebook'}`);
        close();
      }}>
        <h3>Move “{page?.title || 'Untitled'}”</h3>
        <label className="field">Notebook
          <select className="input" value={nb} onChange={(e) => setNb(e.target.value)}>
            {notebooks.map((n) => (
              <option key={n.id} value={n.id}>{groupName(n.group_id) ? `${groupName(n.group_id)} › ${n.name}` : n.name}</option>
            ))}
          </select>
        </label>
        <p className="muted small">Subpages move with it.</p>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={close}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!nb || nb === current}>Move</button>
        </div>
      </form>
    </Modal>
  );
}
