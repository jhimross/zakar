// Pure helpers for reading Markdown notes (no browser or DB dependencies, so they're easy to test).

export interface ParsedNote {
  title: string;
  body: string;
  tags: string[];
  created?: number;
  updated?: number;
  warnings: string[];
}

/** Parse the subset of YAML front matter used by note apps (Obsidian, Jekyll, Hugo, Bear exports…). */
export function parseFrontMatter(text: string): { data: Record<string, unknown>; body: string; error?: string } {
  const src = text.replace(/^﻿/, '');
  const m = src.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/);
  if (!m) return { data: {}, body: src };
  const data: Record<string, unknown> = {};
  let currentKey: string | null = null;
  try {
    for (const raw of m[1].split(/\r?\n/)) {
      if (!raw.trim() || raw.trim().startsWith('#')) continue;
      const item = raw.match(/^\s+-\s*(.*)$/) || (currentKey && raw.match(/^-\s+(.*)$/));
      if (item && currentKey) {
        const arr = Array.isArray(data[currentKey]) ? (data[currentKey] as unknown[]) : [];
        arr.push(scalar(item[1]));
        data[currentKey] = arr;
        continue;
      }
      const kv = raw.match(/^([A-Za-z0-9_\- ]+?)\s*:\s*(.*)$/);
      if (!kv) { if (/^\s/.test(raw)) continue; throw new Error(`Unreadable line: ${raw}`); }
      currentKey = kv[1].trim().toLowerCase();
      const v = kv[2].trim();
      if (v === '' || v === '|' || v === '>') data[currentKey] = v === '' ? [] : '';
      else if (v.startsWith('[') && v.endsWith(']')) data[currentKey] = splitInline(v.slice(1, -1)).map(scalar);
      else data[currentKey] = scalar(v);
    }
  } catch (e) {
    return { data: {}, body: src, error: e instanceof Error ? e.message : String(e) };
  }
  // Empty keys that never received list items become empty strings.
  for (const k of Object.keys(data)) if (Array.isArray(data[k]) && !(data[k] as unknown[]).length) data[k] = '';
  return { data, body: src.slice(m[0].length) };
}

function splitInline(s: string): string[] {
  const out: string[] = []; let cur = ''; let q: string | null = null;
  for (const ch of s) {
    if (q) { if (ch === q) q = null; else cur += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; continue; }
    if (ch === ',') { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function scalar(v: string): string | number | boolean {
  v = v.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v) && v.length < 15) return Number(v);
  return v.replace(/\s+#.*$/, '');
}

function toDate(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const d = typeof v === 'number' ? new Date(v > 1e11 ? v : v * 1000) : new Date(String(v));
  const t = d.getTime();
  return Number.isFinite(t) && t > 0 ? t : undefined;
}

export function normalizeTags(v: unknown): string[] {
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,\s]+/) : [];
  return list.map((t) => String(t).trim().replace(/^#/, '')).filter(Boolean);
}

/** #hashtags written in the body (ignores code, headings and URLs). */
export function inlineTags(body: string): string[] {
  const clean = body.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '').replace(/\]\([^)]*\)/g, ']');
  const out: string[] = [];
  for (const m of clean.matchAll(/(^|[\s(])#([\p{L}\p{N}_][\p{L}\p{N}_\-/]*)/gu)) {
    if (/^\d+$/.test(m[2])) continue; // "#1" is not a tag
    out.push(m[2]);
  }
  return out;
}

export function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>(); const out: string[] = [];
  for (const t of tags) { const k = t.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(t); } }
  return out;
}

export function parseNote(text: string, fileName: string, lastModified?: number): ParsedNote {
  const warnings: string[] = [];
  const fm = parseFrontMatter(text);
  if (fm.error) warnings.push(`Front matter couldn't be read (${fm.error}); kept as text`);
  let body = fm.body.replace(/\r\n/g, '\n');
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.(md|markdown|mdown|txt)$/i, '');

  let title = typeof fm.data.title === 'string' || typeof fm.data.title === 'number' ? String(fm.data.title).trim() : '';
  // A leading "# Heading" becomes the title (and is removed so it isn't shown twice).
  const h1 = body.match(/^\s*#\s+(.+?)\s*#*\s*(\n|$)/);
  if (h1 && (!title || h1[1].trim() === title)) {
    title = title || h1[1].trim();
    body = body.slice(h1[0].length);
  }
  if (!title) title = base || 'Untitled';
  body = body.replace(/^\s*\n/, '').replace(/\s+$/, '') + (body.trim() ? '\n' : '');

  const tags = dedupeTags([...normalizeTags(fm.data.tags ?? fm.data.tag ?? fm.data.keywords), ...inlineTags(body)]);
  const created = toDate(fm.data.created ?? fm.data.date ?? fm.data.created_at ?? fm.data.creation_date) ?? lastModified;
  const updated = toDate(fm.data.updated ?? fm.data.modified ?? fm.data.updated_at ?? fm.data.lastmod ?? fm.data.last_modified) ?? lastModified ?? created;

  const localImages = [...body.matchAll(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)|!\[\[([^\]]+)\]\]/g)]
    .map((m) => m[1] || m[2]).filter((src) => src && !/^(https?:|data:)/i.test(src));
  if (localImages.length) warnings.push(`${localImages.length} local image link(s) kept as text (image upload is not supported yet)`);

  return { title, body, tags, created, updated: updated && created && updated < created ? created : updated, warnings };
}

/** Front matter + body for export (round-trips with parseNote). */
export function toMarkdownFile(p: { title: string; content: string; tags: string[]; created_at: number; updated_at: number }): string {
  const q = (s: string) => (/^[\w .\-()]+$/.test(s) && !/^(true|false|\d+)$/.test(s) ? s : JSON.stringify(s));
  const lines = ['---', `title: ${q(p.title || 'Untitled')}`];
  if (p.tags.length) lines.push(`tags: [${p.tags.map(q).join(', ')}]`);
  lines.push(`created: ${new Date(p.created_at).toISOString()}`, `updated: ${new Date(p.updated_at).toISOString()}`, '---', '');
  return lines.join('\n') + (p.content || '');
}

export function safeFileName(name: string): string {
  return (name || 'Untitled').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Untitled';
}
