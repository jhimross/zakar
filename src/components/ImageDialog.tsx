// "Add image from URL" dialog with a live preview.
import { useEffect, useState, type FormEvent } from 'react';
import { useUI } from '../store';
import { Modal } from './Overlays';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg|bmp)(\?.*)?(#.*)?$/i;

export function normalizeImageUrl(raw: string): string {
  const v = raw.trim();
  if (!v) return '';
  if (/^\/\//.test(v)) return 'https:' + v;
  if (!/^[a-z]+:/i.test(v)) return 'https://' + v;
  return v;
}

/** True for a URL that looks like a direct link to an image file. */
export function looksLikeImageUrl(text: string) {
  const t = text.trim();
  if (!/^https?:\/\/\S+$/i.test(t)) return false;
  try { return IMAGE_EXT.test(new URL(t).pathname); } catch { return false; }
}

export function ImageDialog() {
  const req = useUI((s) => s.imageDialog);
  const set = useUI((s) => s.set);
  const [src, setSrc] = useState('');
  const [alt, setAlt] = useState('');
  const [state, setState] = useState<'empty' | 'loading' | 'ok' | 'error'>('empty');

  useEffect(() => {
    if (req) { setSrc(req.src ?? ''); setAlt(req.alt ?? ''); }
  }, [req]);

  const url = normalizeImageUrl(src);
  useEffect(() => { setState(url ? 'loading' : 'empty'); }, [url]);

  if (!req) return null;
  const finish = (v: { src: string; alt: string } | null) => { req.resolve(v); set({ imageDialog: null }); };
  const insecure = url.startsWith('http://');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!url || !/^https?:\/\//i.test(url)) return;
    finish({ src: url, alt: alt.trim() });
  };

  return (
    <Modal onClose={() => finish(null)} className="small image-dialog">
      <form onSubmit={submit}>
        <h3>{req.src ? 'Edit image' : 'Add image from a link'}</h3>
        <label className="field">Image URL
          <input className="input" autoFocus inputMode="url" placeholder="https://example.com/photo.jpg"
            value={src} onChange={(e) => setSrc(e.target.value)} />
        </label>
        <div className={`img-preview ${state}`}>
          {url && (
            <img key={url} src={url} alt="" referrerPolicy="no-referrer"
              onLoad={() => setState('ok')} onError={() => setState('error')} />
          )}
          {state === 'empty' && <span>Paste a link to an image to see a preview.</span>}
          {state === 'loading' && <span>Loading preview…</span>}
          {state === 'error' && <span>This link didn't load as an image. Use a direct image link (one that opens just the picture, often ending in .jpg or .png).</span>}
        </div>
        {insecure && <p className="muted small">This link starts with http://. Many browsers block it on a secure site, so use https:// if you can.</p>}
        <label className="field">Description <span className="muted">(optional, shown if the image can't load)</span>
          <input className="input" placeholder="e.g. Red Sea crossing map" value={alt} onChange={(e) => setAlt(e.target.value)} />
        </label>
        <p className="muted small">The image stays hosted where it is. Share links from Google Photos or Drive usually aren't direct image links.</p>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => finish(null)}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!url || state === 'error'}>{req.src ? 'Save' : 'Add image'}</button>
        </div>
      </form>
    </Modal>
  );
}
