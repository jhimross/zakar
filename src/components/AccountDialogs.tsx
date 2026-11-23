import { useEffect, useState, type FormEvent } from 'react';
import { adminApi, changePassword, logout, pendingChanges, useAuth, type AuthUser } from '../data/auth';
import { syncNow } from '../data/sync';
import { confirmDialog, useUI } from '../store';
import { Icon } from './Icon';
import { Modal, toast, useMenu } from './Overlays';
import { relTime } from '../lib/text';
import { exportAll } from '../import/exporter';

/** Name + menu in the sidebar footer. */
export function AccountButton() {
  const user = useAuth((s) => s.user);
  const set = useUI((s) => s.set);
  const [menu, openMenu] = useMenu();
  if (!user) return null;
  const initial = (user.name || user.email).trim()[0]?.toUpperCase() || '?';

  const signOut = async () => {
    let pending = await pendingChanges();
    if (pending && navigator.onLine) { await syncNow(); pending = await pendingChanges(); }
    const msg = pending
      ? `${pending} change(s) haven't synced yet and will be lost. Notes are removed from this device when you sign out.`
      : 'Your notes are removed from this device and come back when you sign in again.';
    if (await confirmDialog('Sign out?', msg, 'Sign out', pending > 0)) await logout();
  };

  return (
    <>
      <button className="account" onClick={(e) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        openMenu({ clientX: r.left, clientY: r.top - 8 }, [
          { label: 'Import .md files', icon: 'download', onClick: () => set({ importOpen: true }) },
          { label: 'Export all notes (.zip)', icon: 'upload', onClick: () => void exportAll() },
          { label: 'Trash', icon: 'trash', onClick: () => set({ view: 'trash', pane: 'list', focus: false }) },
          { divider: true },
          { label: 'Change password', icon: 'edit', onClick: () => set({ passwordOpen: true }) },
          ...(user.is_admin ? [{ label: 'Manage users', icon: 'users', onClick: () => set({ usersOpen: true }) }] : []),
          { divider: true },
          { label: "What's new", icon: 'sparkle', onClick: () => set({ releaseNotes: 'all' }) },
          { label: 'About Zakar', icon: 'info', onClick: () => set({ aboutOpen: true }) },
          { divider: true },
          { label: 'Sign out', icon: 'logout', onClick: signOut },
        ]);
      }}>
        <span className="avatar">{initial}</span>
        <span className="account-text">
          <span className="truncate">{user.name || user.email}</span>
          {user.is_admin && <span className="role">Admin</span>}
        </span>
        <Icon name="updown" size={14} className="account-caret" />
      </button>
      {menu}
    </>
  );
}

export function PasswordDialog() {
  const set = useUI((s) => s.set);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => set({ passwordOpen: false });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== confirm) { setError("New passwords don't match"); return; }
    setBusy(true); setError(null);
    try { await changePassword(current, next); toast('Password changed. Other devices were signed out.'); close(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not change password'); }
    finally { setBusy(false); }
  };
  return (
    <Modal onClose={close} className="small">
      <form onSubmit={submit}>
        <h3>Change password</h3>
        <label className="field">Current password<input className="input" type="password" autoComplete="current-password" required autoFocus value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
        <label className="field">New password<input className="input" type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} /></label>
        <label className="field">Confirm new password<input className="input" type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={close}>Cancel</button>
          <button className="btn primary" disabled={busy}>Change password</button>
        </div>
      </form>
    </Modal>
  );
}

function tempPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

