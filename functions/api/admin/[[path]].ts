// /api/admin/users and /api/admin/users/:id (admins only)
import { handleAdmin, type User } from '../../../shared/auth-server';
import type { DB } from '../../../shared/sync-server';

interface Env { DB: D1Database }

export const onRequest: PagesFunction<Env, 'path', { user: User }> = async ({ request, env, params, data }) => {
  const path = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
  return handleAdmin(request, env.DB as unknown as DB, data.user, path);
};
