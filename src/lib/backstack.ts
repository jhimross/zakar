// Makes the phone's Back button (Android) and edge-swipe back (iPhone/iPad) work inside Zakar.
//
// Zakar is one page, so without this "back" leaves the app. Here every step deeper
// (notebooks → pages → note, or opening a dialog or menu) adds one browser history entry,
// and pressing back closes the top dialog/menu or goes up one screen instead.
//
// This file has no browser or React imports so it can be tested in Node; `backnav.ts` wires it up.

export interface HistoryLike {
  readonly state: unknown;
  pushState(state: unknown, title: string): void;
  go(delta: number): void;
}

export interface BackStackOptions {
  history: HistoryLike;
  /** How many screens deep we are (phones: 0 notebooks, 1 pages, 2 note; desktop: 0). */
  paneDepth: () => number;
  /** Go up one screen. */
  backPane: () => void;
  /** Runs `fn` after the current changes settle. Defaults to setTimeout(fn, 0). */
  defer?: (fn: () => void) => void;
}

interface Layer { close: () => void }

const depthOf = (state: unknown): number => {
  const d = (state as { zakar?: unknown } | null)?.zakar;
  return typeof d === 'number' && d > 0 ? d : 0;
};

export function createBackStack(opts: BackStackOptions) {
  const { history } = opts;
  const defer = opts.defer ?? ((fn: () => void) => { setTimeout(fn, 0); });
  const layers: Layer[] = [];
  let pushed = 0; // history entries we added on top of the app's first entry
  let pending = false; // waiting for our own history.go() to land
  let pendingTimer: ReturnType<typeof setTimeout> | undefined;
  let scheduled = false;
  let started = false;

  const target = () => opts.paneDepth() + layers.length;

  function sync() {
    scheduled = false;
    if (!started || pending) return;
    const t = target();
    while (pushed < t) { pushed++; history.pushState({ zakar: pushed }, ''); }
    if (pushed > t) {
      // Something closed from inside the app (a Back link, Cancel, tapping outside):
      // drop the extra history entries so the next Back press does the right thing.
      const n = pushed - t;
      pushed = t;
      pending = true;
      history.go(-n);
      // If the browser can't go back that far it sends no event; don't wait forever.
      pendingTimer = setTimeout(() => { if (pending) { pending = false; schedule(); } }, 1000);
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    defer(sync);
  }

  function closeTop() {
    const layer = layers.pop();
    if (layer) layer.close();
    else opts.backPane();
  }

  return {
    /** Call once at startup. */
    start() {
      started = true;
      // After a reload the tab keeps its history, so continue from where it was.
      pushed = depthOf(history.state);
      schedule();
    },
    /** Hook this to window 'popstate'. */
    onPopState() {
      if (pending) {
        pending = false;
        clearTimeout(pendingTimer);
        schedule();
        return;
      }
      // The user pressed Back (possibly several steps at once from a history menu).
      pushed = depthOf(history.state);
      for (let guard = 0; target() > pushed && guard < 20; guard++) {
        const before = target();
        closeTop();
        if (target() >= before) break; // nothing left to close
      }
      schedule();
    },
    /** Call when the screen depth may have changed (e.g. the open pane, or the window was resized). */
    changed: schedule,
    /** Register an open dialog or menu. Returns a function to call when it closes. */
    addLayer(close: () => void): () => void {
      const layer: Layer = { close };
      layers.push(layer);
      schedule();
      return () => {
        const i = layers.indexOf(layer);
        if (i >= 0) layers.splice(i, 1);
        schedule();
      };
    },
    /** For tests. */
    get depth() { return pushed; },
    get layers() { return layers.length; },
  };
}
