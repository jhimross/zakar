// ─────────────────────────────────────────────────────────────────────────────
//  Zakar changelog
//
//  To publish a new release, add an entry at the TOP of the list:
//    version: the release date as YYYY.MM.DD (add .1, .2… for more than one release in a day)
//    date:    the same date as YYYY-MM-DD
//    title:   one short headline
//    items:   what's new (icon names come from src/components/Icon.tsx)
//
//  After you deploy, every open copy of the app updates itself and shows
//  the newest entry once in a "What's new" popup. The full list is always
//  available from the account menu → What's new.
// ─────────────────────────────────────────────────────────────────────────────

export interface ReleaseItem { icon: string; title: string; text: string }
export interface Release { version: string; date: string; title: string; items: ReleaseItem[] }

export const CHANGELOG: Release[] = [
  {
    version: '2026.11.23.5',
    date: '2026-11-23',
    title: "What's new and About",
    items: [
      { icon: 'sparkle', title: 'Always up to date', text: 'Zakar now updates itself when a new version is released. It saves what you are typing first, then refreshes.' },
      { icon: 'gift', title: "What's new", text: 'After each update, a short note like this one shows what changed. See every update anytime from your name → What’s new.' },
      { icon: 'info', title: 'About Zakar', text: 'Learn what Zakar is for, the meaning behind the name, the current version and who made it.' },
    ],
  },
  {
    version: '2026.11.23.4',
    date: '2026-11-23',
    title: 'Toolbar, focus mode and images',
    items: [
      { icon: 'bold', title: 'Formatting toolbar', text: 'Headings, bold, italic, lists, checklists, quotes, code, links and more, one click away.' },
      { icon: 'sidebar', title: 'Focus mode', text: 'Hide the sidebar for distraction-free writing. Press Ctrl + \\ (⌘ + \\ on Mac).' },
      { icon: 'image', title: 'Images from a link', text: 'Embed an image by pasting its web address. A preview shows before you add it.' },
      { icon: 'users', title: 'Tidier sidebar', text: 'Import, Export and Trash moved into the menu under your name.' },
    ],
  },
  {
    version: '2026.11.23.3',
    date: '2026-11-23',
    title: 'Install, export and breadcrumbs',
    items: [
      { icon: 'install', title: 'Install the app', text: 'Install Zakar on your phone or computer. On iPhone and iPad you get step-by-step instructions.' },
      { icon: 'pdf', title: 'Export a note', text: 'Save any note as PDF, plain text or Markdown from its ⋯ menu.' },
      { icon: 'move', title: 'Simpler structure', text: 'Notebooks now hold pages directly, with breadcrumbs showing where you are.' },
    ],
  },
  {
    version: '2026.11.23.2',
    date: '2026-11-23',
    title: 'Hello, Zakar',
    items: [
      { icon: 'book', title: 'A new name', text: 'MyNotes is now Zakar, Hebrew for “to remember”, with a new icon and colors.' },
      { icon: 'trash', title: 'Less clutter', text: 'Daily note and the Tasks view were removed. Checklists still work inside any page.' },
    ],
  },
  {
    version: '2026.11.23.1',
    date: '2026-11-23',
    title: 'Accounts and notebook groups',
    items: [
      { icon: 'users', title: 'Sign in and users', text: 'Built-in sign-in. The admin can add people, reset passwords and disable accounts. Everyone’s notes are private.' },
      { icon: 'folder', title: 'Notebook groups', text: 'Group notebooks into folders and drag them around.' },
    ],
  },
  {
    version: '2026.11.23',
    date: '2026-11-23',
    title: 'First release',
    items: [
      { icon: 'book', title: 'Notebooks and pages', text: 'Organize notes into notebooks, pages and subpages, with drag and drop.' },
      { icon: 'offline', title: 'Works offline', text: 'Notes live on your device and sync when you are back online. Nothing is lost if two devices edit the same page.' },
      { icon: 'download', title: 'Import and export', text: 'Bring in your Markdown notes and export everything as a .zip anytime.' },
      { icon: 'search', title: 'Search', text: 'Find any note with ⌘K / Ctrl+K.' },
    ],
  },
];

export const APP_VERSION = CHANGELOG[0].version;
export const APP_RELEASE_DATE = CHANGELOG[0].date;

const SEEN_KEY = 'zakar.seenVersion';
// Someone who used the app before this feature existed already has saved UI settings.
const returningUser = (() => { try { return localStorage.getItem('mynotes.ui') !== null; } catch { return false; } })();

/** Releases this device hasn't seen yet (newest first). Empty for brand-new users. */
export function unseenReleases(): Release[] {
  let seen: string | null = null;
  try { seen = localStorage.getItem(SEEN_KEY); } catch { return []; }
  if (!seen) {
    if (!returningUser) { markSeen(); return []; }
    return CHANGELOG.slice(0, 1);
  }
  const i = CHANGELOG.findIndex((r) => r.version === seen);
  return i === -1 ? CHANGELOG.slice(0, 1) : CHANGELOG.slice(0, i);
}

export function markSeen() {
  try { localStorage.setItem(SEEN_KEY, APP_VERSION); } catch { /* ignore */ }
}

export function formatReleaseDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}
