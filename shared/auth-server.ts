// Built-in accounts: users, password hashing, cookie sessions, admin user management.
// Runtime-agnostic (Web Crypto + Request/Response), so it runs on Cloudflare and in Node tests.
import type { DB } from './sync-server';

export interface User {
  id: string;
  email: string;
  name: string;
  is_admin: number;
  disabled: number;
  created_at: number;
  last_login_at: number | null;
}

const SESSION_COOKIE = 'mn_session';
const SESSION_DAYS = 30;
const DAY = 86_400_000;
const PBKDF2_ITERATIONS = 100_000; // Cloudflare Workers' maximum
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW = 15 * 60_000;
const SCHEMA_VERSION = 3;

// ---------------- Schema (created automatically, no console steps needed) ----------------
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL)`,
  `INSERT OR IGNORE INTO meta (k, v) VALUES ('seq', 0)`,
  `CREATE TABLE IF NOT EXISTS notebooks (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', color TEXT, icon TEXT, sort_key TEXT NOT NULL DEFAULT 'a0', created_at INTEGER, updated_at INTEGER, deleted_at INTEGER, seq INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sections (id TEXT PRIMARY KEY, notebook_id TEXT NOT NULL, parent_id TEXT, name TEXT NOT NULL DEFAULT '', color TEXT, sort_key TEXT NOT NULL DEFAULT 'a0', created_at INTEGER, updated_at INTEGER, deleted_at INTEGER, seq INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS pages (id TEXT PRIMARY KEY, section_id TEXT NOT NULL, parent_id TEXT, title TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]', favorite INTEGER NOT NULL DEFAULT 0, purged INTEGER NOT NULL DEFAULT 0, sort_key TEXT NOT NULL DEFAULT 'a0', created_at INTEGER, updated_at INTEGER, deleted_at INTEGER, seq INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL DEFAULT '', password_hash TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0, disabled INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, last_login_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, user_agent TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS login_attempts (k TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS notebook_groups (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', color TEXT, sort_key TEXT NOT NULL DEFAULT 'a0', created_at INTEGER, updated_at INTEGER, deleted_at INTEGER, seq INTEGER NOT NULL, user_id TEXT)`,
];
const ADD_COLUMNS = [
  ...['notebooks', 'sections', 'pages'].map((t) => `ALTER TABLE ${t} ADD COLUMN user_id TEXT`),
  `ALTER TABLE notebooks ADD COLUMN group_id TEXT`,
];
const INDEXES = ['notebook_groups', 'notebooks', 'sections', 'pages'].map((t) => `CREATE INDEX IF NOT EXISTS idx_${t}_user_seq ON ${t}(user_id, seq)`);

let schemaReady: Promise<void> | null = null;

export function ensureSchema(db: DB): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      try {
        const row = await db.prepare(`SELECT v FROM meta WHERE k = 'schema'`).first<{ v: number }>();
        if (row && Number(row.v) >= SCHEMA_VERSION) return;
      } catch { /* meta table doesn't exist yet */ }
      await db.batch(SCHEMA.map((s) => db.prepare(s)));
      for (const sql of ADD_COLUMNS) {
        try { await db.prepare(sql).run(); } catch { /* column already exists */ }
      }
      await db.batch([
        ...INDEXES.map((s) => db.prepare(s)),
        db.prepare(`INSERT INTO meta (k, v) VALUES ('schema', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`).bind(SCHEMA_VERSION),
      ]);
    })().catch((e) => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

/** Tests only. */
export function resetSchemaCache() { schemaReady = null; }

// ---------------- Helpers ----------------
const enc = new TextEncoder();
const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (buf: Uint8Array) => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function sha256Hex(s: string) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password: string, salt = crypto.getRandomValues(new Uint8Array(16)), iterations = PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return `pbkdf2$${iterations}$${b64(salt)}$${b64(bits)}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [alg, iter, salt, hash] = stored.split('$');
  if (alg !== 'pbkdf2' || !iter || !salt || !hash) return false;
  const again = (await hashPassword(password, unb64(salt), Number(iter))).split('$')[3];
  if (again.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= again.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

export const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });

function cookieHeader(req: Request, value: string, maxAgeSec: number) {
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

function readCookie(req: Request, name: string) {
  const m = (req.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
}

const publicUser = (u: User) => ({ id: u.id, email: u.email, name: u.name, is_admin: !!u.is_admin, disabled: !!u.disabled, created_at: u.created_at, last_login_at: u.last_login_at });

const normEmail = (e: unknown) => String(e ?? '').trim().toLowerCase();
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;
function passwordProblem(p: unknown): string | null {
  if (typeof p !== 'string' || p.length < 8) return 'Password must be at least 8 characters';
  if (p.length > 200) return 'Password is too long';
  return null;
}

async function body(req: Request): Promise<Record<string, unknown>> {
  try { const b = await req.json(); return b && typeof b === 'object' ? (b as Record<string, unknown>) : {}; } catch { return {}; }
}

/** Blocks cross-site form posts (in addition to SameSite cookies). */
export function sameOrigin(req: Request) {
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).host === new URL(req.url).host; } catch { return false; }
}

async function createSession(db: DB, req: Request, userId: string) {
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const now = Date.now();
  await db.prepare(`INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)`)
    .bind(await sha256Hex(token), userId, now, now + SESSION_DAYS * DAY, (req.headers.get('user-agent') || '').slice(0, 200)).run();
  await db.prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`).bind(now, userId).run();
  return cookieHeader(req, token, SESSION_DAYS * 86400);
}

