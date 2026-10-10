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
test('an adventure replaces earlier focus pins, can be released, and survives a backup', () => {
  const s = E.freshState(), [a, b, c] = s.tasks;
  E.pinTask(s, a.id); E.pinTask(s, b.id); E.pinTask(s, c.id);
  const order = s.tasks.map(t => t.id);
  E.setCurrentQuest(s, b.id);
  assert.deepEqual(s.tasks.filter(t => t.pinned).map(t => t.id), [b.id]);
  assert.deepEqual(E.validateState(s).tasks.filter(t => t.pinned).map(t => t.id), [b.id]);
  assert.deepEqual(s.tasks.map(t => t.id), order); assert.equal(s.gold, 0);
  const before = structuredClone(s);
  assert.throws(() => E.setCurrentQuest(s, 'missing')); assert.deepEqual(s, before);
  E.toggleTask(s, c.id, day);
  assert.throws(() => E.setCurrentQuest(s, c.id)); assert.equal(b.pinned, true);
  E.moveTask(s, a.id, b.id, { after: true }); assert.equal(b.pinned, true);
  E.setCurrentQuest(s); assert.ok(s.tasks.every(t => !t.pinned));
  E.setCurrentQuest(s, a.id);
  const moved = E.returnTaskToVault(s, a.id); E.setCurrentQuest(s, b.id); E.undoReturnTaskToVault(s, moved.undo);
  assert.deepEqual(s.tasks.filter(t => t.pinned).map(t => t.id), [b.id]);
  E.setCurrentQuest(s, a.id); E.toggleTask(s, a.id, day);
  assert.equal(s.tasks.find(t => t.id === a.id).pinned, undefined);
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
test('a positive habit can be the adventure, replacing a task, and leaves the card once completed', () => {
  const s = E.freshState(), [task] = s.tasks, h = s.habits.find(h => h.category === 'mind');
  E.setCurrentQuest(s, task.id);
  assert.equal(E.setCurrentQuest(s, h.id, day), h);
  assert.equal(task.pinned, undefined, 'the task returns to the list');
  assert.equal(h.pinned, true); assert.deepEqual(E.validateState(s), s);
  E.completeHabit(s, h.id, day);
  assert.equal(h.pinned, undefined, 'a completed habit leaves the adventure');
  assert.throws(() => E.setCurrentQuest(s, h.id, day), /open task or habit/, 'not again on the same day');
  E.setCurrentQuest(s, h.id); E.setCurrentQuest(s, task.id);
  assert.equal(h.pinned, undefined, 'a task replaces the habit');
});
test('Harm habits cannot be adventures, and a pinned Harm habit is rejected as a save', () => {
  const s = E.freshState(), harm = s.habits.find(h => h.category === 'harm');
  assert.throws(() => E.setCurrentQuest(s, harm.id, day));
  harm.pinned = true; assert.throws(() => E.validateState(structuredClone(s)));
});
test('habits reorder only within their category', () => {
  const s = E.freshState(), body = () => s.habits.filter(h => h.category === 'body').map(h => h.id);
  const [first, second, ...rest] = body();
  E.moveHabit(s, second, first);
  assert.deepEqual(body(), [second, first, ...rest]);
  E.moveHabit(s, second, first, { after: true });
  assert.deepEqual(body(), [first, second, ...rest]);
  assert.throws(() => E.moveHabit(s, first, s.habits.find(h => h.category === 'mind').id), /same category/);
  assert.deepEqual(E.validateState(s).habits.map(h => h.id), s.habits.map(h => h.id));
});
