import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
const day = '2026-10-10';
const add = (s, title, extra = {}) => E.saveTask(s, { title, tier: 'hard', ...extra }, day);

test('focus is limited to three open tasks and completion frees a slot without changing rewards', () => {
  const s = E.freshState(), fourth = add(s, 'Fourth');
  for (const t of s.tasks.slice(1)) E.pinTask(s, t.id);
  assert.throws(() => E.pinTask(s, fourth.id), /three/);
  assert.equal(s.gold, 0);
  const first = s.tasks[1]; E.toggleTask(s, first.id, day);
  assert.equal(first.pinned, undefined); E.pinTask(s, fourth.id);
  E.toggleTask(s, first.id, day);
  assert.equal(s.tasks.filter(t => t.pinned).length, 3);
  assert.equal(s.gold, 0); assert.deepEqual(E.validateState(s), s);
});
test('manual order spans sizes and leaves tasks hidden by a filter in their relative order', () => {
  const s = E.freshState(), [a, b, c] = s.tasks, d = add(s, 'Fourth #work');
  a.title += ' #work'; c.title += ' #work';
  E.moveTask(s, c.id, a.id);
  assert.deepEqual(s.tasks.map(t => t.id), [d.id, c.id, a.id, b.id]);
  E.moveTask(s, d.id, a.id, { after: true });
  assert.deepEqual(s.tasks.map(t => t.id), [c.id, a.id, d.id, b.id]);
  assert.deepEqual(E.validateState(s).tasks.map(t => t.id), s.tasks.map(t => t.id));
});
test('reordering preserves focus membership and cannot move tasks across lists', () => {
  const s = E.freshState(), fourth = add(s, 'Fourth'), [a, b, c] = s.tasks.slice(1);
  E.pinTask(s, a.id); E.pinTask(s, b.id); E.pinTask(s, c.id);
  E.moveTask(s, c.id, a.id); E.moveTask(s, a.id, b.id, { after: true });
  assert.deepEqual(s.tasks.filter(t => t.pinned).map(t => t.id), [c.id, b.id, a.id]);
  const before = structuredClone(s);
  assert.throws(() => E.moveTask(s, fourth.id, a.id), /within the list/); assert.deepEqual(s, before);
  assert.throws(() => E.moveTask(s, b.id, fourth.id), /within the list/); assert.deepEqual(s, before);
  E.moveTask(s, c.id, null); assert.equal(c.pinned, true);
  E.pinTask(s, b.id); E.pinTask(s, fourth.id);
  assert.equal(b.pinned, undefined); assert.equal(fourth.pinned, true);
});
test('steps track progress without paying, parent completion pays once, and undo restores the checklist', () => {
  const s = E.freshState(), t = add(s, 'Large task', { steps: [{ title: 'Plan' }, { title: 'Make' }] });
  E.toggleTaskStep(s, t.id, t.steps[0].id);
  assert.equal(s.gold, 0); assert.equal(s.progress.tasks, 0);
  assert.equal(E.toggleTask(s, t.id, day), 18); assert.ok(t.steps.every(step => step.done));
  assert.throws(() => E.toggleTaskStep(s, t.id, t.steps[0].id));
  const restored = E.validateState(s); E.toggleTask(restored, t.id, day);
  assert.deepEqual(restored.tasks.find(x => x.id === t.id).steps.map(step => step.done), [true, false]);
  assert.equal(restored.gold, 0); assert.equal(restored.progress.tasks, 0);
});
test('editing step names preserves checks by identity and new steps start unchecked', () => {
  const s = E.freshState(), t = add(s, 'Large task', { steps: [{ title: 'Plan' }, { title: 'Make' }] });
  E.toggleTaskStep(s, t.id, t.steps[0].id);
  E.saveTask(s, { id: t.id, title: t.title, tier: 'hard', steps: [{ ...t.steps[0], title: 'New plan' }, { title: 'Ship', done: true }] }, day);
  assert.deepEqual(t.steps.map(step => step.done), [true, false]);
  assert.equal(t.steps[0].title, 'New plan');
  E.toggleTask(s, t.id, day);
  E.saveTask(s, { id: t.id, title: 'Renamed completed task', tier: null }, day);
  assert.equal(t.tier, 'hard'); assert.equal(t.steps.length, 2); assert.deepEqual(E.validateState(s), s);
});
test('recurring tasks reopen with fresh steps, without reversing their earned gold', () => {
  const s = E.freshState(), t = add(s, 'Weekly work', { repeat: 'weekly', steps: [{ title: 'First' }] });
  E.pinTask(s, t.id); E.toggleTask(s, t.id, day);
  E.rollover(s, '2026-10-17'); assert.equal(t.done, false); assert.equal(t.pinned, undefined);
  assert.equal(t.steps[0].done, false); assert.equal(t.stepsBeforeDone, undefined); assert.equal(s.gold, 18);
});
test('moving tasks through the Vault preserves small steps and Undo cannot overfill focus', () => {
  const s = E.freshState(), t = add(s, 'Large task', { steps: [{ title: 'First' }, { title: 'Second' }] });
  E.toggleTaskStep(s, t.id, t.steps[0].id); E.pinTask(s, t.id);
  const moved = E.returnTaskToVault(s, t.id), backup = E.validateState(s);
  const back = E.convertNote(backup, moved.note.id);
  assert.deepEqual(back.steps, t.steps); assert.equal(back.pinned, undefined);
  for (const other of s.tasks) E.pinTask(s, other.id);
  E.undoReturnTaskToVault(s, moved.undo); assert.equal(s.tasks.find(x => x.id === t.id).pinned, undefined);
  assert.deepEqual(E.validateState(s), s);
});
test('old saves remain unchanged and malformed focus or steps cannot enter through a backup', () => {
  const old = E.freshState(); assert.deepEqual(E.validateState(old), old);
  const variants = [
    s => { for (const t of s.tasks) t.pinned = true; s.tasks.push({ ...s.tasks[0], id: 'fourth' }); },
    s => { s.tasks[0].pinned = 'yes'; },
    s => { s.tasks[0].steps = [{ id: 'one', title: 'Step', done: 'yes' }]; },
    s => { s.tasks[0].steps = [{ id: 'one', title: '', done: false }]; },
    s => { s.tasks[0].steps = Array.from({ length: 31 }, (_, i) => ({ id: `step${i}`, title: 'Step', done: false })); },
    s => { s.tasks[0].steps = [{ id: 'one', title: 'Step', done: false }, { id: 'one', title: 'Duplicate', done: false }]; },
    s => { s.tasks[0].stepsBeforeDone = ['unknown']; },
  ];
  for (const change of variants) { const s = E.freshState(); change(s); assert.throws(() => E.validateState(s)); }
});
