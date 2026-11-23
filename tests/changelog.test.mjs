import assert from 'node:assert/strict';
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

// Returning user (has UI settings) who never saw a changelog → sees the newest release once.
store.set('mynotes.ui', '{}');
let m = await import('./.build/changelog.js?a');
assert.equal(m.unseenReleases().length, 1);
m.markSeen();
assert.equal(m.unseenReleases().length, 0);
console.log('✓ returning user sees the latest release once');

// Versions are unique, newest first, and match their dates.
const versions = m.CHANGELOG.map((r) => r.version);
assert.equal(new Set(versions).size, versions.length);
for (const r of m.CHANGELOG) assert.ok(r.version.startsWith(r.date.replaceAll('-', '.')), r.version);
const key = (v) => v.split('.').map(Number).concat([0, 0, 0, 0]).slice(0, 4);
for (let i = 1; i < versions.length; i++) {
  const a = key(versions[i - 1]), b = key(versions[i]);
  assert.ok(a.join('.') !== b.join('.') && (a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]) > 0, `${versions[i - 1]} should be newer than ${versions[i]}`);
}
assert.equal(m.APP_VERSION, versions[0]);
console.log('✓ changelog versions are date-based, unique and newest first');

// Someone two releases behind sees both.
store.set('zakar.seenVersion', versions[2]);
assert.deepEqual(m.unseenReleases().map((r) => r.version), versions.slice(0, 2));
console.log('✓ users who missed several updates see each one');

// Brand-new user: nothing shown.
store.clear();
m = await import('./.build/changelog.js?b');
assert.equal(m.unseenReleases().length, 0);
assert.equal(store.get('zakar.seenVersion'), m.APP_VERSION);
console.log('✓ brand-new users are not shown old release notes');
