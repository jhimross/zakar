import assert from 'node:assert/strict';
import { createD1 } from './d1-shim.mjs';
import { handleSync as hs } from './.build/sync-server.js';
import { ensureSchema } from './.build/auth-server.js';
const U = 'user-a';
const handleSync = (db, body, user = U) => hs(db, body, user);

const db = createD1(null);
await ensureSchema(db);
const now = Date.now();
const nb = { id: 'nb1', name: 'Work', color: '#2F6FEB', icon: null, sort_key: 'a0', created_at: now, updated_at: now, deleted_at: null };
const sec = { id: 's1', notebook_id: 'nb1', parent_id: null, name: 'General', color: null, sort_key: 'a0', created_at: now, updated_at: now, deleted_at: null };
const pg = { id: 'p1', section_id: 's1', parent_id: null, title: 'Kickoff', content: 'hello', tags: ['meeting'], favorite: 0, purged: 0, sort_key: 'a0', created_at: now, updated_at: now, deleted_at: null };

// Device A pushes three new rows.
let r = await handleSync(db, { since: 0, changes: [
  { table: 'notebooks', id: 'nb1', baseSeq: 0, row: nb },
  { table: 'sections', id: 's1', baseSeq: 0, row: sec },
  { table: 'pages', id: 'p1', baseSeq: 0, row: pg },
] });
assert.equal(r.accepted.length, 3);
assert.equal(r.conflicts.length, 0);
assert.deepEqual(r.changes.pages[0].tags, ['meeting']);
const seqP1 = r.accepted.find((a) => a.id === 'p1').seq;
console.log('✓ push new rows, cursor', r.cursor);

// Device B pulls from scratch.
const b = await handleSync(db, { since: 0, changes: [] });
assert.equal(b.changes.notebooks.length, 1);
assert.equal(b.changes.pages[0].content, 'hello');
console.log('✓ second device pulls everything');

// A edits (fast-forward).
r = await handleSync(db, { since: r.cursor, changes: [{ table: 'pages', id: 'p1', baseSeq: seqP1, row: { ...pg, content: 'hello from A', updated_at: now + 10 } }] });
assert.equal(r.accepted.length, 1);
const seqA = r.accepted[0].seq;
console.log('✓ fast-forward edit');

// B edits the same page offline from the old version -> conflict copy.
r = await handleSync(db, { since: b.cursor, changes: [{ table: 'pages', id: 'p1', baseSeq: seqP1, row: { ...pg, content: 'hello from B', updated_at: now + 20 } }] });
assert.equal(r.accepted.length, 0);
assert.equal(r.conflicts.length, 1);
assert.equal(r.conflicts[0].row.content, 'hello from A');
const copy = r.changes.pages.find((p) => p.title.includes('conflict copy'));
assert.ok(copy, 'conflict copy created');
assert.equal(copy.content, 'hello from B');
console.log('✓ content conflict keeps both versions');

// Metadata-only conflict -> last write wins.
r = await handleSync(db, { since: 0, changes: [{ table: 'notebooks', id: 'nb1', baseSeq: 0, row: { ...nb, name: 'Work (renamed)', updated_at: now + 99 } }] });
assert.equal(r.accepted.length, 1);
r = await handleSync(db, { since: 0, changes: [{ table: 'notebooks', id: 'nb1', baseSeq: 0, row: { ...nb, name: 'Old name', updated_at: now - 99 } }] });
assert.equal(r.accepted.length, 0);
assert.equal(r.conflicts[0].row.name, 'Work (renamed)');
console.log('✓ last-write-wins for metadata');

// Deletes travel as tombstones.
r = await handleSync(db, { since: 0, changes: [{ table: 'pages', id: 'p1', baseSeq: seqA, row: { ...pg, content: 'hello from A', deleted_at: now + 50, updated_at: now + 50 } }] });
assert.equal(r.accepted.length, 1);
const pulled = await handleSync(db, { since: seqA, changes: [] });
assert.ok(pulled.changes.pages.find((p) => p.id === 'p1').deleted_at);
console.log('✓ delete tombstone syncs');

// Unknown tables/columns are ignored.
r = await handleSync(db, { since: 0, changes: [{ table: 'users', id: 'x', baseSeq: 0, row: {} }, { table: 'pages', id: 'p9', baseSeq: 0, row: { ...pg, id: 'p9', evil: 'DROP TABLE' } }] });
assert.equal(r.accepted.length, 1);
console.log('✓ input is sanitised');

// Pagination.
const many = Array.from({ length: 450 }, (_, i) => ({ table: 'pages', id: 'm' + i, baseSeq: 0, row: { ...pg, id: 'm' + i } }));
for (let i = 0; i < many.length; i += 20) await handleSync(db, { since: 0, changes: many.slice(i, i + 20) });
let since = 0, seen = new Set(), rounds = 0, more = true;
while (more) { const p = await handleSync(db, { since, changes: [] }); p.changes.pages.forEach((x) => seen.add(x.id)); since = p.cursor; more = p.more; rounds++; }
assert.ok(seen.size >= 452 && rounds >= 3, `seen ${seen.size} in ${rounds} rounds`);
console.log(`✓ paginated pull (${seen.size} pages in ${rounds} rounds)`);
// Users can't see or overwrite each other's notes.
const other = await handleSync(db, { since: 0, changes: [] }, 'user-b');
assert.equal(other.changes.pages.length + other.changes.notebooks.length, 0);
const hijack = await handleSync(db, { since: 0, changes: [{ table: 'notebooks', id: 'nb1', baseSeq: 999999, row: { ...nb, name: 'HACKED', updated_at: now + 1e6 } }] }, 'user-b');
assert.equal(hijack.accepted.length, 0);
const mine = await handleSync(db, { since: 0, changes: [] });
assert.equal(mine.changes.notebooks.find((n) => n.id === 'nb1').name, 'Work (renamed)');
assert.ok(!('user_id' in mine.changes.notebooks[0]), 'owner column not leaked');
console.log('✓ users are isolated from each other');

// Notebook groups sync like everything else, and notebooks remember their group.
const grp = { id: 'g1', name: 'Work', color: null, sort_key: 'Zz', created_at: now, updated_at: now, deleted_at: null };
const gr = await handleSync(db, { since: 0, changes: [
  { table: 'notebook_groups', id: 'g1', baseSeq: 0, row: grp },
  { table: 'notebooks', id: 'nb2', baseSeq: 0, row: { ...nb, id: 'nb2', group_id: 'g1' } },
] });
assert.equal(gr.accepted.length, 2);
assert.equal(gr.changes.notebook_groups[0].name, 'Work');
assert.equal(gr.changes.notebooks.find((n) => n.id === 'nb2').group_id, 'g1');
const bview = await handleSync(db, { since: 0, changes: [] }, 'user-b');
assert.equal(bview.changes.notebook_groups.length, 0);
console.log('✓ notebook groups sync and stay private');
console.log('\nAll server sync tests passed');
