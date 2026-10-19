// Twesk interface entry: page layout, dialog routing, event wiring, and startup.
import * as E from './engine.js?v=0.28.0';
import { flameArt } from './brand-art.js?v=0.28.0';
import { avatarFaceArt } from './art.js?v=0.28.0';
import { awardAchievements } from './achievements.js?v=0.28.0';
import { $, $$, KEY, app, esc, icon, iconButton, persist, toast, today, view } from './ui-core.js?v=0.28.0';
import { dismissStatTooltip, hideStatTooltip, toggleStatTooltip } from './ui-stat-tooltip.js?v=0.28.0';
import { closeModal, openModal } from './ui-modal.js?v=0.28.0';
import * as tasks from './ui-tasks.js?v=0.28.0';
import * as quest from './ui-quest.js?v=0.28.0';
import * as habits from './ui-habits.js?v=0.28.0';
import * as vault from './ui-vault.js?v=0.28.0';
import { vaultArt } from './vault-art.js?v=0.28.0';
import * as character from './ui-character.js?v=0.28.0';
import * as shop from './ui-shop.js?v=0.28.0';
import * as battle from './ui-battle.js?v=0.28.0';
import * as collection from './ui-collection.js?v=0.28.0';
import * as settings from './ui-settings.js?v=0.28.0';
import * as sync from './ui-sync.js?v=0.28.0';
import * as history from './ui-history.js?v=0.28.0';
import { installDelights, renderAmbience } from './ui-delights.js?v=0.28.0';
import { installTagSuggest } from './ui-tag-suggest.js?v=0.28.0';
import { installTaskOrder } from './ui-task-order.js?v=0.28.0';
import * as fullscreen from './ui-fullscreen.js?v=0.28.0';

const features = [tasks, quest, habits, vault, character, shop, battle, collection, settings, history, sync, fullscreen];
const modals = Object.assign({}, ...features.map(f => f.modals));
const actions = Object.assign({}, ...features.map(f => f.actions));
const forms = Object.assign({}, ...features.map(f => f.forms || {}));

