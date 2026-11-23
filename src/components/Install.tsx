import { installApp, isIOSNonSafari, useCanInstall, useInstall } from '../lib/install';
import { Icon } from './Icon';
import { Modal } from './Overlays';
import { BrandMark } from './Brand';

/** "Install app" button. Renders nothing when the app is already installed or can't be installed here. */
export function InstallButton({ variant }: { variant: 'sidebar' | 'login' }) {
  const can = useCanInstall();
  if (!can) return null;
  if (variant === 'login') {
    return (
      <button type="button" className="btn wide install-login" onClick={() => void installApp()}>
        <Icon name="install" />Install Zakar on this device
      </button>
    );
  }
  return <button className="install-side" onClick={() => void installApp()}><Icon name="install" />Install app</button>;
}

const ShareGlyph = () => (
  <svg className="glyph" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-label="Share icon">
    <path d="M12 3v12M8 7l4-4 4 4" /><path d="M7 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1" />
  </svg>
);
const AddGlyph = () => (
  <svg className="glyph" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-label="Add to Home Screen icon">
    <rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8v8M8 12h8" />
  </svg>
);

/** Step-by-step instructions for iPhone/iPad and Safari on Mac. */
export function InstallGuide() {
  const guide = useInstall((s) => s.guide);
  if (!guide) return null;
  const close = () => useInstall.setState({ guide: null });
  return (
    <Modal onClose={close} className="small install-guide">
      <div className="guide-head">
        <BrandMark size={44} />
        <div><h3>Install Zakar</h3><p className="muted small">Open it from your {guide === 'ios' ? 'Home Screen' : 'Dock'} like any other app. It works offline too.</p></div>
      </div>
      {guide === 'ios' ? (
        <ol className="steps">
          {isIOSNonSafari && <li><span className="n">0</span><div>For the best result, open this page in <b>Safari</b>.</div></li>}
          <li><span className="n">1</span><div>Tap the <b>Share</b> button <ShareGlyph /> in Safari's toolbar. On newer iOS versions it's inside the <b>⋯</b> menu.</div></li>
          <li><span className="n">2</span><div>Scroll down and tap <b>Add to Home Screen</b> <AddGlyph />.</div></li>
          <li><span className="n">3</span><div>Make sure <b>Open as Web App</b> is on if you see it, then tap <b>Add</b>.</div></li>
          <li><span className="n">4</span><div>Open <b>Zakar</b> from your Home Screen and sign in once.</div></li>
        </ol>
      ) : (
        <ol className="steps">
          <li><span className="n">1</span><div>In Safari's menu bar, click <b>File</b>.</div></li>
          <li><span className="n">2</span><div>Choose <b>Add to Dock…</b> (macOS Sonoma or later).</div></li>
          <li><span className="n">3</span><div>Click <b>Add</b>. Zakar opens in its own window from the Dock.</div></li>
        </ol>
      )}
      <div className="modal-actions"><button className="btn primary" onClick={close}>Got it</button></div>
    </Modal>
  );
}
