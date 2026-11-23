# MyNotes

A minimalist, offline-first notes app organized like OneNote: **notebooks › sections › pages › subpages**. Runs on GitHub + Cloudflare Pages + Cloudflare D1, all on the free tier.

## Features

- **Notebooks, sections (colored tabs), pages and subpages** (2 levels). Drag pages to reorder or nest them, or drop them on a section tab to move them.
- **Rich Markdown editor**: type `/` for headings, to-do lists, bullet and numbered lists, quotes, code blocks and dividers. Notes are stored as plain Markdown.
- **Works offline (PWA)**: install it on your phone or desktop. Notes live on the device and sync to D1 in the background when you're online.
- **Conflict-safe sync**: if the same page is edited on two devices while offline, both versions are kept (one is saved as a “conflict copy”).
- **⌘K / Ctrl+K command palette**: full-text search across titles, content and `#tags`, plus quick actions.
- **Tags, Favorites, Recent, Trash** (with restore), a **daily note**, and a **Tasks** view that collects every checkbox from every page.
- **Import .md**: single files, whole folders or a `.zip` (Obsidian vaults and similar). Keeps front matter (`title`, `tags`, `created`, `updated`) and inline `#tags`, and shows a preview before anything is written.
- **Export .zip** back to Markdown with the same folder layout, so you're never locked in.
- Light and dark mode (follows the system by default).

### How import maps folders

| On disk | In MyNotes |
|---|---|
| `Vault/LevelUp/` | Notebook **LevelUp** |
| `Vault/LevelUp/Interviews/` | Section **Interviews** |
| `Vault/LevelUp/Interviews/Jane.md` | Page **Jane** |
| `Interviews/Meeting.md` + `Interviews/Meeting/*.md` | Files in the folder become **subpages** of *Meeting* |
| `Vault/LevelUp/Overview.md` | Page in section **General** |
| Deeper folders | Section **Interviews / 2024** |

Notebooks and sections that already exist (same name) are merged, and pages with the same title can be skipped.

## Project layout

```
functions/api/        Cloudflare Pages Functions (the API)
  _middleware.ts      Auth via Cloudflare Access (fails closed)
  sync.ts             POST /api/sync – push local changes, pull remote ones
shared/               Code shared by browser and server (schema, sync logic)
migrations/           D1 schema
src/                  React app (Vite)
  data/               IndexedDB (Dexie), write actions, sync client
  components/         UI
  import/             .md import/export
tests/                Node tests for sync + import logic
```

## Run locally

Requires Node 20+.

```bash
npm install
cp .dev.vars.example .dev.vars        # allows the API without login, local only
npm run db:migrate:local              # creates a local D1 database
npm run build && npm run pages:dev    # http://localhost:8788
```

For hot reload while editing UI code, keep `npm run pages:dev` running and run `npm run dev` in a second terminal (Vite proxies `/api` to port 8788).

## Deploy (GitHub → Cloudflare Pages + D1)

### 1. Push to GitHub

Create an empty repository (for example `mynotes`) and push this folder:

```bash
git init && git add . && git commit -m "MyNotes"
git branch -M main
git remote add origin https://github.com/<you>/mynotes.git
git push -u origin main
```

### 2. Create the D1 database

```bash
npx wrangler login
npx wrangler d1 create mynotes
```

Copy the `database_id` it prints into `wrangler.toml`, then create the tables:

```bash
npm run db:migrate:remote
```

Commit and push the updated `wrangler.toml`.

### 3. Create the Pages project

In the Cloudflare dashboard, go to **Workers & Pages → Create → Pages → Connect to Git** (make sure you're on the **Pages** tab), then choose your repository and set:

- Framework preset: **None**
- Build command: `npm run build`
- Build output directory: `dist`

Deploy. Cloudflare reads `wrangler.toml` for the D1 binding, and every push to `main` redeploys automatically.

### 4. Protect it with Cloudflare Access (required)

The API refuses all requests until this step is done, so nobody else can read your notes.

1. Open **Zero Trust** in the dashboard (free for up to 50 users) → **Access → Applications → Add an application → Self-hosted**.
2. Add your domains: `mynotes.pages.dev`, `*.mynotes.pages.dev` (preview deployments), and your custom domain if you have one.
3. Add a policy: **Allow**, with **Emails** set to your email address.
4. Save, then copy the **Application Audience (AUD) tag** from the application's settings.
5. In `wrangler.toml`, fill in:
   ```toml
   ACCESS_TEAM_DOMAIN = "<your-team>.cloudflareaccess.com"
   ACCESS_AUD = "<the AUD tag>"
   ALLOWED_EMAILS = "you@example.com"   # optional extra check
   ```
6. Commit and push.

### 5. Install the app

Open your site and sign in once.

- **iPhone/iPad:** Share → **Add to Home Screen**. Use the installed app, because Safari may clear offline data for sites that aren't installed.
- **Android/Chrome/Edge:** use the **Install** prompt or menu item.

## How sync works

- IndexedDB on each device is the source of truth, so the UI never waits on the network.
- Every edit updates the local row and adds an entry to an **outbox**. Edits are batched: syncing starts about 2 seconds after you stop typing, so D1 writes stay low.
- `POST /api/sync` sends up to 20 changes and receives everything changed since the device's last cursor. Each server row has an increasing `seq` number.
- A change based on an older version is a conflict. Page text is never lost (a conflict copy is created). For titles, moves and other metadata, the newest edit wins.
- Deletes are kept as tombstones so they reach every device. **Delete forever** blanks the content.
- Sync runs on load, when you come back online, when the tab regains focus, every 60 seconds, and after edits.

## Free tier notes

D1's free plan allows 5 GB of storage, 5M rows read and 100k rows written per day (as of late 2026). Edits are debounced and batched, so normal note-taking uses a small fraction of that.

## Tests

```bash
npm test                    # sync + import logic
```

## Roadmap ideas

- `[[Wikilinks]]` and backlinks
- Image uploads to Cloudflare R2 (imported local image links are currently kept as text)
- Page version history
- Semantic search with Workers AI + Vectorize
