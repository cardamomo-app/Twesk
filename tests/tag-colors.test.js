import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { rememberTagColors, TAG_HUES } from '../tag-colors.js';
import { cloudState, fingerprint } from '../sync-engine.js';

const day = '2026-10-20';
test('new tags get unused random colors, while case variants and existing tags keep their colors', () => {
  const s = E.freshState();
  rememberTagColors(s, ['#one', '#two', '#three'], { random: () => 0 });
  assert.equal(s.tagColors['#one'], TAG_HUES[0]);
  assert.equal(new Set(Object.values(s.tagColors)).size, 3);
  const colors = structuredClone(s.tagColors);
  rememberTagColors(s, ['#ONE', '#two'], { random: () => .99 });
  assert.deepEqual(s.tagColors, colors);
  assert.equal(E.tagHue(s, '#ONE'), colors['#one']);
  rememberTagColors(s, Array.from({ length: 30 }, (_, i) => `#project${i}`));
  assert.equal(new Set(Object.values(s.tagColors)).size, 33, 'palette expansion does not reuse a hue early');
});

test('smart assignment avoids neighboring colors in sequence, even when expanding a nearly used palette', () => {
  const distance = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  let seed = 37;
  const seeded = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (const random of [() => 0, () => .5, () => .99999, seeded]) {
    const s = E.freshState();
    rememberTagColors(s, Array.from({ length: 48 }, (_, i) => `#project${i}`), { random });
    const colors = Object.values(s.tagColors);
    assert.equal(new Set(colors).size, colors.length);
    for (let i = 1; i < colors.length; i++) {
      assert.ok(distance(colors[i], colors[i - 1]) >= 90, `consecutive colors ${colors[i - 1]} and ${colors[i]}`);
      if (i > 1) assert.ok(distance(colors[i], colors[i - 2]) >= 45, 'avoid the second most recent color too');
    }
  }
});

test('manual colors persist across backups and cloud payloads without changing task or reward data', () => {
  const s = E.freshState();
  E.saveTask(s, { title: 'Draw #art', tier: 'quick' }, day);
  E.saveNote(s, { text: 'Idea #art', kind: 'note' }, day);
  const before = structuredClone(s);
  E.setTagColor(s, '#ART', 209);
  before.tagColors['#art'] = 209;
  assert.deepEqual(s, before);
  assert.equal(E.tagHue(E.validateState(JSON.parse(JSON.stringify(s))), '#art'), 209);
  assert.equal(E.tagHue(E.validateState(cloudState(s)), '#art'), 209);
  rememberTagColors(s, ['#art', '#another']);
  assert.equal(E.tagHue(s, '#art'), 209, 'later automatic assignments keep the chosen color');
  for (const [tag, hue] of [['bad', 8], ['#art', -1], ['#art', 360], ['#art', '8'], ['#art', 8.5]]) {
    const previous = structuredClone(s);
    assert.throws(() => E.setTagColor(s, tag, hue), /valid tag color/);
    assert.deepEqual(s, previous);
  }
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