export interface AuthResult { user: User; sessionId: string; setCookie?: string }

/** Who is making this request? Renews sessions that are more than halfway to expiry. */
export async function authenticate(req: Request, db: DB): Promise<AuthResult | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const id = await sha256Hex(token);
  const now = Date.now();
  const row = await db.prepare(
    `SELECT u.*, s.expires_at AS s_expires FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ? AND u.disabled = 0`,
  ).bind(id, now).first<User & { s_expires: number }>();
  if (!row) return null;
  const { s_expires, ...user } = row;
  let setCookie: string | undefined;
  if (s_expires - now < (SESSION_DAYS / 2) * DAY) {
    await db.prepare(`UPDATE sessions SET expires_at = ? WHERE id = ?`).bind(now + SESSION_DAYS * DAY, id).run();
    setCookie = cookieHeader(req, token, SESSION_DAYS * 86400);
  }
  return { user: user as User, sessionId: id, setCookie };
}

async function userCount(db: DB) {
  const r = await db.prepare(`SELECT COUNT(*) AS n FROM users`).first<{ n: number }>();
  return Number(r?.n ?? 0);
}

// ---------------- Login rate limiting ----------------
async function tooManyAttempts(db: DB, key: string) {
  const r = await db.prepare(`SELECT count, window_start FROM login_attempts WHERE k = ?`).bind(key).first<{ count: number; window_start: number }>();
  return !!r && Date.now() - r.window_start < ATTEMPT_WINDOW && r.count >= MAX_ATTEMPTS;
}
async function recordFailure(db: DB, key: string) {
  const now = Date.now();
  await db.prepare(
    `INSERT INTO login_attempts (k, count, window_start) VALUES (?, 1, ?)
     ON CONFLICT(k) DO UPDATE SET count = CASE WHEN ? - window_start > ? THEN 1 ELSE count + 1 END,
                                  window_start = CASE WHEN ? - window_start > ? THEN ? ELSE window_start END`,
  ).bind(key, now, now, ATTEMPT_WINDOW, now, ATTEMPT_WINDOW, now).run();
}

