// Progress history: a month calendar of habits, tasks, and stat growth, with day details.
import * as E from './engine.js?v=0.20.3';
import { monsterName } from './art.js?v=0.20.3';
import { $, app, coin, esc, icon, modalShell, today, view } from './ui-core.js?v=0.20.3';
import { openModal } from './ui-modal.js?v=0.20.3';

const shift = (day, n) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const monthOf = day => day.slice(0, 7);
const addMonths = (month, n) => {
  const d = new Date(`${month}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};
const format = (day, options) =>
  new Intl.DateTimeFormat('en', { ...options, timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
const noteDay = note => E.dateKey(new Date(note.created), app.state.settings.timezone);
const summary = day => E.daySummary(app.state, day, noteDay);
const activity = d => d.habits.length + d.tasks;
const heat = n => (n === 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : n <= 8 ? 3 : 4);

// The earliest month with any dated record, so navigation stops where history begins.
function firstMonth() {
  const days = [
    ...app.state.habits.flatMap(h => [...h.logs, ...h.harmLogs].map(l => l.day)),
    ...Object.keys(app.state.history || {}),
    ...app.state.notes.map(noteDay),
    ...app.state.battles.map(b => b.day),
  ].sort();
  return monthOf(days[0] || today());
}
function monthDays(month) {
  const days = [];
  for (let day = `${month}-01`; monthOf(day) === month; day = shift(day, 1)) days.push(day);
  return days;
}
function dayCell(d, selected, current) {
  const level = heat(activity(d)),
    future = d.day > current;
  const markers = [
    d.tasks ? `<i class="mark task" title="${d.tasks} tasks"></i>` : '',
    d.levels.length ? `<i class="mark level" title="Level up"></i>` : '',
    d.battles.some(b => b.won) ? `<i class="mark win" title="Victory"></i>` : '',
  ].join('');
  const label = `${format(d.day, { weekday: 'long', month: 'long', day: 'numeric' })}: ${d.habits.length} habits, ${d.tasks} tasks${d.levels.length ? ', level up' : ''}${d.battles.some(b => b.won) ? ', victory' : ''}`;
  return `<button class="history-day heat-${level} ${selected ? 'selected' : ''} ${d.day === current ? 'today' : ''}" data-action="history-day" data-day="${d.day}" aria-pressed="${selected}" aria-label="${esc(label)}" ${future ? 'disabled' : ''} tabindex="${selected ? 0 : -1}"><span>${Number(d.day.slice(8))}</span><span class="marks">${markers}</span></button>`;
}
function dayDetails(d) {
  const xpTotal = E.CATEGORIES.reduce((n, c) => n + d.xp[c], 0);
  const empty =
    !d.habits.length && !d.tasks && !d.harm.length && !d.notes && !d.journals && !d.battles.length;
  const heading = `<h3>${format(d.day, { weekday: 'long', month: 'long', day: 'numeric' })}</h3>`;
  if (empty)
    return `<section class="history-details">${heading}<p class="history-empty">${d.day === today() ? 'Nothing logged yet today. There’s still time.' : 'A quiet day. Rest counts too.'}</p></section>`;
  const facts = [
    d.habits.length
      ? `${icon('leaf')}<strong>${d.habits.length}</strong> ${d.habits.length === 1 ? 'habit' : 'habits'}`
      : '',
    d.tasks
      ? `${icon('check')}<strong>${d.tasks}</strong> ${d.tasks === 1 ? 'task' : 'tasks'} ${coin(d.gold)}`
      : '',
    xpTotal ? `${icon('soul')}<strong>+${xpTotal}</strong> XP` : '',
  ]
    .filter(Boolean)
    .map(f => `<span>${f}</span>`)
    .join('');
  const xpChips = E.CATEGORIES.filter(c => d.xp[c])
    .map(c => `<span class="history-chip ${c}">${icon(c)}${E.CATEGORY_META[c].label} +${d.xp[c]}</span>`)
    .join('');
  const levels = d.levels
    .map(c => `<li class="history-level ${c}">${icon(c)}${E.CATEGORY_META[c].label} reached a new level</li>`)
    .join('');
  const habits = d.habits
    .map(
      h =>
        `<li><span class="history-dot ${h.category}"></span>${esc(h.title)}<small>+${h.xp} XP</small></li>`,
    )
    .join('');
  const harm = d.harm
    .map(
      h => `<li><span class="history-dot harm"></span>${esc(h.title)}<small>${h.count}× logged</small></li>`,
    )
    .join('');
  const extras = [
    d.notes ? `${d.notes} ${d.notes === 1 ? 'note' : 'notes'} captured` : '',
    d.journals ? `${d.journals} journal ${d.journals === 1 ? 'entry' : 'entries'}` : '',
    ...d.battles.map(b => `${b.won ? 'Defeated' : 'Fell to'} ${monsterName(b.monster)}`),
  ].filter(Boolean);
  return `<section class="history-details">${heading}<div class="history-facts">${facts}</div>${xpChips ? `<div class="history-chips">${xpChips}</div>` : ''}${levels ? `<ul class="history-levels">${levels}</ul>` : ''}${habits || harm ? `<ul class="history-habits">${habits}${harm}</ul>` : ''}${extras.length ? `<p class="history-extras">${extras.map(esc).join(' · ')}</p>` : ''}</section>`;
}
function monthSummary(days) {
  const active = days.filter(d => activity(d) > 0).length,
    habits = days.reduce((n, d) => n + d.habits.length, 0),
    tasks = days.reduce((n, d) => n + d.tasks, 0),
    gold = days.reduce((n, d) => n + d.gold, 0),
    wins = days.reduce((n, d) => n + d.battles.filter(b => b.won).length, 0),
    levels = days.reduce((n, d) => n + d.levels.length, 0);
  const xp = Object.fromEntries(E.CATEGORIES.map(c => [c, days.reduce((n, d) => n + d.xp[c], 0)]));
  const most = Math.max(1, ...Object.values(xp));
  const bars = E.CATEGORIES.map(
    c =>
      `<div class="growth-row ${c}"><span>${icon(c)}${E.CATEGORY_META[c].label}</span><div class="growth-bar"><div style="width:${(xp[c] / most) * 100}%"></div></div><strong>+${xp[c]}</strong></div>`,
  ).join('');
  return `<section class="history-month-summary"><div class="history-totals"><span><strong>${active}</strong>active ${active === 1 ? 'day' : 'days'}</span><span><strong>${habits}</strong>habits</span><span><strong>${tasks}</strong>tasks</span><span><strong>${gold}</strong>task gold</span>${wins ? `<span><strong>${wins}</strong>${wins === 1 ? 'victory' : 'victories'}</span>` : ''}${levels ? `<span><strong>${levels}</strong>level ${levels === 1 ? 'up' : 'ups'}</span>` : ''}</div><h4>Stat growth this month</h4>${bars}</section>`;
}
function renderHistory() {
  const current = today(),
    month = app.historyMonth || monthOf(current),
    selected =
      app.historyDay && monthOf(app.historyDay) === month
        ? app.historyDay
        : month === monthOf(current)
          ? current
          : `${month}-01`;
  const days = monthDays(month).map(summary);
  // Monday-first grid; leading blanks align the first day under its weekday.
  const lead = (new Date(`${month}-01T12:00:00Z`).getUTCDay() + 6) % 7;
  const cells = [
    ...Array.from({ length: lead }, () => '<span class="history-blank"></span>'),
    ...days.map(d => dayCell(d, d.day === selected, current)),
  ].join('');
  const earliest = firstMonth();
  return modalShell(
    'Your history',
    `<div class="history-body"><div class="history-calendar"><div class="history-nav"><button class="icon-button" data-action="history-month" data-direction="-1" aria-label="Previous month" ${month <= earliest ? 'disabled' : ''}>${icon('chevron', 'flip')}</button><h3 id="history-month-label">${format(`${month}-01`, { month: 'long', year: 'numeric' })}</h3><button class="icon-button" data-action="history-month" data-direction="1" aria-label="Next month" ${month >= monthOf(current) ? 'disabled' : ''}>${icon('chevron')}</button></div><div class="history-weekdays" aria-hidden="true">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(w => `<span>${w}</span>`).join('')}</div><div class="history-grid" role="group" aria-labelledby="history-month-label">${cells}</div><div class="history-legend" aria-hidden="true"><span>Less</span>${[0, 1, 2, 3, 4].map(n => `<i class="heat-${n}"></i>`).join('')}<span>More</span><span class="legend-marks"><i class="mark task"></i>Tasks <i class="mark level"></i>Level up <i class="mark win"></i>Victory</span></div></div>${dayDetails(summary(selected))}</div>${monthSummary(days)}`,
    'history-modal',
    'Habits, tasks, and growth, one day at a time.',
  );
}
export const modals = {
  history() {
    return renderHistory();
  },
};
function select(day) {
  app.historyDay = day;
  app.historyMonth = monthOf(day);
  view.renderModal();
  $(`#overlay [data-action="history-day"][data-day="${day}"]`)?.focus();
}
export const actions = {
  history() {
    app.historyMonth = monthOf(today());
    app.historyDay = today();
    openModal({ type: 'history' });
  },
  'history-month'(b) {
    app.historyMonth = addMonths(app.historyMonth || monthOf(today()), Number(b.dataset.direction));
    app.historyDay = null;
    view.renderModal();
    $(
      `#overlay [data-action="history-month"][data-direction="${b.dataset.direction}"]:not(:disabled)`,
    )?.focus();
  },
  'history-day'(b) {
    select(b.dataset.day);
  },
};
// Arrow keys move between days (a week up or down), within recorded history and not past today.
export function onKeydown(event) {
  if (app.modal?.type !== 'history' || !event.target.matches?.('[data-action="history-day"]')) return;
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
  if (!step) return;
  event.preventDefault();
  const next = shift(event.target.dataset.day, step);
  if (next > today() || monthOf(next) < firstMonth()) return;
  select(next);
}
