// UI state (what's selected, which dialogs are open). Data lives in IndexedDB.
import { create } from 'zustand';

export type View = 'section' | 'recent' | 'favorites' | 'trash';
export type Pane = 'nav' | 'list' | 'editor';
export type Theme = 'system' | 'light' | 'dark';

interface DialogReq {
  kind: 'prompt' | 'confirm';
  title: string;
  message?: string;
  value?: string;
  okLabel?: string;
  danger?: boolean;
  resolve: (v: string | boolean | null) => void;
}

export interface ImageRequest { src?: string; alt?: string; resolve: (v: { src: string; alt: string } | null) => void }

interface UI {
  notebookId: string | null;
  sectionId: string | null;
  pageId: string | null;
  view: View;
  pane: Pane;
  theme: Theme;
  paletteOpen: boolean;
  importOpen: boolean;
  moveOpen: string | null; // page id
  collapsed: Record<string, boolean>;
  focusTitle: string | null; // page id whose title should get focus
  dialog: DialogReq | null;
  imageDialog: ImageRequest | null;
  usersOpen: boolean;
  /** Desktop focus mode: hides the sidebar and page list. */
  focus: boolean;
  /** Show the formatting toolbar above notes. */
  toolbar: boolean;
  passwordOpen: boolean;
  ownerId: string | null;
  set: (p: Partial<UI>) => void;
  resetForUser: (userId: string) => void;
  openNotebook: (id: string, sectionId?: string | null) => void;
  openSection: (notebookId: string, id: string) => void;
  openPage: (id: string, ctx?: { notebookId?: string; sectionId?: string }) => void;
  toggleCollapsed: (id: string) => void;
}

const saved = (() => {
  try { return JSON.parse(localStorage.getItem('mynotes.ui') || '{}'); } catch { return {}; }
})();

export const useUI = create<UI>((set) => ({
  notebookId: saved.notebookId ?? null,
  sectionId: saved.sectionId ?? null,
  pageId: saved.pageId ?? null,
  view: 'section',
  pane: saved.pageId ? 'editor' : 'nav',
  theme: saved.theme ?? 'system',
  paletteOpen: false,
  importOpen: false,
  moveOpen: null,
  collapsed: saved.collapsed ?? {},
  focusTitle: null,
  dialog: null,
  imageDialog: null,
  usersOpen: false,
  focus: saved.focus ?? false,
  toolbar: saved.toolbar ?? true,
  passwordOpen: false,
  ownerId: saved.ownerId ?? null,
  set: (p) => set(p),
  resetForUser: (userId) => set((s) => (s.ownerId === userId ? {} : {
    ownerId: userId, notebookId: null, sectionId: null, pageId: null, collapsed: {}, view: 'section', pane: 'nav',
  })),
  openNotebook: (id, sectionId = null) => set({ notebookId: id, sectionId, view: 'section', pane: 'list' }),
  openSection: (notebookId, id) => set({ notebookId, sectionId: id, view: 'section', pane: 'list' }),
  openPage: (id, ctx) => set((s) => ({
    pageId: id,
    pane: 'editor',
    notebookId: ctx?.notebookId ?? s.notebookId,
    sectionId: ctx?.sectionId ?? s.sectionId,
  })),
  toggleCollapsed: (id) => set((s) => ({ collapsed: { ...s.collapsed, [id]: !s.collapsed[id] } })),
}));

useUI.subscribe((s) => {
  try {
    localStorage.setItem('mynotes.ui', JSON.stringify({
      notebookId: s.notebookId, sectionId: s.sectionId, pageId: s.pageId, theme: s.theme, collapsed: s.collapsed, ownerId: s.ownerId, focus: s.focus, toolbar: s.toolbar,
    }));
  } catch { /* storage unavailable */ }
});

export function ask(title: string, value = '', okLabel = 'Save'): Promise<string | null> {
  return new Promise((resolve) => useUI.getState().set({
    dialog: { kind: 'prompt', title, value, okLabel, resolve: (v) => resolve(typeof v === 'string' ? v : null) },
  }));
}

export function confirmDialog(title: string, message: string, okLabel = 'Delete', danger = true): Promise<boolean> {
  return new Promise((resolve) => useUI.getState().set({
    dialog: { kind: 'confirm', title, message, okLabel, danger, resolve: (v) => resolve(v === true) },
  }));
}

/** Ask for an image URL (and optional description). Resolves null if cancelled. */
export function askImage(initial: { src?: string; alt?: string } = {}): Promise<{ src: string; alt: string } | null> {
  return new Promise((resolve) => useUI.getState().set({ imageDialog: { ...initial, resolve } }));
}
