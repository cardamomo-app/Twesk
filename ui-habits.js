// Habit categories, the habit dialog, and habit/harm logging.
import * as E from './engine.js?v=0.27.0';
import { HABIT_ICONS, habitIconChoice, resolvedHabitIcon, validHabitIcon } from './habit-icons.js?v=0.27.0';
import { $, app, esc, icon, iconButton, modalShell, toast, today, view } from './ui-core.js?v=0.27.0';
import { closeModal, commit, openModal } from './ui-modal.js?v=0.27.0';
import { burst, celebrateLevel, rewardEffect, sound } from './ui-effects.js?v=0.27.0';
export function renderCategory(cat) {
  const meta = E.CATEGORY_META[cat],
    harm = cat === 'harm',
    open = app.openCategories.has(cat),
    habits = app.state.habits.filter(h => h.category === cat),
    xp = harm ? 0 : app.state.xp[cat] % 300;
  const done = habits.filter(h => h.logs.some(l => l.day === today())).length;
  return `<section class="habit-category ${cat} ${open ? 'expanded' : ''}"><button class="category-header" data-action="category" data-category="${cat}" aria-expanded="${open}"><span class="category-symbol">${icon(meta.icon)}</span><span class="category-name"><strong>${meta.label}</strong><small>${harm ? meta.subtitle : `${done}/${habits.length} today`}</small></span>${harm ? '<span class="harm-tag">− HP</span>' : `<span class="category-level">Lv. ${E.level(app.state, cat)}</span>`}${icon('chevron', 'category-chevron')}</button>${!harm ? `<div class="category-progress" role="progressbar" aria-label="${meta.label} experience" aria-valuemin="0" aria-valuemax="300" aria-valuenow="${xp}"><div style="width:${xp / 3}%"></div></div>` : ''}${
    open
      ? `<div class="category-body" data-habit-list="${cat}"><p class="category-subtitle">${harm ? 'Log it when it happens. A moment to notice.' : meta.subtitle + ` · ${xp}/300 XP`}</p>${habits
          .map(h => {
            const log = h.logs.find(l => l.day === today()),
              reward = harm ? h.base : log?.xp || Math.round(h.base * E.momentum(h, today()));
            const harmCount = harm ? h.harmLogs.filter(l => l.day === today()).length : 0;
            // The grip sits in the row's left gutter: drag to reorder, or onto the adventure box.
            const grip = `<button class="habit-grip" data-habit-grip data-id="${h.id}" aria-label="Move ${esc(h.title)}${harm ? '' : ' or drag it to your adventure'}" title="Drag to reorder${harm ? '' : ' or start an adventure'} · Arrow keys move">${icon('grip')}</button>`;
            return `<div class="habit-row ${log ? 'done' : ''} ${h.pinned ? 'is-adventure' : ''}" data-habit-id="${h.id}">${grip}<button class="habit-complete" data-action="${harm ? 'harm' : 'habit'}" data-id="${h.id}" ${!harm ? `aria-pressed="${!!log}"` : ''} title="${esc(harm ? 'Log ' + h.title : log ? 'Completed today · click to undo' : 'Complete ' + h.title)}"><span class="habit-icon" data-habit-drag data-id="${h.id}">${icon(log ? 'check' : resolvedHabitIcon(h))}</span><span class="habit-name">${esc(h.title)}${harmCount ? `<small>Logged ${harmCount}× today</small>` : log ? '<small>Done for today</small>' : h.pinned ? `<small>${icon('compass')}On your adventure</small>` : ''}</span><span class="xp-badge">${harm ? '−' : '+'}${reward} ${harm ? 'HP' : 'XP'}</span></button>${iconButton('edit-habit', 'more', 'Edit ' + h.title, `data-id="${h.id}"`)}</div>`;
          })
          .join(
            '',
          )}<button class="add-habit" data-action="new-habit" data-category="${cat}">${icon('plus')}Add ${harm ? 'a Harm habit' : 'a habit'}</button></div>`
      : ''
  }</section>`;
}
function habitOptions(cat, selected) {
  return (
    cat === 'harm'
      ? [
          [3, 'Minor · 3 HP'],
          [7, 'Moderate · 7 HP'],
          [12, 'Substantial · 12 HP'],
        ]
      : [
          [10, 'Small · 10 XP'],
          [20, 'Standard · 20 XP'],
          [30, 'Deep · 30 XP'],
        ]
  )
    .map(([n, l]) => `<option value="${n}" ${selected === n ? 'selected' : ''}>${l}</option>`)
    .join('');
}
function habitIconOptions(category, selected) {
  return HABIT_ICONS.map(
    i =>
      `<label class="habit-icon-option" title="${i.label}"><input type="radio" name="icon" value="${i.id}" aria-label="${i.label}" ${selected === i.id ? 'checked' : ''}><span aria-hidden="true">${icon(i.id === 'category' ? category : i.id)}</span></label>`,
  ).join('');
}
function renderHabitIconPicker(category, selected) {
  return `<fieldset class="habit-icon-picker ${category}" id="habit-icon-picker"><legend>Habit icon <span id="habit-icon-label">${HABIT_ICONS.find(i => i.id === selected).label}</span></legend><div class="habit-icon-options" id="habit-icon-options">${habitIconOptions(category, selected)}</div></fieldset>`;
}
const suggestions = {
  body: ['Go for a walk', 'Stretch a little', 'Exercise'],
  mind: ['Draw something', 'Practice a language', 'Study something new'],
  soul: ['Meditate', 'Journal', 'Spend time in nature'],
  heart: ['Share a meal', 'Listen to someone', 'Express gratitude'],
  harm: ['Late-night scrolling', 'Skip a meal', 'Smoke'],
};
function suggestionButtons(cat) {
  return suggestions[cat]
    .map(x => `<button type="button" data-action="suggest-habit" data-title="${x}">${x}</button>`)
    .join('');
}
const shortDate = day =>
  new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${day}T12:00:00Z`),
  );
// Recent history, next reward, momentum, and totals shown above the habit's edit form.
function habitDetails(h) {
  const st = E.habitStats(h, today()),
    unit = st.harm ? 'HP' : 'XP',
    active = st.history.filter(d => d.count).length;
  const momentum = st.harm
    ? 'Harm has no momentum. Each log costs the same HP.'
    : st.factor >= 1.5
      ? 'Top momentum. A missed day lowers it one step; nothing already earned is taken away.'
      : st.factor > 1
        ? 'Complete it on consecutive days to reach 1.5×.'
        : 'Complete it two days in a row to start building momentum.';
  const cells = st.history
    .map(
      d =>
        `<span class="history-cell ${d.count ? 'done' : ''} ${d.count > 1 ? 'many' : ''} ${d.day === today() ? 'today' : ''}" title="${shortDate(d.day)}${d.count ? ` · ${st.harm ? d.count + '× logged' : 'completed'}` : ''}"></span>`,
    )
    .join('');
  return `<section class="habit-details ${h.category}"><div class="habit-stats"><div><small>${st.harm ? 'Each log' : st.doneToday ? 'Tomorrow' : 'Next completion'}</small><strong>${st.harm ? '−' : '+'}${st.next} ${unit}</strong><span>${st.harm ? 'No momentum' : `${st.factor}× momentum`}</span></div><div><small>${st.harm ? 'Today' : 'Streak'}</small><strong>${st.harm ? `${st.history.at(-1).count}×` : `${st.streak} ${st.streak === 1 ? 'day' : 'days'}`}</strong><span>${active} of the last 28 days</span></div><div><small>All time</small><strong>${st.total}×</strong><span>${st.harm ? '−' : '+'}${st.earned} ${unit}</span></div></div><div class="habit-history" role="img" aria-label="Last 28 days: ${st.harm ? 'logged' : 'completed'} on ${active} days">${cells}</div><div class="history-range"><span>${shortDate(st.history[0].day)}</span><span>Today</span></div><p class="form-help">${momentum}</p></section>`;
}
export const modals = {
  habit() {
    const h = app.state.habits.find(h => h.id === app.modal.id),
      cat = h?.category || app.modal.category || 'body';
    return modalShell(
      h ? esc(h.title) : 'Make room for a habit',
      `${h ? habitDetails(h) : ''}<form id="habit-form" class="form-body"><label>Habit name<input name="title" required maxlength="100" placeholder="Something you’d like to do" value="${esc(h?.title || '')}" autofocus></label><div class="form-grid"><label>Category<select name="category" ${h ? 'disabled' : ''}>${[...E.CATEGORIES, 'harm'].map(c => `<option value="${c}" ${cat === c ? 'selected' : ''}>${E.CATEGORY_META[c].label}</option>`).join('')}</select></label><label id="effort-label">${cat === 'harm' ? 'HP cost' : 'Effort'}<select name="base" id="habit-base">${habitOptions(cat, h?.base)}</select></label></div><p class="form-help">${cat === 'harm' ? 'Log it whenever it happens. It costs HP, with no XP or level.' : 'Available every day, once a day. No schedule to keep.'}</p>${renderHabitIconPicker(cat, h ? habitIconChoice(h) : 'category')}${!h ? `<div class="suggestions"><span class="small-label">A FEW IDEAS</span><div id="habit-suggestions">${suggestionButtons(cat)}</div></div>` : ''}<div class="form-actions">${h ? `<button type="button" class="button danger subtle" data-action="delete-habit" data-id="${h.id}">Remove habit</button>` : '<span></span>'}<button class="button primary">${h ? 'Save changes' : 'Add habit'}${icon('plus')}</button></div></form>`,
    );
  },
  'confirm-delete'() {
    return modalShell(
      'Remove this habit?',
      `<div class="form-body"><p><strong>${esc(app.modal.title)}</strong> will be removed. Your earned XP and levels stay with you.</p><div class="form-actions"><button class="button secondary" data-action="cancel-delete">Keep habit</button><button class="button danger" data-action="confirm-delete" data-id="${app.modal.id}">Remove habit</button></div></div>`,
    );
  },
};
export const actions = {
  category(b, { a, id, sourceRect }) {
    app.openCategories.has(b.dataset.category)
      ? app.openCategories.delete(b.dataset.category)
      : app.openCategories.add(b.dataset.category);
    view.render();
  },
  'new-habit'(b, { a, id, sourceRect }) {
    openModal({ type: 'habit', category: b.dataset.category || 'body' });
  },
  'edit-habit'(b, { a, id, sourceRect }) {
    openModal({ type: 'habit', id });
  },
  'delete-habit'(b, { a, id, sourceRect }) {
    const h = app.state.habits.find(h => h.id === id);
    openModal({ type: 'confirm-delete', id, title: h.title });
  },
  'cancel-delete'(b, { a, id, sourceRect }) {
    openModal({ type: 'habit', id: app.modal.id });
  },
  'confirm-delete'(b, { a, id, sourceRect }) {
    commit(() => {
      app.state.habits = app.state.habits.filter(h => h.id !== id);
    });
    closeModal();
    toast('Habit removed. Earned XP stays with you.');
  },
  'suggest-habit'(b, { a, id, sourceRect }) {
    $('#habit-form [name="title"]').value = b.dataset.title;
    $('#habit-form [name="title"]').focus();
  },
  habit(b, { a, id, sourceRect }) {
    const h = app.state.habits.find(h => h.id === id),
      done = h.logs.some(l => l.day === today());
    const r = commit(() =>
      done ? E.undoHabit(app.state, id, today()) : E.completeHabit(app.state, id, today()),
    );
    if (!done && r) {
      sound('xp');
      rewardEffect(sourceRect, r.amount, 'xp');
      const row = document.querySelector(`.habit-complete[data-id="${CSS.escape(id)}"]`);
      row?.classList.add('just-done');
      burst(row?.querySelector('.habit-icon') || sourceRect, {
        palette: r.category,
        count: 12,
        distance: 44,
        size: 5,
      });
      if (r.leveled) celebrateLevel(r.category);
      toast(
        r.leveled
          ? `${E.CATEGORY_META[r.category].label} reached level ${E.level(app.state, r.category)}!`
          : `+${r.amount} ${E.CATEGORY_META[r.category].label} XP.`,
        () => commit(() => E.undoHabit(app.state, id, today())),
      );
    } else if (done) toast('Completion undone. XP restored to its previous value.');
  },
  harm(b, { a, id, sourceRect }) {
    const day = today();
    const damage = commit(() => E.logHarm(app.state, id, day));
    if (damage !== undefined) {
      sound('harm');
      const log = app.state.habits.find(h => h.id === id).harmLogs.at(-1);
      toast(`Noted. −${damage} HP.`, () => commit(() => E.undoHarm(app.state, id, log.id, day)));
    }
  },
};
export const forms = {
  'habit-form'(data) {
    const title = data.get('title').trim();
    if (!title) return;
    if (!validHabitIcon(data.get('icon'))) {
      toast('Choose a habit icon.');
      return;
    }
    const r = commit(() => {
      const h = app.state.habits.find(h => h.id === app.modal.id);
      if (h) {
        h.title = title;
        h.base = Number(data.get('base'));
        h.icon = data.get('icon');
      } else
        app.state.habits.push({
          id: E.uid(),
          title,
          category: data.get('category'),
          base: Number(data.get('base')),
          icon: data.get('icon'),
          logs: [],
          harmLogs: [],
          created: Date.now(),
        });
      app.openCategories.add(h?.category || data.get('category'));
      return true;
    });
    if (r) closeModal();
  },
};
export function onChange(event) {
  if (event.target.name === 'icon')
    $('#habit-icon-label').textContent = HABIT_ICONS.find(i => i.id === event.target.value).label;
  if (event.target.name === 'category') {
    const cat = event.target.value;
    $('#habit-base').innerHTML = habitOptions(cat);
    $('#effort-label').firstChild.textContent = cat === 'harm' ? 'HP cost' : 'Effort';
    $('#habit-suggestions').innerHTML = suggestionButtons(cat);
    $('#habit-form .form-help').textContent =
      cat === 'harm'
        ? 'Log it whenever it happens. It costs HP, with no XP or level.'
        : 'Available every day, once a day. No schedule to keep.';
    const selected = $('#habit-form [name="icon"]:checked').value;
    $('#habit-icon-picker').className = 'habit-icon-picker ' + cat;
    $('#habit-icon-options').innerHTML = habitIconOptions(cat, selected);
  }
}
