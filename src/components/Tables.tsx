// Tables in notes: the editor extensions and the small bar shown while editing a table.
//
// Notes are stored as Markdown, so tables are kept to what Markdown tables can hold:
// one header row, no merged cells, and one line of formatted text per cell.
// A normalizer fixes anything else (e.g. a table pasted from a web page) as soon as it
// appears, so a table is never lost when the note is saved.
import { Extension, type Editor } from '@tiptap/core';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import Text from '@tiptap/extension-text';
import { Fragment, Slice, type Node as PMNode, type Schema } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Icon } from './Icon';
import { useSlash } from './SlashMenu';

// ---------- Making every table safe to save as Markdown ----------

function cellIsSimple(cell: PMNode) {
  if (cell.attrs.colspan > 1 || cell.attrs.rowspan > 1) return false;
  if (cell.childCount !== 1 || cell.firstChild!.type.name !== 'paragraph') return false;
  let ok = true;
  cell.firstChild!.forEach((n) => { if (n.type.name === 'hardBreak' || !n.isInline) ok = false; });
  return ok;
}

/** True when the table can be written as a Markdown table without losing anything. */
export function isMarkdownTable(table: PMNode) {
  let width = -1;
  let ok = true;
  table.forEach((row, _o, r) => {
    if (width === -1) width = row.childCount;
    if (row.childCount !== width) ok = false;
    row.forEach((cell) => {
      const wantHeader = r === 0;
      if ((cell.type.name === 'tableHeader') !== wantHeader || !cellIsSimple(cell)) ok = false;
    });
  });
  return ok && width > 0;
}

/** All the inline content of a cell as one line (line breaks and paragraphs become spaces). */
function cellInline(cell: PMNode, schema: Schema): PMNode[] {
  const out: PMNode[] = [];
  const space = () => { if (out.length) out.push(schema.text(' ')); };
  cell.descendants((n) => {
    if (n.isTextblock) {
      space();
      n.forEach((c) => {
        if (c.type.name === 'hardBreak') out.push(schema.text(' ', c.marks));
        else if (c.isInline) out.push(c);
      });
      return false;
    }
    return true;
  });
  return out;
}

/** Rebuild a table into the Markdown-friendly shape: header row, no merged cells, even rows. */
function rebuildTable(table: PMNode, schema: Schema): PMNode {
  const { tableHeader, tableCell, tableRow, paragraph } = schema.nodes;
  const rows: PMNode[][] = [];
  table.forEach((row, _o, r) => {
    const type = r === 0 ? tableHeader : tableCell;
    const cells: PMNode[] = [];
    row.forEach((cell) => {
      cells.push(type.create(null, paragraph.create(null, cellInline(cell, schema))));
      for (let i = 1; i < (cell.attrs.colspan || 1); i++) cells.push(type.create(null, paragraph.create()));
    });
    rows.push(cells);
  });
  const width = Math.max(1, ...rows.map((r) => r.length));
  return table.type.create(table.attrs, rows.map((cells, r) => {
    const type = r === 0 ? tableHeader : tableCell;
    while (cells.length < width) cells.push(type.create(null, paragraph.create()));
    return tableRow.create(null, Fragment.from(cells));
  }));
}

/** True when the cursor is inside a table cell. */
export function inTableCell(state: EditorState) {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const name = $from.node(d).type.name;
    if (name === 'tableCell' || name === 'tableHeader') return true;
  }
  return false;
}

/** Text pasted into a cell becomes one line, so it stays in that cell (tables paste normally). */
function flattenPasteIntoCell(slice: Slice, schema: Schema): Slice | null {
  let hasTable = false;
  let blocks = 0;
  slice.content.descendants((n) => {
    if (n.type.name === 'table') hasTable = true;
    if (n.isBlock) blocks++;
    return !hasTable;
  });
  if (hasTable || blocks <= 1) return null;
  const inline: PMNode[] = [];
  slice.content.descendants((n) => {
    if (n.isTextblock) {
      if (inline.length) inline.push(schema.text(' '));
      n.forEach((c) => {
        if (c.type.name === 'hardBreak') inline.push(schema.text(' '));
        else if (c.isInline) inline.push(c);
      });
      return false;
    }
    return true;
  });
  return inline.length ? new Slice(Fragment.from(inline), 0, 0) : null;
}

