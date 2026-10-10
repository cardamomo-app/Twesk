// Whole-save synchronization with optimistic concurrency. Cloud versions are independent
// of the local revision counter. Concurrent adventures always require an explicit choice.
export const SYNC_META_KEY = 'twesk.sync.v1';
const DEVICE_SETTINGS = ['theme', 'muted', 'reducedMotion', 'lastBackup', 'backupNudge'];
export function cloudState(state) {
  const next = structuredClone(state);
  next.revision = 0;
  Object.assign(next.settings, { theme: 'light', muted: false, reducedMotion: false, lastBackup: null, backupNudge: null });
  return next;
}
export function withDeviceSettings(remote, local) {
  const next = structuredClone(remote);
  for (const key of DEVICE_SETTINGS) next.settings[key] = local.settings[key];
  next.revision = Math.max(local.revision || 0, remote.revision || 0) + 1;
  return next;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
export async function fingerprint(state) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(cloudState(state))));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
export function createSync({ storage, remote, getState, validate, apply, preserve, canApply, onStatus = () => {}, lock = fn => fn() }) {
  let user = null, epoch = 0, running = false, conflict = null;
  const status = { phase: 'signed-out', message: '', lastSynced: null };
  const report = (phase, message = '') => { Object.assign(status, { phase, message }); onStatus({ ...status }); };
  const readMeta = () => JSON.parse(storage.getItem(SYNC_META_KEY) || '{}');
  // Keep this tab's last acknowledged base. Another tab's bookkeeping cannot
  // advance the base underneath this tab's unsynced adventure.
  let deviceMeta = readMeta();
  const saveMeta = (id, version, hash) => {
    const meta = readMeta();
    meta.owner = id;
    meta.accounts = { ...meta.accounts, [id]: { version, hash } };
    storage.setItem(SYNC_META_KEY, JSON.stringify(meta));
    deviceMeta = structuredClone(meta);
    status.lastSynced = new Date().toISOString();
  };
  const checked = row => {
    if (!row) return null;
    if (!Number.isSafeInteger(row.cloud_version) || row.cloud_version < 1) throw new Error('The cloud save has an invalid version.');
    return { ...row, payload: validate(structuredClone(row.payload)) };
  };
  const showConflict = (row, reason) => {
    conflict = { row, reason };
    report('conflict', reason);
  };
  const tick = async () => {
    if (!user || running || conflict) return;
    if (!canApply()) { report('pending', 'Waiting for you to finish here.'); return; }
    running = true;
    const id = user, turn = epoch;
    const current = () => user === id && epoch === turn;
    try {
      await lock(async () => {
        if (!current() || !canApply()) return;
        report('syncing');
        const meta = deviceMeta, base = meta.accounts?.[id];
        const row = checked(await remote.read(id));
        if (!current()) return;
        if (!canApply()) { report('pending', 'Waiting for you to finish here.'); return; }
        const local = structuredClone(getState()), hash = await fingerprint(local);
        if (!current()) return;
        const remoteHash = row ? await fingerprint(row.payload) : null;
        if (!current() || !canApply()) { if (current()) report('pending'); return; }
        // A local edit during hashing must be considered on the next pass.
        if (hash !== await fingerprint(getState())) { if (current()) report('pending'); return; }
        if (!current() || !canApply()) { if (current()) report('pending'); return; }
        if (row && hash === remoteHash) {
          saveMeta(id, row.cloud_version, hash); report('synced'); return;
        }
        if (meta.owner && meta.owner !== id) {
          showConflict(row, 'This device has progress from another account. Choose what to use.'); return;
        }
        if (row && base && row.cloud_version < base.version) {
          showConflict(row, 'Your account contains an earlier cloud save. Choose the adventure to continue.'); return;
        }
        if (row && (!base || base.version !== row.cloud_version)) {
          if (base && hash === base.hash) {
            // Replace locally before acknowledging this version. If storage fails, the
            // previous base remains intact and a retry cannot upload stale progress.
            await apply(withDeviceSettings(row.payload, getState()));
            if (!current()) return;
            saveMeta(id, row.cloud_version, remoteHash);
            report('synced');
          } else showConflict(row, base ? 'Both devices have made changes.' : 'This device and your account have different adventures.');
          return;
        }
        if (!row && base) { showConflict(null, 'The previous cloud save is no longer available.'); return; }
        const result = checked(await remote.write(cloudState(local), row?.cloud_version || 0, id));
        if (!current()) return;
        if (result.conflict) { showConflict(result, 'Another device saved while this one was syncing.'); return; }
        saveMeta(id, result.cloud_version, hash);
        const unchanged = hash === await fingerprint(getState());
        if (current()) report(unchanged ? 'synced' : 'pending');
      });
    } catch (error) {
      if (current()) report('error', error?.status === 401 ? 'Please sign in again. Your progress is still on this device.' : 'Couldn’t sync. Your progress is still on this device; we’ll retry.');
    } finally { running = false; }
  };
  return {
    status,
    get conflict() { return conflict; },
    setUser(id) { if (user === id) return; user = id; epoch++; conflict = null; status.lastSynced = null; report(id ? 'pending' : 'signed-out'); },
    async tick() { await tick(); },
    async resolve(choice) {
      if (!conflict || !user || running || !canApply()) return;
      running = true;
      const selected = conflict, id = user, turn = epoch;
      try {
        await lock(async () => {
          if (turn !== epoch || id !== user || !canApply()) return;
          const latest = checked(await remote.read(id));
          if (turn !== epoch || id !== user || !canApply()) return;
          if ((latest?.cloud_version || 0) !== (selected.row?.cloud_version || 0)) {
            showConflict(latest, 'The cloud adventure changed again. Please review the newer copy.'); return;
          }
          if (choice === 'cloud') {
            if (!latest) throw new Error('No cloud adventure to restore.');
            const hash = await fingerprint(latest.payload);
            if (turn !== epoch || id !== user || !canApply()) return;
            await apply(withDeviceSettings(latest.payload, getState()));
            if (turn !== epoch || id !== user) return;
            saveMeta(id, latest.cloud_version, hash);
            conflict = null; report('synced');
          } else if (choice === 'local') {
            // Keep the displaced cloud adventure recoverable before replacing it.
            if (latest) await preserve(latest.payload);
            const local = structuredClone(getState()), hash = await fingerprint(local);
            if (turn !== epoch || id !== user) return;
            const result = checked(await remote.write(cloudState(local), latest?.cloud_version || 0, id));
            if (turn !== epoch || id !== user) return;
            if (result.conflict) { showConflict(result, 'Another device saved while this one was syncing.'); return; }
            saveMeta(id, result.cloud_version, hash);
            conflict = null;
            const unchanged = hash === await fingerprint(getState());
            if (turn === epoch && id === user) report(unchanged ? 'synced' : 'pending');
          }
        });
      } catch {
        if (turn === epoch) report('error', 'Couldn’t save your choice. Both adventures have been kept. Try again when storage and your connection are available.');
      } finally { running = false; }
    },
  };
}
