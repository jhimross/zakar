// "Install app" support.
// - Chrome, Edge, Android: uses the browser's install prompt (beforeinstallprompt).
// - iPhone/iPad and Safari on Mac: no prompt exists, so we show step-by-step instructions.
// - Already installed (running as an app): nothing is shown.
import { create } from 'zustand';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const ua = navigator.userAgent;
export const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isMacSafari = !isIOS && /Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/.test(ua);
export const isIOSNonSafari = isIOS && /CriOS|FxiOS|EdgiOS/.test(ua);

export function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

interface InstallState {
  deferred: InstallPromptEvent | null;
  installed: boolean;
  guide: 'ios' | 'mac' | null;
}

export const useInstall = create<InstallState>(() => ({ deferred: null, installed: isStandalone(), guide: null }));

// Must be registered before React renders, because the browser may fire this early.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // we show our own Install button instead of the browser's banner
  useInstall.setState({ deferred: e as InstallPromptEvent });
});
window.addEventListener('appinstalled', () => useInstall.setState({ installed: true, deferred: null }));
window.matchMedia('(display-mode: standalone)').addEventListener?.('change', (e) => {
  if (e.matches) useInstall.setState({ installed: true });
});

/** Whether to show an Install button at all. */
export function useCanInstall() {
  return useInstall((s) => !s.installed && (!!s.deferred || isIOS || isMacSafari));
}

export async function installApp() {
  const { deferred } = useInstall.getState();
  if (deferred) {
    await deferred.prompt();
    const choice = await deferred.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
    useInstall.setState({ deferred: null, installed: choice.outcome === 'accepted' });
    return;
  }
  if (isIOS) useInstall.setState({ guide: 'ios' });
  else if (isMacSafari) useInstall.setState({ guide: 'mac' });
}
