/** Markdown table helpers: a delimiter row like `| --- | :-: |`, and a row's cells. */
const TABLE_DELIM = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
export function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '')
    .replace(/\\\|/g, '\u0000').split('|').map((c) => c.replace(/\u0000/g, '|').trim());
}

/** Plain-text preview of Markdown. */
export function snippet(md: string, len = 90): string {
  const text = md
    .split('\n').filter((l) => !TABLE_DELIM.test(l)).map((l) => (isTableRow(l) ? tableCells(l).filter(Boolean).join(' · ') : l)).join('\n')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+(\[[ xX]\]\s+)?/gm, '')
    .replace(/[*_`~\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > len ? text.slice(0, len).trimEnd() + '…' : text;
}

export function plainText(md: string): string {
  return snippet(md, 1e9);
}

export function wordCount(md: string): number {
  const t = plainText(md);
  return t ? t.split(/\s+/).length : 0;
}

export function formatDate(t: number, withTime = false): string {
  const d = new Date(t);
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
  if (withTime) Object.assign(opts, { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleString(undefined, opts);
}

export function relTime(t: number): string {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d > 300 ? 'numeric' : undefined });
}

export const TASK_RE = /^(\s*)([-*+]) \[( |x|X)\] (.*)$/;

export interface TaskLine { line: number; done: boolean; text: string }

export function parseTasks(md: string): TaskLine[] {
  const out: TaskLine[] = [];
  let inCode = false;
  md.split('\n').forEach((l, i) => {
    if (/^\s*```/.test(l)) inCode = !inCode;
    if (inCode) return;
    const m = l.match(TASK_RE);
    if (m) out.push({ line: i, done: m[3] !== ' ', text: m[4].replace(/\\([\\`*_{}[\]()#+\-.!])/g, '$1') });
  });
  return out;
}

export function toggleTaskLine(md: string, line: number): string {
  const lines = md.split('\n');
  const m = lines[line]?.match(TASK_RE);
  if (!m) return md;
  lines[line] = `${m[1]}${m[2]} [${m[3] === ' ' ? 'x' : ' '}] ${m[4]}`;
  return lines.join('\n');
}

/** Convert a note's Markdown to clean, readable plain text (for .txt export). */
export function markdownToText(md: string): string {
  const unescape = (s: string) => s.replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, '$1');
  const inline = (s: string) => unescape(
    s
      .replace(/!\[([^\]]*)\]\(([^)\s]*)[^)]*\)/g, (_m, alt, src) => `[Image${alt ? `: ${alt}` : ''}] ${src}`.trim())
      .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_m, t, u) => (t === u || `mailto:${t}` === u ? t : `${t} (${u})`))
      .replace(/`([^`]+)`/g, '$1')
      .replace(/(\*\*|__)(.+?)\1/g, '$2')
      .replace(/~~(.+?)~~/g, '$1')
      .replace(/(^|[^\w*])\*(?!\s)(.+?)\*(?!\w)/g, '$1$2')
      .replace(/(^|[^\w_])_(?!\s)(.+?)_(?!\w)/g, '$1$2'),
  );
  const out: string[] = [];
  let inCode = false;
  let prevTableRow = false;
  for (const raw of md.replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s*```/.test(raw)) { inCode = !inCode; continue; }
    if (inCode) { out.push('    ' + raw); continue; }
    let m: RegExpMatchArray | null;
    if ((m = raw.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/))) {
      const text = inline(m[2]);
      if (out.length && out[out.length - 1] !== '') out.push('');
      out.push(text);
      if (m[1].length <= 2) out.push((m[1].length === 1 ? '=' : '-').repeat(Math.min(Math.max(text.length, 3), 60)));
      continue;
    }
    if (prevTableRow && TABLE_DELIM.test(raw)) {
      out.push(out[out.length - 1].replace(/[^|]/g, '-').replace(/\|/g, '+'));
      continue;
    }
    prevTableRow = isTableRow(raw);
    if (prevTableRow) { out.push(tableCells(raw).map(inline).join(' | ')); continue; }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(raw)) { out.push('—'.repeat(20)); continue; }
    if ((m = raw.match(/^(\s*)[-*+] \[( |x|X)\] (.*)$/))) { out.push(`${m[1]}[${m[2] === ' ' ? ' ' : 'x'}] ${inline(m[3])}`); continue; }
    if ((m = raw.match(/^(\s*)[-*+] (.*)$/))) { out.push(`${m[1]}• ${inline(m[2])}`); continue; }
    if ((m = raw.match(/^(\s*)(\d+)[.)] (.*)$/))) { out.push(`${m[1]}${m[2]}. ${inline(m[3])}`); continue; }
    if ((m = raw.match(/^\s*>\s?(.*)$/))) { out.push(`  │ ${inline(m[1])}`); continue; }
    out.push(inline(raw));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
