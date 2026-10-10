// Task list, project filter, task dialog, and task actions.
import * as E from './engine.js?v=0.18.0';
import { $, app, coin, esc, icon, iconButton, modalShell, toast, today, view } from './ui-core.js?v=0.18.0';
import { closeModal, commit, openModal } from './ui-modal.js?v=0.18.0';
import { burst, motionOK, rewardEffect, sound } from './ui-effects.js?v=0.18.0';

const inProject = t => !app.taskProject || E.tags(t.title).includes(app.taskProject);
// Open tasks per project tag, in order of first appearance.
function projectCounts() {
  const counts = new Map();
  for (const t of app.state.tasks)
    for (const tag of E.tags(t.title)) counts.set(tag, (counts.get(tag) || 0) + (t.done ? 0 : 1));
  return counts;
}
export function renderProjects() {
  const counts = projectCounts();
  if (app.taskProject && !counts.has(app.taskProject)) app.taskProject = null;
  if (!counts.size) return '';
  const chip = (project, label, count) =>
    `<button class="project-chip ${app.taskProject === project ? 'selected' : ''}" data-action="task-project" data-project="${esc(project || '')}" aria-pressed="${app.taskProject === project}">${esc(label)}${count === null ? '' : `<span>${count}</span>`}</button>`;
  return `<div class="project-chips" role="group" aria-label="Filter tasks by project">${chip(null, 'All', null)}${[...counts].map(([tag, n]) => chip(tag, tag, n)).join('')}</div>`;
}
function dueLabel(due) {
  const days = E.daysBetween(today(), due);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  const date = new Date(`${due}T12:00:00Z`),
    format = days < 7 ? { weekday: 'long' } : { weekday: 'short', month: 'short', day: 'numeric' };
  return new Intl.DateTimeFormat('en', { ...format, timeZone: 'UTC' }).format(date);
}
// Title with each #tag as a button that filters to that project.
function taskTitle(title) {
  return title
    .split(/(#[\p{L}\p{N}_-]+)/u)
    .map((part, i) =>
      i % 2
        ? `<button class="task-tag" data-action="task-project" data-project="${esc(part.toLowerCase())}" title="Show ${esc(part)} tasks">${esc(part)}</button>`
        : esc(part),
    )
    .join('');
}
function taskMeta(t) {
  const back = t.done && t.due ? ` · back ${dueLabel(t.due)}` : '';
  return `<small class="task-meta"><span>${t.inbox ? 'From the Vault' : tierLabel(t.tier)}</span>${t.repeat ? `<span>${icon('repeat')}${E.REPEATS[t.repeat]}${back}</span>` : ''}</small>`;
}
const tierLabel = tier => ({ quick: 'Little thing', standard: 'A little focus', hard: 'Deep work', quest: 'Side quest' }[tier]);
function taskRow(t) {
  const steps = t.steps || [], done = steps.filter(step => step.done).length, expanded = app.openTaskSteps.has(t.id);
  return `<article class="task-item ${t.pinned ? 'is-pinned' : ''}" data-task-id="${t.id}"><div class="task-row ${t.done ? 'completed' : ''}">
    ${!t.done ? `<button class="task-grip" data-task-grip data-action="task-grip" data-id="${t.id}" aria-label="Reorder ${esc(t.title)}" title="Drag to reorder · ↑ / ↓ to move" aria-description="Drag to reorder, or use the up and down arrow keys.">${icon('grip')}</button>` : ''}
    <button class="task-check" data-action="toggle-task" data-id="${t.id}" aria-label="${t.done ? 'Undo' : 'Complete'} ${esc(t.title)}">${t.done ? icon('check') : ''}</button>
    <span class="task-text"><span class="task-title">${taskTitle(t.title)}</span>${taskMeta(t)}${steps.length ? `<button class="task-step-summary" data-action="task-steps" data-id="${t.id}" aria-expanded="${expanded}" aria-controls="steps-${t.id}" aria-label="${expanded ? 'Hide' : 'Show'} steps for ${esc(t.title)}"><span class="step-progress" aria-hidden="true"><span style="width:${done / steps.length * 100}%"></span></span>${done}/${steps.length} steps${icon('chevron')}</button>` : ''}</span>
    <span class="task-reward">${coin(E.TASK_GOLD[t.tier], true)}</span>
    ${!t.done ? `<button class="task-pin ${t.pinned ? 'selected' : ''}" data-action="pin-task" data-id="${t.id}" aria-label="${t.pinned ? 'Unpin' : 'Pin'} ${esc(t.title)}${t.pinned ? '' : ' to focus'}" aria-pressed="${!!t.pinned}" title="${t.pinned ? 'Remove from focus' : 'Pin to focus'}">${icon('pin')}</button>` : ''}
    ${iconButton('edit-task', 'more', 'Edit ' + t.title, `data-id="${t.id}"`)}</div>
    ${steps.length ? `<div class="task-steps" id="steps-${t.id}" ${expanded ? '' : 'hidden'}>${steps.map(step => `<label class="task-step ${step.done ? 'done' : ''}"><input type="checkbox" data-task-step data-id="${t.id}" data-step-id="${step.id}" ${step.done ? 'checked' : ''} ${t.done ? 'disabled' : ''}><span>${esc(step.title)}</span></label>`).join('')}</div>` : ''}</article>`;
}
export function renderTasks() {
  const shown = app.state.tasks.filter(t => (app.taskView === 'done' ? t.done : !t.done) && inProject(t));
  if (!shown.length) return '';
  if (app.taskView === 'done') return shown.map(taskRow).join('');
  const focus = shown.filter(t => t.pinned), others = shown.filter(t => !t.pinned);
  const totalFocus = app.state.tasks.filter(t => !t.done && t.pinned).length;
  return `<section class="task-focus ${focus.length ? 'has-focus' : ''}" data-task-list="focus" aria-label="Focus tasks"><div class="focus-heading">${icon('pin')}<h3>Focus</h3><span>${totalFocus}/3</span></div>${focus.map(taskRow).join('')}<div class="focus-drop-hint">Drop here to focus</div></section><section class="task-list" data-task-list="other" aria-label="Other tasks">${focus.length && others.length ? '<div class="other-tasks-heading">Other tasks</div>' : ''}${others.map(taskRow).join('')}</section>`;
}
function stepEditor(step = { id: '', title: '' }) {
  return `<div class="step-editor-row"><input type="hidden" name="stepId" value="${esc(step.id)}"><input name="stepTitle" aria-label="Step" maxlength="160" placeholder="A small next step" value="${esc(step.title)}"><button type="button" class="icon-button" data-action="remove-task-step" aria-label="Remove step">${icon('close')}</button></div>`;
}
export const modals = {
  task() {
    const t = app.state.tasks.find(t => t.id === app.modal.id);
    const tiers = Object.entries(E.TASK_GOLD)
      .map(
        ([k, v]) =>
          `<option value="${k}" ${(t?.tier || 'quick') === k ? 'selected' : ''}>${{ quick: 'Little thing', standard: 'A little focus', hard: 'Deep work', quest: 'Side quest' }[k]} · ${v} gold</option>`,
      )
      .join('');
    const repeats = [['', 'Doesn’t repeat'], ...Object.entries(E.REPEATS)]
      .map(
        ([k, label]) => `<option value="${k}" ${(t?.repeat || '') === k ? 'selected' : ''}>${label}</option>`,
      )
      .join('');
    return modalShell(
      t ? 'Edit task' : 'A little thing to do',
      `<form id="task-form" class="form-body"><label>What’s on your mind?<input name="title" required maxlength="160" placeholder="Give this task a name" data-tag-suggest aria-autocomplete="list" autocomplete="off" value="${esc(t?.title || app.modal.prefill || '')}" autofocus></label><p class="form-help">Add a #tag to group tasks into a project.</p><div class="form-grid"><label>How much does it ask of you?<select name="tier" ${t?.done ? 'disabled' : ''}>${tiers}</select></label><label>Repeats<select name="repeat">${repeats}</select></label></div><p class="form-help" id="repeat-help">${t?.repeat ? 'Earns gold each time. After you complete it, it comes back on its next date. Missed days don’t pile up.' : 'A repeating task earns gold each time and comes back on its next date.'}</p>
      ${!t?.done ? `<fieldset class="task-step-editor"><legend>Small steps <span>optional</span></legend><div id="task-step-fields">${(t?.steps || []).map(stepEditor).join('')}</div><button type="button" class="button secondary subtle add-step" data-action="add-task-step">${icon('plus')}Add a step</button><p class="form-help">Steps keep it manageable. Finish the whole task to earn its gold.</p></fieldset>` : ''}
      ${t?.inbox ? '<label class="checkbox-label"><input type="checkbox" name="sort" checked>Move out of the task inbox</label>' : ''}<div class="form-actions">${t ? `<span class="task-form-secondary"><button type="button" class="button danger subtle" data-action="delete-task" data-id="${t.id}">Delete task</button>${!t.done ? `<button type="button" class="button secondary subtle" data-action="task-to-vault" data-id="${t.id}" title="Take it off your list and keep it in the Vault to look into later">${icon('vault')}Move to Vault</button>` : ''}</span>` : '<span></span>'}<button class="button primary" type="submit">${t ? 'Save changes' : 'Add task'}${icon('plus')}</button></div></form>`,
    );
  },
};
const completing = new Set();
function celebrateToggle(r, sourceRect, id, day) {
  if (!r) return;
  if (r < 0) return toast('Task restored and reward reversed.');
  rewardEffect(sourceRect, r);
  const task = app.state.tasks.find(t => t.id === id);
  toast(`Task cleared. +${r} gold.${task?.repeat ? ` Back ${dueLabel(task.due)}.` : ''}`, () =>
    commit(() => {
      if (app.state.tasks.find(t => t.id === id)?.done) E.toggleTask(app.state, id, day);
    }),
  );
}
export const actions = {
  'pin-task'(b, { id }) {
    commit(() => E.pinTask(app.state, id));
  },
  'task-steps'(b, { id }) {
    if (app.openTaskSteps.has(id)) app.openTaskSteps.delete(id); else app.openTaskSteps.add(id);
    view.render();
  },
  'add-task-step'() {
    const fields = $('#task-step-fields');
    if (fields.children.length >= E.MAX_TASK_STEPS) return toast(`Use up to ${E.MAX_TASK_STEPS} steps.`);
    fields.insertAdjacentHTML('beforeend', stepEditor());
    fields.lastElementChild.querySelector('[name="stepTitle"]').focus();
  },
  'remove-task-step'(b) {
    const row = b.closest('.step-editor-row'), next = row.nextElementSibling || row.previousElementSibling;
    row.remove();
    (next?.querySelector('[name="stepTitle"]') || $('[data-action="add-task-step"]'))?.focus();
  },
  'task-view'(b) {
    app.taskView = b.dataset.view;
    view.render();
  },
  'task-project'(b) {
    const project = b.dataset.project || null;
    app.taskProject = app.taskProject === project ? null : project;
    view.render();
    $(`.project-chip[data-project="${CSS.escape(app.taskProject || '')}"]`)?.focus();
  },
  'new-task'() {
    // In a project view, new tasks start in that project.
    openModal({ type: 'task', prefill: app.taskProject ? ` ${app.taskProject}` : '' });
    if (app.taskProject) requestAnimationFrame(() => $('#task-form [name="title"]')?.setSelectionRange(0, 0));
  },
  'edit-task'(b, { id }) {
    openModal({ type: 'task', id });
  },
  'toggle-task'(b, { id, sourceRect }) {
    const day = today(),
      task = app.state.tasks.find(t => t.id === id);
    if (!task || completing.has(id)) return;
    const finish = () => {
      completing.delete(id);
      const r = commit(() => E.toggleTask(app.state, id, day));
      celebrateToggle(r, sourceRect, id, day);
    };
    if (task.done) return finish();
    // Feedback lands on the click; the row plays its check before leaving the list.
    sound('check');
    burst(b, { palette: 'gold', count: 12, distance: 46, size: 5 });
    b.closest('.task-row')?.classList.add('completing');
    if (!motionOK()) return finish();
    completing.add(id);
    setTimeout(finish, 430);
  },

  'task-to-vault'(b, { id }) {
    const moved = commit(() => E.returnTaskToVault(app.state, id));
    if (!moved) return;
    closeModal();
    sound('note');
    toast('Moved to the Vault to look at later. It’s waiting in Needs review.', () =>
      commit(() => E.undoReturnTaskToVault(app.state, moved.undo)),
    );
  },
  'delete-task'(b, { id }) {
    commit(() => {
      app.state.tasks = app.state.tasks.filter(t => t.id !== id);
      for (const n of app.state.notes) if (n.taskId === id) delete n.taskId;
    });
    closeModal();
    toast('Task removed.');
  },
};
export const forms = {
  'task-form'(data) {
    const title = data.get('title').trim();
    if (!title) return;
    const r = commit(() =>
      E.saveTask(
        app.state,
        {
          id: app.modal.id,
          title,
          tier: data.get('tier'),
          repeat: data.get('repeat') || null,
          sort: !!data.get('sort'),
          steps: app.state.tasks.find(t => t.id === app.modal.id)?.done ? undefined : data.getAll('stepTitle').map((title, i) => ({ id: data.getAll('stepId')[i] || undefined, title })).filter(step => step.title.trim()),
        },
        today(),
      ),
    );
    if (r) {
      if (r.steps?.length) app.openTaskSteps.add(r.id);
      closeModal();
      view.render();
    }
  },
};
