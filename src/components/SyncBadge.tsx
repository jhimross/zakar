import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { syncNow, useSync } from '../data/sync';
import { sessionExpired } from '../data/auth';

function ago(t: number | null) {
  if (!t) return 'never';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : new Date(t).toLocaleDateString();
}

export function SyncBadge({ compact = false }: { compact?: boolean }) {
  const { state, lastSynced, error } = useSync();
  const pending = useLiveQuery(() => db.outbox.count(), []) ?? 0;
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30_000); return () => clearInterval(t); }, []);

  let cls = 'ok';
  let text = `Synced · ${ago(lastSynced)}`;
  if (state === 'offline') { cls = 'warn'; text = pending ? `Offline · ${pending} change${pending > 1 ? 's' : ''} to sync` : 'Offline'; }
  else if (state === 'syncing') { cls = 'busy'; text = 'Syncing…'; }
  else if (state === 'auth') { cls = 'err'; text = 'Sign in to sync'; }
  else if (state === 'error') { cls = 'err'; text = pending ? `Sync error · ${pending} pending` : 'Sync error'; }
  else if (pending) { cls = 'busy'; text = `${pending} change${pending > 1 ? 's' : ''} pending`; }

  return (
    <button className={`sync-badge ${cls} ${compact ? 'compact' : ''}`} title={error || 'Sync now'} onClick={() => {
      if (state === 'auth') sessionExpired(); else void syncNow();
    }}>
      <span className="sync-dot" />{!compact && text}
    </button>
  );
}

/** Banner shown above the editor when offline (as in the mobile mockup). */
export function OfflineBanner() {
  const state = useSync((s) => s.state);
  const pending = useLiveQuery(() => db.outbox.count(), []) ?? 0;
  if (state !== 'offline') return null;
  return (
    <div className="offline-banner" role="status">
      Offline · {pending ? `${pending} change${pending > 1 ? 's' : ''} will sync when you're back` : 'changes save on this device'}
    </div>
  );
}
