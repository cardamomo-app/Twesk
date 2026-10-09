// Shared interface foundation: the app store, saving, small HTML helpers, and toasts.
import * as E from './engine.js?v=0.13.1';
import { goldArt } from './art.js?v=0.13.1';
import { HABIT_ICONS } from './habit-icons.js?v=0.13.1';
export const $ = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];
export const esc = v =>
  String(v ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const KEY = 'twesk.v1';

// View state that resets with a new adventure.
export function viewDefaults() {
  return {
    taskView: 'active',
    taskProject: null,
    vaultFilter: 'inbox',
    vaultSearch: '',
    vaultTag: null,
    vaultSelected: new Set(),
    modal: null,
    pendingImport: null,
    pendingBadges: [],
    openCategories: new Set(['body']),
    chance: null,
    chanceKey: '',
    shopCategory: 'weapon',
    collectionTab: 'seals',
    sealFilter: 'all',
    earnedOnly: false,
    monsterChapter: 1,
    selectedMonster: 1,
    avatarAngle: -0.45,
    avatarZoom: 1,
    avatarPreview: null,
    historyMonth: null,
    historyDay: null,
  };
}
// Everything the interface shares. Modules read and assign app.state, app.modal, etc.
export const app = {
  state: null,
  rawSave: null,
  saveError: false,
  startupWarning: '',
  protectSave: false,
  busy: false,
  lastDay: '',
  ...viewDefaults(),
};
// Top-level views, registered by app.js so feature modules can redraw without importing it.
export const view = { render() {}, renderModal() {}, finishBattlePlayback() {} };

try {
  app.rawSave = localStorage.getItem(KEY);
  app.state = app.rawSave ? E.validateState(JSON.parse(app.rawSave)) : E.freshState();
} catch {
  app.state = E.freshState();
  app.startupWarning =
    'Your previous save could not be read. It has been left untouched. Export a backup before replacing it.';
  app.saveError = true;
}
app.protectSave = !!app.startupWarning;
export const today = () => E.dateKey(new Date(), app.state.settings.timezone);
if (!app.state.settings.lastBackup && !app.state.settings.backupNudge)
  app.state.settings.backupNudge = today();
export function persist() {
  app.state.revision = (app.state.revision || 0) + 1;
  if (app.protectSave) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(app.state));
    app.saveError = false;
  } catch {
    app.saveError = true;
    toast('Saving is unavailable. Export a backup to keep your progress.');
  }
}
const icons = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  vault: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M3 5h18M9 10h6m-3 0v5"/>',
  moon: '<path d="M20 14a8 8 0 0 1-10-10 8 8 0 1 0 10 10Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',
  sound: '<path d="m10 5-5 4H2v6h3l5 4ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m10 5-5 4H2v6h3l5 4ZM16 9l6 6m0-6-6 6"/>',
  settings:
    '<path d="m9 3-1 3-3 1v4l-2 1 2 2v3l3 1 1 3h5l1-3 3-1v-3l3-2-3-1V7l-3-1-1-3Z"/><circle cx="11.5" cy="12" r="3"/>',
  body: '<path d="M4 8v8m3-10v12m10-12v12m3-10v8M7 12h10"/>',
  mind: '<path d="M4 5h6l2 2 2-2h6v14h-6l-2 2-2-2H4ZM12 7v14"/>',
  soul: '<path d="M12 3c1 5 4 8 9 9-5 1-8 4-9 9-1-5-4-8-9-9 5-1 8-4 9-9Z"/>',
  heart: '<path d="M20 5c-3-3-7-1-8 1-1-2-5-4-8-1-5 5 3 11 8 15 5-4 13-10 8-15Z"/>',
  harm: '<path d="m13 2-8 12h6l-1 8 9-13h-7Z"/>',
  coin: '<circle cx="12" cy="12" r="8"/><path d="M12 7v10m3-8h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9"/>',
  sword: '<path d="m16 3 5 0v5L9 20l-5-5ZM3 12l9 9M4 20l-2 2"/>',
  pet: '<ellipse cx="12" cy="16" rx="5" ry="4"/><circle cx="5" cy="9" r="2"/><circle cx="10" cy="5" r="2"/><circle cx="16" cy="6" r="2"/><circle cx="20" cy="11" r="2"/>',
  medal:
    '<path d="m7 3 5 7 5-7M4 3h5l3 4 3-4h5l-5 9H9Z"/><path d="m12 10 3 2 4 1v4l-3 4h-8l-3-4v-4l4-1ZM12 14v4m-2-2h4"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/>',
  leaf: '<path d="M20 3c0 13-4 17-11 14C3 14 6 5 20 3ZM4 21 17 8"/>',
  pencil: '<path d="m16 3 5 5L8 21H3v-5ZM13 6l5 5"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  undo: '<path d="M9 4 3 10l6 6M3 10h11a6 6 0 0 1 0 12"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  merge: '<path d="M6 3v5a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3M12 14v7m-3-3 3 3 3-3"/>',
  calendar:
    '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4m6-4v4M8 14h2m4 0h2m-8 3h2"/>',
  helmet: '<path d="M4 15a8 8 0 0 1 16 0v2H4ZM12 7V4M4 17h16l-1 3H5Z"/>',
  sparkle: '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2ZM19 3v4M17 5h4"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  pin: '<path d="M9 3h6l-1 6 4 4H6l4-4ZM12 13v8"/>',
  repeat: '<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-5v2a3 3 0 0 1-3 3H3"/>',
};
export function icon(name, cls = '') {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || HABIT_ICONS.find(i => i.id === name)?.path || icons.soul}</svg>`;
}
export function iconButton(action, name, label, extra = '') {
  return `<button class="icon-button" data-action="${action}" title="${esc(label)}" aria-label="${esc(label)}" ${extra}>${icon(name)}</button>`;
}
export function coin(n, voxel = false) {
  return `<span class="gold-value ${voxel ? 'voxel-gold-value' : ''}" ${voxel ? `title="${esc(n)} gold"` : ''}>${voxel ? goldArt(n) : icon('coin')}<span>${esc(n)}</span></span>`;
}
export function modalShell(title, body, cls = '', subtitle = '') {
  return `<div class="scrim" data-action="dismiss"><section class="modal ${cls}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-header"><div><h2 id="modal-title">${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div>${iconButton('close-modal', 'close', 'Close')}</header>${body}</section></div>`;
}
export function toast(text, action = null) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  if (action) {
    const b = document.createElement('button');
    b.textContent = 'Undo';
    b.onclick = () => {
      action();
      el.remove();
    };
    el.append(b);
  }
  $('#toasts').append(el);
  while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove();
  setTimeout(() => el.remove(), 6500);
}
