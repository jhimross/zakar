// Runs before every /api route: creates the database tables if needed and requires a signed-in user,
// except for the sign-in endpoints themselves.
import { authenticate, ensureSchema, json, type User } from '../../shared/auth-server';
import type { DB } from '../../shared/sync-server';

interface Env { DB: D1Database }

export const onRequest: PagesFunction<Env, string, { user?: User }> = async (ctx) => {
  const db = ctx.env.DB as unknown as DB;
  if (!db) {
    return json(500, { error: 'No D1 database is connected. In Cloudflare: Pages project → Settings → Bindings → add D1 database, variable name DB.' });
  }
  try {
    await ensureSchema(db);
  } catch (err) {
    console.error(err);
    return json(500, { error: `Database setup failed: ${err instanceof Error ? err.message : String(err)}` });
  }
  const path = new URL(ctx.request.url).pathname;
  if (path.startsWith('/api/auth/') || path === '/api/health') return ctx.next();

  const auth = await authenticate(ctx.request, db);
  if (!auth) return json(401, { error: 'Not signed in' });
  ctx.data.user = auth.user;
  const res = await ctx.next();
  if (!auth.setCookie) return res;
  const out = new Response(res.body, res);
  out.headers.append('set-cookie', auth.setCookie);
  return out;
};