function dateLabel() {
  return new Intl.DateTimeFormat('en', {
    timeZone: app.state.settings.timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());
}
// Selector for the same control after a redraw, e.g. [data-action="habit"][data-id="…"].
function controlSelector(el) {
  if (!el?.dataset?.action) return null;
  return ['action', 'id', 'category', 'view', 'project', 'stat']
    .filter(key => el.dataset[key] !== undefined)
    .map(key => `[data-${key}="${CSS.escape(el.dataset[key])}"]`)
    .join('');
}
// Redraws create fresh elements, which would restart looping animations (like the monster's idle
// float) from their first frame. Anchoring them to the page clock keeps each loop's phase continuous.
function syncLoops(root) {
  for (const animation of root.getAnimations?.({ subtree: true }) || [])
    if (animation.effect?.getComputedTiming().iterations === Infinity) animation.startTime = 0;
}
function render() {
  hideStatTooltip();
  // Redrawing replaces the dashboard; keep list scroll positions, the page position, and focus.
  const scrolls = ['.tasks-scroll', '.habits-scroll'].map(selector => [
      selector,
      $(selector)?.scrollTop || 0,
    ]),
    pageY = window.scrollY,
    focused = $('#app').contains(document.activeElement) ? controlSelector(document.activeElement) : null;
  const day = today();
  E.rollover(app.state, day);
  // Older focus lists become one adventure; all other tasks and habits return to their lists.
  E.setCurrentQuest(app.state, (app.state.tasks.find(t => !t.done && t.pinned) || app.state.habits.find(h => h.pinned))?.id || null);
  app.lastDay = day;
  document.documentElement.dataset.theme = app.state.settings.theme;
  document.documentElement.dataset.motion = app.state.settings.reducedMotion ? 'reduced' : 'full';
  const completed = app.state.tasks.filter(t => t.done).length;
  const habitsDone = app.state.habits.filter(
    h => h.category !== 'harm' && h.logs.some(l => l.day === day),
  ).length;
  $('#app').innerHTML = `
    <header class="topbar"><div class="topbar-brand"><a class="wordmark" href="./" aria-label="Twesk home"><span class="logo-mark">${flameArt()}</span>twesk</a><time class="topbar-date" datetime="${day}">${esc(dateLabel())}</time></div>
    <div class="topbar-actions"><button class="capture-button" data-action="capture" aria-label="Quick capture" title="Quick capture (⌘K)" aria-keyshortcuts="Meta+K">${icon('bolt')}<kbd>⌘ K</kbd></button><span class="toolbar-divider"></span><button class="collection-button" data-action="history" title="Progress history" aria-label="Open progress history">${icon('calendar')}</button><button class="collection-button" data-action="achievements" title="Achievements and monster collection" aria-label="Open achievements">${icon('medal')}</button>${iconButton('theme', app.state.settings.theme === 'dark' ? 'sun' : 'moon', 'Switch to ' + (app.state.settings.theme === 'dark' ? 'light' : 'dark') + ' mode')}${iconButton('mute', app.state.settings.muted ? 'mute' : 'sound', app.state.settings.muted ? 'Unmute sounds' : 'Mute sounds')}${fullscreen.fullscreenButton()}${iconButton('settings', 'settings', 'Settings and backup')}<button class="profile-dot" data-action="settings" aria-label="Your profile">${avatarFaceArt(app.state.appearance)}</button></div></header>
    <main>
    ${app.saveError ? '<div class="save-warning">' + esc(app.startupWarning || 'Browser saving is unavailable. Export a backup in Settings to keep your progress.') + '</div>' : E.backupDue(app.state, day) ? settings.backupReminder() : ''}
    <div class="dashboard">
      <section class="panel tasks-panel" aria-labelledby="tasks-heading"><div class="panel-heading"><div><span class="section-kicker">MAKE THINGS HAPPEN</span><h2 id="tasks-heading">Tasks <span class="count">${app.state.tasks.filter(t => !t.done).length}</span></h2></div>${iconButton('new-task', 'plus', 'Add a task')}</div>
      <div class="task-tabs" role="group" aria-label="Task view"><button data-action="task-view" data-view="active" class="${app.taskView === 'active' ? 'selected' : ''}">To do</button><button data-action="task-view" data-view="done" class="${app.taskView === 'done' ? 'selected' : ''}">Completed <span>${completed}</span></button></div>${tasks.renderProjects()}
      <div class="tasks-scroll">${tasks.renderTasks()}</div>
      ${quest.renderQuest()}
      <button class="vault-card" data-action="vault"><span class="vault-symbol">${vaultArt('vault')}</span><span><strong>The Vault</strong><small>${app.state.notes.filter(n => n.status === 'inbox').length ? app.state.notes.filter(n => n.status === 'inbox').length + (app.state.notes.filter(n => n.status === 'inbox').length === 1 ? ' idea waiting to be sorted' : ' ideas waiting to be sorted') : 'A home for thoughts, before they become plans'}</small></span>${icon('arrow')}</button>
      </section>
      <section class="panel habits-panel" aria-labelledby="habits-heading"><div class="panel-heading"><div><span class="section-kicker">GROW AT YOUR OWN PACE</span><h2 id="habits-heading">Habits</h2></div>${iconButton('new-habit', 'plus', 'Add a habit')}</div><div class="habits-scroll">${[...E.CATEGORIES, 'harm'].map(habits.renderCategory).join('')}</div></section>
      <aside class="character-column" aria-label="Your character and adventure">${character.renderCharacter()}${battle.renderMonster()}</aside>
    </div><footer class="app-footer"><button data-action="sync" class="footer-sync"><span class="local-dot"></span><span data-sync-label>${esc(sync.syncLabel())}</span></button><div class="day-summary" aria-label="Daily progress"><span>${icon('check')}<strong>${completed}</strong> tasks cleared</span><span>${icon('leaf')}<strong>${habitsDone}</strong> habits today</span></div><button data-action="vault">Open Vault <kbd>⌘ J</kbd></button></footer></main>`;
  for (const [selector, top] of scrolls) if ($(selector)) $(selector).scrollTop = top;
  if (window.scrollY !== pageY) window.scrollTo(0, pageY);
  if (focused && !app.modal) $(`#app ${focused}`)?.focus({ preventScroll: true });
  syncLoops($('#app'));
  renderAmbience();
  renderModal();
  battle.updateOdds();
}
// Redrawing the same dialog (after buying or equipping, say) keeps its scroll positions and skips the
// arrival animation; a newly opened dialog starts at the top.
let shownModal = null;
const KEEP_SCROLL = ['.modal', '.shop-tabs'];
function renderModal() {
  $('#app').inert = !!app.modal;
  if (!app.modal) {
    $('#overlay').innerHTML = '';
    document.body.classList.remove('modal-open');
    shownModal = null;
    return;
  }
  document.body.classList.add('modal-open');
  const same = shownModal === app.modal,
    kept = same ? KEEP_SCROLL.map(sel => [sel, $(`#overlay ${sel}`)?.scrollTop || 0, $(`#overlay ${sel}`)?.scrollLeft || 0]) : [];
  $('#overlay').innerHTML = modals[app.modal.type]?.() ?? '';
  shownModal = app.modal;
  if (same) $('#overlay .modal')?.classList.add('redrawn');
  for (const [sel, top, left] of kept) {
    const el = $(`#overlay ${sel}`);
    if (el) Object.assign(el, { scrollTop: top, scrollLeft: left });
  }
  syncLoops($('#overlay'));
}
installTagSuggest();
installTaskOrder();
fullscreen.installFullscreen();
quest.installQuest();
installDelights();
Object.assign(view, { render, renderModal, finishBattlePlayback: battle.finishBattlePlayback });

function handleClick(event) {
  const b = event.target.closest('[data-action]');
  if (!b) return;
  if (b.dataset.action === 'dismiss' && event.target !== b) return;
  const a = b.dataset.action,
    id = b.dataset.id,
    sourceRect = b.getBoundingClientRect();
  if (app.busy && !['skip-battle', 'close-modal', 'dismiss', 'battle-mute'].includes(a)) return;
  if (app.taskDragging) return;
  if (a === 'close-modal' || a === 'dismiss') return closeModal();
  if (a === 'stat-info') return toggleStatTooltip(b);
  actions[a]?.(b, { a, id, sourceRect });
}
$('#app').addEventListener('click', handleClick);
$('#overlay').addEventListener('click', handleClick);
$('#overlay').addEventListener('submit', event => {
  event.preventDefault();
  if (app.busy) return;
  forms[event.target.id]?.(new FormData(event.target));
});
$('#overlay').addEventListener('keydown', event => {
  if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.isComposing || event.defaultPrevented) return;
  const form = event.target.closest?.('#task-form, #capture-form');
  if (!form) return;
  event.preventDefault();
  const submit = form.querySelector('button[type="submit"]');
  if (!event.repeat && !app.busy && submit && !submit.disabled) form.requestSubmit(submit);
});
$('#overlay').addEventListener('input', event => vault.onInput(event));
$('#overlay').addEventListener('change', event => {
  habits.onChange(event);
  collection.onChange(event);
  settings.onChange(event);
});
document.addEventListener('keydown', event => {
  collection.onKeydown(event);
  vault.onKeydown(event);
  history.onKeydown(event);
  shop.onKeydown(event);
  character.onKeydown(event);
});
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (!app.busy) openModal({ type: 'capture', kind: 'note' });
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
    event.preventDefault();
    if (!app.busy) openModal({ type: 'vault' });
  }
  if (event.key === 'Escape') {
    if (dismissStatTooltip()) {
      event.preventDefault();
      return;
    }
    closeModal();
  }
  if (event.key === 'Tab' && app.modal) {
    const focusable = $$(
      '#overlay button:not([disabled]),#overlay input:not([hidden]):not([disabled]),#overlay textarea,#overlay select:not([disabled]),#overlay a[href]',
    ).filter(e => e.offsetParent !== null);
    const first = focusable[0],
      last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
});
window.addEventListener('storage', event => {
  if (event.key !== KEY || !event.newValue) return;
  if (sync.hasPendingSync()) {
    toast('Another tab changed progress. This tab’s pending changes are kept; open Sync to review.');
    return;
  }
  if (app.busy) {
    toast('Progress changed in another tab. Finish this encounter, then reload to use that save.');
    return;
  }
  try {
    const incoming = E.validateState(JSON.parse(event.newValue));
    if (incoming.revision > app.state.revision) {
      app.state = incoming;
      render();
      toast('Progress updated from another tab.');
    }
  } catch {}
});
setInterval(() => {
  if (!app.busy && !app.modal && today() !== app.lastDay) {
    E.rollover(app.state, today());
    persist();
    render();
  }
}, 30000);
window.addEventListener('focus', () => {
  if (!app.busy && !app.modal && today() !== app.lastDay) {
    E.rollover(app.state, today());
    persist();
    render();
  }
});
awardAchievements(app.state, today());
render();
if (!app.protectSave) persist();
sync.installSync();
// Offline support for the installed app (Add to Dock / Install). Skipped in the single-file Twesk.html.
if ('serviceWorker' in navigator && !window.__TWESK_STANDALONE__ && location.protocol.startsWith('http')) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker
    .register('./sw.js', { updateViaCache: 'none' })
    .then(registration => {
      // Check for a newer version whenever the app comes back into view (it updates only if the server is up).
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => {});
      });
    })
    .catch(() => {});
  // A new version took over while this page was open: offer a reload instead of switching mid-task.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || $('#update-ready')) return;
    const note = document.createElement('div');
    note.id = 'update-ready';
    note.className = 'toast update-ready';
    note.setAttribute('role', 'status');
    note.textContent = 'A new version of Twesk is ready.';
    const reload = document.createElement('button');
    reload.textContent = 'Reload';
    reload.onclick = () => location.reload();
    note.append(reload);
    $('#toasts').append(note);
  });
}
