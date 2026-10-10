// Pointer dragging uses a dedicated handle so touch scrolling and task clicks stay natural.
import * as E from './engine.js?v=0.18.0';
import { $, app, toast, view } from './ui-core.js?v=0.18.0';
import { commit } from './ui-modal.js?v=0.18.0';

export function installTaskOrder() {
  let drag = null, frame = null;
  const clearMarks = () => document.querySelectorAll('.task-drop-before,.task-drop-after,.task-drop-zone').forEach(el => el.classList.remove('task-drop-before', 'task-drop-after', 'task-drop-zone'));
  function locate() {
    clearMarks();
    const hit = document.elementFromPoint(drag.x, drag.y), list = hit?.closest('[data-task-list]');
    drag.drop = null;
    if (!list) return;
    const row = hit.closest('[data-task-id]'), pinned = list.dataset.taskList === 'focus';
    if (row?.dataset.taskId === drag.id) return;
    if (row) {
      const after = drag.y > row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2;
      row.classList.add(after ? 'task-drop-after' : 'task-drop-before');
      drag.drop = { targetId: row.dataset.taskId, after, pinned };
    } else {
      list.classList.add('task-drop-zone');
      drag.drop = { targetId: null, pinned };
    }
  }
  function scroll() {
    if (!drag?.active) return;
    const list = $('.tasks-scroll'), box = list?.getBoundingClientRect();
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
    const { id, drop, active, handle } = drag;
    drag.ghost?.remove();
    cancelAnimationFrame(frame);
    clearMarks();
    document.body.classList.remove('task-dragging');
    document.querySelector('.task-being-dragged')?.classList.remove('task-being-dragged');
    if (handle.hasPointerCapture?.(drag.pointerId)) handle.releasePointerCapture(drag.pointerId);
    drag = null;
    app.taskDragging = false;
    if (!cancel && active && drop) commit(() => E.moveTask(app.state, id, drop.targetId, drop));
    view.modalClosed();
  }
  $('#app').addEventListener('pointerdown', event => {
    const handle = event.target.closest('[data-task-grip]');
    if (!handle || event.button !== 0 || app.modal || app.busy) return;
    drag = { id: handle.dataset.id, handle, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, active: false };
    handle.setPointerCapture(event.pointerId);
  });
  document.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.x = event.clientX; drag.y = event.clientY;
    if (!drag.active && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 6) {
      drag.active = true; app.taskDragging = true;
      document.body.classList.add('task-dragging');
      drag.handle.closest('.task-item').classList.add('task-being-dragged');
      drag.ghost = document.createElement('div');
      drag.ghost.className = 'task-drag-ghost';
      drag.ghost.textContent = app.state.tasks.find(t => t.id === drag.id)?.title || '';
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
  document.addEventListener('pointerup', event => { if (event.pointerId === drag?.pointerId) finish(); });
  document.addEventListener('pointercancel', () => finish(true));
  window.addEventListener('blur', () => finish(true));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && drag) { event.preventDefault(); finish(true); return; }
    const handle = event.target.closest('[data-task-grip]');
    if (!handle || !['ArrowUp', 'ArrowDown'].includes(event.key) || app.modal || app.busy) return;
    event.preventDefault();
    const rows = [...handle.closest('[data-task-list]').querySelectorAll('[data-task-id]')];
    const index = rows.findIndex(row => row.dataset.taskId === handle.dataset.id), down = event.key === 'ArrowDown', target = rows[index + (down ? 1 : -1)];
    if (!target) return;
    commit(() => E.moveTask(app.state, handle.dataset.id, target.dataset.taskId, { after: down }));
    $('[data-task-grip][data-id="' + CSS.escape(handle.dataset.id) + '"]')?.focus({ preventScroll: true });
    toast('Task moved ' + (down ? 'down.' : 'up.'));
  });
  $('#app').addEventListener('change', event => {
    const input = event.target.closest('[data-task-step]');
    if (!input) return;
    const id = input.dataset.id, stepId = input.dataset.stepId;
    commit(() => E.toggleTaskStep(app.state, id, stepId));
    $('.task-step input[data-step-id="' + CSS.escape(stepId) + '"]')?.focus({ preventScroll: true });
  });
}
