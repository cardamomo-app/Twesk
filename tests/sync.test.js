import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSync, fingerprint, cloudState, withDeviceSettings, SYNC_META_KEY } from '../sync-engine.js';
import { createCloudAdapter } from '../sync-remote.js';
import { freshState, validateState } from '../engine.js';
function memory() {
  const data = new Map();
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
}
function harness(server = { row: null }, storage = memory()) { let state = freshState(), safe = true, failApply = false;
  const preserved = [], applied = [], writes = [];
  const remote = {
    async read() { return structuredClone(server.row); },
    async write(payload, version) {
      writes.push({ payload, version });
      if ((server.row?.cloud_version || 0) !== version) return { ...structuredClone(server.row), conflict: true };
      server.row = { payload: structuredClone(payload), cloud_version: version + 1 };
      return { ...structuredClone(server.row), conflict: false };
    },
  };
  const sync = createSync({ storage, remote, getState: () => state, validate: validateState,
    apply: next => { if (failApply) throw new Error('quota'); preserved.push(state); state = next; applied.push(next); },
    preserve: next => preserved.push(next), canApply: () => safe });
  sync.setUser('alice');
  return { sync, storage, remote, server, writes, preserved, applied, get state() { return state; }, set state(v) { state = v; }, set safe(v) { safe = v; }, set failApply(v) { failApply = v; } };
}
const change = (h, name) => { h.state.name = name; h.state.revision++; };
test('cloud payload validates; only adventure changes affect its fingerprint', async () => {
  const s = freshState(), before = await fingerprint(s);
  s.revision++; Object.assign(s.settings, { theme: 'dark', muted: true, reducedMotion: true, lastBackup: '2026-10-10' });
  assert.equal(await fingerprint(s), before);
  assert.doesNotThrow(() => validateState(cloudState(s)));
  s.settings.timezone = 'UTC'; s.name = 'A new name'; assert.notEqual(await fingerprint(s), before);
  assert.equal(withDeviceSettings(cloudState(s), s).settings.theme, 'dark');
});
test('initial save uploads; unchanged saves do not write again', async () => {
  const h = harness(); await h.sync.tick(); assert.equal(h.server.row.cloud_version, 1);
  await h.sync.tick(); assert.equal(h.writes.length, 1); assert.equal(h.sync.status.phase, 'synced');
});
test('a second device reviews different initial progress and can recover its local copy', async () => {
  const a = harness(); change(a, 'Desktop'); await a.sync.tick();
  const b = harness(a.server); change(b, 'Mobile'); await b.sync.tick();
  assert.equal(b.sync.status.phase, 'conflict'); assert.equal(b.writes.length, 0);
  await b.sync.resolve('cloud'); assert.equal(b.state.name, 'Desktop'); assert.equal(b.preserved[0].name, 'Mobile');
});
test('clean devices receive updates without uploading stale progress', async () => {
  const a = harness(); await a.sync.tick(); const b = harness(a.server);
  b.state = structuredClone(a.state); await b.sync.tick(); change(a, 'Desktop edit'); await a.sync.tick();
  await b.sync.tick(); assert.equal(b.state.name, 'Desktop edit'); assert.equal(b.writes.length, 0);
});
test('offline edits on both devices require a choice and preserve the displaced cloud save', async () => {
  const a = harness(); await a.sync.tick(); const b = harness(a.server);
  b.state = structuredClone(a.state); await b.sync.tick();
  change(a, 'A'); change(b, 'B'); await a.sync.tick(); await b.sync.tick();
  assert.equal(b.sync.status.phase, 'conflict'); assert.equal(b.server.row.payload.name, 'A');
  await b.sync.resolve('local'); assert.equal(b.server.row.payload.name, 'B'); assert.equal(b.preserved[0].name, 'A');
});
test('a save made during an upload stays pending and uploads on the next pass', async () => {
  const h = harness(), write = h.remote.write;
  h.remote.write = async (...args) => { const result = await write(...args); change(h, 'During upload'); return result; };
  await h.sync.tick(); assert.equal(h.sync.status.phase, 'pending'); assert.notEqual(h.server.row.payload.name, h.state.name);
  h.remote.write = write; await h.sync.tick(); assert.equal(h.server.row.payload.name, 'During upload');
});
test('a race rejected by the server becomes a conflict', async () => {
  const h = harness(), write = h.remote.write;
  h.remote.write = async (...args) => { h.server.row = { cloud_version: 1, payload: cloudState(freshState()) }; return write(...args); };
  await h.sync.tick(); assert.equal(h.sync.status.phase, 'conflict'); assert.equal(h.server.row.cloud_version, 1);
});
test('conflict resolution checks the latest cloud version again', async () => {
  const h = harness({ row: { cloud_version: 1, payload: cloudState(freshState()) } });
  change(h, 'Local'); await h.sync.tick(); h.server.row.cloud_version++;
  await h.sync.resolve('local'); assert.equal(h.writes.length, 0); assert.equal(h.sync.conflict.row.cloud_version, 2);
});
test('network failure and invalid remote saves never replace local progress', async () => {
  const h = harness(); const initial = structuredClone(h.state);
  h.remote.read = async () => { throw new Error('offline'); }; await h.sync.tick(); assert.equal(h.sync.status.phase, 'error');
  h.remote.read = async () => ({ cloud_version: 1, payload: { version: 1 } }); await h.sync.tick();
  assert.deepEqual(h.state, initial); assert.equal(h.writes.length, 0);
});
test('no replacements or uploads happen while editing or in combat', async () => {
  const h = harness(); h.safe = false; await h.sync.tick(); assert.equal(h.writes.length, 0);
  h.safe = true; await h.sync.tick(); assert.equal(h.writes.length, 1);
});
test('failed local storage leaves the original sync base intact on remote pull', async () => {
  const a = harness(); await a.sync.tick(); const b = harness(a.server); b.state = structuredClone(a.state); await b.sync.tick();
  const before = b.storage.getItem(SYNC_META_KEY); change(a, 'Remote'); await a.sync.tick(); b.failApply = true;
  await b.sync.tick(); assert.equal(b.storage.getItem(SYNC_META_KEY), before); assert.equal(b.sync.status.phase, 'error');
  b.failApply = false; await b.sync.tick(); assert.equal(b.state.name, 'Remote'); assert.equal(b.writes.length, 0);
});
test('account switching cannot upload the previous account’s adventure automatically', async () => {
  const h = harness(); await h.sync.tick(); h.server.row = null; h.sync.setUser('bob'); await h.sync.tick();
  assert.equal(h.sync.status.phase, 'conflict'); assert.equal(h.writes.length, 1);
  await h.sync.resolve('local'); assert.equal(h.writes.length, 2);
});
test('signing out during a request prevents a late remote response from replacing progress', async () => {
  const h = harness({ row: { cloud_version: 1, payload: cloudState(freshState()) } });
  h.remote.read = async () => { h.sync.setUser(null); return h.server.row; };
  await h.sync.tick(); assert.equal(h.applied.length, 0); assert.equal(h.writes.length, 0); assert.equal(h.sync.status.phase, 'signed-out');
});
test('lost upload acknowledgement recovers safely by comparing payloads', async () => {
  const h = harness(), write = h.remote.write;
  h.remote.write = async (...args) => { await write(...args); throw new Error('timeout'); };
  await h.sync.tick(); assert.equal(h.sync.status.phase, 'error'); h.remote.write = write;
  await h.sync.tick(); assert.equal(h.sync.status.phase, 'synced'); assert.equal(h.writes.length, 1);
});
test('a removed cloud save is never silently recreated from an outdated device', async () => {
  const h = harness(); await h.sync.tick(); h.server.row = null; await h.sync.tick(); assert.equal(h.sync.status.phase, 'conflict');
});
test('a restored older cloud version requires review rather than rolling back a device', async () => {
  const h = harness(); await h.sync.tick(); const older = structuredClone(h.server.row);
  change(h, 'Latest progress'); await h.sync.tick(); h.server.row = older;
  await h.sync.tick(); assert.equal(h.sync.status.phase, 'conflict'); assert.equal(h.state.name, 'Latest progress');
});
test('a sign-out during fingerprinting stops the upload and bookkeeping', async () => {
  const storage = memory(), state = freshState(); let reads = 0, writes = 0, sync;
  sync = createSync({ storage, remote: { read: async () => null, write: async () => { writes++; } },
    getState: () => { if (++reads === 2) sync.setUser(null); return state; }, validate: validateState,
    apply() {}, preserve() {}, canApply: () => true });
  sync.setUser('alice'); await sync.tick();
  assert.equal(writes, 0); assert.equal(storage.getItem(SYNC_META_KEY), null); assert.equal(sync.status.phase, 'signed-out');
});
test('requests carry the identity captured at their start', async () => {
  const h = harness(); let reader, writer; const read = h.remote.read, write = h.remote.write;
  h.remote.read = async id => { reader = id; return read(); };
  h.remote.write = async (payload, version, id) => { writer = id; return write(payload, version); };
  await h.sync.tick(); assert.equal(reader, 'alice'); assert.equal(writer, 'alice');
});
test('the cloud adapter pins its token before a different account signs in', async () => {
  let session = { user: { id: 'alice' }, access_token: 'alice-token' }, token, args;
  const authClient = { auth: { getSession: async () => ({ data: { session } }) } };
  const makeClient = (url, key, options) => {
    session = { user: { id: 'bob' }, access_token: 'bob-token' };
    return { rpc(name, params) { args = params; return { async abortSignal() { token = await options.accessToken(); return {data:{cloud_version:1}}; } }; } };
  };
  const adapter = createCloudAdapter(authClient, makeClient, {url:'https://example.invalid',publishableKey:'public-key'});
  await adapter.write({version:1}, 0, 'alice');
  assert.equal(token, 'alice-token'); assert.equal(args.p_expected_version, 0);
  await assert.rejects(() => adapter.write({version:1}, 0, 'alice'), /Account changed/);
});
test('the cloud adapter requires a session and propagates server errors', async () => {
  const authClient = { auth: { getSession: async () => ({ data: { session: null } }) } };
  const adapter = createCloudAdapter(authClient, () => { throw new Error('must not call'); }, {});
  await assert.rejects(() => adapter.read('alice'), /Account changed/);
  authClient.auth.getSession = async () => ({data:{session:{user:{id:'alice'},access_token:'token'}}});
  const failure = createCloudAdapter(authClient, () => ({ from() { return { select() { return this; }, maybeSingle() { return this; }, abortSignal: async () => ({error:new Error('server unavailable')}) }; } }), {});
  await assert.rejects(() => failure.read('alice'), /server unavailable/);
});
test('shared browser storage cannot advance another tab’s unsynced base', async () => {
  const storage = memory(), a = harness({row:null}, storage); await a.sync.tick();
  const b = harness(a.server, storage); b.state = structuredClone(a.state); await b.sync.tick();
  change(a, 'Tab A'); change(b, 'Tab B'); await a.sync.tick(); await b.sync.tick();
  assert.equal(b.sync.status.phase, 'conflict'); assert.equal(a.server.row.payload.name, 'Tab A');
});
