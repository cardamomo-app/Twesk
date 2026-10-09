// Settings, backups, and full reset/restore.
import * as E from './engine.js?v=0.14.0';
import { PREVIOUS_SAVE_KEY, resetProgress, restorePreviousProgress } from './save-recovery.js?v=0.14.0';
import {
  $,
  app,
  esc,
  icon,
  modalShell,
  persist,
  toast,
  today,
  view,
  viewDefaults,
} from './ui-core.js?v=0.14.0';
import { closeModal, commit, openModal } from './ui-modal.js?v=0.14.0';
function backupStatus() {
  const last = app.state.settings.lastBackup;
  if (!last) return 'No backup exported from this browser yet.';
  const days = E.daysBetween(last, today());
  return `Last backup: ${days <= 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago'}.`;
}
export function backupReminder() {
  const message = app.state.settings.lastBackup
    ? `It’s been ${E.daysBetween(app.state.settings.lastBackup, today())} days since your last backup.`
    : 'Your progress lives only in this browser. Export a backup file to keep it safe.';
  return `<div class="backup-nudge" role="status"><p>${icon('download')}<span>${message}</span></p><div class="backup-nudge-actions"><button class="button secondary" data-action="export">Export backup</button><button class="text-button" data-action="backup-later">Remind me next week</button></div></div>`;
}
function resetSettings() {
  let canRestore = false;
  try {
    canRestore = !!localStorage.getItem(PREVIOUS_SAVE_KEY);
  } catch {}
  return `<div class="backup-box reset-box"><h3>Start over</h3><p>Return to the beginning. A previous save stays available here for recovery.</p><div class="backup-actions"><button type="button" class="button danger" data-action="reset-progress">Reset progress</button>${canRestore ? '<button type="button" class="button secondary" data-action="restore-previous">Restore previous progress</button>' : ''}</div></div>`;
}
function exportBackup() {
  if (!app.protectSave) {
    app.state.settings.lastBackup = today();
    persist();
    view.render();
    const status = $('#backup-status');
    if (status) status.textContent = backupStatus();
  }
  const blob = new Blob([app.protectSave && app.rawSave ? app.rawSave : JSON.stringify(app.state, null, 2)], {
      type: 'application/json',
    }),
    url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  link.download = `twesk-${app.protectSave ? 'original-save' : 'backup'}-${today()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Backup exported. Keep it somewhere safe.');
}
const resetOrRestore = (b, { a }) => {
  try {
    const next =
      a === 'confirm-reset'
        ? resetProgress(localStorage, app.state, app.protectSave ? app.rawSave : null)
        : restorePreviousProgress(localStorage, app.state);
    Object.assign(app, viewDefaults(), {
      state: next,
      rawSave: JSON.stringify(next),
      protectSave: false,
      startupWarning: '',
      saveError: false,
      monsterChapter: Math.ceil(next.monster.number / 8),
      selectedMonster: next.monster.number,
    });
    $('#toasts').replaceChildren();
    $('#effects').replaceChildren();
    view.render();
    $('[data-action="settings"]')?.focus();
    toast(
      a === 'confirm-reset'
        ? 'New adventure started. Previous progress is recoverable in Settings.'
        : 'Previous progress restored.',
    );
  } catch (error) {
    toast(error.message || 'Progress could not be saved. Your adventure has not been reset.');
  }
};
export const modals = {
  settings() {
    return modalShell(
      'Make yourself at home',
      `<form id="settings-form" class="form-body"><label>Your adventurer’s name<input name="name" required maxlength="40" value="${esc(app.state.name)}"></label><label>Your timezone<input name="timezone" list="timezones" required value="${esc(app.state.settings.timezone)}"><datalist id="timezones">${[...new Set([E.deviceTimezone(), 'Atlantic/Madeira', 'Europe/London', 'Europe/Lisbon', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Australia/Sydney', 'UTC'])].map(z => `<option value="${z}">`).join('')}</datalist></label><p class="form-help">Habits become available again at midnight here. No schedules and no damage for missed days.${app.state.settings.timezone !== E.deviceTimezone() ? ` <button type="button" class="text-button" data-action="use-device-timezone">Use this device’s timezone (${esc(E.deviceTimezone())})</button>` : ''}</p><label class="checkbox-label"><input type="checkbox" name="muted" ${app.state.settings.muted ? 'checked' : ''}>Mute little reward sounds</label><label class="checkbox-label"><input type="checkbox" name="reduced" ${app.state.settings.reducedMotion ? 'checked' : ''}>Reduce motion</label><div class="backup-box"><h3>Your progress stays on this device</h3><p>Back it up before clearing browser data or moving to another browser. There are no accounts or syncing yet.</p><p class="backup-status" id="backup-status">${backupStatus()}</p><div class="backup-actions"><button type="button" class="button secondary" data-action="export">${icon('download')}Export backup</button><button type="button" class="button secondary" data-action="import">${icon('upload')}Import backup</button></div><input type="file" id="import-file" accept="application/json,.json" hidden></div>${resetSettings()}${app.protectSave ? '<p class="save-warning">The old save is protected. Saving these settings will begin a new save and replace it.</p>' : ''}<div class="form-actions"><span class="small-label">TWESK · MVP 0.1</span><button class="button primary">Save settings</button></div></form>`,
    );
  },
  'confirm-import'() {
    return modalShell(
      'Restore this backup?',
      `<div class="form-body"><p>This replaces the progress currently on this device with <strong>${esc(app.pendingImport?.name)}’s</strong> backup.</p><p>You can export your current progress first.</p><div class="form-actions"><button class="button secondary" data-action="export">Export current progress</button><button class="button primary" data-action="confirm-import">Restore backup</button></div></div>`,
    );
  },
  'confirm-reset'() {
    return modalShell(
      'Start a new adventure?',
      `<div class="form-body"><p>This resets your character, tasks, habits, Vault, equipment, gold, and achievements.</p><p>You’ll start at level 1 with full health and Mossling as your first opponent. Your current progress will be kept in Settings → Restore previous progress.</p><div class="backup-actions"><button class="button secondary" data-action="export">${icon('download')}Export backup</button></div><div class="form-actions"><button class="button secondary" data-action="settings">Keep current progress</button><button class="button danger" data-action="confirm-reset">Reset progress</button></div></div>`,
    );
  },
  'confirm-previous'() {
    return modalShell(
      'Restore previous progress?',
      `<div class="form-body"><p>Replace this adventure with the save kept before your last reset or restore. Your current adventure will become the recoverable previous save.</p><div class="form-actions"><button class="button secondary" data-action="settings">Keep current progress</button><button class="button primary" data-action="confirm-previous">Restore previous progress</button></div></div>`,
    );
  },
};
export const actions = {
  theme(b, { a, id, sourceRect }) {
    commit(() => {
      app.state.settings.theme = app.state.settings.theme === 'light' ? 'dark' : 'light';
    });
  },
  mute(b, { a, id, sourceRect }) {
    commit(() => {
      app.state.settings.muted = !app.state.settings.muted;
    });
  },
  settings(b, { a, id, sourceRect }) {
    openModal({ type: 'settings' });
  },
  'reset-progress'(b, { a, id, sourceRect }) {
    openModal({ type: 'confirm-reset' });
  },
  'restore-previous'(b, { a, id, sourceRect }) {
    openModal({ type: 'confirm-previous' });
  },
  'confirm-reset': resetOrRestore,
  'confirm-previous': resetOrRestore,
  export(b, { a, id, sourceRect }) {
    exportBackup();
  },
  'backup-later'(b, { a, id, sourceRect }) {
    commit(() => {
      app.state.settings.backupNudge = today();
    });
    toast('I’ll remind you again next week.');
  },
  'use-device-timezone'(b, { a, id, sourceRect }) {
    const input = $('#settings-form [name="timezone"]');
    input.value = E.deviceTimezone();
    input.focus();
    b.remove();
  },
  import(b, { a, id, sourceRect }) {
    $('#import-file').click();
  },
  'confirm-import'(b, { a, id, sourceRect }) {
    app.state = app.pendingImport;
    app.pendingImport = null;
    app.protectSave = false;
    app.startupWarning = '';
    persist();
    app.modal = null;
    app.chanceKey = '';
    view.render();
    toast('Backup restored. Welcome back.');
  },
};
export const forms = {
  'settings-form'(data) {
    const name = data.get('name').trim(),
      timezone = data.get('timezone').trim();
    if (!name) return;
    try {
      E.dateKey(new Date(), timezone);
    } catch {
      toast('Use a timezone such as Atlantic/Madeira or America/New_York.');
      return;
    }
    app.protectSave = false;
    app.startupWarning = '';
    commit(() => {
      app.state.name = name;
      app.state.settings.timezone = timezone;
      app.state.settings.muted = !!data.get('muted');
      app.state.settings.reducedMotion = !!data.get('reduced');
    });
    closeModal();
    toast('Made a little more yours.');
  },
};
export async function onChange(event) {
  if (event.target.id === 'import-file') {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 5e6) throw new Error('Choose a backup smaller than 5 MB.');
      app.pendingImport = E.validateState(JSON.parse(await file.text()));
      openModal({ type: 'confirm-import' });
    } catch (error) {
      toast(
        error.message === 'Unexpected end of JSON input' ? 'This backup could not be read.' : error.message,
      );
    }
  }
}
