import { handleSync, type DB } from '../../shared/sync-server';
import { json, sameOrigin, type User } from '../../shared/auth-server';
import type { SyncRequest } from '../../shared/schema';

interface Env { DB: D1Database }

export const onRequestPost: PagesFunction<Env, string, { user: User }> = async ({ request, env, data }) => {
  if (!sameOrigin(request)) return json(403, { error: 'Bad origin' });
  let body: SyncRequest;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Bad JSON' });
  }
  try {
    return json(200, await handleSync(env.DB as unknown as DB, body, data.user.id));
  } catch (err) {
    console.error(err);
    return json(500, { error: 'Sync failed' });
  }
};
