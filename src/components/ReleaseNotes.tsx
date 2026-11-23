// "What's new" popup, full changelog, and About Zakar.
import { useEffect, useState } from 'react';
import { APP_RELEASE_DATE, APP_VERSION, CHANGELOG, formatReleaseDate, markSeen, unseenReleases, type Release } from '../changelog';
import { ABOUT } from '../about';
import { checkForUpdates } from '../lib/updates';
import { useUI } from '../store';
import { BrandMark, Wordmark } from './Brand';
import { Icon } from './Icon';
import { Modal, toast } from './Overlays';

function ReleaseCard({ r, compact = false }: { r: Release; compact?: boolean }) {
  return (
    <section className={`release ${compact ? 'compact' : ''}`}>
      <div className="release-head">
        <h4>{r.title}</h4>
        <span className="release-meta">{formatReleaseDate(r.date)} · v{r.version}</span>
      </div>
      <ul className="release-items">
        {r.items.map((it, i) => (
          <li key={i}>
            <span className="ri-icon"><Icon name={it.icon} size={16} /></span>
            <div><b>{it.title}</b><p>{it.text}</p></div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Shows unseen releases once, right after the app updates. Rendered while signed in. */
export function WhatsNewHost() {
  const mode = useUI((s) => s.releaseNotes);
  const set = useUI((s) => s.set);
  const [unseen] = useState<Release[]>(() => unseenReleases());

  useEffect(() => {
    if (unseen.length) { set({ releaseNotes: 'new' }); markSeen(); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mode) return null;
  const close = () => set({ releaseNotes: null });

  if (mode === 'new' && unseen.length) {
    const [latest, ...older] = unseen.slice(0, 3);
    return (
      <Modal onClose={close} className="whats-new">
        <div className="wn-hero">
          <span className="wn-badge"><Icon name="sparkle" size={14} />Updated</span>
          <h3>What's new in Zakar</h3>
          <p className="muted small">You're on the latest version · v{APP_VERSION}</p>
        </div>
        <ReleaseCard r={latest} />
        {older.map((r) => <ReleaseCard key={r.version} r={r} compact />)}
        <div className="modal-actions">
          <button className="btn" onClick={() => set({ releaseNotes: 'all' })}>See all updates</button>
          <button className="btn primary" onClick={close}>Got it</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={close} className="changelog">
      <div className="modal-head">
        <h3>What's new</h3>
        <button className="icon-btn" aria-label="Close" onClick={close}><Icon name="x" /></button>
      </div>
      <p className="muted small" style={{ marginBottom: 14 }}>Every update to Zakar, newest first. You're on v{APP_VERSION}.</p>
      <div className="changelog-list">
        {CHANGELOG.map((r, i) => (
          <div key={r.version} className="cl-entry">
            <div className="cl-rail"><span className={`cl-dot ${i === 0 ? 'current' : ''}`} /></div>
            <ReleaseCard r={r} compact={i > 0} />
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function AboutDialog() {
  const set = useUI((s) => s.set);
  const [checking, setChecking] = useState(false);
  const close = () => set({ aboutOpen: false });
  const d = ABOUT.developer;

  const check = async () => {
    setChecking(true);
    const found = await checkForUpdates();
    setChecking(false);
    toast(found ? 'Update found. Zakar will refresh in a moment.' : "You're on the latest version.");
  };

  return (
    <Modal onClose={close} className="about">
      <button className="icon-btn about-close" aria-label="Close" onClick={close}><Icon name="x" /></button>
      <div className="about-hero">
        <BrandMark size={64} />
        <Wordmark height={30} />
        <p className="about-tagline">{ABOUT.tagline}</p>
        <div className="about-version">
          <span>Version {APP_VERSION}</span><span className="dot-sep">·</span><span>Released {formatReleaseDate(APP_RELEASE_DATE)}</span>
        </div>
        <div className="row gap center">
          <button className="btn small" onClick={check} disabled={checking}><Icon name="restore" />{checking ? 'Checking…' : 'Check for updates'}</button>
          <button className="btn small" onClick={() => set({ aboutOpen: false, releaseNotes: 'all' })}><Icon name="sparkle" />What's new</button>
        </div>
      </div>

      <section className="about-sec">
        <h4>What Zakar is for</h4>
        <p>{ABOUT.purpose}</p>
        <ul className="about-list">{ABOUT.highlights.map((h) => <li key={h}><Icon name="tasks" size={14} />{h}</li>)}</ul>
      </section>

      <section className="about-sec">
        <h4>The meaning behind the name</h4>
        <p>{ABOUT.nameMeaning}</p>
        {ABOUT.verses.map((v) => <blockquote key={v.ref} className="about-verse">“{v.text}”<small>{v.ref}</small></blockquote>)}
        <p className="muted">{ABOUT.markMeaning}</p>
      </section>

      <section className="about-sec">
        <h4>Developer</h4>
        <div className="dev-card">
          <span className="avatar big">{d.name.trim()[0]}</span>
          <div className="dev-info">
            <b>{d.name}</b>
            <span className="muted small">{d.role}</span>
            <div className="dev-links">
              {d.website && <a href={d.website} target="_blank" rel="noopener noreferrer"><Icon name="globe" size={14} />{d.website.replace(/^https?:\/\//, '')}</a>}
              {d.email && <a href={`mailto:${d.email}`}><Icon name="mail" size={14} />{d.email}</a>}
              {d.handle && <span><Icon name="at" size={14} />{d.handle.replace(/^@/, '')}</span>}
            </div>
          </div>
        </div>
      </section>

      <p className="about-foot muted small">Built with {ABOUT.builtWith}.</p>
    </Modal>
  );
}
