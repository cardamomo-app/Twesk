import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../quest-timer.js';

test('a focus session uses elapsed wall time through pause, resume and reload', () => {
  let timer = T.startTimer(T.freshTimer('task', 5), 1000);
  assert.equal(timer.endAt, 301000);
  assert.equal(T.remaining(timer, 61000), 240000);
  timer = T.pauseTimer(timer, 61000);
  assert.equal(timer.status, 'paused'); assert.equal(timer.remainingMs, 240000);
  assert.equal(T.remaining(timer, 200000), 240000);
  timer = T.startTimer(T.readTimer(JSON.parse(JSON.stringify(timer))), 200000);
  assert.equal(timer.endAt, 440000);
  const restored = T.readTimer(JSON.parse(JSON.stringify(timer)));
  assert.equal(T.remaining(restored, 430000), 10000);
  assert.equal(T.finishTimer(restored, 439999), restored);
  timer = T.finishTimer(restored, 999999);
  assert.equal(timer.status, 'finished'); assert.equal(timer.remainingMs, 0);
  assert.equal(T.finishTimer(timer, 1000000), timer); // The alarm transition happens once.
  assert.equal(T.startTimer(timer, 1000000).endAt, 1300000);
});
test('duration is constrained to five-minute increments and cannot change mid-session', () => {
  let timer = T.freshTimer('task');
  assert.equal(T.durationTimer(timer, 1).minutes, 5);
  assert.equal(T.durationTimer(timer, 100).minutes, 60);
  assert.equal(T.durationTimer(timer, 33).minutes, 35);
  assert.equal(T.startTimer(T.freshTimer()).status, 'ready');
  timer = T.startTimer(timer, 1000);
  assert.equal(T.durationTimer(timer, 5), timer); assert.equal(T.startTimer(timer, 2000), timer);
  timer = T.pauseTimer(timer, 3000);
  timer = T.durationTimer(timer, 10);
  assert.equal(timer.status, 'ready'); assert.equal(timer.remainingMs, 600000);
});
test('corrupt local clocks reset safely and deadlines never produce negative time', () => {
  for (const value of [null, {}, { ...T.freshTimer(), minutes: 0 }, { ...T.freshTimer(), minutes: 7 },
    { ...T.freshTimer(), remainingMs: -1 }, { ...T.freshTimer(), endAt: 5 },
    { ...T.freshTimer('task'), status: 'running', endAt: 'tomorrow' },
    { ...T.freshTimer(), status: 'finished' }, { ...T.freshTimer(), taskId: {} }]) {
    assert.deepEqual(T.readTimer(value), T.freshTimer());
  }
  const timer = T.startTimer(T.freshTimer('task', 5), 1000);
  assert.equal(T.remaining(timer, -10000), 300000);
  assert.equal(T.remaining(timer, 1e10), 0);
  assert.equal(T.pauseTimer(timer, 1e10).status, 'finished');
});
