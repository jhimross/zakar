// Formatting toolbar for the note editor (in addition to the "/" menu and keyboard shortcuts).
import type { Editor } from '@tiptap/core';
import { Icon } from './Icon';
import { useMenu } from './Overlays';
import { ask, askImage } from '../store';
import { insertTable } from './Tables';

const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

function blockLabel(e: Editor) {
  if (e.isActive('heading', { level: 1 })) return 'Heading 1';
  if (e.isActive('heading', { level: 2 })) return 'Heading 2';
  if (e.isActive('heading', { level: 3 })) return 'Heading 3';
  if (e.isActive('codeBlock')) return 'Code';
  return 'Text';
}

export function Toolbar({ editor }: { editor: Editor | null }) {
  const [menu, openMenu] = useMenu();
  if (!editor) return null;
  const chain = () => editor.chain().focus();

  const Btn = ({ icon, label, active, onClick, disabled }: { icon: string; label: string; active?: boolean; onClick: () => void; disabled?: boolean }) => (
    <button type="button" className={`tb-btn ${active ? 'on' : ''}`} title={label} aria-label={label} aria-pressed={active}
      disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      <Icon name={icon} size={16} />
    </button>
  );

  const setLink = async () => {
    const prev = (editor.getAttributes('link').href as string | undefined) ?? '';
    const { from, to } = editor.state.selection;
    const url = await ask(prev ? 'Edit link' : 'Add link', prev || 'https://', prev ? 'Save' : 'Add');
    if (url === null) return;
    const href = url.trim();
    if (!href || href === 'https://') { chain().extendMarkRange('link').unsetLink().run(); return; }
    const full = /^(https?:|mailto:|tel:)/i.test(href) ? href : `https://${href}`;
    if (from === to && !editor.isActive('link')) {
      chain().insertContent({ type: 'text', text: full, marks: [{ type: 'link', attrs: { href: full } }] }).run();
    } else {
      chain().setTextSelection({ from, to }).extendMarkRange('link').setLink({ href: full }).run();
    }
  };

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <button type="button" className="tb-style" onMouseDown={(e) => e.preventDefault()} onClick={(e) => openMenu(e, [
        { label: 'Text', icon: 'text', onClick: () => chain().setParagraph().run() },
        { label: 'Heading 1', icon: 'h1', onClick: () => chain().setHeading({ level: 1 }).run() },
        { label: 'Heading 2', icon: 'h2', onClick: () => chain().setHeading({ level: 2 }).run() },
        { label: 'Heading 3', icon: 'h3', onClick: () => chain().setHeading({ level: 3 }).run() },
      ])}>
        {blockLabel(editor)}<Icon name="chevron" size={12} />
      </button>
      <span className="tb-sep" />
      <Btn icon="bold" label={`Bold (${mod}B)`} active={editor.isActive('bold')} onClick={() => chain().toggleBold().run()} />
      <Btn icon="italic" label={`Italic (${mod}I)`} active={editor.isActive('italic')} onClick={() => chain().toggleItalic().run()} />
      <Btn icon="strike" label="Strikethrough" active={editor.isActive('strike')} onClick={() => chain().toggleStrike().run()} />
      <Btn icon="code" label="Inline code" active={editor.isActive('code')} onClick={() => chain().toggleCode().run()} />
      <Btn icon="link" label="Link" active={editor.isActive('link')} onClick={() => void setLink()} />
      <span className="tb-sep" />
      <Btn icon="list" label="Bullet list" active={editor.isActive('bulletList')} onClick={() => chain().toggleBulletList().run()} />
      <Btn icon="olist" label="Numbered list" active={editor.isActive('orderedList')} onClick={() => chain().toggleOrderedList().run()} />
      <Btn icon="todo" label="Checklist" active={editor.isActive('taskList')} onClick={() => chain().toggleTaskList().run()} />
      <span className="tb-sep" />
      <Btn icon="quote" label="Quote" active={editor.isActive('blockquote')} onClick={() => chain().toggleBlockquote().run()} />
      <Btn icon="codeblock" label="Code block" active={editor.isActive('codeBlock')} onClick={() => chain().toggleCodeBlock().run()} />
      <Btn icon="divider" label="Divider" onClick={() => chain().setHorizontalRule().run()} />
      <Btn icon="image" label="Image from a link" active={editor.isActive('image')} onClick={() => void askImage().then((v) => { if (v) chain().setImage(v).run(); })} />
      <Btn icon="table" label="Table" active={editor.isActive('table')} disabled={editor.isActive('table')} onClick={() => insertTable(editor)} />
      <span className="tb-grow" />
      <Btn icon="undo" label={`Undo (${mod}Z)`} disabled={!editor.can().undo()} onClick={() => chain().undo().run()} />
      <Btn icon="redo" label={`Redo (${mod}⇧Z)`} disabled={!editor.can().redo()} onClick={() => chain().redo().run()} />
      {menu}
    </div>
  );
}
