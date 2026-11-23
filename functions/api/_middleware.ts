// Runs before every /api route: creates the database tables if needed and requires a signed-in user,
// except for the sign-in endpoints themselves.
import { authenticate, ensureSchema, json, type User } from '../../shared/auth-server';
import type { DB } from '../../shared/sync-server';

interface Env { DB: D1Database }

export const onRequest: PagesFunction<Env, string, { user?: User }> = async (ctx) => {
  const db = ctx.env.DB as unknown as DB;
  try {
    await ensureSchema(db);
  } catch (err) {
    console.error(err);
    return json(500, { error: 'Database not available. Check the D1 binding named DB.' });
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
