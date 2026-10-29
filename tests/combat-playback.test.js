import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombatClock, combatTurnTiming, syncCombatAnimation, recordCombatAnimationFrame } from '../combat-playback.js';
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

function nativeAnimation(time, state = 'running') {
  return { currentTime: time, playState: state, plays: 0,
    pause() { this.playState = 'paused'; },
    play() { this.plays++; this.playState = 'running'; } };
}
test('stall corrections never rewind an attack or damage number that is ahead of the clock', () => {
  const animation = nativeAnimation(950), record = { start: 400, end: 1150 };
  recordCombatAnimationFrame(animation, record);
  syncCombatAnimation(animation, record, 1000);
  assert.equal(animation.currentTime, 950);
  assert.equal(animation.plays, 0, 'a running native animation needs no play command');
  animation.currentTime = 1150; animation.playState = 'finished';
  recordCombatAnimationFrame(animation, record);
  for (const elapsed of [1050, 1100, 1500, 1800]) syncCombatAnimation(animation, record, elapsed);
  assert.equal(animation.currentTime, 1150);
  assert.equal(animation.plays, 0, 'a finished effect stays finished through later corrections');
  const rounded = nativeAnimation(1149.999, 'finished'), roundedRecord = { start: 400, end: 1150 };
  recordCombatAnimationFrame(rounded, roundedRecord);
  syncCombatAnimation(rounded, roundedRecord, 1000);
  syncCombatAnimation(rounded, roundedRecord, 1100);
  assert.equal(rounded.plays, 0, 'completion remains final even with fractional native timing');
});
test('hiding and resuming preserve native progress even when the replay clock is behind', () => {
  const animation = nativeAnimation(900), record = { start: 0, end: 1300 };
  recordCombatAnimationFrame(animation, record);
  syncCombatAnimation(animation, record, 500, true);
  assert.equal(animation.currentTime, 900); assert.equal(animation.playState, 'paused');
  syncCombatAnimation(animation, record, 500);
  assert.equal(animation.currentTime, 900); assert.equal(animation.plays, 1);
  animation.currentTime = 1300; animation.playState = 'finished';
  recordCombatAnimationFrame(animation, record);
  syncCombatAnimation(animation, record, 700, true);
  syncCombatAnimation(animation, record, 700);
  assert.equal(animation.currentTime, 1300); assert.equal(animation.plays, 1, 'resume never restarts a completed attack');
});
test('new effects may advance to their cue while cancelled effects stay cancelled', () => {
  const record = { start: 400, end: 700 }, animation = nativeAnimation(0);
  syncCombatAnimation(animation, record, 450);
  assert.equal(animation.currentTime, 50);
  const cancelled = nativeAnimation(null, 'idle');
  syncCombatAnimation(cancelled, record, 600);
  assert.equal(cancelled.currentTime, null); assert.equal(cancelled.plays, 0);
});
test('a stall recovers unseen spell motion without repeating a frame already painted', () => {
  const animation = nativeAnimation(300), record = { start: 0, end: 700 };
  recordCombatAnimationFrame(animation, record);
  // The browser finished during a long stall, but none of those frames were seen.
  animation.currentTime = 700; animation.playState = 'finished';
  syncCombatAnimation(animation, record, 200);
  assert.equal(animation.currentTime, 300, 'resume from the latest painted frame, even when the clock is behind');
  recordCombatAnimationFrame(animation, record);
  animation.currentTime = 450; animation.playState = 'running';
  recordCombatAnimationFrame(animation, record);
  syncCombatAnimation(animation, record, 250);
  assert.equal(animation.currentTime, 450, 'later corrections cannot repeat the recovered motion');
});
