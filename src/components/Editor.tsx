import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import { looksLikeImageUrl } from './ImageDialog';
import { Markdown } from 'tiptap-markdown';
import { db } from '../data/db';
import { deletePage, normalizeTag, restorePage, updatePage } from '../data/actions';
import type { Page } from '../../shared/schema';
import { askImage, useUI } from '../store';
import { Icon } from './Icon';
import { useMenu, toast } from './Overlays';
import { SlashCommand, SlashMenu } from './SlashMenu';
import { OfflineBanner, SyncBadge } from './SyncBadge';
import { formatDate, relTime, wordCount } from '../lib/text';
import { exportPage, exportPagePdf, exportPageText } from '../import/exporter';
import { BrandMark } from './Brand';
import { Toolbar } from './Toolbar';
import { modKey } from '../lib/platform';
import { TableBar, inTableCell, tableExtensions } from './Tables';

export function EditorPane() {
  const pageId = useUI((s) => s.pageId);
  const set = useUI((s) => s.set);
  const page = useLiveQuery(() => (pageId ? db.pages.get(pageId) : undefined), [pageId]);

  if (!pageId || !page || page.purged) {
    return (
      <main className="ed">
        <OfflineBanner />
        <div className="empty">
          <BrandMark size={44} className="empty-brand" />
          <p>Select a page<span className="kbd-hint">, or press <kbd>{modKey}K</kbd> to search</span>.</p>
          <button className="mobile-only btn" onClick={() => set({ pane: 'list' })}>Back to pages</button>
        </div>
      </main>
    );
  }
  return <PageEditor key={page.id} page={page} />;
}

function useDebounced<T extends unknown[]>(fn: (...a: T) => void, ms: number) {
  const t = useRef<ReturnType<typeof setTimeout>>();
  const last = useRef<T | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const flush = () => { clearTimeout(t.current); if (last.current) { fnRef.current(...last.current); last.current = null; } };
  const call = (...a: T) => { last.current = a; clearTimeout(t.current); t.current = setTimeout(flush, ms); };
  useEffect(() => flush, []); // flush pending save on unmount
  return { call, flush };
}