// ---------------- /api/auth/* ----------------
export async function handleAuth(req: Request, db: DB, action: string): Promise<Response> {
  if (!sameOrigin(req)) return json(403, { error: 'Bad origin' });

  if (action === 'me' && req.method === 'GET') {
    if ((await userCount(db)) === 0) return json(200, { needsSetup: true });
    const auth = await authenticate(req, db);
    if (!auth) return json(401, { error: 'Not signed in' });
    return json(200, { user: publicUser(auth.user) }, auth.setCookie ? { 'set-cookie': auth.setCookie } : {});
  }

  if (action === 'setup' && req.method === 'POST') {
    if ((await userCount(db)) > 0) return json(403, { error: 'Setup is already done. Please sign in.' });
    const b = await body(req);
    const email = normEmail(b.email);
    if (!validEmail(email)) return json(400, { error: 'Enter a valid email address' });
    const problem = passwordProblem(b.password);
    if (problem) return json(400, { error: problem });
    const id = crypto.randomUUID();
    await db.prepare(`INSERT INTO users (id, email, name, password_hash, is_admin, disabled, created_at) VALUES (?, ?, ?, ?, 1, 0, ?)`)
      .bind(id, email, String(b.name ?? '').trim().slice(0, 100), await hashPassword(String(b.password)), Date.now()).run();
    // Notes synced before accounts existed belong to the first admin.
    await db.batch(['notebook_groups', 'notebooks', 'sections', 'pages'].map((t) => db.prepare(`UPDATE ${t} SET user_id = ? WHERE user_id IS NULL`).bind(id)));
    const cookie = await createSession(db, req, id);
    const user = await db.prepare(`SELECT * FROM users WHERE id = ?`).bind(id).first<User>();
    return json(200, { user: publicUser(user!) }, { 'set-cookie': cookie });
  }

  if (action === 'login' && req.method === 'POST') {
    const b = await body(req);
    const email = normEmail(b.email);
    const ip = req.headers.get('cf-connecting-ip') || 'local';
    const key = `${email}|${ip}`;
    if (await tooManyAttempts(db, key)) return json(429, { error: 'Too many attempts. Try again in 15 minutes.' });
    const user = email ? await db.prepare(`SELECT * FROM users WHERE email = ?`).bind(email).first<User & { password_hash: string }>() : null;
    // Always run the hash so response time doesn't reveal whether the email exists.
    const ok = await verifyPassword(String(b.password ?? ''), user?.password_hash || 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
    if (!user || !ok) { await recordFailure(db, key); return json(401, { error: 'Wrong email or password' }); }
    if (user.disabled) return json(403, { error: 'This account is disabled. Ask your admin.' });
    await db.prepare(`DELETE FROM login_attempts WHERE k = ?`).bind(key).run();
    const cookie = await createSession(db, req, user.id);
    return json(200, { user: publicUser(user) }, { 'set-cookie': cookie });
  }

  if (action === 'logout' && req.method === 'POST') {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) await db.prepare(`DELETE FROM sessions WHERE id = ?`).bind(await sha256Hex(token)).run();
    return json(200, { ok: true }, { 'set-cookie': cookieHeader(req, '', 0) });
  }

  if (action === 'password' && req.method === 'POST') {
    const auth = await authenticate(req, db);
    if (!auth) return json(401, { error: 'Not signed in' });
    const b = await body(req);
    const full = await db.prepare(`SELECT password_hash FROM users WHERE id = ?`).bind(auth.user.id).first<{ password_hash: string }>();
    if (!full || !(await verifyPassword(String(b.current ?? ''), full.password_hash))) return json(400, { error: 'Current password is wrong' });
    const problem = passwordProblem(b.next);
    if (problem) return json(400, { error: problem });
    await db.batch([
      db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).bind(await hashPassword(String(b.next)), auth.user.id),
      db.prepare(`DELETE FROM sessions WHERE user_id = ? AND id != ?`).bind(auth.user.id, auth.sessionId), // sign out other devices
    ]);
    return json(200, { ok: true });
  }

  return json(404, { error: 'Not found' });
}

