// Account controls and the browser adapter for the independently tested sync engine.
import * as E from './engine.js?v=0.42.0';
import { createCloudAdapter } from './sync-remote.js?v=0.42.0';
import { createSync } from './sync-engine.js?v=0.42.0';
import { SYNC_CONFIG } from './sync-config.js?v=0.42.0';
import { PREVIOUS_SAVE_KEY, replaceSave } from './save-recovery.js?v=0.42.0';
import { $, KEY, app, esc, icon, modalShell, toast, view, viewDefaults } from './ui-core.js?v=0.42.0';
import { openModal } from './ui-modal.js?v=0.42.0';

let client = null, coordinator = null, user = null, timer = null, authBusy = false, emailSent = '', authMessage = '';
let phase = 'signed-out', message = '';
export const syncConfigured = () => !!SYNC_CONFIG.url && !!SYNC_CONFIG.publishableKey && !window.__TWESK_STANDALONE__;
const labels = { 'signed-out': 'Saved on this device', pending: 'Changes waiting to sync', syncing: 'Syncing…', synced: 'Synced', conflict: 'Choose progress to sync', error: 'Saved here · sync needs attention', offline: 'Offline · saved on this device' };
export const hasPendingSync = () => !!user && phase !== 'synced';
export function syncLabel() { return app.saveError ? 'Save unavailable' : labels[phase] || labels['signed-out']; }
export function syncSettings() {
  return `<div class="backup-box"><h3>${icon('cloud')}Sync across devices</h3><p>Keep your tasks, habits, character, and Vault together on desktop and mobile. Works offline, then catches up when you reconnect.</p><div class="backup-actions sync-settings-actions"><button type="button" class="button secondary" data-action="sync">${icon('cloud')}${user ? 'Manage sync' : 'Set up sync'}</button><span class="sync-settings-status" data-sync-label>${esc(syncLabel())}</span></div></div>`;
}
function updateStatus(next) {
  phase = navigator.onLine === false && user ? 'offline' : next.phase;
  message = next.message;
  for (const el of document.querySelectorAll('[data-sync-label]')) el.textContent = syncLabel();
  const details = $('#sync-details');
  if (details) details.innerHTML = syncDetails();
}
function syncDetails() {
  return `<p class="sync-status" role="status">${esc(syncLabel())}</p>${message && app.modal?.type !== 'sync-conflict' ? `<p class="form-help">${esc(message)}</p>` : ''}${coordinator?.conflict && app.modal?.type !== 'sync-conflict' ? '<button type="button" class="button primary" data-action="sync-conflict">Review both adventures</button>' : ''}`;
}
function schedule(delay = 1200) {
  clearTimeout(timer);
  if (!user) return;
  if (!coordinator?.conflict) updateStatus({ phase: 'pending', message: '' });
  timer = setTimeout(() => run(), delay);
}
async function run() {
  if (!user || !coordinator) return;
  if (navigator.onLine === false) { updateStatus({ phase: 'offline', message: '' }); return; }
  await coordinator.tick();
}
function summary(state, title) {
  if (!state) return `<div class="sync-copy"><h3>${title}</h3><p>No adventure saved yet.</p></div>`;
  return `<div class="sync-copy"><h3>${title}</h3><strong>${esc(state.name)}</strong><p>${state.tasks.filter(t => t.done).length} tasks completed · ${state.notes.length} Vault entries</p><p>${state.gold} gold · Monster ${state.monster.number}</p><p>${E.CATEGORIES.map(c => `${esc(c[0].toUpperCase() + c.slice(1))} ${E.level(state, c)}`).join(' · ')}</p></div>`;
}
function download(state, label) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `twesk-${label}-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const modals = {
  sync() {
    let content;
    if (!syncConfigured()) content = `<p>${window.__TWESK_STANDALONE__ ? 'Open the online app to use account sync. You can import your backup there.' : 'Account sync is being connected. Your progress is still saved on this device.'}</p><a class="button primary" href="https://cardamomo-app.github.io/Twesk/">Open online Twesk</a>`;
    else if (user) content = `<p>Signed in as <strong>${esc(user.email)}</strong></p><div id="sync-details">${syncDetails()}</div><p class="form-help">Your adventure is private to your account. Sound, theme, and motion preferences stay on each device. Backups remain available in Settings.</p><div class="backup-actions"><button class="button primary" data-action="sync-now">Sync now</button><button class="button secondary" data-action="sync-signout">Sign out on this device</button></div><p class="form-help">Signing out keeps this device’s progress. Sign out on shared devices when you’re finished.</p>`;
    else content = `<p>Sign in with the same email on each device. Your existing adventure stays here until you sign in.</p><form id="sync-email-form"><label>Email<input name="email" type="email" autocomplete="email" required maxlength="254" value="${esc(emailSent)}" autofocus></label><button class="button primary" ${authBusy ? 'disabled' : ''}>${authBusy ? 'Sending…' : emailSent ? 'Send another sign-in link' : 'Email me a sign-in link'}</button></form>${emailSent ? '<p class="form-help">Check your inbox and open the sign-in link on this device.</p>' : ''}`;
    return modalShell('Your adventure, everywhere', `<div class="form-body sync-body">${content}<p id="sync-auth-message" class="form-help" role="status">${esc(authMessage)}</p></div>`);
  },
  'sync-conflict'() {
    const conflict = coordinator?.conflict;
    if (!conflict) return modals.sync();
    return modalShell('Choose the adventure to continue', `<div class="form-body sync-body"><p>${esc(conflict.reason)} The copies are kept separate so rewards and progress aren’t counted twice.</p><div class="sync-copies">${summary(app.state, 'This device')}${summary(conflict.row?.payload, 'Your account')}</div><p class="form-help">The copy you replace stays recoverable in Settings → Restore previous progress. You can also download either copy first.</p><div class="backup-actions"><button class="button secondary" data-action="sync-export-local">Download this device’s copy</button>${conflict.row ? '<button class="button secondary" data-action="sync-export-cloud">Download account copy</button>' : ''}</div><div id="sync-details">${syncDetails()}</div><div class="form-actions"><button class="button secondary" data-action="sync-use-local">Use this device’s progress</button>${conflict.row ? '<button class="button primary" data-action="sync-use-cloud">Use account progress</button>' : ''}</div></div>`, 'sync-conflict-modal');
  },
};
async function resolve(choice) {
  if (authBusy || !coordinator) return;
  authBusy = true;
  for (const button of document.querySelectorAll('#overlay button')) button.disabled = true;
  // The coordinator is permitted to replace a save only from this explicit review dialog.
  await coordinator.resolve(choice);
  authBusy = false;
  if (!coordinator.conflict) { openModal({ type: 'sync' }); toast('Adventure synced. The other copy is recoverable in Settings.'); }
  else view.renderModal();
}
export const actions = {
  sync() { authMessage = ''; openModal({ type: 'sync' }); run(); },
  'sync-now'() { run(); },
  'sync-conflict'() { openModal({ type: 'sync-conflict' }); },
  'sync-export-local'() { download(app.state, 'device'); },
  'sync-export-cloud'() { if (coordinator?.conflict?.row) download(coordinator.conflict.row.payload, 'account'); },
  'sync-use-local'() { resolve('local'); },
  'sync-use-cloud'() { resolve('cloud'); },
  async 'sync-signout'() {
    if (authBusy) return;
    authBusy = true;
    const { error } = await client.auth.signOut({ scope: 'local' });
    authBusy = false;
    if (error) toast('Couldn’t sign out. Please try again.');
    else { user = null; coordinator.setUser(null); emailSent = ''; openModal({ type: 'sync' }); }
  },
};
export const forms = {
  async 'sync-email-form'(data) {
    if (!client || authBusy) return;
    const email = String(data.get('email')).trim();
    authBusy = true; authMessage = ''; view.renderModal();
    try {
      const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: new URL('./', location.href).href } });
      if (error) throw error;
      emailSent = email; authMessage = 'Sign-in email sent. The link expires after an hour.';
    } catch { authMessage = 'Couldn’t send a sign-in email. Check the address and connection, then try again in a minute.'; }
    authBusy = false; if (app.modal?.type === 'sync') view.renderModal();
  },
};
export function installSync() {
  if (!syncConfigured()) return;
  try {
    client = window.supabase.createClient(SYNC_CONFIG.url, SYNC_CONFIG.publishableKey, {
      auth: { storageKey: 'twesk.auth.v1', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    coordinator = createSync({
      storage: localStorage,
      remote: createCloudAdapter(client, window.supabase.createClient, SYNC_CONFIG),
      getState: () => app.state,
      validate: E.validateState,
      canApply: () => !app.busy && !app.taskDragging && !app.protectSave && !app.saveError && (!app.modal || ['sync', 'sync-conflict'].includes(app.modal.type)),
      preserve: state => localStorage.setItem(PREVIOUS_SAVE_KEY, JSON.stringify(state)),
      apply: next => {
        replaceSave(localStorage, JSON.stringify(app.state), next);
        const modal = app.modal;
        Object.assign(app, viewDefaults(), { state: next, rawSave: JSON.stringify(next), modal });
        view.render();
        // Render may perform the daily rollover. Persist it and sync it next time.
        localStorage.setItem(KEY, JSON.stringify(app.state));
        toast('Progress updated from your account.');
      },
      onStatus: updateStatus,
      lock: fn => navigator.locks ? navigator.locks.request('twesk-cloud-sync', fn) : fn(),
    });
    client.auth.onAuthStateChange((event, session) => {
      user = session?.user || null;
      if (user) authMessage = '';
      coordinator.setUser(user?.id || null);
      // Supabase auth callbacks must return without waiting on further auth/database calls.
      setTimeout(() => {
        if (app.modal?.type === 'sync') view.renderModal();
        if (user) schedule(0);
      }, 0);
    });
    view.saved = () => schedule();
    view.modalClosed = () => { if (user && phase !== 'synced') schedule(0); };
    window.addEventListener('online', () => schedule(0));
    window.addEventListener('offline', () => updateStatus({ phase: 'offline', message: '' }));
    window.addEventListener('focus', () => run());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run(); });
    setInterval(() => { if (document.visibilityState === 'visible') run(); }, 20000);
  } catch { updateStatus({ phase: 'error', message: 'Sync could not start. Your progress is still on this device.' }); }
}
