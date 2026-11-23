import { useState, type FormEvent, type ReactNode } from 'react';
import { initAuth, login, setup, useAuth } from '../data/auth';
import { BrandMark, Wordmark } from './Brand';
import { InstallButton } from './Install';

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand"><BrandMark size={30} /><Wordmark height={20} /></div>
        {children}
      </div>
    </div>
  );
}

function useSubmit(fn: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await fn(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong'); }
    finally { setBusy(false); }
  };
  return { busy, error, onSubmit };
}

export function LoginScreen() {
  const { expired, user, offlineNotice, initError } = useAuth();
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const { busy, error, onSubmit } = useSubmit(() => login(email, password));
  return (
    <Shell>
      <h1>{expired ? 'Sign in again' : 'Sign in'}</h1>
      <p className="muted">
        {expired ? 'Your session ended. Your notes are safe on this device and will sync after you sign in.' : 'Welcome back.'}
      </p>
      {offlineNotice && !navigator.onLine && <p className="auth-note">You're offline. Connect to the internet to sign in.</p>}
      {initError && navigator.onLine && (
        <div className="auth-note">
          <b>Can't reach the server.</b> {initError}
          <button className="btn small" style={{ marginTop: 8 }} onClick={() => void initAuth()}>Try again</button>
        </div>
      )}
      <form onSubmit={onSubmit} className="auth-form">
        <label className="field">Email
          <input className="input" type="email" autoComplete="username" required autoFocus={!email} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">Password
          <input className="input" type="password" autoComplete="current-password" required autoFocus={!!email} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary wide" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="muted small center-text">Don't have an account? Ask your admin to add you.</p>
      <InstallButton variant="login" />
    </Shell>
  );
}

export function SetupScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const { busy, error, onSubmit } = useSubmit(async () => {
    if (password !== confirm) throw new Error("Passwords don't match");
    await setup(name, email, password);
  });
  return (
    <Shell>
      <h1>Create your admin account</h1>
      <p className="muted">This is a one-time setup. You'll be the admin and can add other users later.</p>
      <form onSubmit={onSubmit} className="auth-form">
        <label className="field">Name
          <input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label className="field">Email
          <input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">Password <span className="muted">(at least 8 characters)</span>
          <input className="input" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="field">Confirm password
          <input className="input" type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary wide" disabled={busy}>{busy ? 'Creating…' : 'Create admin account'}</button>
      </form>
    </Shell>
  );
}

export function LoadingScreen() {
  return <div className="auth-page"><BrandMark size={48} /></div>;
}