/** Admin: add, edit, disable and remove users. */
export function UsersDialog() {
  const me = useAuth((s) => s.user)!;
  const set = useUI((s) => s.set);
  const [users, setUsers] = useState<AuthUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: tempPassword(), is_admin: false });
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [menu, openMenu] = useMenu();
  const close = () => set({ usersOpen: false });

  const load = async () => {
    try { setUsers((await adminApi.list()).users); setError(null); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load users (are you online?)'); }
  };
  useEffect(() => { void load(); }, []);

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    try { await fn(); if (done) toast(done); await load(); }
    catch (err) { toast(err instanceof Error ? err.message : 'Something went wrong'); }
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await adminApi.create(form);
      setCreated({ email: form.email.trim().toLowerCase(), password: form.password });
      setForm({ name: '', email: '', password: tempPassword(), is_admin: false });
      setAdding(false);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not add user'); }
  };

  const userMenu = (u: AuthUser) => [
    { label: 'Reset password', icon: 'edit', onClick: () => {
      const pw = tempPassword();
      void run(async () => { await adminApi.update(u.id, { password: pw }); setCreated({ email: u.email, password: pw }); });
    } },
    { label: u.is_admin ? 'Remove admin rights' : 'Make admin', icon: 'users', disabled: u.id === me.id,
      onClick: () => run(() => adminApi.update(u.id, { is_admin: !u.is_admin }), u.is_admin ? 'Admin rights removed' : 'Now an admin') },
    { label: u.disabled ? 'Enable account' : 'Disable account', icon: 'x', disabled: u.id === me.id,
      onClick: () => run(() => adminApi.update(u.id, { disabled: !u.disabled }), u.disabled ? 'Account enabled' : 'Account disabled and signed out') },
    { divider: true },
    { label: 'Delete user', icon: 'trash', danger: true, disabled: u.id === me.id, onClick: async () => {
      if (await confirmDialog(`Delete ${u.name || u.email}?`, 'Their account and all their notes will be deleted permanently.', 'Delete user')) {
        await run(() => adminApi.remove(u.id), 'User deleted');
      }
    } },
  ];

  return (
    <Modal onClose={close} className="users">
      <div className="modal-head">
        <h3>Manage users</h3>
        <button className="icon-btn" aria-label="Close" onClick={close}><Icon name="x" /></button>
      </div>

      {created && (
        <div className="credentials">
          <p><b>Share these sign-in details with the user:</b></p>
          <code>Email: {created.email}<br />Password: {created.password}</code>
          <div className="row gap">
            <button className="btn small" onClick={() => { void navigator.clipboard?.writeText(`Email: ${created.email}\nPassword: ${created.password}\nSign in at: ${location.origin}`); toast('Copied'); }}>Copy</button>
            <button className="btn small" onClick={() => setCreated(null)}>Done</button>
          </div>
          <p className="muted small">They can change it after signing in (account menu → Change password).</p>
        </div>
      )}

      <div className="user-list">
        {users?.map((u) => (
          <div key={u.id} className={`user-row ${u.disabled ? 'disabled' : ''}`}>
            <span className="avatar">{(u.name || u.email)[0]?.toUpperCase()}</span>
            <div className="user-main">
              <div className="truncate"><b>{u.name || u.email}</b>{u.id === me.id && <span className="muted"> (you)</span>}</div>
              <div className="muted small truncate">{u.email} · {u.last_login_at ? `last sign-in ${relTime(u.last_login_at)}` : 'never signed in'}</div>
            </div>
            {u.is_admin && <span className="pill">Admin</span>}
            {u.disabled && <span className="pill warn">Disabled</span>}
            <button className="icon-btn" aria-label={`Options for ${u.email}`} onClick={(e) => openMenu(e, userMenu(u))}><Icon name="more" /></button>
          </div>
        ))}
        {!users && !error && <p className="muted">Loading…</p>}
      </div>

      {error && <p className="error">{error}</p>}

      {adding ? (
        <form className="add-user" onSubmit={add}>
          <div className="grid2">
            <label className="field">Name<input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></label>
            <label className="field">Email<input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          </div>
          <label className="field">Temporary password
            <div className="row gap nowrap">
              <input className="input mono" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <button type="button" className="btn small" onClick={() => setForm({ ...form, password: tempPassword() })}>New</button>
            </div>
          </label>
          <label className="check-label"><input type="checkbox" checked={form.is_admin} onChange={(e) => setForm({ ...form, is_admin: e.target.checked })} />Admin (can manage users)</label>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setAdding(false)}>Cancel</button>
            <button className="btn primary">Add user</button>
          </div>
        </form>
      ) : (
        <div className="modal-actions">
          <button className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" />Add user</button>
        </div>
      )}
      <p className="muted small">Each user has their own private notebooks.</p>
      {menu}
    </Modal>
  );
}
