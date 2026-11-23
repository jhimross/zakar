import assert from 'node:assert/strict';
import { createD1 } from './d1-shim.mjs';
import { ensureSchema, handleAuth, handleAdmin, authenticate, hashPassword, verifyPassword, resetSchemaCache } from './.build/auth-server.js';
import { handleSync } from './.build/sync-server.js';

// Make the shim's run() awaitable like D1's.
const db = createD1(null);
const origPrepare = db.prepare;
db.prepare = (sql) => wrap(origPrepare(sql));
function wrap(st) { return { ...st, sql: st.sql, params: st.params, bind: (...p) => wrap(st.bind(...p)), all: () => st.all(), first: () => st.first(), run: async () => st.run(), _raw: st }; }
const origBatch = db.batch;
db.batch = (stmts) => origBatch(stmts.map((s) => s._raw ?? s));

resetSchemaCache();
await ensureSchema(db);
resetSchemaCache();
await ensureSchema(db); // second run is a no-op
console.log('✓ schema created automatically (idempotent)');

assert.ok(await verifyPassword('secret123', await hashPassword('secret123')));
assert.ok(!(await verifyPassword('wrong', await hashPassword('secret123'))));
console.log('✓ password hashing');

const BASE = 'https://notes.example.com';
let cookie = '';
const req = (method, path, body, extra = {}) => new Request(BASE + path, {
  method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined,
});
const call = async (method, path, body, extra) => {
  const r = req(method, path, body, extra);
  const parts = path.split('/').filter(Boolean); // api, auth|admin, ...
  let res;
  if (parts[1] === 'auth') res = await handleAuth(r, db, parts[2]);
  else { const a = await authenticate(r, db); if (!a) return { status: 401, data: {} }; res = await handleAdmin(r, db, a.user, parts.slice(2)); }
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
  return { status: res.status, data: await res.json(), setCookie: set };
};

// A note synced before accounts existed gets claimed by the first admin.
await db.batch([origPrepare(`INSERT INTO notebooks (id, name, sort_key, seq) VALUES ('old', 'Old', 'a0', 1)`)]);

let r = await call('GET', '/api/auth/me');
assert.deepEqual(r.data, { needsSetup: true });
r = await call('POST', '/api/auth/setup', { name: 'Jhim', email: 'Admin@Example.com', password: 'short' });
assert.equal(r.status, 400);
r = await call('POST', '/api/auth/setup', { name: 'Jhim', email: 'Admin@Example.com', password: 'correct horse' });
assert.equal(r.status, 200); assert.equal(r.data.user.is_admin, true); assert.equal(r.data.user.email, 'admin@example.com');
assert.match(r.setCookie, /HttpOnly; SameSite=Lax; Max-Age=2592000; Secure/);
const adminId = r.data.user.id;
const claimed = await handleSync(db, { since: 0, changes: [] }, adminId);
assert.equal(claimed.changes.notebooks[0].id, 'old');
console.log('✓ first-run setup creates the admin, signs in, claims existing notes');

r = await call('POST', '/api/auth/setup', { email: 'evil@example.com', password: 'whatever123' });
assert.equal(r.status, 403);
console.log('✓ setup cannot be run twice');

r = await call('GET', '/api/auth/me');
assert.equal(r.data.user.name, 'Jhim');

// Admin adds a user
r = await call('POST', '/api/admin/users', { name: 'Maria', email: 'maria@example.com', password: 'temp-pass-1' });
assert.equal(r.status, 200); const mariaId = r.data.user.id;
r = await call('POST', '/api/admin/users', { email: 'MARIA@example.com', password: 'temp-pass-1' });
assert.equal(r.status, 409);
r = await call('GET', '/api/admin/users');
assert.equal(r.data.users.length, 2); assert.ok(!('password_hash' in r.data.users[0]));
r = await call('PATCH', `/api/admin/users/${adminId}`, { is_admin: false });
assert.equal(r.status, 400);
r = await call('DELETE', `/api/admin/users/${adminId}`);
assert.equal(r.status, 400);
console.log('✓ admin can add/list users; cannot lock themselves out');

