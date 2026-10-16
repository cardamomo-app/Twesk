import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

// Exercise the public sound API against audio-device interruptions, with no browser or speakers.
const source = readFileSync(new URL('../sfx.js', import.meta.url), 'utf8').replace(/\bexport /g, '') + '\nthis.sfx = { configureSfx, playSfx, stopSfx, SOUND_NAMES };';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function audioHarness({ session = { type: 'auto' }, initial = 'running', rebuildState = 'running', time = performance } = {}) {
  const contexts = [], starts = [], stops = [], listeners = {};
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ connect() {}, disconnect() {}, gain: param(), frequency: param(), Q: param(), pan: param(), detune: param(),
    start(t) { starts.push({ context: contexts.at(-1), time: t }); }, stop(t) { stops.push(t); } });
  class AudioContext {
    constructor() { this.state = contexts.length ? rebuildState : initial; this.currentTime = 1; this.sampleRate = 100; contexts.push(this); }
    createDynamicsCompressor() { return { ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }; }
    createGain() { return node(); }
    createConvolver() { return node(); }
    createOscillator() { return node(); }
    createBiquadFilter() { return node(); }
    createBufferSource() { return node(); }
    createStereoPanner() { return node(); }
    createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
    addEventListener() {}
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  const document = { hidden: false, addEventListener(type, fn) { listeners[type] = fn; } };
  const sandbox = createContext({ window: { AudioContext, addEventListener() {} }, navigator: { audioSession: session },
    document, performance: time, setTimeout, clearTimeout, Float32Array });
  runInContext(source, sandbox);
  return { ...sandbox.sfx, contexts, starts, stops, listeners };
}
test('all combat spell casts and impacts sound, respect mute, and stop with battle playback', () => {
  const h = audioHarness();
  for (const [spell, mode] of [['ember','attack'],['storm','attack'],['starfall','attack'],['starfall','guard'],['ward','guard']])
    for (const name of ['spellCast','spellImpact']) {
      const before = h.starts.length;
      h.playSfx(name, { spell, mode, channel: 'battle' });
      assert.ok(h.starts.length > before, `${spell} ${mode} ${name}`);
    }
  const stopped = h.stops.length;
  h.stopSfx('battle');assert.ok(h.stops.length > stopped);
  h.configureSfx({ muted: () => true });const before = h.starts.length;
  h.playSfx('spellCast', { spell:'ember', channel:'battle' });
  h.playSfx('spellImpact', { spell:'ward', mode:'guard', channel:'battle' });
  assert.equal(h.starts.length,before);
});
test('game sounds request mixable audio, with no dependency on AudioSession support', () => {
  const session = { type: 'auto' }, h = audioHarness({ session });
  h.playSfx('focusHeal');
  assert.equal(session.type, 'ambient'); assert.ok(h.starts.length > 0);
  for (const session of [undefined, { get type() { throw new Error('unsupported'); } }]) {
    const fallback = audioHarness({ session }); fallback.playSfx('focusHeal'); assert.ok(fallback.starts.length > 0);
  }
});
test('a scheduled HP chime resumes an interrupted context without another click', async () => {
  const h = audioHarness(); h.playSfx('setOff');
  const context = h.contexts[0], before = h.starts.length;
  context.state = 'interrupted'; h.playSfx('focusHeal');
  await wait(15);
  assert.equal(context.state, 'running'); assert.ok(h.starts.length > before); assert.equal(h.contexts.length, 1);
});
test('a refused resume rebuilds once and delivers simultaneous chimes without a click', async () => {
  const h = audioHarness(); h.playSfx('setOff');
  const old = h.contexts[0], before = h.starts.length;
  old.state = 'interrupted'; old.resume = () => Promise.reject(new Error('audio held elsewhere'));
  h.playSfx('focusHeal'); h.playSfx('trailBell'); await wait(20);
  assert.equal(old.state, 'closed'); assert.equal(h.contexts.length, 2);
  assert.ok(h.starts.length > before); assert.equal(h.contexts[1].state, 'running');
});
test('a resume that never resolves times out and recovers instead of losing the minute chime', async () => {
  const h = audioHarness(); h.playSfx('setOff'); const before = h.starts.length;
  h.contexts[0].state = 'suspended'; h.contexts[0].resume = () => new Promise(() => {});
  h.playSfx('focusHeal'); await wait(230);
  assert.equal(h.contexts.length, 2); assert.ok(h.starts.length > before);
});
test('a context reporting running with a frozen clock is replaced for the next automatic sound', () => {
  let now = 0; const h = audioHarness({ time: { now: () => now } });
  h.playSfx('setOff'); h.playSfx('focusHeal'); const before = h.starts.length;
  now = 2000; h.playSfx('focusHeal');
  assert.equal(h.contexts.length, 2); assert.equal(h.contexts[0].state, 'closed');
  assert.ok(h.starts.length > before);
});
test('blocked replacement contexts do not trigger an endless rebuild loop', async () => {
  const h = audioHarness({ rebuildState: 'suspended' }); h.playSfx('setOff');
  h.contexts[0].state = 'interrupted'; h.contexts[0].resume = () => Promise.reject(new Error('blocked'));
  // Make even the replacement unable to resume.
  const original = h.contexts[0].constructor.prototype.resume;
  h.contexts[0].constructor.prototype.resume = () => Promise.reject(new Error('blocked'));
  const before = h.starts.length; h.playSfx('focusHeal'); await wait(30);
  assert.equal(h.contexts.length, 2); assert.equal(h.starts.length, before);
  h.contexts[0].constructor.prototype.resume = original;
});
test('mute and stopped channels cancel sounds still waiting for audio recovery', async () => {
  const h = audioHarness(); h.playSfx('setOff'); const before = h.starts.length;
  let muted = false; h.configureSfx({ muted: () => muted });
  h.contexts[0].state = 'suspended'; let release;
  h.contexts[0].resume = () => new Promise(resolve => { release = () => { h.contexts[0].state = 'running'; resolve(); }; });
  h.playSfx('focusHeal'); muted = true; release(); await wait(15);
  assert.equal(h.starts.length, before);
  muted = false; h.contexts[0].state = 'suspended';
  h.playSfx('trailBell', { channel: 'combat' }); h.stopSfx('combat'); release(); await wait(15);
  assert.equal(h.starts.length, before);
});
test('winding is a short rate-limited effect and respects mute', () => {
  const h = audioHarness(); assert.ok(h.SOUND_NAMES.includes('wind'));
  h.playSfx('wind', { direction: 1 }); const first = h.starts.length;
  assert.ok(first > 0); h.playSfx('wind', { direction: -1 }); assert.equal(h.starts.length, first);
  h.configureSfx({ muted: () => true }); h.playSfx('wind'); assert.equal(h.starts.length, first);
});
