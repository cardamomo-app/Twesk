// Pointer dragging uses a dedicated handle so touch scrolling and task clicks stay natural.
// Tasks reorder in their list and habits within their category; either can be dropped on the adventure box.
import * as E from './engine.js?v=0.23.2';
import { $, app, toast, today, view } from './ui-core.js?v=0.23.2';
import { commit } from './ui-modal.js?v=0.23.2';
import { sound } from './ui-effects.js?v=0.23.2';

const KINDS = {
  task: { grip: 'data-task-grip', list: 'taskList', row: 'taskId', panel: '.tasks-panel', scroller: '.tasks-scroll', items: s => s.tasks, move: E.moveTask },
  habit: { grip: 'data-habit-grip', list: 'habitList', row: 'habitId', panel: '.habits-panel', scroller: '.habits-scroll', items: s => s.habits, move: E.moveHabit },
};
const attr = key => key.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
const kindOf = handle => (handle.matches('[data-habit-grip],[data-habit-drag]') ? 'habit' : 'task');

export function installTaskOrder() {
  let drag = null, frame = null, swallowClick = false;
  const clearMarks = () => document.querySelectorAll('.task-drop-before,.task-drop-after,.quest-drop-ready,.task-drop-end').forEach(el => el.classList.remove('task-drop-before', 'task-drop-after', 'quest-drop-ready', 'task-drop-end'));
  function locate() {
    clearMarks();
    const k = KINDS[drag.kind], listAttr = `[data-${attr(k.list)}]`, rowAttr = `[data-${attr(k.row)}]`;
    const hit = document.elementFromPoint(drag.x, drag.y), list = hit?.closest(listAttr);
    drag.drop = null;
    const quest = hit?.closest('[data-quest-drop]');
    if (quest) {
      if (drag.fromQuest || !drag.questable) return; // already the adventure, or a Harm habit
      quest.classList.add('quest-drop-ready'); drag.drop = { quest: true }; return;
    }
    // The adventure returns anywhere in its list, or via the panel's empty space (tasks go to the end; habits keep their place).
    if (drag.fromQuest && (!list || list.dataset[k.list] !== drag.list)) {
      const panel = hit?.closest(k.panel);
      if (panel) { panel.classList.add('task-drop-end'); drag.drop = drag.kind === 'task' ? { targetId: null } : {}; }
      return;
    }
    if (!list || list.dataset[k.list] !== drag.list) return;
    let row = hit.closest(rowAttr);
    if (!row) {
      const rows = [...list.querySelectorAll(rowAttr)].filter(row => row.dataset[k.row] !== drag.id);
      row = rows.find(row => drag.y < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2) || rows.at(-1);
    }
    if (row?.dataset[k.row] === drag.id) { if (drag.fromQuest) drag.drop = {}; return; }
    if (row) {
      const after = drag.y > row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2;
      row.classList.add(after ? 'task-drop-after' : 'task-drop-before');
      drag.drop = { targetId: row.dataset[k.row], after };
    } else if (drag.fromQuest) drag.drop = {};
  }
  function scroll() {
    if (!drag?.active) return;
    const list = $(KINDS[drag.kind].scroller), box = list?.getBoundingClientRect();
    if (box && drag.x >= box.left && drag.x <= box.right) {
      const top = Math.max(box.top, 0), bottom = Math.min(box.bottom, window.innerHeight);
      if (drag.y < top + 42) list.scrollTop -= 8;
      else if (drag.y > bottom - 42) list.scrollTop += 8;
      if (drag.y < 50) window.scrollBy(0, -8);
      else if (drag.y > window.innerHeight - 50) window.scrollBy(0, 8);
    }
    locate();
    frame = requestAnimationFrame(scroll);
  }
  function finish(cancel = false) {
    if (!drag) return;
    const { id, kind, drop, active, handle, fromQuest } = drag;
    drag.ghost?.remove();
    cancelAnimationFrame(frame);
    clearMarks();
    document.body.classList.remove('task-dragging');
    document.querySelector('.task-being-dragged')?.classList.remove('task-being-dragged');
    if (handle.hasPointerCapture?.(drag.pointerId)) handle.releasePointerCapture(drag.pointerId);
    drag = null;
    app.taskDragging = false;
    // A drag that started on a habit's icon must not also complete the habit when released.
    if (active && handle.hasAttribute('data-habit-drag')) { swallowClick = true; setTimeout(() => (swallowClick = false)); }
    if (!cancel && active && drop) {
      const moved = commit(() => {
        if (drop.quest) return E.setCurrentQuest(app.state, id, today());
        if (fromQuest) E.setCurrentQuest(app.state);
        return drop.targetId === undefined || KINDS[kind].move(app.state, id, drop.targetId, drop);
      });
      if (moved && fromQuest) sound('note');
      if (moved && drop.quest) { sound('note'); $('[data-action="quest-play"]')?.focus({ preventScroll: true }); }
    }
    view.modalClosed();
  }
  $('#app').addEventListener('pointerdown', event => {
    // A habit's icon also works as a handle with a mouse or pen; on touch it stays a tap target, so lists still scroll.
    const handle = event.target.closest('[data-task-grip],[data-habit-grip]') || (event.pointerType !== 'touch' && event.target.closest('[data-habit-drag]'));
    if (!handle || event.button !== 0 || app.modal || app.busy) return;
    // The adventure task stays put while its timer runs.
    const fromQuest = handle.hasAttribute('data-quest-grip');
    if (fromQuest && handle.closest('.quest-card')?.classList.contains('is-walking')) return;
    const kind = kindOf(handle), item = KINDS[kind].items(app.state).find(x => x.id === handle.dataset.id);
    if (!item) return;
    const list = kind === 'task' ? 'other' : item.category;
    drag = { id: item.id, kind, fromQuest, list, questable: kind === 'task' || (item.category !== 'harm' && !item.logs.some(l => l.day === today())), handle, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, active: false };
    handle.setPointerCapture(event.pointerId);
  });
  document.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.x = event.clientX; drag.y = event.clientY;
    if (!drag.active && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 6) {
      drag.active = true; app.taskDragging = true;
      document.body.classList.add('task-dragging');
      drag.handle.closest('.task-item,.quest-task,.habit-row').classList.add('task-being-dragged');
      drag.ghost = document.createElement('div');
      drag.ghost.className = 'task-drag-ghost';
      drag.ghost.textContent = KINDS[drag.kind].items(app.state).find(x => x.id === drag.id)?.title || '';
      document.body.append(drag.ghost);
      frame = requestAnimationFrame(scroll);
    }
    if (drag.active) {
      event.preventDefault();
      drag.ghost.style.left = `${Math.min(drag.x + 14, window.innerWidth - 210)}px`;
      drag.ghost.style.top = `${drag.y + 12}px`;
      locate();
    }
  }, { passive: false });
  document.addEventListener('click', event => { if (swallowClick) { swallowClick = false; event.preventDefault(); event.stopPropagation(); } }, true);
  document.addEventListener('pointerup', event => { if (event.pointerId === drag?.pointerId) finish(); });
  document.addEventListener('pointercancel', () => finish(true));
  window.addEventListener('blur', () => finish(true));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && drag) { event.preventDefault(); finish(true); return; }
    const handle = event.target.closest('[data-task-grip],[data-habit-grip]');
    // Arrow keys reorder list rows; the adventure returns via its ⋯ menu instead.
    if (!handle || handle.hasAttribute('data-quest-grip') || !['ArrowUp', 'ArrowDown'].includes(event.key) || app.modal || app.busy) return;
    event.preventDefault();
    const kind = kindOf(handle), k = KINDS[kind];
    const rows = [...handle.closest(`[data-${attr(k.list)}]`).querySelectorAll(`[data-${attr(k.row)}]`)];
    const index = rows.findIndex(row => row.dataset[k.row] === handle.dataset.id), down = event.key === 'ArrowDown', target = rows[index + (down ? 1 : -1)];
    if (!target) return;
    commit(() => k.move(app.state, handle.dataset.id, target.dataset[k.row], { after: down }));
    $(`[${k.grip}][data-id="${CSS.escape(handle.dataset.id)}"]`)?.focus({ preventScroll: true });
    toast(`${kind === 'task' ? 'Task' : 'Habit'} moved ${down ? 'down.' : 'up.'}`);
  });
  document.addEventListener('change', event => {
    const input = event.target.closest('[data-task-step]');
    if (!input || app.busy) return;
    const id = input.dataset.id, stepId = input.dataset.stepId;
    commit(() => E.toggleTaskStep(app.state, id, stepId));
    $('.task-step input[data-step-id="' + CSS.escape(stepId) + '"]')?.focus({ preventScroll: true });
  });
}
