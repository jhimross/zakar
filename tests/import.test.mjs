import assert from 'node:assert/strict';
import { parseNote, parseFrontMatter, toMarkdownFile, inlineTags } from './.build/import/parse.js';
import { buildPlan } from './.build/import/plan.js';

// Front matter variants
let fm = parseFrontMatter('---\ntitle: "Hello: world"\ntags: [a, "b c"]\ndate: 2024-05-01\n---\nBody');
assert.equal(fm.data.title, 'Hello: world'); assert.deepEqual(fm.data.tags, ['a', 'b c']); assert.equal(fm.body, 'Body');
fm = parseFrontMatter('---\ntags:\n  - work\n  - "#ideas"\naliases:\n---\ntext');
assert.deepEqual(fm.data.tags, ['work', '#ideas']); assert.equal(fm.data.aliases, '');
console.log('✓ front matter');

let n = parseNote('---\ntags: work, ideas\ncreated: 2024-01-02T03:04:05Z\n---\n# Big Title\n\nSome #inline text with `#notatag` and #1 issue.\n- [ ] task\n', 'folder/file-name.md', 1710000000000);
assert.equal(n.title, 'Big Title');
assert.ok(!n.body.includes('# Big Title'));
assert.deepEqual(n.tags, ['work', 'ideas', 'inline']);
assert.equal(n.created, Date.parse('2024-01-02T03:04:05Z'));
assert.equal(n.updated, 1710000000000);
n = parseNote('No heading here\n![x](img/a.png)', 'Meeting notes.md');
assert.equal(n.title, 'Meeting notes'); assert.equal(n.warnings.length, 1);
assert.deepEqual(inlineTags('see https://a.com/#frag and (#ok) ## Heading'), ['ok']);
console.log('✓ note parsing');

// Round trip
const out = toMarkdownFile({ title: 'Q: plans', content: 'Hello\n', tags: ['a', 'b'], created_at: 0, updated_at: 1000 });
const back = parseNote(out, 'x.md');
assert.equal(back.title, 'Q: plans'); assert.deepEqual(back.tags, ['a', 'b']); assert.equal(back.body, 'Hello\n');
console.log('✓ export/import round trip');

// Folder mapping
const files = [
  { path: 'Vault/LevelUp/Interviews/A. Reyes.md', text: 'a' },
  { path: 'Vault/LevelUp/Interviews/Meeting.md', text: 'parent' },
  { path: 'Vault/LevelUp/Interviews/Meeting/Notes 1.md', text: 'child' },
  { path: 'Vault/LevelUp/Interviews/Meeting/Notes 1/Deep.md', text: 'grandchild' },
  { path: 'Vault/LevelUp/Interviews/2024/Old.md', text: 'flattened' },
  { path: 'Vault/LevelUp/Overview.md', text: 'nb root' },
  { path: 'Vault/Root note.md', text: 'loose' },
  { path: 'Vault/.obsidian/workspace.md', text: 'hidden' },
  { path: 'Vault/LevelUp/Interviews/photo.png', text: '' },
];
const existing = [{ id: 'nb1', name: 'levelup', sections: [{ id: 's1', name: 'Interviews', titles: new Set(['a. reyes']) }] }];
const plan = buildPlan(files, existing, { stripRoot: true, looseNotebook: 'Imported' });
const lv = plan.notebooks.find((x) => x.name === 'levelup');
assert.equal(lv.existingId, 'nb1');
const iv = lv.sections.find((s) => s.name === 'Interviews');
assert.equal(iv.existingId, 's1');
const meeting = iv.pages.find((p) => p.title === 'Meeting');
assert.equal(meeting.children[0].title, 'Notes 1');
assert.equal(meeting.children[0].children[0].title, 'Deep');
assert.ok(lv.sections.find((s) => s.name === 'Interviews / 2024').pages[0].title === 'Old');
assert.ok(lv.sections.find((s) => s.name === 'General').pages[0].title === 'Overview');
assert.ok(plan.notebooks.find((x) => x.name === 'Imported').sections[0].pages[0].title === 'Root note');
assert.equal(plan.pageCount, 7); assert.equal(plan.duplicateCount, 1); assert.deepEqual(plan.skipped, ['Vault/LevelUp/Interviews/photo.png']);
console.log('✓ folder → notebook/section/page mapping, subpages, duplicates');

const flat = buildPlan([{ path: 'a.md', text: '# A' }, { path: 'b.md', text: 'b' }], [], { stripRoot: true, looseNotebook: 'Inbox' });
assert.equal(flat.notebooks[0].name, 'Inbox'); assert.equal(flat.notebooks[0].sections[0].pages.length, 2);
console.log('✓ loose files go to chosen notebook');
console.log('\nAll import tests passed');
