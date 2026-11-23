// "/" command menu for the editor, built on @tiptap/suggestion.
import { Extension, type Editor, type Range } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { create } from 'zustand';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

interface Cmd { title: string; icon: string; hint?: string; keywords?: string; run: (e: Editor, r: Range) => void }

export const COMMANDS: Cmd[] = [
  { title: 'Text', icon: 'text', keywords: 'paragraph', run: (e, r) => e.chain().focus().deleteRange(r).setParagraph().run() },
  { title: 'Heading 1', icon: 'h1', hint: '#', keywords: 'title h1', run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 1 }).run() },
  { title: 'Heading 2', icon: 'h2', hint: '##', keywords: 'subtitle h2', run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 2 }).run() },
  { title: 'Heading 3', icon: 'h3', hint: '###', keywords: 'h3', run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 3 }).run() },
  { title: 'To-do list', icon: 'todo', hint: '[ ]', keywords: 'task checkbox check', run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run() },
  { title: 'Bullet list', icon: 'list', hint: '-', keywords: 'unordered ul', run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
  { title: 'Numbered list', icon: 'olist', hint: '1.', keywords: 'ordered ol', run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },
  { title: 'Quote', icon: 'quote', hint: '>', keywords: 'blockquote', run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run() },
  { title: 'Code block', icon: 'code', hint: '```', keywords: 'pre', run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run() },
  { title: 'Divider', icon: 'divider', hint: '---', keywords: 'hr rule line', run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run() },
];

interface SlashState {
  open: boolean;
  items: Cmd[];
  index: number;
  rect: DOMRect | null;
  pick: ((c: Cmd) => void) | null;
}

export const useSlash = create<SlashState>(() => ({ open: false, items: [], index: 0, rect: null, pick: null }));

function filter(query: string) {
  const q = query.toLowerCase();
  return COMMANDS.filter((c) => c.title.toLowerCase().includes(q) || c.keywords?.includes(q));
}

export const SlashCommand = Extension.create({
  name: 'slashCommand',
  addProseMirrorPlugins() {
    return [
      Suggestion<Cmd>({
        editor: this.editor,
        char: '/',
        allowSpaces: false,
        startOfLine: false,
        items: ({ query }) => filter(query),
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => ({
          onStart: (p) => useSlash.setState({ open: true, items: p.items, index: 0, rect: p.clientRect?.() ?? null, pick: (c) => p.command(c) }),
          onUpdate: (p) => useSlash.setState({ items: p.items, index: 0, rect: p.clientRect?.() ?? null, pick: (c) => p.command(c) }),
          onKeyDown: ({ event }) => {
            const s = useSlash.getState();
            if (!s.open) return false;
            if (event.key === 'Escape') { useSlash.setState({ open: false }); return true; }
            if (!s.items.length) return false;
            if (event.key === 'ArrowDown') { useSlash.setState({ index: (s.index + 1) % s.items.length }); return true; }
            if (event.key === 'ArrowUp') { useSlash.setState({ index: (s.index - 1 + s.items.length) % s.items.length }); return true; }
            if (event.key === 'Enter' || event.key === 'Tab') { s.pick?.(s.items[s.index]); return true; }
            return false;
          },
          onExit: () => useSlash.setState({ open: false, rect: null }),
        }),
      }),
    ];
  },
});

export function SlashMenu() {
  const { open, items, index, rect, pick } = useSlash();
  if (!open || !rect || !items.length) return null;
  const below = rect.bottom + 280 < window.innerHeight;
  const style = {
    left: Math.min(rect.left, window.innerWidth - 260),
    top: below ? rect.bottom + 6 : undefined,
    bottom: below ? undefined : window.innerHeight - rect.top + 6,
  };
  return createPortal(
    <div className="slash" style={style} role="listbox" onMouseDown={(e) => e.preventDefault()}>
      {items.map((c, i) => (
        <button key={c.title} role="option" aria-selected={i === index} className={i === index ? 'on' : ''}
          onMouseEnter={() => useSlash.setState({ index: i })} onClick={() => pick?.(c)}>
          <Icon name={c.icon} />{c.title}<span className="k">{c.hint}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
