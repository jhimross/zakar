// Sidebar list of notebook groups and notebooks, with drag and drop.
import { useState, type DragEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import {
  bySort, createGroup, createNotebook, deleteNotebook, listSections, moveSidebarItem, ungroup, updateGroup, updateNotebook,
} from '../data/actions';
import type { Notebook, NotebookGroup } from '../../shared/schema';
import { ask, confirmDialog, useUI } from '../store';
import { Icon } from './Icon';
import { useMenu, toast, type MenuItem } from './Overlays';

type Kind = 'group' | 'notebook';
type Drop = { id: string; pos: 'before' | 'after' | 'inside' } | { id: '__end__'; pos: 'end' };

export function NotebookTree() {
  const ui = useUI();
  const [menu, openMenu] = useMenu();
  const [drag, setDrag] = useState<{ kind: Kind; id: string } | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);

  const groups = useLiveQuery(async () => (await db.notebook_groups.toArray()).filter((g) => !g.deleted_at).sort(bySort), []) || [];
  const notebooks = useLiveQuery(async () => (await db.notebooks.toArray()).filter((n) => !n.deleted_at).sort(bySort), []) || [];

  const groupIds = new Set(groups.map((g) => g.id));
  const groupOf = (n: Notebook) => (n.group_id && groupIds.has(n.group_id) ? n.group_id : null);
  const top = [
    ...groups.map((g) => ({ kind: 'group' as const, id: g.id, sort_key: g.sort_key, g })),
    ...notebooks.filter((n) => !groupOf(n)).map((n) => ({ kind: 'notebook' as const, id: n.id, sort_key: n.sort_key, n })),
  ].sort(bySort);
  const inGroup = (gid: string) => notebooks.filter((n) => groupOf(n) === gid);
  const isCollapsed = (gid: string) => !!ui.collapsed[`g:${gid}`];

  // ---------- actions ----------
  const newNotebook = async (groupId: string | null = null) => {
    const name = await ask('New notebook', '', 'Create');
    if (name === null) return;
    const { notebook, section } = await createNotebook(name, undefined, groupId);
    if (groupId && isCollapsed(groupId)) ui.toggleCollapsed(`g:${groupId}`);
    ui.openNotebook(notebook.id, section.id);
  };
  const newGroup = async () => {
    const name = await ask('New group', '', 'Create');
    if (name !== null) await createGroup(name);
  };
  const openNb = async (id: string) => {
    const secs = await listSections(id);
    const keep = secs.find((s) => s.id === ui.sectionId);
    ui.openNotebook(id, keep?.id ?? secs[0]?.id ?? null);
  };

  const groupMenu = (g: NotebookGroup): MenuItem[] => [
    { label: 'New notebook in group', icon: 'plus', onClick: () => newNotebook(g.id) },
    { label: 'Rename group', icon: 'edit', onClick: async () => { const v = await ask('Rename group', g.name); if (v) await updateGroup(g.id, { name: v.trim() }); } },
    { colors: (c: string) => void updateGroup(g.id, { color: c }) },
    { divider: true },
    { label: 'Ungroup (keeps notebooks)', icon: 'x', onClick: async () => {
      if (await confirmDialog(`Remove group “${g.name}”?`, 'The notebooks inside stay, they just move out of the group.', 'Ungroup', false)) await ungroup(g.id);
    } },
  ];

  const nbMenu = (nb: Notebook): MenuItem[] => {
    const current = groupOf(nb);
    return [
      { label: 'Rename', icon: 'edit', onClick: async () => { const v = await ask('Rename notebook', nb.name); if (v) await updateNotebook(nb.id, { name: v.trim() }); } },
      { colors: (c: string) => void updateNotebook(nb.id, { color: c }) },
      ...(groups.length || current ? [{ divider: true } as MenuItem] : []),
      ...groups.filter((g) => g.id !== current).map((g) => ({
        label: `Move to “${g.name}”`, icon: 'folder', onClick: () => void moveSidebarItem('notebook', nb.id, g.id).then(() => toast(`Moved to ${g.name}`)),
      })),
      ...(current ? [{ label: 'Remove from group', icon: 'outdent', onClick: () => {
        const ref = top.find((t) => t.id === current);
        void moveSidebarItem('notebook', nb.id, null, ref ? { id: ref.id, pos: 'after' } : undefined);
      } }] : []),
      { divider: true },
      { label: 'Delete notebook', icon: 'trash', danger: true, onClick: async () => {
        if (await confirmDialog(`Delete “${nb.name}”?`, 'Its pages move to Trash, where you can restore them.')) {
          await deleteNotebook(nb.id);
          if (ui.notebookId === nb.id) ui.set({ notebookId: null, sectionId: null, pageId: null });
        }
      } },
    ];
  };

  // ---------- drag & drop ----------
  const start = (e: DragEvent, kind: Kind, id: string) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    setDrag({ kind, id });
  };
  const over = (e: DragEvent, target: { kind: Kind; id: string; nested: boolean }) => {
    if (!drag || drag.id === target.id) return;
    if (drag.kind === 'group' && target.nested) return; // groups only live at the top level
    e.preventDefault();
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    let pos: 'before' | 'after' | 'inside';
    if (target.kind === 'group' && drag.kind === 'notebook') pos = y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'inside';
    else pos = y < 0.5 ? 'before' : 'after';
    setDrop({ id: target.id, pos });
  };
  const dropOn = async (e: DragEvent, target: { kind: Kind; id: string; groupId: string | null }) => {
    e.preventDefault();
    e.stopPropagation();
    if (!drag || !drop || drop.pos === 'end') return finish();
    if (drop.pos === 'inside') {
      await moveSidebarItem('notebook', drag.id, target.id);
      if (isCollapsed(target.id)) ui.toggleCollapsed(`g:${target.id}`);
    } else {
      await moveSidebarItem(drag.kind, drag.id, target.kind === 'notebook' ? target.groupId : null, { id: target.id, pos: drop.pos });
    }
    finish();
  };
  const dropEnd = async (e: DragEvent) => {
    e.preventDefault();
    if (drag) await moveSidebarItem(drag.kind, drag.id, null);
    finish();
  };
  const finish = () => { setDrag(null); setDrop(null); };
  const dropCls = (id: string) => (drop && drop.id === id ? `drop-${drop.pos}` : '');

  const notebookRow = (nb: Notebook, nested: boolean) => (
    <div key={nb.id}
      className={`nb ${nested ? 'nested' : ''} ${ui.view === 'section' && ui.notebookId === nb.id ? 'on' : ''} ${dropCls(nb.id)} ${drag?.id === nb.id ? 'dragging' : ''}`}
      draggable
      onDragStart={(e) => start(e, 'notebook', nb.id)}
      onDragOver={(e) => over(e, { kind: 'notebook', id: nb.id, nested })}
      onDrop={(e) => dropOn(e, { kind: 'notebook', id: nb.id, groupId: groupOf(nb) })}
      onClick={() => openNb(nb.id)}
      onContextMenu={(e) => openMenu(e, nbMenu(nb))}
      role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') openNb(nb.id); }}>
      <span className="dot" style={{ background: nb.color || '#999' }} />
      <span className="truncate">{nb.name}</span>
      <button className="icon-btn tiny hover-only ml-auto" aria-label="Notebook options" onClick={(e) => openMenu(e, nbMenu(nb))}><Icon name="more" size={13} /></button>
    </div>
  );

  return (
    <>
      <div className="label">
        <span>Notebooks</span>
        <button className="icon-btn tiny" title="New notebook or group" onClick={(e) => openMenu(e, [
          { label: 'New notebook', icon: 'book', onClick: () => newNotebook() },
          { label: 'New group', icon: 'folder', onClick: newGroup },
        ])}><Icon name="plus" size={13} /></button>
      </div>
      <div className="notebooks" onDragEnd={finish}>
        {top.map((item) => {
          if (item.kind === 'notebook') return notebookRow(item.n, false);
          const g = item.g;
          const kids = inGroup(g.id);
          const collapsed = isCollapsed(g.id);
          return (
            <div key={g.id} className={`group ${drag?.id === g.id ? 'dragging' : ''}`}>
              <div className={`group-row ${dropCls(g.id)}`}
                draggable
                onDragStart={(e) => start(e, 'group', g.id)}
                onDragOver={(e) => over(e, { kind: 'group', id: g.id, nested: false })}
                onDrop={(e) => dropOn(e, { kind: 'group', id: g.id, groupId: null })}
                onClick={() => ui.toggleCollapsed(`g:${g.id}`)}
                onContextMenu={(e) => openMenu(e, groupMenu(g))}
                role="button" tabIndex={0} aria-expanded={!collapsed}
                onKeyDown={(e) => { if (e.key === 'Enter') ui.toggleCollapsed(`g:${g.id}`); }}>
                <span className={`caret ${collapsed ? 'closed' : ''}`}><Icon name="chevron" size={12} /></span>
                <Icon name="folder" size={14} className="folder-icon" />
                <span className="truncate">{g.name}</span>
                <span className="count">{kids.length}</span>
                <button className="icon-btn tiny hover-only" aria-label="Group options" onClick={(e) => { e.stopPropagation(); openMenu(e, groupMenu(g)); }}><Icon name="more" size={13} /></button>
              </div>
              {!collapsed && (
                <div className="group-children" style={g.color ? { borderColor: g.color } : undefined}>
                  {kids.map((nb) => notebookRow(nb, true))}
                  {!kids.length && <div className="group-empty">Drag notebooks here</div>}
                </div>
              )}
            </div>
          );
        })}
        {drag && (
          <div className={`drop-end ${drop?.pos === 'end' ? 'on' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDrop({ id: '__end__', pos: 'end' }); }}
            onDrop={dropEnd}>
            {drag.kind === 'notebook' ? 'Drop here to move out of groups' : 'Drop here to move to the end'}
          </div>
        )}
        {!notebooks.length && !groups.length && <button className="nb muted" onClick={() => newNotebook()}><Icon name="plus" />Create a notebook</button>}
      </div>
      {menu}
    </>
  );
}
