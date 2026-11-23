/** Plain-text preview of Markdown. */
export function snippet(md: string, len = 90): string {
  const text = md
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
