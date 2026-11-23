// Connects the Back button / back swipe to Zakar's screens, dialogs and menus. See backstack.ts.
import { useEffect, useRef } from 'react';
import { useUI } from '../store';
import { createBackStack } from './backstack';

// Same breakpoint as the phone layout in styles.css (one screen at a time).
const phone = window.matchMedia('(max-width: 860px)');

const stack = createBackStack({
  history: window.history,
  paneDepth: () => {
    if (!phone.matches) return 0;
    const pane = useUI.getState().pane;
    return pane === 'editor' ? 2 : pane === 'list' ? 1 : 0;
  },
  backPane: () => {
    const ui = useUI.getState();
    if (ui.pane === 'editor') {
      window.dispatchEvent(new Event('zakar:flush')); // save what was just typed
      ui.set({ pane: 'list' });
    } else if (ui.pane === 'list') {
      ui.set({ pane: 'nav' });
    }
  },
});

let started = false;

export function startBackNavigation() {
  if (started) return;
  started = true;
  window.addEventListener('popstate', () => stack.onPopState());
  phone.addEventListener?.('change', () => stack.changed());
  useUI.subscribe((s, prev) => { if (s.pane !== prev.pane) stack.changed(); });
  stack.start();
}

/** While a dialog or menu is open, Back closes it (instead of leaving the screen). */
export function useBackToClose(onClose: () => void) {
  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => stack.addLayer(() => latest.current()), []);
}