// Cross-site requests are refused
r = await call('POST', '/api/admin/users', { email: 'x@example.com', password: 'temp-pass-1' }, { origin: 'https://evil.com' });
assert.equal(r.status, 403);
console.log('✓ cross-site requests blocked');

r = await call('POST', '/api/auth/logout');
assert.equal(cookie, '');
r = await call('GET', '/api/auth/me');
assert.equal(r.status, 401);
console.log('✓ logout ends the session');

// Maria signs in; she's not an admin.
r = await call('POST', '/api/auth/login', { email: 'maria@example.com', password: 'nope-nope' });
assert.equal(r.status, 401);
r = await call('POST', '/api/auth/login', { email: 'maria@example.com', password: 'temp-pass-1' });
assert.equal(r.status, 200); assert.equal(r.data.user.is_admin, false);
r = await call('GET', '/api/admin/users');
assert.equal(r.status, 403);
const mariaNotes = await handleSync(db, { since: 0, changes: [] }, mariaId);
assert.equal(mariaNotes.changes.notebooks.length, 0);
console.log("✓ regular users sign in, can't use admin pages, can't see the admin's notes");

r = await call('POST', '/api/auth/password', { current: 'wrong', next: 'new-password-1' });
assert.equal(r.status, 400);
r = await call('POST', '/api/auth/password', { current: 'temp-pass-1', next: 'new-password-1' });
assert.equal(r.status, 200);
const mariaCookie = cookie;
cookie = '';
r = await call('POST', '/api/auth/login', { email: 'maria@example.com', password: 'new-password-1' });
assert.equal(r.status, 200);
console.log('✓ users can change their password');

// Disabling a user signs them out everywhere.
cookie = '';
r = await call('POST', '/api/auth/login', { email: 'admin@example.com', password: 'correct horse' });
const adminCookie2 = cookie;
r = await call('PATCH', `/api/admin/users/${mariaId}`, { disabled: true });
assert.equal(r.data.user.disabled, true);
cookie = mariaCookie;
r = await call('GET', '/api/auth/me');
assert.equal(r.status, 401);
r = await call('POST', '/api/auth/login', { email: 'maria@example.com', password: 'new-password-1' });
assert.equal(r.status, 403);
cookie = adminCookie2;
r = await call('PATCH', `/api/admin/users/${mariaId}`, { disabled: false, password: 'reset-pass-9' });
assert.equal(r.status, 200);
cookie = '';
r = await call('POST', '/api/auth/login', { email: 'maria@example.com', password: 'reset-pass-9' });
assert.equal(r.status, 200);
console.log('✓ admin can disable users and reset passwords');

// Rate limiting
cookie = '';
for (let i = 0; i < 10; i++) await call('POST', '/api/auth/login', { email: 'admin@example.com', password: 'bad' });
r = await call('POST', '/api/auth/login', { email: 'admin@example.com', password: 'correct horse' });
assert.equal(r.status, 429);
console.log('✓ repeated wrong passwords are rate limited');

cookie = adminCookie2;
await handleSync(db, { since: 0, changes: [{ table: 'notebooks', id: 'm1', baseSeq: 0, row: { id: 'm1', name: 'Maria nb', sort_key: 'a0', created_at: 1, updated_at: 1, deleted_at: null } }] }, mariaId);
r = await call('DELETE', `/api/admin/users/${mariaId}`);
assert.equal(r.status, 200);
const gone = await origPrepare(`SELECT COUNT(*) AS n FROM notebooks WHERE user_id = ?`).bind(mariaId).first();
assert.equal(gone.n, 0);
console.log('✓ deleting a user removes their notes');
console.log('\nAll auth tests passed');