function PageEditor({ page }: { page: Page }) {
  const ui = useUI();
  const section = useLiveQuery(() => db.sections.get(page.section_id), [page.section_id]);
  const notebook = useLiveQuery(() => (section ? db.notebooks.get(section.notebook_id) : undefined), [section?.notebook_id]);
  const group = useLiveQuery(() => (notebook?.group_id ? db.notebook_groups.get(notebook.group_id) : undefined), [notebook?.group_id]);
  const parent = useLiveQuery(() => (page.parent_id ? db.pages.get(page.parent_id) : undefined), [page.parent_id]);
  const [title, setTitle] = useState(page.title);
  const [words, setWords] = useState(() => wordCount(page.content));
  const [addingTag, setAddingTag] = useState(false);
  const lastSaved = useRef(page.content);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const [menu, openMenu] = useMenu();
  const readOnly = !!page.deleted_at;

  const saveContent = useDebounced((md: string) => {
    lastSaved.current = md;
    void updatePage(page.id, { content: md });
  }, 400);
  const saveTitle = useDebounced((t: string) => void updatePage(page.id, { title: t }), 400);

  const editor = useEditor({
    editable: !readOnly,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, text: false }),
      ...tableExtensions,
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false, autolink: true }),
      Image.configure({ inline: false, allowBase64: false, HTMLAttributes: { referrerpolicy: 'no-referrer', loading: 'lazy' } }),
      Placeholder.configure({ placeholder: "Type '/' for commands…" }),
      Markdown.configure({ html: false, tightLists: true, linkify: true, transformPastedText: true, breaks: false }),
      SlashCommand,
    ],
    content: page.content,
    editorProps: {
      // Pasting a direct image link embeds the image.
      handlePaste: (view, event) => {
        const data = event.clipboardData;
        const text = data?.getData('text/plain')?.trim() ?? '';
        if (!text || data?.getData('text/html') || !looksLikeImageUrl(text) || inTableCell(view.state)) return false;
        const image = view.state.schema.nodes.image;
        if (!image) return false;
        view.dispatch(view.state.tr.replaceSelectionWith(image.create({ src: text })).scrollIntoView());
        return true;
      },
      // Double-click an image to change its link or description.
      handleDoubleClickOn: (view, pos, node) => {
        if (node.type.name !== 'image' || !view.editable) return false;
        void askImage({ src: node.attrs.src, alt: node.attrs.alt ?? '' }).then((v) => {
          if (v) view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: v.src, alt: v.alt || null }));
        });
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      const md = (editor.storage as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown();
      setWords(wordCount(md));
      saveContent.call(md);
    },
  });

  // Save immediately when the app is about to update or close.
  useEffect(() => {
    const flush = () => { saveContent.flush(); saveTitle.flush(); };
    window.addEventListener('zakar:flush', flush);
    return () => window.removeEventListener('zakar:flush', flush);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply changes that arrive from sync (another device) when we're not typing.
  useEffect(() => {
    if (!editor || page.content === lastSaved.current) return;
    if (editor.isFocused) return;
    lastSaved.current = page.content;
    editor.commands.setContent(page.content, false);
    setWords(wordCount(page.content));
  }, [page.content, editor]);

  useEffect(() => { if (document.activeElement !== titleRef.current) setTitle(page.title); }, [page.title]);
  useEffect(() => { editor?.setEditable(!readOnly); }, [readOnly, editor]);

  // Focus the title for brand-new pages.
  useEffect(() => {
    if (ui.focusTitle === page.id) { titleRef.current?.focus(); ui.set({ focusTitle: null }); }
  }, [ui.focusTitle, page.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-size title textarea.
  useEffect(() => {
    const el = titleRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
  }, [title]);

  const addTag = (raw: string) => {
    const tags = raw.split(/[,\s]+/).map(normalizeTag).filter(Boolean);
    const merged = [...page.tags];
    for (const t of tags) if (!merged.some((m) => m.toLowerCase() === t.toLowerCase())) merged.push(t);
    void updatePage(page.id, { tags: merged });
  };

  const moreMenu = [
    { label: page.favorite ? 'Remove from favorites' : 'Add to favorites', icon: 'star', onClick: () => updatePage(page.id, { favorite: page.favorite ? 0 : 1 }) },
    { label: 'Move to…', icon: 'move', onClick: () => ui.set({ moveOpen: page.id }) },
    { label: ui.toolbar ? 'Hide formatting toolbar' : 'Show formatting toolbar', icon: 'bold', onClick: () => ui.set({ toolbar: !ui.toolbar }) },
    { divider: true },
    { label: 'Export as PDF', icon: 'pdf', onClick: () => {
      saveContent.flush();
      const win = window.open('', '_blank'); // open now, while the click still counts as a user action
      void exportPagePdf(page.id, editor?.getHTML() ?? '', win);
    } },
    { label: 'Export as .txt', icon: 'txt', onClick: () => { saveContent.flush(); setTimeout(() => void exportPageText(page.id), 50); } },
    { label: 'Export as Markdown (.md)', icon: 'upload', onClick: () => { saveContent.flush(); setTimeout(() => void exportPage(page.id), 50); } },
    { divider: true },
    { label: 'Delete page', icon: 'trash', danger: true, onClick: async () => {
      const id = page.id;
      await deletePage(id); ui.set({ pageId: null, pane: 'list' });
      toast('Moved to Trash', { label: 'Undo', run: () => void restorePage(id).then(() => useUI.getState().openPage(id)) });
    } },
  ];

  return (
    <main className="ed">
      <OfflineBanner />
      <div className="bar">
        <button className="mobile-back inline" onClick={() => { saveContent.flush(); ui.set({ pane: 'list' }); }}>
          <Icon name="back" />{notebook?.name || 'Back'}
        </button>
        <button className={`icon-btn focus-btn desktop-only ${ui.focus ? 'on' : ''}`}
          title={ui.focus ? `Show sidebar (${modKey}\\)` : `Focus mode: hide sidebar (${modKey}\\)`}
          aria-pressed={ui.focus} onClick={() => ui.set({ focus: !ui.focus })}><Icon name="sidebar" /></button>
        <span className="crumb desktop-only">
          {group && !group.deleted_at && <>{group.name} <span className="sep">›</span> </>}{notebook?.name}
          {parent && <> <span className="sep">›</span> {parent.title || 'Untitled'}</>}
          <span className="sep">›</span> <b>{page.title || 'Untitled'}</b>
        </span>
        <div className="r">
          <span className="mobile-only"><SyncBadge compact /></span>
          {!readOnly && (
            <button className={`icon-btn ${page.favorite ? 'fav-on' : ''}`} title="Favorite"
              onClick={() => updatePage(page.id, { favorite: page.favorite ? 0 : 1 })}><Icon name="star" /></button>
          )}
          {!readOnly && <button className="icon-btn" title="More" onClick={(e) => openMenu(e, moreMenu)}><Icon name="more" /></button>}
        </div>
      </div>

      {!readOnly && ui.toolbar && <Toolbar editor={editor} />}
      {!readOnly && <TableBar editor={editor} />}

      {readOnly && (
        <div className="trash-banner">
          This page is in Trash.
          <button className="btn small" onClick={() => void restorePage(page.id).then(() => toast('Restored'))}><Icon name="restore" />Restore</button>
        </div>
      )}

      <div className="scroll">
        <article className="doc">
          <div className="meta">
            {page.tags.map((t) => (
              <span key={t} className="tag">#{t}
                {!readOnly && <button aria-label={`Remove tag ${t}`} onClick={() => updatePage(page.id, { tags: page.tags.filter((x) => x !== t) })}><Icon name="x" size={10} /></button>}
              </span>
            ))}
            {!readOnly && (addingTag ? (
              <input className="tag-input" autoFocus placeholder="tag"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { addTag(e.currentTarget.value); e.currentTarget.value = ''; }
                  if (e.key === 'Escape') setAddingTag(false);
                }}
                onBlur={(e) => { if (e.currentTarget.value) addTag(e.currentTarget.value); setAddingTag(false); }} />
            ) : (
              <button className="tag add" onClick={() => setAddingTag(true)}><Icon name="tag" size={11} />Add tag</button>
            ))}
          </div>
          <textarea ref={titleRef} className="title" rows={1} placeholder="Untitled" value={title} readOnly={readOnly}
            onChange={(e) => { const v = e.target.value.replace(/\n/g, ''); setTitle(v); saveTitle.call(v); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || (e.key === 'ArrowDown' && !e.shiftKey)) { e.preventDefault(); editor?.commands.focus('start'); } }} />
          <div className="date">{formatDate(page.created_at)} · Edited {relTime(page.updated_at)}</div>
          <EditorContent editor={editor} className="prose" />
        </article>
      </div>
      <div className="wc">{words} words</div>
      <SlashMenu />
      {menu}
    </main>
  );
}
