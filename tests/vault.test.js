import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { inVaultSection, needsReview, vaultTone } from '../vault-model.js';
import { vaultArt } from '../vault-art.js';
const day = '2026-10-15';
test('notes enter review, while journals and healing reflections go straight to Journal', () => {
  const s = E.freshState(); s.hp = 30;
  const note = E.saveNote(s, { text: 'A new idea' }, day).note;
  const journal = E.saveNote(s, { text: 'Today I found some quiet.', kind: 'journal' }, day).note;
  const reflection = E.saveNote(s, { text: 'I need more rest and more time outside.', recovery: true }, day).note;
  assert.equal(note.status, 'inbox'); assert.equal(journal.status, 'kept'); assert.equal(reflection.status, 'kept');
  assert.equal(reflection.kind, 'journal'); assert.ok(s.hp > 30);
  assert.ok(needsReview(note)); assert.ok(!needsReview(journal)); assert.ok(!needsReview(reflection));
  for (const entry of [journal, reflection]) {
    assert.ok(inVaultSection(entry, 'journal')); assert.ok(!inVaultSection(entry, 'kept')); assert.ok(!inVaultSection(entry, 'inbox'));
    E.saveNote(s, { id: entry.id, text: entry.text + ' A revised thought.' }, day);
    assert.equal(entry.kind, 'journal'); assert.equal(entry.status, 'kept');
  }
});
test('older inbox journals migrate quietly, while archived journals stay archived', () => {
  const s = E.freshState(), j = E.saveNote(s, { text: 'An older journal', kind: 'journal' }, day).note;
  j.status = 'inbox';
  const archived = E.saveNote(s, { text: 'Put away', kind: 'journal' }, day).note; archived.status = 'archived';
  const gold = s.gold, progress = structuredClone(s.progress), restored = E.validateState(s);
  assert.equal(restored.notes.find(n => n.id === j.id).status, 'kept');
  assert.equal(restored.notes.find(n => n.id === archived.id).status, 'archived');
  assert.equal(restored.gold, gold); assert.deepEqual(restored.reviewDates, []); assert.deepEqual(restored.progress, progress);
});
test('Notes and Journal are exclusive shelves; All and Archive remain useful collections', () => {
  const notes = [
    { kind: 'note', status: 'inbox' }, { kind: 'note', status: 'kept' },
    { kind: 'journal', status: 'kept' }, { kind: 'journal', status: 'archived' },
  ];
  assert.deepEqual(['inbox', 'kept', 'journal', 'all', 'archived'].map(k => notes.filter(n => inVaultSection(n, k)).length), [1, 1, 1, 3, 1]);
  assert.deepEqual(notes.map(vaultTone), ['inbox', 'kept', 'journal', 'archived']);
});
test('a task made from a journal returns to Journal, and Undo preserves the original link', () => {
  const s = E.freshState(), journal = E.saveNote(s, { text: 'Make time to draw #craft', kind: 'journal' }, day).note;
  const task = E.convertNote(s, journal.id), moved = E.returnTaskToVault(s, task.id);
  assert.equal(moved.note.kind, 'journal'); assert.equal(moved.note.status, 'kept'); assert.equal(moved.note.text, journal.text);
  E.undoReturnTaskToVault(s, moved.undo);
  assert.equal(journal.taskId, task.id); assert.equal(journal.status, 'kept'); assert.ok(s.tasks.some(t => t.id === task.id));
  assert.deepEqual(E.validateState(s), s);
});
test('journal actions never consume the once-daily review bonus', () => {
  const s = E.freshState(), j = E.saveNote(s, { text: 'An old journal', kind: 'journal' }, day).note;
  j.status = 'inbox'; assert.equal(E.reviewNote(s, j.id, 'kept', day), 0);
  const note = E.saveNote(s, { text: 'A captured thought' }, day).note, other = E.saveNote(s, { text: 'Another thought' }, day).note;
  const before = s.gold;
  assert.equal(E.reviewNote(s, note.id, 'kept', day), 4); assert.equal(s.gold, before + 4);
  assert.equal(E.reviewNote(s, other.id, 'archived', day), 0); assert.equal(s.gold, before + 4);
});
test('each Vault writing object is distinct, cached, and fully inside its SVG bounds', () => {
  const arts = ['note', 'journal', 'review', 'vault', 'archive'].map(kind => {
    const art = vaultArt(kind); assert.equal(vaultArt(kind), art);
    const [x, y, w, h] = art.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
    for (const m of art.matchAll(/points="([^"]+)"/g)) for (const [px, py] of m[1].split(' ').map(p => p.split(',').map(Number)))
      assert.ok(Number.isFinite(px) && Number.isFinite(py) && px >= x && px <= x+w && py >= y && py <= y+h);
    return art;
  });
  assert.equal(new Set(arts).size, 5);
});
