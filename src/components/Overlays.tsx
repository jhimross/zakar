import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useUI } from '../store';
import { COLORS } from '../data/actions';
import { useBackToClose } from '../lib/backnav';

export interface MenuItem {
  label?: string;
  icon?: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  colors?: (c: string) => void; // render a color swatch row
  divider?: boolean;
}

/** Hook: const [menu, openMenu] = useMenu(); openMenu(event, items) */
export function useMenu(): [ReactNode, (e: { clientX: number; clientY: number; preventDefault?: () => void; stopPropagation?: () => void }, items: MenuItem[]) => void] {
  const [state, setState] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const open = (e: { clientX: number; clientY: number; preventDefault?: () => void; stopPropagation?: () => void }, items: MenuItem[]) => {
    e.preventDefault?.();
    e.stopPropagation?.();
    setState({ x: e.clientX, y: e.clientY, items });
  };
  const node = state ? <Menu {...state} onClose={() => setState(null)} /> : null;
  return [node, open];
}

function Menu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useBackToClose(onClose);
  const [pos, setPos] = useState({ x, y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: Math.min(x, window.innerWidth - r.width - 8), y: Math.min(y, window.innerHeight - r.height - 8) });
  }, [x, y]);
  useEffect(() => {
    const close = (e: Event) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    setTimeout(() => document.addEventListener('pointerdown', close), 0);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [onClose]);
  return createPortal(
    <div ref={ref} className="menu" style={{ left: pos.x, top: pos.y }} role="menu">
      {items.map((it, i) =>
        it.divider ? <div key={i} className="menu-divider" /> :
        it.colors ? (
          <div key={i} className="swatches">
            {COLORS.map((c) => (
              <button key={c} className="swatch" style={{ background: c }} aria-label={`Color ${c}`}
                onClick={() => { it.colors!(c); onClose(); }} />
            ))}
          </div>
        ) : (
          <button key={i} role="menuitem" className={`menu-item ${it.danger ? 'danger' : ''}`} disabled={it.disabled}
            onClick={() => { onClose(); it.onClick?.(); }}>
            {it.icon && <Icon name={it.icon} />}{it.label}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}

export function Modal({ children, onClose, className = '' }: { children: ReactNode; onClose: () => void; className?: string }) {
  useBackToClose(onClose);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return createPortal(
    <div className="backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${className}`} role="dialog" aria-modal="true">{children}</div>
    </div>,
    document.body,
  );
}

/** Prompt / confirm dialog driven by the UI store (see ask() and confirmDialog()). */
export function DialogHost() {
  const dialog = useUI((s) => s.dialog);
  const set = useUI((s) => s.set);
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (dialog) { setValue(dialog.value || ''); setTimeout(() => { input.current?.focus(); input.current?.select(); }, 0); }
  }, [dialog]);
  if (!dialog) return null;
  const finish = (v: string | boolean | null) => { dialog.resolve(v); set({ dialog: null }); };
  return (
    <Modal onClose={() => finish(null)} className="small">
      <form onSubmit={(e) => { e.preventDefault(); finish(dialog.kind === 'prompt' ? value : true); }}>
        <h3>{dialog.title}</h3>
        {dialog.message && <p className="muted">{dialog.message}</p>}
        {dialog.kind === 'prompt' && <input ref={input} className="input" value={value} onChange={(e) => setValue(e.target.value)} />}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => finish(null)}>Cancel</button>
          <button type="submit" className={`btn primary ${dialog.danger ? 'danger' : ''}`}>{dialog.okLabel || 'OK'}</button>
        </div>
      </form>
    </Modal>
  );
}

type ToastMsg = { text: string; action?: { label: string; run: () => void } };

export function Toast() {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    const h = (e: Event) => {
      const m = (e as CustomEvent<ToastMsg>).detail;
      clearTimeout(timer.current); // a new message gets its own full time on screen
      setMsg(m);
      timer.current = setTimeout(() => setMsg(null), m.action ? 6000 : 2600);
    };
    window.addEventListener('toast', h);
    return () => { window.removeEventListener('toast', h); clearTimeout(timer.current); };
  }, []);
  if (!msg) return null;
  return (
    <div className="toast" role="status">
      {msg.text}
      {msg.action && (
        <button className="toast-action" onClick={() => { const run = msg.action!.run; clearTimeout(timer.current); setMsg(null); run(); }}>
          {msg.action.label}
        </button>
      )}
    </div>
  );
}

export const toast = (text: string, action?: ToastMsg['action']) => window.dispatchEvent(new CustomEvent<ToastMsg>('toast', { detail: { text, action } }));
