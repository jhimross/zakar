import { handleSync, type DB } from '../../shared/sync-server';
import type { SyncRequest } from '../../shared/schema';

interface Env { DB: D1Database }

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: SyncRequest;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Bad JSON' }), { status: 400 });
  }
  try {
    const result = await handleSync(env.DB as unknown as DB, body);
    return new Response(JSON.stringify(result), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'Sync failed' }), { status: 500 });
  }
};
