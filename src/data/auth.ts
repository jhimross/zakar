// Sign-in state on the client. Works offline: if you've signed in on this device before,
// the app opens with your local notes even without a connection.
import { create } from 'zustand';
import { closeUserDb, deleteUserDb, db, openUserDb } from './db';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
  disabled?: boolean;
  created_at?: number;
  last_login_at?: number | null;
}

type Status = 'loading' | 'setup' | 'login' | 'ready';

interface AuthState {
  status: Status;
  user: AuthUser | null;
  /** True when a session ended while the app was open (local notes stay on the device). */
  expired: boolean;
  offlineNotice: boolean;
}

export const useAuth = create<AuthState>(() => ({ status: 'loading', user: null, expired: false, offlineNotice: false }));

const CACHE_KEY = 'mynotes.user';
const cachedUser = (): AuthUser | null => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; } };
const cacheUser = (u: AuthUser | null) => { try { u ? localStorage.setItem(CACHE_KEY, JSON.stringify(u)) : localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ } };

export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }

export async function api<T = Record<string, unknown>>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json() : {};
  if (!res.ok) throw new ApiError((data as { error?: string }).error || `Request failed (${res.status})`, res.status);
  if (!isJson) throw new ApiError('Unexpected response from server', res.status);
  return data as T;
}

async function enter(user: AuthUser) {
  cacheUser(user);
  await openUserDb(user.id);
  useAuth.setState({ status: 'ready', user, expired: false });
}

/** Called once at startup. */
export async function initAuth() {
  try {
    const me = await api<{ user?: AuthUser; needsSetup?: boolean }>('/api/auth/me');
    if (me.needsSetup) { useAuth.setState({ status: 'setup' }); return; }
    if (me.user) { await enter(me.user); return; }
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      const cached = cachedUser();
      useAuth.setState({ status: 'login', user: cached, expired: false });
      return;
    }
    // Offline or server unreachable: open the last signed-in user's local notes.
    const cached = cachedUser();
    if (cached) { await enter(cached); useAuth.setState({ offlineNotice: true }); return; }
    useAuth.setState({ status: 'login', offlineNotice: true });
  }
}

export async function login(email: string, password: string) {
  const { user } = await api<{ user: AuthUser }>('/api/auth/login', 'POST', { email, password });
  const current = useAuth.getState().user;
  if (useAuth.getState().expired && current && current.id !== user.id) {
    // A different person signed in on a device that had someone else's session open.
    cacheUser(user);
    location.reload();
    return;
  }
  await enter(user);
  const { syncNow } = await import('./sync');
  void syncNow();
}

export async function setup(name: string, email: string, password: string) {
  const { user } = await api<{ user: AuthUser }>('/api/auth/setup', 'POST', { name, email, password });
  await enter(user);
}

/** The server says our session is no longer valid. */
export function sessionExpired() {
  if (useAuth.getState().status === 'ready') useAuth.setState({ status: 'login', expired: true });
}

export async function pendingChanges() {
  try { return await db.outbox.count(); } catch { return 0; }
}

/** Sign out and remove this user's notes from the device. */
export async function logout() {
  const user = useAuth.getState().user;
  try { await api('/api/auth/logout', 'POST'); } catch { /* offline: the session simply expires */ }
  closeUserDb();
  if (user) await deleteUserDb(user.id);
  cacheUser(null);
  try { localStorage.removeItem('mynotes.ui'); } catch { /* ignore */ }
  location.reload();
}

export function changePassword(current: string, next: string) {
  return api('/api/auth/password', 'POST', { current, next });
}

// ---------- Admin ----------
export const adminApi = {
  list: () => api<{ users: AuthUser[] }>('/api/admin/users'),
  create: (u: { name: string; email: string; password: string; is_admin: boolean }) => api<{ user: AuthUser }>('/api/admin/users', 'POST', u),
  update: (id: string, patch: Partial<{ name: string; email: string; password: string; is_admin: boolean; disabled: boolean }>) =>
    api<{ user: AuthUser }>(`/api/admin/users/${id}`, 'PATCH', patch),
  remove: (id: string) => api(`/api/admin/users/${id}`, 'DELETE'),
};
