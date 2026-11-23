// /api/auth/me | setup | login | logout | password
import { handleAuth } from '../../../shared/auth-server';
import type { DB } from '../../../shared/sync-server';

interface Env { DB: D1Database }

export const onRequest: PagesFunction<Env, 'path'> = async ({ request, env, params }) => {
  const action = Array.isArray(params.path) ? params.path[0] : params.path;
  return handleAuth(request, env.DB as unknown as DB, action || '');
};
