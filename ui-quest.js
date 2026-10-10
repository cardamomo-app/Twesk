// One task, a little trail, and a device-local focus timer.
import * as E from './engine.js?v=0.19.1';
import * as T from './quest-timer.js?v=0.19.1';
import { avatarJourneyArt } from './avatar-model.js?v=0.19.1';
import { $, app, coin, esc, icon, iconButton, modalShell, toast, view } from './ui-core.js?v=0.19.1';
import { closeModal, commit, openModal } from './ui-modal.js?v=0.19.1';
import { sound } from './ui-effects.js?v=0.19.1';
import { unlockSfx } from './sfx.js?v=0.19.1';

const TIMER_KEY = 'twesk.quest-timer.v1';
let timer = T.freshTimer(), dialDrag = null;
try { timer = T.readTimer(JSON.parse(localStorage.getItem(TIMER_KEY))); } catch {}
export const currentQuest = () => app.state.tasks.find(t => !t.done && t.pinned);
function saveClock() {
  try { localStorage.setItem(TIMER_KEY, JSON.stringify(timer)); } catch {}
}
function reconcile() {
  const id = currentQuest()?.id || null;
  if (timer.taskId !== id) { timer = T.freshTimer(id, timer.minutes); saveClock(); }
}
const timeText = ms => `${Math.floor(Math.ceil(ms / 1000) / 60).toString().padStart(2, '0')}:${(Math.ceil(ms / 1000) % 60).toString().padStart(2, '0')}`;
const statusText = () => ({ ready: '', running: 'On the trail', paused: 'Resting a moment', finished: 'Time to take a breath' }[timer.status]);
function clockFace(task) {
  const minutes = timer.minutes, angle = -135 + (minutes - 5) / 55 * 270;
  return `<div class="quest-dial ${timer.status === 'running' ? 'is-locked' : ''}" role="slider" tabindex="${task ? '0' : '-1'}" aria-label="Focus duration" aria-valuemin="5" aria-valuemax="60" aria-valuenow="${minutes}" aria-valuetext="${minutes} minutes" aria-disabled="${!task || timer.status === 'running'}" title="Drag around the dial · 5 to 60 minutes · Arrow keys adjust">
    <svg viewBox="0 0 72 72" aria-hidden="true"><circle class="dial-track" cx="36" cy="36" r="30" pathLength="100"/><circle class="dial-fill" cx="36" cy="36" r="30" pathLength="100" stroke-dasharray="${(minutes - 5) / 55 * 75} 100"/><g transform="rotate(${angle} 36 36)" data-dial-hand><circle class="dial-knob" cx="36" cy="6" r="3.5"/></g></svg><span><strong data-clock>${timeText(T.remaining(timer))}</strong><small>MINUTES</small></span></div>`;
}
export function renderQuest() {
  reconcile();
  const task = currentQuest(), equipment = Object.fromEntries(E.GEAR_SLOTS.map(slot => [slot, E.SHOP.find(i => i.id === app.state.equipped[slot]) || null]));
  const steps = task?.steps || [], done = steps.filter(step => step.done).length;
  return `<section class="quest-card ${task ? 'has-quest' : ''} ${timer.status === 'running' ? 'is-walking' : ''}" data-quest-drop aria-labelledby="quest-heading">
    <header class="quest-heading"><span class="quest-symbol">${icon('compass')}</span><h3 id="quest-heading">One small adventure</h3><button class="quest-choose ${task ? 'quest-manage' : ''}" data-action="quest-choose" aria-label="${task ? 'Manage adventure' : 'Choose an adventure'}" title="${task ? 'Change or return this task' : 'Choose an adventure'}">${task ? icon('more') : `Choose${icon('chevron')}`}</button></header>
    <div class="quest-task-slot">${task ? `<div class="quest-task"><button class="task-check" data-action="toggle-task" data-id="${task.id}" aria-label="Complete ${esc(task.title)}"></button><span class="quest-task-text"><button class="quest-title" data-action="edit-task" data-id="${task.id}" title="${esc(task.title)}">${esc(task.title)}</button>${steps.length ? `<button class="quest-step-link" data-action="quest-steps">${done}/${steps.length} steps</button>` : ''}</span><span class="task-reward">${coin(E.TASK_GOLD[task.tier], true)}</span></div>` : ''}</div>
    <div class="quest-bottom">${clockFace(task)}<div class="quest-controls"><small data-clock-status>${statusText()}</small><div class="quest-play-row"><button class="quest-play" data-action="quest-play" ${task ? '' : 'disabled'} aria-label="${timer.status === 'running' ? 'Pause focus timer' : timer.status === 'paused' ? 'Resume focus timer' : 'Start focus timer'}">${icon(timer.status === 'running' ? 'pause' : 'play')}<span>${timer.status === 'running' ? 'Pause' : timer.status === 'paused' ? 'Resume' : timer.status === 'finished' ? 'Go again' : 'Set off'}</span></button>${iconButton('quest-reset', 'undo', 'Reset focus timer', task ? '' : 'disabled')}</div></div><div class="quest-trail" aria-hidden="true"><svg class="trail-ground" viewBox="0 0 90 74"><path class="trail-path" d="M-5 65Q17 70 30 58T65 60T100 48"/><path d="m10 54 3-6 3 6m55 0 3-7 3 7M55 67l2-4 2 4" stroke="currentColor" fill="none"/><path d="m8 61 5-2 5 2-5 2Z" fill="currentColor" opacity=".25"/></svg>${avatarJourneyArt(equipment.weapon, equipment.armor, app.state.appearance, equipment.helmet)}</div></div>
    <span class="quest-session-progress" aria-hidden="true"><span data-session-progress style="width:${100 * (1 - T.remaining(timer) / (timer.minutes * 60000))}%"></span></span>
  </section>`;
}
function selectQuest(id) {
  if (app.busy) return;
  const selected = commit(() => E.setCurrentQuest(app.state, id));
  if (!selected) return;
  closeModal();
  sound('note');
  $('[data-action="quest-play"]')?.focus({ preventScroll: true });
}
export const actions = {
  'quest-choose'() { openModal({ type: 'quest' }); },
  'quest-select'(b, { id }) { selectQuest(id); },
  'quest-clear'() {
    commit(() => E.setCurrentQuest(app.state));
    closeModal();
    $('[data-action="quest-choose"]')?.focus({ preventScroll: true });
  },
  'quest-play'() {
    reconcile(); unlockSfx();
    timer = timer.status === 'running' ? T.pauseTimer(timer) : T.startTimer(timer);
    saveClock(); view.render();
  },
  'quest-reset'() { timer = T.freshTimer(currentQuest()?.id || null, timer.minutes); saveClock(); view.render(); },
  'quest-steps'() { openModal({ type: 'questSteps' }); },
};
export const modals = {
  quest() {
    const tasks = app.state.tasks.filter(t => !t.done);
    return modalShell(`${icon('compass')} Choose your adventure`, `<div class="quest-options">${tasks.length ? tasks.map(t => `<button class="quest-option ${t.id === currentQuest()?.id ? 'selected' : ''}" data-action="quest-select" data-id="${t.id}"><span>${icon(t.id === currentQuest()?.id ? 'compass' : 'arrow')}</span><strong>${esc(t.title)}</strong>${coin(E.TASK_GOLD[t.tier], true)}</button>`).join('') : '<p>Add a task to begin your next adventure.</p>'}${currentQuest() ? `<button class="quest-return" data-action="quest-clear">${icon('undo')}Return current task to the list</button>` : ''}</div>`, 'quest-modal');
  },
  questSteps() {
    const task = currentQuest();
    return modalShell('Small steps', `<div class="quest-options"><p class="quest-steps-title">${esc(task?.title || 'Adventure complete')}</p>${(task?.steps || []).map(step => `<label class="task-step ${step.done ? 'done' : ''}"><input type="checkbox" data-task-step data-id="${task.id}" data-step-id="${step.id}" ${step.done ? 'checked' : ''}><span>${esc(step.title)}</span></label>`).join('')}</div>`, 'quest-modal');
  },
};
function tick() {
  reconcile();
  const finished = T.finishTimer(timer);
  if (finished !== timer) {
    timer = finished; saveClock();
    sound('trailBell');
    toast('A little journey, well spent. Take a breath.');
    // Keep an open editor and its draft intact.
    if (!app.modal && !app.taskDragging && !dialDrag && !app.busy) view.render();
  }
  const clock = $('[data-clock]');
  if (clock) clock.textContent = timeText(T.remaining(timer));
  const status = $('[data-clock-status]');
  if (status) status.textContent = statusText();
  const progress = $('[data-session-progress]');
  if (progress) progress.style.width = `${100 * (1 - T.remaining(timer) / (timer.minutes * 60000))}%`;
  $('.quest-card')?.classList.toggle('is-walking', timer.status === 'running');
  // If the clock finished while editing, refresh only its controls after closing.
  const play = $('[data-action="quest-play"]');
  if (play && timer.status === 'finished' && play.getAttribute('aria-label') !== 'Start focus timer') {
    play.innerHTML = `${icon('play')}<span>Go again</span>`; play.setAttribute('aria-label', 'Start focus timer');
    $('.quest-dial')?.setAttribute('aria-disabled', 'false'); $('.quest-dial')?.classList.remove('is-locked');
  }
}
function setMinutes(minutes) {
  timer = T.durationTimer(timer, minutes); saveClock();
  const dial = $('.quest-dial');
  if (!dial) return;
  dial.setAttribute('aria-valuenow', timer.minutes); dial.setAttribute('aria-valuetext', `${timer.minutes} minutes`);
  $('[data-dial-hand]').setAttribute('transform', `rotate(${-135 + (timer.minutes - 5) / 55 * 270} 36 36)`);
  $('.dial-fill').setAttribute('stroke-dasharray', `${(timer.minutes - 5) / 55 * 75} 100`);
  $('[data-clock]').textContent = timeText(timer.remainingMs);
  $('[data-clock-status]').textContent = statusText();
  $('[data-session-progress]').style.width = '0%';
  $('[data-action="quest-play"]').innerHTML = `${icon('play')}<span>Set off</span>`;
  $('[data-action="quest-play"]').setAttribute('aria-label', 'Start focus timer');
}
export function installQuest() {
  const updateDial = event => {
    const box = dialDrag.el.getBoundingClientRect();
    let angle = Math.atan2(event.clientX - box.left - box.width / 2, -(event.clientY - box.top - box.height / 2)) * 180 / Math.PI;
    // Stay at the endpoint while crossing the dial’s lower gap.
    if (Math.abs(angle) > 135) angle = (dialDrag.lastAngle ?? angle) < 0 ? -135 : 135;
    dialDrag.lastAngle = angle;
    setMinutes(5 + (Math.max(-135, Math.min(135, angle)) + 135) / 270 * 55);
  };
  $('#app').addEventListener('pointerdown', event => {
    const el = event.target.closest('.quest-dial');
    if (!el || el.getAttribute('aria-disabled') === 'true' || app.busy || app.modal || event.button !== 0) return;
    event.preventDefault(); el.focus(); el.setPointerCapture(event.pointerId);
    dialDrag = { el, id: event.pointerId }; updateDial(event);
  });
  document.addEventListener('pointermove', event => { if (dialDrag?.id === event.pointerId) { event.preventDefault(); updateDial(event); } }, { passive: false });
  const endDial = () => { if (dialDrag) { if (dialDrag.el.hasPointerCapture(dialDrag.id)) dialDrag.el.releasePointerCapture(dialDrag.id); dialDrag = null; } };
  document.addEventListener('pointerup', endDial); document.addEventListener('pointercancel', endDial); window.addEventListener('blur', endDial);
  $('#app').addEventListener('keydown', event => {
    if (!event.target.matches('.quest-dial') || event.target.getAttribute('aria-disabled') === 'true' || app.busy) return;
    const value = { ArrowUp: timer.minutes + 5, ArrowRight: timer.minutes + 5, ArrowDown: timer.minutes - 5, ArrowLeft: timer.minutes - 5, Home: 5, End: 60 }[event.key];
    if (value !== undefined) { event.preventDefault(); setMinutes(value); }
  });
  window.addEventListener('storage', event => {
    if (event.key !== TIMER_KEY) return;
    try { timer = T.readTimer(JSON.parse(event.newValue)); } catch { timer = T.freshTimer(); }
    if (!app.modal && !app.taskDragging && !dialDrag && !app.busy) view.render();
  });
  setInterval(tick, 500);
  window.addEventListener('focus', tick);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
}
