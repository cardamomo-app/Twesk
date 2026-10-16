// One task, a little trail, and a device-local focus timer.
import * as E from './engine.js?v=0.23.2';
import * as T from './quest-timer.js?v=0.23.2';
import { avatarJourneyArt } from './avatar-model.js?v=0.23.2';
import { resolvedHabitIcon } from './habit-icons.js?v=0.23.2';
import { $, app, coin, esc, icon, modalShell, toast, today, view } from './ui-core.js?v=0.23.2';
import { closeModal, commit, openModal } from './ui-modal.js?v=0.23.2';
import { rewardEffect, sound } from './ui-effects.js?v=0.23.2';
import { unlockSfx } from './sfx.js?v=0.23.2';

const TIMER_KEY = 'twesk.quest-timer.v1';
let timer = T.freshTimer(), dialDrag = null, owed = 0;
try { timer = T.readTimer(JSON.parse(localStorage.getItem(TIMER_KEY))); } catch {}
// The adventure is an open task, or a positive habit dragged in from the habits column.
export const currentQuest = () => app.state.tasks.find(t => !t.done && t.pinned) || app.state.habits.find(h => h.pinned);
const isHabit = item => !!item?.category;
function saveClock() {
  try { localStorage.setItem(TIMER_KEY, JSON.stringify(timer)); } catch {}
}
function reconcile() {
  const id = currentQuest()?.id || null;
  // A finished or changed adventure keeps the minutes it earned; they are credited on the next calm tick.
  if (timer.taskId !== id) { owed += T.minutesDue(timer); timer = T.freshTimer(id, timer.minutes); saveClock(); }
}
// Crediting saves and redraws, so it waits while a dialog, drag, or encounter is in progress.
const calm = () => !app.modal && !app.taskDragging && !dialDrag && !app.busy;
function creditFocus() {
  const due = T.minutesDue(timer), minutes = due + owed;
  if (!minutes) return;
  const healed = commit(() => E.focusHeal(app.state, minutes));
  if (healed === undefined) return;
  timer = T.creditMinutes(timer, due); owed = 0; saveClock();
  if (healed > 0) {
    sound('focusHeal');
    rewardEffect($('[data-focus-meter]'), healed, 'hp');
  }
}
// The health meter: current HP, plus a softly shimmering segment for what this session can still
// restore (1 HP per minute), filling smoothly as the current minute passes.
function meterValues(now = Date.now()) {
  const max = E.maxHP(app.state), hp = app.state.hp;
  const restore = Math.min(timer.minutes - timer.credited + owed, max - hp);
  const minute = timer.status === 'running' ? ((timer.minutes * 60000 - T.remaining(timer, now)) % 60000) / 60000 : 0;
  return { max, hp, restore, earned: Math.min(restore, T.minutesDue(timer, now) + owed + minute) };
}
function focusMeter() {
  const v = meterValues(), pct = n => `${((100 * n) / v.max).toFixed(2)}%`;
  const label = v.restore
    ? `Focus restores up to ${v.restore} HP · ${v.hp} of ${v.max} HP`
    : `Full health · ${v.hp} of ${v.max} HP`;
  return `<div class="focus-meter ${v.restore ? '' : 'is-full'}" role="img" aria-label="${label}" title="${label}" data-focus-meter>${icon('heart')}<span class="focus-bar"><span class="focus-hp" style="width:${pct(v.hp)}"></span><span class="focus-gain" style="left:${pct(v.hp)};width:${pct(v.restore)}"><span class="focus-earned" style="width:${v.restore ? ((100 * v.earned) / v.restore).toFixed(1) : 0}%"></span></span></span></div>`;
}
// Update the meter in place, so its shimmer and smooth width changes keep running between ticks.
function refreshMeter() {
  const meter = $('[data-focus-meter]');
  if (!meter) return;
  const v = meterValues(), pct = n => `${((100 * n) / v.max).toFixed(2)}%`;
  const label = v.restore ? `Focus restores up to ${v.restore} HP · ${v.hp} of ${v.max} HP` : `Full health · ${v.hp} of ${v.max} HP`;
  if (meter.getAttribute('aria-label') !== label) { meter.setAttribute('aria-label', label); meter.title = label; }
  meter.classList.toggle('is-full', !v.restore);
  meter.querySelector('.focus-hp').style.width = pct(v.hp);
  Object.assign(meter.querySelector('.focus-gain').style, { left: pct(v.hp), width: pct(v.restore) });
  meter.querySelector('.focus-earned').style.width = `${v.restore ? ((100 * v.earned) / v.restore).toFixed(1) : 0}%`;
}
const canReset = () => timer.status !== 'ready' || timer.remainingMs !== timer.minutes * 60000;
const timeText = ms => `${Math.floor(Math.ceil(ms / 1000) / 60).toString().padStart(2, '0')}:${(Math.ceil(ms / 1000) % 60).toString().padStart(2, '0')}`;
const statusText = () => ({ ready: '', running: 'On the trail', paused: 'Resting a moment', finished: 'Time to take a breath' }[timer.status]);
// The dial runs from 0 to 60 minutes. Before a session it shows the chosen duration; once started, the
// knob and arc wind back toward 0 with the time remaining.
const dialMinutes = () => (timer.status === 'ready' ? timer.minutes : T.remaining(timer) / 60000);
const dialAngle = minutes => -135 + (minutes / 60) * 270;
const dialArc = minutes => `${(minutes / 60) * 75} 100`;
function clockFace(task) {
  const minutes = timer.minutes, angle = dialAngle(dialMinutes());
  return `<div class="quest-dial ${timer.status === 'running' ? 'is-locked' : ''}" role="slider" tabindex="${task ? '0' : '-1'}" aria-label="Focus duration" aria-valuemin="5" aria-valuemax="60" aria-valuenow="${minutes}" aria-valuetext="${minutes} minutes" aria-disabled="${!task || timer.status === 'running'}" title="Drag around the dial · 5 to 60 minutes · Arrow keys adjust">
    <svg viewBox="0 0 72 72" aria-hidden="true"><circle class="dial-track" cx="36" cy="36" r="30" pathLength="100"/><circle class="dial-fill" cx="36" cy="36" r="30" pathLength="100" stroke-dasharray="${dialArc(dialMinutes())}"/><g transform="rotate(${angle} 36 36)" data-dial-hand><circle class="dial-knob" cx="36" cy="6" r="3.5"/></g></svg><span><strong data-clock>${timeText(T.remaining(timer))}</strong><small>MINUTES</small></span></div>`;
}
function playButton(task) {
  const running = timer.status === 'running';
  const label = running ? 'Pause focus timer' : timer.status === 'paused' ? 'Resume focus timer' : 'Start focus timer';
  return `<button class="quest-play ${running ? 'is-running' : ''}" data-action="quest-play" ${task ? '' : 'disabled'} aria-label="${label}" title="${label}">${icon(running ? 'pause' : 'play')}</button>`;
}
// The same collapsible steps as the task list, opening inside the adventure box under the title.
function questSteps(task, steps, done) {
  const open = app.openTaskSteps.has(task.id);
  return `<button class="task-step-summary quest-step-summary" data-action="task-steps" data-id="${task.id}" aria-expanded="${open}" aria-controls="quest-steps-${task.id}" aria-label="${open ? 'Hide' : 'Show'} steps for ${esc(task.title)}"><span class="step-progress" aria-hidden="true"><span style="width:${(done / steps.length) * 100}%"></span></span><span>${done}/${steps.length} steps</span>${icon('chevron')}</button><div class="task-steps quest-steps" id="quest-steps-${task.id}" ${open ? '' : 'hidden'}>${steps.map(step => `<label class="task-step ${step.done ? 'done' : ''}"><input type="checkbox" data-task-step data-id="${task.id}" data-step-id="${step.id}" ${step.done ? 'checked' : ''}><span>${esc(step.title)}</span></label>`).join('')}</div>`;
}
// A habit adventure: its icon completes it, like the habit row, and it earns XP instead of gold.
function questHabit(h) {
  const reward = Math.round(h.base * E.momentum(h, today()));
  const grip = timer.status === 'running' ? '' : `<button class="task-grip quest-grip" data-habit-grip data-quest-grip data-id="${h.id}" aria-label="Drag ${esc(h.title)} back to your habits" title="Drag back to your habits">${icon('grip')}</button>`;
  return `<div class="quest-task quest-habit ${h.category}">${grip}<button class="quest-habit-check" data-action="habit" data-id="${h.id}" aria-label="Complete ${esc(h.title)}" title="Complete ${esc(h.title)}"><span class="quest-habit-glyph">${icon(resolvedHabitIcon(h))}</span><span class="quest-habit-tick">${icon('check')}</span></button><span class="quest-task-text"><button class="quest-title" data-action="edit-habit" data-id="${h.id}" title="${esc(h.title)}">${esc(h.title)}</button></span><span class="xp-badge">+${reward} XP</span></div>`;
}
export function renderQuest() {
  reconcile();
  const task = currentQuest(), equipment = Object.fromEntries(E.GEAR_SLOTS.map(slot => [slot, E.SHOP.find(i => i.id === app.state.equipped[slot]) || null]));
  const steps = (!isHabit(task) && task?.steps) || [], done = steps.filter(step => step.done).length;
  return `<section class="quest-card ${task ? 'has-quest' : ''} ${timer.status === 'running' ? 'is-walking' : ''} ${task && steps.length && app.openTaskSteps.has(task.id) ? 'steps-open' : ''}" data-quest-drop aria-labelledby="quest-heading">
    <header class="quest-heading"><span class="quest-symbol">${icon('compass')}</span><h3 id="quest-heading">Adventure</h3><button class="quest-choose ${task ? 'quest-manage' : ''}" data-action="quest-choose" aria-label="${task ? 'Manage adventure' : 'Choose an adventure'}" title="${task ? `Change or return this ${isHabit(task) ? 'habit' : 'task'}` : 'Choose an adventure'}">${task ? icon('more') : `Choose${icon('chevron')}`}</button></header>
    <div class="quest-task-slot">${isHabit(task) ? questHabit(task) : task ? `<div class="quest-task">${timer.status === 'running' ? '' : `<button class="task-grip quest-grip" data-task-grip data-quest-grip data-id="${task.id}" aria-label="Drag ${esc(task.title)} back to your task list" title="Drag back to your task list">${icon('grip')}</button>`}<button class="task-check" data-action="toggle-task" data-id="${task.id}" aria-label="Complete ${esc(task.title)}"></button><span class="quest-task-text"><button class="quest-title" data-action="edit-task" data-id="${task.id}" title="${esc(task.title)}">${esc(task.title)}</button>${steps.length ? questSteps(task, steps, done) : ''}</span><span class="task-reward">${coin(E.TASK_GOLD[task.tier], true)}</span></div>` : ''}</div>
    <div class="quest-bottom">${clockFace(task)}<div class="quest-controls"><span class="sr-only" data-clock-status aria-live="polite">${statusText()}</span>${focusMeter()}<div class="quest-play-row">${playButton(task)}<button class="quest-reset" data-action="quest-reset" aria-label="Reset focus timer" title="Reset" ${task && canReset() ? '' : 'disabled'}>${icon('reset')}</button></div></div><div class="quest-trail" aria-hidden="true"><svg class="trail-ground" viewBox="0 0 90 74"><path class="trail-hill far" d="M-4 47Q10 35 24 41T52 34T94 40V76H-4Z"/><path class="trail-hill near" d="M-4 58Q18 47 38 53T94 50V76H-4Z"/><g class="trail-tree"><rect x="13" y="45" width="2" height="5" rx=".6"/><path d="M14 30 18.8 38.5H9.2ZM14 34.5 19.8 44.5H8.2Z"/></g><g class="trail-tree round"><rect x="74" y="42" width="2" height="6" rx=".6"/><circle cx="75" cy="38.5" r="5.2"/><circle cx="73.2" cy="36.6" r="1.6" class="trail-shine"/></g><path class="trail-path" d="M-5 68Q17 72 30 61T65 62T100 51"/></svg>${avatarJourneyArt(equipment.weapon, equipment.armor, app.state.appearance, equipment.helmet, equipment)}</div></div>
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
    // A fresh session (not a resume) sets off with its own little call.
    if (timer.status === 'ready' || timer.status === 'finished') sound('setOff');
    timer = timer.status === 'running' ? T.pauseTimer(timer) : T.startTimer(timer);
    saveClock();
    creditFocus();
    view.render();
    $('[data-action="quest-play"]')?.focus({ preventScroll: true });
  },
  'quest-reset'() {
    // Minutes already focused keep their HP; only the clock starts over.
    timer = T.pauseTimer(timer); creditFocus();
    timer = T.freshTimer(currentQuest()?.id || null, timer.minutes); saveClock(); view.render();
    $('[data-action="quest-play"]')?.focus({ preventScroll: true });
  },
};
export const modals = {
  quest() {
    const tasks = app.state.tasks.filter(t => !t.done);
    return modalShell(`${icon('compass')} Choose your adventure`, `<div class="quest-options">${tasks.length ? tasks.map(t => `<button class="quest-option ${t.id === currentQuest()?.id ? 'selected' : ''}" data-action="quest-select" data-id="${t.id}"><span>${icon(t.id === currentQuest()?.id ? 'compass' : 'arrow')}</span><strong>${esc(t.title)}</strong>${coin(E.TASK_GOLD[t.tier], true)}</button>`).join('') : '<p>Add a task to begin your next adventure.</p>'}${currentQuest() ? `<button class="quest-return" data-action="quest-clear">${icon('undo')}Return current ${isHabit(currentQuest()) ? 'habit to your habits' : 'task to the list'}</button>` : ''}</div>`, 'quest-modal');
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
    if (calm()) view.render();
  }
  if (calm()) creditFocus();
  refreshMeter();
  refreshDial();
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
    play.outerHTML = playButton(currentQuest());
    $('.quest-dial')?.setAttribute('aria-disabled', 'false'); $('.quest-dial')?.classList.remove('is-locked');
  }
}
function refreshDial() {
  const minutes = dialMinutes();
  $('[data-dial-hand]')?.setAttribute('transform', `rotate(${dialAngle(minutes)} 36 36)`);
  $('.dial-fill')?.setAttribute('stroke-dasharray', dialArc(minutes));
}
function setMinutes(minutes) {
  const previousMinutes = timer.minutes;
  const next = T.durationTimer(timer, minutes);
  if (next !== timer) owed += T.minutesDue(timer); // a new duration starts a fresh session; keep what was earned
  timer = next; saveClock();
  if (timer.minutes !== previousMinutes) sound('wind', { direction: Math.sign(timer.minutes - previousMinutes), channel: 'dial' });
  const dial = $('.quest-dial');
  if (!dial) return;
  dial.setAttribute('aria-valuenow', timer.minutes); dial.setAttribute('aria-valuetext', `${timer.minutes} minutes`);
  refreshDial();
  $('[data-clock]').textContent = timeText(timer.remainingMs);
  $('[data-clock-status]').textContent = statusText();
  $('[data-session-progress]').style.width = '0%';
  $('[data-action="quest-play"]').outerHTML = playButton(currentQuest());
  refreshMeter();
}
export function installQuest() {
  const updateDial = event => {
    const box = dialDrag.el.getBoundingClientRect();
    let angle = Math.atan2(event.clientX - box.left - box.width / 2, -(event.clientY - box.top - box.height / 2)) * 180 / Math.PI;
    // Stay at the endpoint while crossing the dial’s lower gap.
    if (Math.abs(angle) > 135) angle = (dialDrag.lastAngle ?? angle) < 0 ? -135 : 135;
    dialDrag.lastAngle = angle;
    setMinutes((Math.max(-135, Math.min(135, angle)) + 135) / 270 * 60);
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
