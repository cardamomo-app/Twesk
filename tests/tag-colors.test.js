import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { rememberTagColors, TAG_HUES } from '../tag-colors.js';
import { cloudState, fingerprint } from '../sync-engine.js';

const day = '2026-10-20';
test('new tags get unused random colors, while case variants and existing tags keep their colors', () => {
  const s = E.freshState();
  rememberTagColors(s, ['#one', '#two', '#three'], { random: () => 0 });
  assert.deepEqual(Object.values(s.tagColors), TAG_HUES.slice(0, 3));
  const colors = structuredClone(s.tagColors);
  rememberTagColors(s, ['#ONE', '#two'], { random: () => .99 });
  assert.deepEqual(s.tagColors, colors);
  assert.equal(E.tagHue(s, '#ONE'), colors['#one']);
  rememberTagColors(s, Array.from({ length: 30 }, (_, i) => `#project${i}`));
  assert.equal(new Set(Object.values(s.tagColors)).size, 33, 'palette expansion does not reuse a hue early');
});

test('task edits, Vault conversion, removing and reusing a tag preserve its saved color', () => {
  const s = E.freshState();
  const task = E.saveTask(s, { title: 'Sketch #art', tier: 'quick' }, day);
  const hue = s.tagColors['#art'];
  E.saveTask(s, { id: task.id, title: 'Draw #ART #practice', tier: 'quick' }, day);
  const note = E.saveNote(s, { text: 'A study #art #learn', kind: 'note' }, day).note;
  E.convertNote(s, note.id);
  const changes = E.removeTaskTag(s, '#art');
  assert.equal(s.tagColors['#art'], hue);
  E.undoTaskTagRemoval(s, changes);
  E.saveTask(s, { title: 'Another #art', tier: 'hard' }, day);
  assert.equal(s.tagColors['#art'], hue);
  assert.deepEqual(E.validateState(JSON.parse(JSON.stringify(s))).tagColors, s.tagColors);
  assert.deepEqual(E.validateState(cloudState(s)).tagColors, s.tagColors);
});

test('older saves migrate deterministically without changing progress or existing colors', async () => {
  const old = E.freshState();
  E.saveTask(old, { title: 'Read #mind #thesis', tier: 'hard' }, day);
  E.saveNote(old, { text: 'Remember #café', kind: 'journal' }, day);
  delete old.tagColors;
  const a = E.validateState(old), b = E.validateState(structuredClone(old));
  assert.deepEqual(a.tagColors, b.tagColors);
  assert.equal(await fingerprint(a), await fingerprint(b));
  const withoutColors = structuredClone(a); delete withoutColors.tagColors;
  assert.deepEqual(withoutColors, old);
  a.tagColors['#mind'] = 17;
  const newer = E.validateState(a);
  assert.equal(newer.tagColors['#mind'], 17);
});

test('backups reject unsafe or malformed color metadata while accepting canonical Unicode tags', () => {
  for (const colors of [null, [], { '#tag': -1 }, { '#tag': 360 }, { '#tag': 1.5 }, { '#tag': 'red' }, { '#TAG': 5 }, { 'bad; color:red': 5 }]) {
    const s = E.freshState(); s.tagColors = colors;
    assert.throws(() => E.validateState(s), /valid Twesk backup/);
  }
  const s = E.freshState();
  E.saveTask(s, { title: 'Read #İstanbul #日本語', tier: 'quick' }, day);
  assert.ok(E.validateState(s));
});
