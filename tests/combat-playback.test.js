import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombatClock, combatTurnTiming } from '../combat-playback.js';
function harness(options = {}) {
  let callback, timestamp = 0, hidden = false;
  const frames = [];
  const clock = createCombatClock({ requestFrame(fn) { callback = fn; return 1; }, cancelFrame() { callback = null; }, hidden: () => hidden, onFrame: time => frames.push(time), onResync: options.onResync });
  return { clock, frames, step(ms = 16) { timestamp += ms; const fn = callback; callback = null; fn?.(timestamp); }, hide(value) { hidden = value; clock.resetFrame(); }, advance(ms) { for (let i = 0; i < ms; i += 20) this.step(20); } };
}
test('a stalled frame cannot run impact and the next turn back-to-back', () => {
  const h = harness(), beats = [];
  h.clock.after(400, () => { beats.push('impact'); h.clock.after(1000, () => beats.push('next')); });
  h.step(); h.advance(380); h.step(10000);
  assert.deepEqual(beats, ['impact']); assert.equal(h.clock.elapsed, 430);
  h.step(10000); assert.deepEqual(beats, ['impact'], 'the next long stall advances only one visible frame');
  h.advance(1000); assert.deepEqual(beats, ['impact', 'next']);
  h.clock.stop();
});
test('hidden windows and sleep preserve every remaining beat without catch-up', () => {
  const h = harness(); let impacts = 0;
  h.clock.after(400, () => impacts++); h.step(); h.advance(200);
  h.hide(true); h.step(50000); h.step(50000); assert.equal(h.clock.elapsed, 200);
  h.hide(false); h.step(50000); assert.equal(h.clock.elapsed, 200);
  h.advance(200); assert.equal(impacts, 1);
  h.clock.stop();
});
test('new zero-delay work is painted on another frame and stop cancels all pending work', () => {
  const h = harness(), beats = [];
  h.clock.after(0, () => { beats.push('render'); h.clock.after(0, () => beats.push('sound')); });
  h.step(); assert.deepEqual(beats, ['render']); h.step(); assert.deepEqual(beats, ['render', 'sound']);
  h.clock.after(100, () => beats.push('stale')); h.clock.stop(); h.advance(1000);
  assert.deepEqual(beats, ['render', 'sound']);
});
test('spell and pet effects have distinct arrivals and enough time to finish, including reduced motion', () => {
  for (const reduced of [false, true]) for (const mode of ['attack', 'guard']) {
    const t = combatTurnTiming({ duration: 1300, spell: { mode }, pet: { id: 'drake' }, reduced });
    assert.ok(t.spellImpact >= t.impact); assert.ok(t.petImpact > t.spellImpact);
    assert.ok(t.spellStart < t.spellImpact); assert.ok(t.petStart < t.petImpact);
    assert.ok(t.duration - t.petImpact >= (reduced ? 700 : 1000));
  }
  assert.equal(combatTurnTiming().duration, 1650);
});

test('normal frames do not force animation seeks; only stalls and resume resynchronize', () => {
  const syncs = [], h = harness({ onResync: time => syncs.push(time) });
  h.step(); for (let i = 0; i < 180; i++) h.step(16);
  assert.equal(syncs.length, 1, 'native animation runs uninterrupted between ordinary frames');
  h.step(650); assert.equal(syncs.length, 2, 'one correction after a stall');
  for (let i = 0; i < 60; i++) h.step(16);
  assert.equal(syncs.length, 2);
  h.hide(true); h.step(10000); h.hide(false); h.step(10000);
  assert.equal(syncs.length, 3, 'one correction after resuming'); h.clock.stop();
});
