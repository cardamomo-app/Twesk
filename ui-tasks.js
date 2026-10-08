// Task list, task dialog, and task actions.
import * as E from './engine.js?v=0.7.5';
import { app, coin, esc, icon, iconButton, modalShell, toast, view } from './ui-core.js?v=0.8.0';
import { closeModal, commit, openModal } from './ui-modal.js?v=0.8.0';
import { rewardEffect, sound } from './ui-effects.js?v=0.8.0';
export function renderTasks() {
  const shown = app.state.tasks.filter(t => (app.taskView === 'done' ? t.done : !t.done));
  if (!shown.length)
    return `<div class="empty-state"><span class="empty-symbol">${icon('check')}</span><h3>${app.taskView === 'done' ? 'Your wins will live here' : 'A little breathing room'}</h3><p>${app.taskView === 'done' ? 'Complete a task to start your collection.' : 'Add a task, or bring an idea over from the Vault.'}</p>${app.taskView === 'active' ? '<button class="button secondary" data-action="new-task">Add your first task</button>' : ''}</div>`;
  const groups = [
    ['inbox', 'From the Vault', 'Ready to find a place'],
    ['quick', 'Little things', 'Quick wins · 4 gold'],
    ['standard', 'A little focus', 'Some time and attention · 10 gold'],
    ['hard', 'Deep work', 'Something more involved · 18 gold'],
    ['quest', 'Side quests', 'Bigger milestones · 40 gold'],
  ];
  return groups
    .map(([tier, label, sub]) => {
      const tasks = shown.filter(t => (tier === 'inbox' ? t.inbox : !t.inbox && t.tier === tier));
      if (!tasks.length) return '';
      return `<section class="task-group"><div class="group-heading"><h3>${label}</h3><span>${tasks.length}</span></div><p class="group-description">${sub}</p>${tasks.map(t => `<div class="task-row ${t.done ? 'completed' : ''}"><button class="task-check" data-action="toggle-task" data-id="${t.id}" aria-label="${t.done ? 'Undo' : 'Complete'} ${esc(t.title)}">${t.done ? icon('check') : ''}</button><span class="task-title">${esc(t.title)}</span><span class="task-reward">${coin(E.TASK_GOLD[t.tier], true)}</span>${iconButton('edit-task', 'more', 'Edit ' + t.title, `data-id="${t.id}"`)}</div>`).join('')}</section>`;
    })
    .join('');
}
export const modals = {
  task() {
    const t = app.state.tasks.find(t => t.id === app.modal.id);
    return modalShell(
      t ? 'Edit task' : 'A little thing to do',
      `<form id="task-form" class="form-body"><label>What’s on your mind?<input name="title" required maxlength="160" placeholder="Give this task a name" value="${esc(t?.title || app.modal.prefill || '')}" autofocus></label><label>How much does it ask of you?<select name="tier" ${t?.done ? 'disabled' : ''}>${Object.entries(
        E.TASK_GOLD,
      )
        .map(
          ([k, v]) =>
            `<option value="${k}" ${(t?.tier || 'quick') === k ? 'selected' : ''}>${{ quick: 'Little thing', standard: 'A little focus', hard: 'Deep work', quest: 'Side quest' }[k]} · ${v} gold</option>`,
        )
        .join(
          '',
        )}</select></label>${t?.inbox ? '<label class="checkbox-label"><input type="checkbox" name="sort" checked>Move out of the task inbox</label>' : ''}<div class="form-actions">${t ? `<button type="button" class="button danger subtle" data-action="delete-task" data-id="${t.id}">Delete task</button>` : '<span></span>'}<button class="button primary" type="submit">${t ? 'Save changes' : 'Add task'}${icon('plus')}</button></div></form>`,
    );
  },
};
export const actions = {
  'task-view'(b, { a, id, sourceRect }) {
    app.taskView = b.dataset.view;
    view.render();
  },
  'new-task'(b, { a, id, sourceRect }) {
    openModal({ type: 'task' });
  },
  'edit-task'(b, { a, id, sourceRect }) {
    openModal({ type: 'task', id });
  },
  'toggle-task'(b, { a, id, sourceRect }) {
    const r = commit(() => E.toggleTask(app.state, id));
    if (r > 0) {
      sound('coins');
      rewardEffect(sourceRect, r);
      toast(`Task cleared. +${r} gold.`, () =>
        commit(() => {
          if (app.state.tasks.find(t => t.id === id)?.done) E.toggleTask(app.state, id);
        }),
      );
    } else if (r < 0) toast('Task restored and reward reversed.');
  },
  'delete-task'(b, { a, id, sourceRect }) {
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
    const r = commit(() => {
      const t = app.state.tasks.find(t => t.id === app.modal.id);
      if (t) {
        t.title = title;
        if (!t.done) t.tier = data.get('tier');
        if (data.get('sort')) t.inbox = false;
      } else app.state.tasks.unshift({ id: E.uid(), title, tier: data.get('tier'), done: false, earned: 0 });
      return true;
    });
    if (r) closeModal();
  },
};