function normalizeTables(state: EditorState): Transaction | null {
  const fixes: { pos: number; node: PMNode }[] = [];
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'table') {
      if (!isMarkdownTable(node)) fixes.push({ pos, node });
      return false;
    }
    return true;
  });
  if (!fixes.length) return null;
  const tr = state.tr;
  const at = state.selection.from;
  for (const { pos, node } of fixes.reverse()) {
    tr.replaceWith(pos, pos + node.nodeSize, rebuildTable(node, state.schema));
  }
  // Keep the cursor where it was (the rebuilt table has the same shape in almost every case).
  try { tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(at, tr.doc.content.size)))); } catch { /* keep mapped selection */ }
  return tr;
}

const TableGuard = Extension.create({
  name: 'tableGuard',
  priority: 1000,
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey('tableGuard'),
      appendTransaction: (trs, _old, state) => (trs.some((t) => t.docChanged) ? normalizeTables(state) : null),
      props: {
        handlePaste: (view, _event, slice) => {
          if (!inTableCell(view.state)) return false;
          const flat = flattenPasteIntoCell(slice, view.state.schema);
          if (!flat) return false;
          view.dispatch(view.state.tr.replaceSelection(flat).scrollIntoView());
          return true;
        },
      },
    })];
  },
  addKeyboardShortcuts() {
    // (Leave keys alone while the "/" menu is open, so Enter still picks a command.)
    const inTable = () => this.editor.isActive('table') && !useSlash.getState().open;
    return {
      // A cell holds one line, so Enter moves on to the next cell (adding a row at the end).
      Enter: () => {
        if (!inTable()) return false;
        if (this.editor.commands.goToNextCell()) return true;
        return this.editor.chain().addRowAfter().goToNextCell().run();
      },
      'Shift-Enter': () => inTable(),
      'Mod-Enter': () => inTable(),
    };
  },
});

// Escape "|" inside table cells so it isn't read as a column divider.
const TableSafeText = Text.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: { inTable?: boolean; esc: (s: string) => string; text: (s: string, escape?: boolean) => void }, node: PMNode) {
          const html = (node.text ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          if (state.inTable) state.text(state.esc(html).replace(/\|/g, '\\|'), false);
          else state.text(html);
        },
      },
    };
  },
});

/** Extensions to add to the editor (StarterKit must be configured with `text: false`). */
export const tableExtensions = [
  TableSafeText,
  Table.configure({ resizable: false, HTMLAttributes: { class: 'note-table' } }),
  TableRow,
  TableHeader.extend({ content: 'paragraph' }),
  TableCell.extend({ content: 'paragraph' }),
  TableGuard,
];

export function insertTable(editor: Editor) {
  return editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
}

// ---------- The bar shown while the cursor is in a table ----------

export function TableBar({ editor }: { editor: Editor | null }) {
  if (!editor || !editor.isEditable || !editor.isActive('table')) return null;
  const chain = () => editor.chain().focus();
  const inHeader = editor.isActive('tableHeader');
  const Btn = ({ icon, label, onClick, disabled, danger }: { icon: string; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) => (
    <button type="button" className={`tb-btn ${danger ? 'danger' : ''}`} title={label} aria-label={label} disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      <Icon name={icon} size={16} />
    </button>
  );
  return (
    <div className="toolbar table-bar" role="toolbar" aria-label="Table">
      <span className="tb-label"><Icon name="table" size={14} />Table</span>
      <span className="tb-sep" />
      <Btn icon="rowAbove" label="Add row above" disabled={inHeader} onClick={() => chain().addRowBefore().run()} />
      <Btn icon="rowBelow" label="Add row below" onClick={() => chain().addRowAfter().run()} />
      <Btn icon="colLeft" label="Add column left" onClick={() => chain().addColumnBefore().run()} />
      <Btn icon="colRight" label="Add column right" onClick={() => chain().addColumnAfter().run()} />
      <span className="tb-sep" />
      <Btn icon="rowDel" label="Delete row" disabled={!editor.can().deleteRow()} onClick={() => chain().deleteRow().run()} />
      <Btn icon="colDel" label="Delete column" disabled={!editor.can().deleteColumn()} onClick={() => chain().deleteColumn().run()} />
      <Btn icon="trash" label="Delete table" danger onClick={() => chain().deleteTable().run()} />
      <span className="tb-grow" />
      <span className="tb-hint">Tab or Enter: next cell</span>
    </div>
  );
}
