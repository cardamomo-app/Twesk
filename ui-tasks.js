// Task list, project filter, task dialog, and task actions.
import * as E from './engine.js?v=0.41.5';
import { $, app, coin, esc, icon, iconButton, modalShell, tagStyle, toast, today, view } from './ui-core.js?v=0.41.5';
import { closeModal, commit, openModal } from './ui-modal.js?v=0.41.5';
import { burst, motionOK, rewardEffect, sound } from './ui-effects.js?v=0.41.5';
import { TAG_COLORS } from './tag-colors.js?v=0.41.5';

const NO_TAG = '__untagged__';
const inProject = t => !app.taskProject || (app.taskProject === NO_TAG ? E.tags(t.title).length === 0 : E.tags(t.title).includes(app.taskProject));
// Open tasks per project tag, in order of first appearance.
function projectCounts() {
  const counts = new Map();
  for (const t of app.state.tasks)
    for (const tag of E.tags(t.title)) counts.set(tag, (counts.get(tag) || 0) + (t.done ? 0 : 1));
  return counts;
}
export function renderProjects() {
  const counts = projectCounts();
  if (app.taskProject && app.taskProject !== NO_TAG && !counts.has(app.taskProject)) app.taskProject = null;
  if (!app.state.tasks.length) return '';
  const untagged = app.state.tasks.filter(t => !t.done && E.tags(t.title).length === 0).length;
  const chip = (project, label, count) =>
    `<button class="project-chip ${project?.startsWith('#') ? 'tag-colored' : ''} ${app.taskProject === project ? 'selected' : ''}" ${project?.startsWith('#') ? tagStyle(project) : ''} data-action="task-project" data-project="${esc(project || '')}" aria-pressed="${app.taskProject === project}">${esc(label)}${count === null ? '' : `<span>${count}</span>`}</button>`;
  return `<div class="project-chips" role="group" aria-label="Filter tasks by project">${chip(null, 'All', null)}${chip(NO_TAG, 'No tag', untagged)}${[...counts].map(([tag, n]) => chip(tag, tag, n)).join('')}${counts.size ? `<button class="icon-button project-manage" data-action="manage-task-tags" aria-label="Manage task tags" title="Manage task tags">${icon('tag')}</button>` : ''}</div>`;
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
        ? `<button class="task-tag tag-colored" ${tagStyle(part)} data-action="task-project" data-project="${esc(part.toLowerCase())}" title="Show ${esc(part)} tasks">${esc(part)}</button>`
        : esc(part),
    )
    .join('');
}
function taskMeta(t) {
  if (!t.repeat) return '';
  const back = t.done && t.due ? `back ${dueLabel(t.due)}` : '';
  // Beside the gold: the schedule for open tasks, or when a finished repeat comes back.
  const full = `Repeats ${E.REPEATS[t.repeat].toLowerCase()}${back ? ` · ${back}` : ''}`;
  return `<small class="task-meta" title="${full}" aria-label="${full}">${icon('repeat')}<span class="task-meta-text">${back || E.REPEATS[t.repeat]}</span></small>`;
}
const tierLabel = tier => ({ quick: 'Little thing', standard: 'A little focus', hard: 'Deep work', quest: 'Side quest' }[tier]);
function taskRow(t) {
  const steps = t.steps || [], done = steps.filter(step => step.done).length, expanded = app.openTaskSteps.has(t.id);
  // Steps live under the title, aligned with it; the repeat schedule sits under the gold on the right.
  const stepBlock = steps.length
    ? `<button class="task-step-summary" data-action="task-steps" data-id="${t.id}" aria-expanded="${expanded}" aria-controls="steps-${t.id}" aria-label="${expanded ? 'Hide' : 'Show'} steps for ${esc(t.title)}"><span class="step-progress" aria-hidden="true"><span style="width:${(done / steps.length) * 100}%"></span></span><span>${done}/${steps.length} steps</span>${icon('chevron')}</button><div class="task-steps" id="steps-${t.id}" ${expanded ? '' : 'hidden'}>${steps.map(step => `<label class="task-step ${step.done ? 'done' : ''}"><input type="checkbox" data-task-step data-id="${t.id}" data-step-id="${step.id}" ${step.done ? 'checked' : ''} ${t.done ? 'disabled' : ''}><span>${esc(step.title)}</span></label>`).join('')}</div>`
    : '';
  return `<article class="task-item ${t.pinned ? 'is-pinned' : ''}" data-task-id="${t.id}"><div class="task-row ${t.done ? 'completed' : ''}">
    ${!t.done ? `<button class="task-grip" data-task-grip data-action="task-grip" data-id="${t.id}" aria-label="Reorder ${esc(t.title)}" title="Drag to reorder · ↑ / ↓ to move" aria-description="Drag to reorder, or use the up and down arrow keys.">${icon('grip')}</button>` : ''}
    <button class="task-check" data-action="toggle-task" data-id="${t.id}" aria-label="${t.done ? 'Undo' : 'Complete'} ${esc(t.title)}">${t.done ? icon('check') : ''}</button>
    <span class="task-text"><span class="task-title">${taskTitle(t.title)}</span>${stepBlock}</span>
    <span class="task-side">${t.repeat ? `${taskMeta(t)}<span class="task-side-rule" aria-hidden="true"></span>` : ''}<span class="task-reward">${coin(E.TASK_GOLD[t.tier], true)}</span></span>
    ${iconButton('edit-task', 'more', 'Edit ' + t.title, `data-id="${t.id}"`)}</div></article>`;
}
export function renderTasks() {
  const shown = app.state.tasks.filter(t => (app.taskView === 'done' ? t.done : !t.done) && inProject(t));
  if (!shown.length) return '';
  if (app.taskView === 'done') return shown.map(taskRow).join('');
  const current = app.state.tasks.find(t => !t.done && t.pinned);
  const others = shown.filter(t => t.id !== current?.id);
  return `<section class="task-list" data-task-list="other" aria-label="Other tasks">${others.map(taskRow).join('')}</section>`;
}
function stepEditor(step = { id: '', title: '' }) {
  return `<div class="step-editor-row"><input type="hidden" name="stepId" value="${esc(step.id)}"><input name="stepTitle" aria-label="Step" maxlength="160" placeholder="A small next step" value="${esc(step.title)}"><button type="button" class="icon-button" data-action="remove-task-step" aria-label="Remove step">${icon('close')}</button></div>`;
}
export const modals = {
  'task-tags'() {
    const rows = [...projectCounts()].map(([tag, open], index) => {
      const total = app.state.tasks.filter(t => E.tags(t.title).includes(tag)).length;
      const hue = E.tagHue(app.state, tag), expanded = app.modal.colorTag === tag;
      const choices = TAG_COLORS.some(color => color.hue === hue) ? TAG_COLORS : [{ hue, name: 'Current' }, ...TAG_COLORS];
      const palette = expanded ? `<div class="task-tag-palette" id="tag-palette-${index}" role="group" aria-label="Color for ${esc(tag)}">${choices.map(color => `<button class="tag-color-swatch tag-colored ${color.name === 'Current' ? 'tag-color-current' : ''} ${color.hue === hue ? 'selected' : ''}" style="--tag-hue:${color.hue};--tag-swatch:${color.swatch || `hsl(${color.hue} 68% 60%)`}" data-action="set-task-tag-color" data-tag="${esc(tag)}" data-hue="${color.hue}" aria-label="${color.name} for ${esc(tag)}" aria-pressed="${color.hue === hue}" title="${color.name}"><span>${color.hue === hue ? icon('check') : ''}</span><small>${color.name === 'Current' ? 'Current color' : color.name}</small></button>`).join('')}</div>` : `<div id="tag-palette-${index}" hidden></div>`;
      return `<div class="task-tag-entry" role="listitem"><div class="task-tag-row tag-colored" ${tagStyle(tag)}><button class="task-tag-mark task-tag-color" data-action="choose-task-tag-color" data-tag="${esc(tag)}" aria-label="Change color for ${esc(tag)}" title="Change color for ${esc(tag)}" aria-expanded="${expanded}" aria-controls="tag-palette-${index}">${icon('tag')}</button><span class="task-tag-info"><strong>${esc(tag)}</strong><small>${open} open · ${total - open} completed</small></span><button class="button secondary task-tag-remove" data-action="remove-task-tag" data-tag="${esc(tag)}" aria-label="Remove ${esc(tag)} from tasks">${icon('trash')}Remove</button></div>${palette}</div>`;
    }).join('');
    return modalShell('Task tags', `<div class="form-body task-tag-manager"><p>Click a tag’s color to change it. Removing a tag clears it from open and completed tasks; Vault entries keep their tags.</p><div class="task-tag-list" role="list" aria-label="Task tags">${rows || '<p class="task-tag-empty">No task tags to manage.</p>'}</div></div>`, 'task-tags-modal');
  },
  task() {
    const t = app.state.tasks.find(t => t.id === app.modal.id);
    const tiers = Object.entries(E.TASK_GOLD)
      .map(([key, gold]) => `<label class="task-size-choice"><input type="radio" name="tier" value="${key}" aria-label="${tierLabel(key)}, ${gold} gold" ${(t?.tier || 'quick') === key ? 'checked' : ''} ${t?.done ? 'disabled' : ''}><span class="task-size-face"><span>${tierLabel(key)}</span>${coin(gold, true)}</span></label>`)
      .join('');
    const repeats = [['', 'Once'], ['daily', 'Daily'], ['weekdays', 'Weekdays'], ['weekly', 'Weekly'], ['monthly', 'Monthly']]
      .map(([key, label]) => `<label class="task-repeat-choice"><input type="radio" name="repeat" value="${key}" ${(t?.repeat || '') === key ? 'checked' : ''}><span>${label}</span></label>`)
      .join('');
    return modalShell(
      `<span class="task-dialog-title"><span class="task-dialog-mark">${icon('check')}</span>${t ? 'Edit task' : 'New task'}</span>`,
      `<form id="task-form" class="form-body task-form">
        <div class="task-name-field"><label for="task-title">Task</label><input id="task-title" name="title" required maxlength="160" placeholder="What’s your next move?" data-tag-suggest aria-autocomplete="list" aria-describedby="task-tag-hint" autocomplete="off" value="${esc(t?.title || app.modal.prefill || '')}" autofocus><p id="task-tag-hint">Add a <span>#tag</span> to group into a project.</p></div>
        <fieldset class="task-size-picker"><legend>Reward</legend><div class="task-size-options">${tiers}</div></fieldset>
        <fieldset class="task-repeat-picker"><legend>${icon('repeat')}Repeat</legend><div class="task-repeat-options">${repeats}</div></fieldset>
        ${!t?.done ? `<fieldset class="task-step-editor"><legend>Steps</legend><div id="task-step-fields">${(t?.steps || []).map(stepEditor).join('')}</div><button type="button" class="button secondary subtle add-step" data-action="add-task-step">${icon('plus')}Add a step</button></fieldset>` : ''}
        ${t?.inbox ? '<label class="checkbox-label"><input type="checkbox" name="sort" checked>Move out of the task inbox</label>' : ''}
        <div class="form-actions task-dialog-actions">${t ? `<span class="task-form-secondary"><button type="button" class="icon-button task-delete" data-action="delete-task" data-id="${t.id}" aria-label="Delete task" title="Delete task">${icon('trash')}</button>${!t.done ? `<button type="button" class="button secondary subtle" data-action="task-to-vault" data-id="${t.id}" title="Take it off your list and keep it in the Vault to look into later">${icon('vault')}To Vault</button>` : ''}</span>` : '<span></span>'}<button class="button primary" type="submit" aria-keyshortcuts="Meta+Enter Control+Enter" title="Confirm (⌘Enter / Ctrl+Enter)">${t ? 'Save changes' : 'Add task'}${icon(t ? 'check' : 'plus')}</button></div>
      </form>`,
      'task-modal',
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
  'manage-task-tags'() {
    openModal({ type: 'task-tags' });
  },
  'choose-task-tag-color'(b) {
    const tag = b.dataset.tag;
    app.modal.colorTag = app.modal.colorTag === tag ? null : tag;
    view.renderModal();
    $(`#overlay [data-action="choose-task-tag-color"][data-tag="${CSS.escape(tag)}"]`)?.focus();
  },
  'set-task-tag-color'(b) {
    const tag = b.dataset.tag, hue = Number(b.dataset.hue);
    const result = commit(() => E.setTagColor(app.state, tag, hue));
    if (result !== undefined) $(`#overlay [data-action="set-task-tag-color"][data-tag="${CSS.escape(tag)}"][data-hue="${hue}"]`)?.focus();
  },
  'remove-task-tag'(b) {
    const tag = b.dataset.tag;
    if (app.modal.colorTag === tag) app.modal.colorTag = null;
    const index = [...b.closest('.task-tag-list').querySelectorAll('[data-action="remove-task-tag"]')].indexOf(b);
    const changes = commit(() => E.removeTaskTag(app.state, tag));
    if (!changes?.length) return;
    const buttons = [...document.querySelectorAll('#overlay [data-action="remove-task-tag"]')];
    (buttons[Math.min(index, buttons.length - 1)] || $('#overlay [data-action="close-modal"]'))?.focus();
    toast(`${tag} removed from ${changes.length} ${changes.length === 1 ? 'task' : 'tasks'}.`, () => {
      const restored = commit(() => E.undoTaskTagRemoval(app.state, changes));
      if (restored) toast(`${tag} restored.`);
    });
  },
  'new-task'() {
    // In a project view, new tasks start in that project.
    const project = app.taskProject && app.taskProject !== NO_TAG ? app.taskProject : null;
    openModal({ type: 'task', prefill: project ? ` ${project}` : '' });
    if (project) requestAnimationFrame(() => $('#task-form [name="title"]')?.setSelectionRange(0, 0));
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
    const creating = !app.modal.id;
    const r = commit(() => {
      const task = E.saveTask(
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
      );
      return task;
    });
    if (r) {
      if (creating) sound('taskCreated');
      if (r.steps?.length) app.openTaskSteps.add(r.id);
      closeModal();
      view.render();
    }
  },
};
