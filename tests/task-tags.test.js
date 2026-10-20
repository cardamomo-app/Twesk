import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';

const day = '2026-10-20';
const task = (state, title, extra = {}) => E.saveTask(state, { title, tier: 'quick', ...extra }, day);

test('removing a task tag matches whole Unicode tags, including repeats and case variants, without changing progress or Vault entries', () => {
  const s = E.freshState();
  s.tasks = [];
  const open = task(s, 'Send #HOME report #homework #Home', { steps: [{ title: 'Read it' }] });
  open.pinned = true;
  const done = task(s, 'Clean #home', { repeat: 'daily' });
  E.toggleTask(s, done.id, day);
  const other = task(s, 'Study #café #homework');
  E.saveNote(s, { text: 'Remember #home', kind: 'note' }, day);
  const expected = structuredClone(s);
  expected.tasks.find(t => t.id === open.id).title = 'Send report #homework';
  expected.tasks.find(t => t.id === done.id).title = 'Clean';
  const changes = E.removeTaskTag(s, '#home');
  assert.equal(changes.length, 2);
  assert.deepEqual(s, expected, 'only matching task titles change');
  assert.equal(E.removeTaskTag(s, '#CAFÉ').length, 1);
  assert.equal(other.title, 'Study #homework');
  assert.ok(E.validateState(structuredClone(s)));
});

test('tag cleanup Undo restores exact original titles but preserves later edits, deletions, and unrelated new tasks', () => {
  const s = E.freshState();
  s.tasks = [];
  const original = task(s, '  Keep #HOME  spelling');
  const edited = task(s, 'Edit #home');
  const deleted = task(s, 'Delete #home');
  const before = original.title;
  const changes = E.removeTaskTag(s, '#home');
  edited.title = 'A newer title #other';
  s.tasks = s.tasks.filter(t => t.id !== deleted.id);
  const newTask = task(s, 'New #home');
  assert.equal(E.undoTaskTagRemoval(s, changes), 1);
  assert.equal(original.title, before);
  assert.equal(edited.title, 'A newer title #other');
  assert.ok(!s.tasks.some(t => t.id === deleted.id));
  assert.equal(newTask.title, 'New #home');
});

test('tag-only tasks retain a valid title and invalid or missing tags do not modify the save', () => {
  const s = E.freshState();
  s.tasks = [];
  const onlyTag = task(s, '#Done');
  const changes = E.removeTaskTag(s, '#done');
  assert.equal(onlyTag.title, 'Untitled task');
  assert.ok(E.validateState(structuredClone(s)));
  E.undoTaskTagRemoval(s, changes);
  assert.equal(onlyTag.title, '#Done');
  const before = structuredClone(s);
  for (const tag of ['', null, '#do', '#done!', '#done #other']) assert.deepEqual(E.removeTaskTag(s, tag), []);
  assert.deepEqual(s, before);
});
