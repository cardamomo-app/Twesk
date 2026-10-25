import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveObjectURL } from 'node:buffer';
import { audioBufferWav, createMediaSoundPlayer } from '../sfx-media.js';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const plan = id => [{ kind: 'tone', t: .01, dur: .1, f: 440, id }];
function harness(t, options = {}) {
  const audio = [], played = [], rendered = [];
  let muted = false, blocked = false;
  class Audio {
    constructor() { this.src = ''; this.paused = true; this.loads = 0; audio.push(this); }
    setAttribute() {}
    play() {
      if (blocked) return Promise.reject(Object.assign(new Error('Gesture required'), { name: 'NotAllowedError' }));
      if (this.src.startsWith('blob:')) {
        assert.ok(resolveObjectURL(this.src), 'the clip URL must remain alive until playback');
        played.push({ src: this.src, audio: this });
      }
      this.paused = false; return Promise.resolve();
    }
    pause() { this.paused = true; }
    load() { this.loads++; }
  }
  const player = createMediaSoundPlayer({ muted: () => muted, createAudio: () => new Audio(), voices: 2,
    render: p => { rendered.push(p); return options.render ? options.render(p, rendered.length) : Promise.resolve(new Blob([JSON.stringify(p)], { type: 'audio/wav' })); }, ...options });
  t.after(() => player.dispose());
  return { player, audio, played, rendered, mute: value => { muted = value; }, block: value => { blocked = value; } };
}

test('WAV encoding interleaves channels, clamps samples, and writes a valid PCM header', async () => {
  const blob = audioBufferWav({ numberOfChannels: 2, sampleRate: 8000, length: 3,
    getChannelData: c => c ? new Float32Array([.5, -.5, 0]) : new Float32Array([2, -2, NaN]) });
  const bytes = await blob.arrayBuffer(), view = new DataView(bytes);
  assert.equal(blob.type, 'audio/wav'); assert.equal(bytes.byteLength, 56);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), 'RIFF');
  assert.equal(view.getUint32(4, true), 48); assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(24, true), 8000); assert.equal(view.getUint32(28, true), 32000);
  assert.equal(view.getUint32(40, true), 12);
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => view.getInt16(44 + i * 2, true)), [32767, 16384, -32768, -16384, 0, 0]);
});
test('media playback reuses rendered clips and the same gesture-authorized elements after wake', async t => {
  const h = harness(t); h.player.unlock({ gesture: true });
  await h.player.play(plan('heal')); const elements = [...h.audio], loads = h.audio.map(a => a.loads);
  assert.equal(h.played.length, 1); assert.equal(h.rendered.length, 1);
  h.player.wake(); assert.ok(h.audio.every(a => a.paused));
  h.player.unlock({ gesture: true }); await h.player.play(plan('heal'));
  assert.equal(h.played.length, 2); assert.equal(h.rendered.length, 1);
  assert.deepEqual(h.audio, elements); assert.ok(h.audio.every((a,i) => a.loads > loads[i]));
  assert.ok(h.audio.every(a => a.loop === false), 'no silent background loop');
});
test('channel cancellation removes delayed combat effects while other sounds keep playing', async t => {
  const h = harness(t);
  await h.player.play(plan('spell'), { channel: 'battle', delay: .04 });
  await h.player.play(plan('coin'), { channel: 'ui' });
  h.player.stop('battle'); await wait(60);
  assert.equal(h.played.length, 1);
  h.player.stop(); assert.ok(h.audio.every(a => a.paused));
});
test('mute and wake discard effects still being rendered instead of replaying them later', async t => {
  let release;
  const h = harness(t, { render: () => new Promise(resolve => { release = resolve; }) });
  const pending = h.player.play(plan('old')); await wait(0);
  h.mute(true); h.player.stop(); release(new Blob(['old']));
  assert.equal(await pending, false); assert.equal(h.played.length, 0);
  h.mute(false);
  const second = h.player.play(plan('sleep')); await wait(0);
  h.player.wake(); release(new Blob(['sleep']));
  assert.equal(await second, false); assert.equal(h.played.length, 0);
});
test('a render interrupted by sleep cannot poison the same sound after returning', async t => {
  let release, calls = 0;
  const h = harness(t, { render: () => ++calls === 1 ? new Promise(resolve => { release = resolve; }) : Promise.resolve(new Blob(['fresh'])) });
  const old = h.player.play(plan('minute')); await wait(0);
  h.player.wake(); h.player.unlock({ gesture: true });
  assert.equal(await h.player.play(plan('minute')), true);
  release(new Blob(['stale'])); assert.equal(await old, false);
  assert.equal(calls, 2); assert.equal(h.played.length, 1);
});
test('a refused media play can recover on the next gesture without a reload', async t => {
  const h = harness(t); h.block(true);
  await h.player.play(plan('pause')); await wait(0); assert.equal(h.played.length, 0);
  h.block(false); h.player.unlock({ gesture: true });
  await h.player.play(plan('pause')); await wait(0); assert.equal(h.played.length, 1);
});
test('a long sleep with no focus or visibility event refreshes playback on the next sound', async t => {
  let wall = 0;
  const h = harness(t, { wallNow: () => wall });
  await h.player.play(plan('minute')); const first = h.played[0].audio, loads = first.loads;
  wall = 20 * 60 * 1000;
  await h.player.play(plan('minute'));
  assert.equal(h.played.length, 2); assert.ok(h.played.at(-1).audio.loads > loads);
  assert.equal(h.audio.length, 2, 'the existing authorized elements are retained');
});
test('late rendered effects expire and delayed clips stay alive under cache pressure', async t => {
  let time = 0, release;
  const late = harness(t, { now: () => time, render: () => new Promise(resolve => { release = resolve; }) });
  const old = late.player.play(plan('late')); await wait(0); time = 1000; release(new Blob(['late']));
  assert.equal(await old, false); assert.equal(late.played.length, 0);
  const h = harness(t, { cacheBytes: 1, voices: 1 });
  await h.player.play(plan('first')); await h.player.play(plan('delayed'), { delay: .025 });
  await wait(45); assert.equal(h.played.length, 2);
  h.player.stop(); assert.equal(resolveObjectURL(h.played.at(-1).src), undefined, 'released clips can be evicted');
});