// ---------------- /api/admin/* ----------------
export async function handleAdmin(req: Request, db: DB, me: User, path: string[]): Promise<Response> {
  if (!sameOrigin(req)) return json(403, { error: 'Bad origin' });
  if (!me.is_admin) return json(403, { error: 'Admins only' });
  const [resource, id] = path;
  if (resource !== 'users') return json(404, { error: 'Not found' });

  if (!id && req.method === 'GET') {
    const { results } = await db.prepare(`SELECT * FROM users ORDER BY created_at`).all<User>();
    return json(200, { users: results.map(publicUser) });
  }

  if (!id && req.method === 'POST') {
    const b = await body(req);
    const email = normEmail(b.email);
    if (!validEmail(email)) return json(400, { error: 'Enter a valid email address' });
    const problem = passwordProblem(b.password);
    if (problem) return json(400, { error: problem });
    if (await db.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first()) return json(409, { error: 'A user with that email already exists' });
    const nid = crypto.randomUUID();
    await db.prepare(`INSERT INTO users (id, email, name, password_hash, is_admin, disabled, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)`)
      .bind(nid, email, String(b.name ?? '').trim().slice(0, 100), await hashPassword(String(b.password)), b.is_admin ? 1 : 0, Date.now()).run();
    const user = await db.prepare(`SELECT * FROM users WHERE id = ?`).bind(nid).first<User>();
    return json(200, { user: publicUser(user!) });
  }

  if (!id) return json(405, { error: 'Method not allowed' });
  const target = await db.prepare(`SELECT * FROM users WHERE id = ?`).bind(id).first<User>();
  if (!target) return json(404, { error: 'User not found' });
  const self = target.id === me.id;

  if (req.method === 'PATCH') {
    const b = await body(req);
    const sets: string[] = []; const vals: unknown[] = [];
    let endSessions = false;
    if (typeof b.name === 'string') { sets.push('name = ?'); vals.push(b.name.trim().slice(0, 100)); }
    if (b.email !== undefined) {
      const email = normEmail(b.email);
      if (!validEmail(email)) return json(400, { error: 'Enter a valid email address' });
      const clash = await db.prepare(`SELECT id FROM users WHERE email = ? AND id != ?`).bind(email, id).first();
      if (clash) return json(409, { error: 'A user with that email already exists' });
      sets.push('email = ?'); vals.push(email);
    }
    if (b.password !== undefined) {
      const problem = passwordProblem(b.password);
      if (problem) return json(400, { error: problem });
      sets.push('password_hash = ?'); vals.push(await hashPassword(String(b.password)));
      endSessions = !self;
    }
    if (b.is_admin !== undefined) {
      if (self && !b.is_admin) return json(400, { error: "You can't remove your own admin rights" });
      sets.push('is_admin = ?'); vals.push(b.is_admin ? 1 : 0);
    }
    if (b.disabled !== undefined) {
      if (self && b.disabled) return json(400, { error: "You can't disable your own account" });
      sets.push('disabled = ?'); vals.push(b.disabled ? 1 : 0);
      if (b.disabled) endSessions = true;
    }
    if (!sets.length) return json(400, { error: 'Nothing to change' });
    const stmts = [db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, id)];
    if (endSessions) stmts.push(db.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(id));
    await db.batch(stmts);
    const user = await db.prepare(`SELECT * FROM users WHERE id = ?`).bind(id).first<User>();
    return json(200, { user: publicUser(user!) });
  }

  if (req.method === 'DELETE') {
    if (self) return json(400, { error: "You can't delete your own account" });
    await db.batch([
      db.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(id),
      db.prepare(`DELETE FROM pages WHERE user_id = ?`).bind(id),
      db.prepare(`DELETE FROM sections WHERE user_id = ?`).bind(id),
      db.prepare(`DELETE FROM notebooks WHERE user_id = ?`).bind(id),
      db.prepare(`DELETE FROM notebook_groups WHERE user_id = ?`).bind(id),
      db.prepare(`DELETE FROM users WHERE id = ?`).bind(id),
    ]);
    return json(200, { ok: true });
  }

  return json(405, { error: 'Method not allowed' });
}
