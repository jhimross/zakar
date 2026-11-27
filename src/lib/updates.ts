// Keeps the app up to date.
// - Checks for a new version when the app opens, when you come back to it, and every 30 minutes.
// - When one is ready, it saves anything you're typing, waits until you pause, then reloads into the new version.
// - After the reload, the "What's new" popup (see changelog.ts) tells you what changed.
import { registerSW } from 'virtual:pwa-register';
import { create } from 'zustand';
import { rememberPlaceForReload } from '../store';

export const useUpdate = create<{ updating: boolean }>(() => ({ updating: false }));

let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
let registration: ServiceWorkerRegistration | undefined;
let lastInput = Date.now();
let started = false;

/** Ask open notes to save immediately (the editor listens for this). */
export function flushPendingSaves() {
  window.dispatchEvent(new Event('zakar:flush'));
}

function reloadWhenIdle() {
  if (useUpdate.getState().updating) return;
  useUpdate.setState({ updating: true });
  const attempt = async () => {
    const typingRecently = Date.now() - lastInput < 2500 && document.visibilityState === 'visible';
    if (typingRecently) { setTimeout(attempt, 1000); return; }
    flushPendingSaves();
    await new Promise((r) => setTimeout(r, 700)); // let the save reach IndexedDB
    rememberPlaceForReload(); // come back to the same note after the reload
    if (updateSW) await updateSW(true); else location.reload();
  };
  setTimeout(attempt, 1200);
}

export function startUpdates() {
  if (started || !('serviceWorker' in navigator)) return;
  started = true;
  ['keydown', 'pointerdown', 'input'].forEach((ev) => window.addEventListener(ev, () => { lastInput = Date.now(); }, true));
  window.addEventListener('pagehide', flushPendingSaves);

  updateSW = registerSW({
    immediate: true,
    onNeedRefresh: reloadWhenIdle,
    onRegisteredSW(_url, reg) {
      registration = reg;
      if (!reg) return;
      const check = () => { if (navigator.onLine) reg.update().catch(() => {}); };
      setInterval(check, 30 * 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
      window.addEventListener('online', check);
    },
  });
}

/** Manual "Check for updates". Resolves true if an update was found (the app will then reload). */
export async function checkForUpdates(): Promise<boolean> {
  if (!registration) return false;
  try { await registration.update(); } catch { return false; }
  await new Promise((r) => setTimeout(r, 2500));
  return useUpdate.getState().updating || !!registration.waiting || !!registration.installing;
}
