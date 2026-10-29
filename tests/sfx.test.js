import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { WEAPON_ATTACKS, MONSTER_ATTACKS } from '../combat-attack-art.js';
import { audioBufferWav, createMediaSoundPlayer, trimmedBuffer } from '../sfx-media.js';

// Exercise the public sound API against audio-device interruptions, with no browser or speakers.
const source = readFileSync(new URL('../sfx.js', import.meta.url), 'utf8').replace(/^import .+;$/gm, '').replace(/\bexport /g, '') + '\nthis.sfx = { configureSfx, playSfx, prepareSfx, prepareBattleSfx, stopSfx, unlockSfx, SOUND_NAMES };';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function audioHarness({ session = { type: 'auto' }, initial = 'running', rebuildState = 'running', time = performance, safari = false, controlledIdle = false, renderOffline = buffer => Promise.resolve(buffer) } = {}) {
  const contexts = [], starts = [], stops = [], listeners = {}, windowListeners = {}, media = [];
  const idleTasks = [];
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
  class OfflineAudioContext extends AudioContext {
    constructor(channels, length, sampleRate) { super(); this.offline = true; this.length = length; this.sampleRate = sampleRate; }
    resume() { throw new Error('An offline renderer must not resume a hardware output.'); }
    startRendering() { this.state = 'closed'; return renderOffline({ numberOfChannels: 2, length: 16, sampleRate: this.sampleRate, getChannelData: () => new Float32Array(16).fill(.1) }); }
  }
  class Audio {
    constructor() { this.src = ''; this.plays = []; this.paused = true; media.push(this); }
    setAttribute() {}
    play() { this.plays.push(this.src); this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
    load() { this.loads = (this.loads || 0) + 1; }
  }
  const document = { hidden: false, addEventListener(type, fn) { listeners[type] = fn; } };
  const sandbox = createContext({ window: { AudioContext, ...(safari ? { Audio, OfflineAudioContext } : {}), ...(controlledIdle ? { requestIdleCallback: cb => idleTasks.push(cb) } : {}), addEventListener(type, fn) { windowListeners[type] = fn; } },
    navigator: { audioSession: session, userAgent: safari ? 'AppleWebKit/605.1.15 Version/18.5 Safari/605.1.15' : '' },
    document, performance: time, setTimeout, clearTimeout, Float32Array, audioBufferWav, createMediaSoundPlayer, trimmedBuffer });
  runInContext(source, sandbox);
  return { ...sandbox.sfx, contexts, starts, stops, listeners, windowListeners, media,
    async idleStep() { const cb = idleTasks.shift(); if (cb) cb(); await wait(0); },
    async drainIdle() { let remaining = 300; while (idleTasks.length && remaining--) { idleTasks.shift()(); await wait(0); } assert.ok(remaining > 0, 'preparation must not retry indefinitely'); },
  };
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
test('every weapon, creature, and activated weapon power produces its combat sound', () => {
  const h = audioHarness();
  for (const [name, profiles] of [['weaponSwing', Object.values(WEAPON_ATTACKS)], ['creatureAttack', MONSTER_ATTACKS]])
    for (const { id, voice, pitch } of profiles) {
      const before = h.starts.length;
      h.playSfx(name, { voice, pitch, channel: 'battle' });
      assert.ok(h.starts.length > before, id);
    }
  for (const power of ['freeze', 'venom', 'critical', 'drain', 'sunder', 'stagger']) {
    const before = h.starts.length;
    h.playSfx('weaponPower', { power, channel: 'battle' });
    assert.ok(h.starts.length > before, power);
  }
  const before = h.starts.length; h.configureSfx({ muted: () => true });
  for (const name of ['weaponSwing', 'creatureAttack', 'weaponPower']) h.playSfx(name, { channel: 'battle' });
  assert.equal(h.starts.length, before);
  const stopped = h.stops.length; h.stopSfx('battle'); assert.ok(h.stops.length > stopped);
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
test('each companion has a call and assist sound, with battle mute and cancellation', () => {
  const h = audioHarness();
  for (const pet of ['fox', 'owl', 'tortoise', 'cat', 'drake']) for (const name of ['petCall', 'petImpact']) {
    const before = h.starts.length;
    h.playSfx(name, { pet, channel: 'battle' }); assert.ok(h.starts.length > before, `${pet} ${name}`);
  }
  const before = h.starts.length; h.configureSfx({ muted: () => true });
  h.playSfx('petCall', { pet: 'drake', channel: 'battle' }); h.playSfx('petImpact', { pet: 'cat', channel: 'battle' });
  assert.equal(h.starts.length, before);
  const stops = h.stops.length; h.stopSfx('battle'); assert.ok(h.stops.length > stops);
});
test('Safari renders identical effects offline and uses media playback even when live audio cannot resume', async () => {
  const session = { type: 'auto' }, h = audioHarness({ safari: true, initial: 'interrupted', session });
  h.playSfx('focusHeal'); await wait(35);
  assert.ok(h.contexts.length); assert.ok(h.contexts.every(c => c.offline), 'no live output to get stuck');
  assert.equal(session.type, 'ambient', 'media effects still request mixing with other apps');
  assert.ok(h.media.some(a => a.plays.some(src => src.startsWith('blob:'))), 'the rendered WAV uses HTML audio');
  const before = h.contexts.length;
  h.windowListeners.focus({ type: 'focus' }); h.listeners.pointerdown({ type: 'pointerdown' });
  h.playSfx('focusHeal'); await wait(15);
  assert.equal(h.contexts.length, before, 'a rendered effect is reusable after wake');
  assert.ok(h.media.some(a => a.loads), 'an element reloads its clip after waking, before it plays again');
  h.stopSfx(null); assert.ok(h.media.every(a => a.paused));
  const loads = h.media.reduce((n,a) => n + (a.loads || 0), 0);
  h.unlockSfx({ refresh: true }); h.playSfx('focusHeal'); await wait(15);
  assert.ok(h.media.reduce((n,a) => n + (a.loads || 0), 0) > loads, 'unmuting can explicitly refresh output in place');
  assert.equal(h.contexts.length, before);
});
test('global mute cancels a sound waiting for a live context even if unmuted before it resumes', async () => {
  const h = audioHarness(); h.playSfx('setOff'); const before = h.starts.length;
  h.contexts[0].state = 'suspended'; let release;
  h.contexts[0].resume = () => new Promise(resolve => { release = () => { h.contexts[0].state = 'running'; resolve(); }; });
  h.playSfx('trailBell', { channel: 'delight' }); h.stopSfx(null); release(); await wait(15);
  assert.equal(h.starts.length, before);
});

test('Safari reuses a few fixed variants of a randomized sound instead of rendering every play', async () => {
  const h = audioHarness({ safari: true });
  for (let i = 0; i < 20; i++) { h.playSfx('coins', { amount: 10 }); await wait(2); }
  await wait(200);
  const renders = h.contexts.filter(c => c.offline).length;
  assert.ok(renders >= 1 && renders <= 3, `20 plays rendered ${renders} clips`);
});
test('preparing renders each combo step once, ahead of time, without playing anything', async () => {
  const h = audioHarness({ safari: true });
  h.prepareSfx([['check']]); h.prepareSfx([['check']]);
  // Preparation runs one clip per idle moment; wait for it to finish rather than for a fixed time.
  const renders = () => h.contexts.filter(c => c.offline).length;
  for (let waited = 0; renders() < 9 && waited < 8000; waited += 50) await wait(50);
  await wait(9 * 3 * 40);
  assert.equal(renders(), 9, 'one clip per combo step; variants of a fixed sound share it');
  assert.ok(h.media.every(a => !a.plays.some(src => src.startsWith('blob:'))), 'nothing was played');
  const live = audioHarness(); live.prepareSfx([['check']]); await wait(60);
  assert.equal(live.contexts.length, 0, 'live Web Audio has nothing to prepare');
});

test('muting pauses queued preparation and unmuting resumes it without another request', async () => {
  const h = audioHarness({ safari: true, controlledIdle: true });
  let muted = false; h.configureSfx({ muted: () => muted });
  h.prepareSfx([['check']]); muted = true;
  await h.drainIdle(); assert.equal(h.contexts.length, 0);
  muted = false; h.unlockSfx({ refresh: true }); await h.drainIdle();
  assert.equal(h.contexts.length, 9, 'all combo steps prepare after unmuting');
  assert.ok(h.media.every(a => !a.plays.some(src => src.startsWith('blob:'))));
  h.prepareSfx([['check']]); await h.drainIdle(); assert.equal(h.contexts.length, 9, 'successful work stays deduplicated');
});

test('sounds registered while already muted prepare on unmute, including combat', async () => {
  const h = audioHarness({ safari: true, controlledIdle: true });
  let muted = true; h.configureSfx({ muted: () => muted });
  h.prepareSfx([['focusHeal'], ['weaponSwing', { voice: 'steel', pitch: .8 }]]);
  await h.drainIdle(); assert.equal(h.contexts.length, 0);
  muted = false; h.unlockSfx({ refresh: true }); await h.drainIdle();
  assert.ok(h.contexts.length >= 2);
});

test('failed preparation retries on a new request or foreground recovery, without a retry loop', async () => {
  let broken = true;
  const h = audioHarness({ safari: true, controlledIdle: true, renderOffline: buffer => broken ? Promise.reject(new Error('Interrupted render')) : Promise.resolve(buffer) });
  h.prepareSfx([['focusPause']]); await h.drainIdle();
  assert.equal(h.contexts.length, 3);
  broken = false; h.prepareSfx([['focusPause']]); await h.drainIdle();
  assert.equal(h.contexts.length, 4, 'failed keys may be requested again');
  broken = true; h.prepareSfx([['focusResume']]); await h.drainIdle(); const failed = h.contexts.length;
  broken = false; h.windowListeners.focus({ type: 'focus' }); await h.drainIdle();
  assert.equal(h.contexts.length, failed + 1, 'foregrounding retries failed work automatically');
});

test('foreground recovery also retries preparation that was still rendering at wake', async () => {
  let release;
  const h = audioHarness({ safari: true, controlledIdle: true, renderOffline: buffer => release ? Promise.resolve(buffer) : new Promise(resolve => { release = () => resolve(buffer); }) });
  h.prepareSfx([['trailBell']]); await h.idleStep();
  h.windowListeners.focus({ type: 'focus' }); release(); await wait(0); await h.drainIdle();
  assert.equal(h.contexts.length, 2, 'the discarded render is replaced once');
  h.prepareSfx([['trailBell']]); await h.drainIdle(); assert.equal(h.contexts.length, 2);
});

test('Safari warms a fixed encounter set and does no new rendering while it plays', async () => {
  const h = audioHarness({ safari: true, controlledIdle: true });
  const entries = [['spellCast', { spell: 'starfall', mode: 'attack' }], ['petImpact', { pet: 'drake' }], ['impact', { target: 'monster', heavy: true }]];
  h.prepareSfx([['check']]);
  const scene = h.prepareBattleSfx(entries); await scene.ready; scene.start();
  const renders = h.contexts.length; assert.equal(renders, 3);
  await h.drainIdle(); assert.equal(h.contexts.length, renders, 'background preparation stays paused');
  for (let i = 0; i < 4; i++) for (const [name, options] of entries) h.playSfx(name, { ...options, channel: 'battle' });
  await wait(0);
  assert.equal(h.contexts.length, renders, 'all battle sounds reuse the retained variant');
  assert.ok(h.media.some(a => a.plays.some(src => src.startsWith('blob:'))));
  h.playSfx('grunt', { who: 'monster', channel: 'battle' }); await wait(0);
  assert.equal(h.contexts.length, renders, 'a missing sound never starts an on-demand render during combat');
  scene.release(); await h.drainIdle(); assert.ok(h.contexts.length > renders, 'ordinary preparation resumes');
});
test('a muted encounter warms silently for a later unmute, and starting stops an unfinished warm-up', async () => {
  const h = audioHarness({ safari: true, controlledIdle: true });
  let muted = true; h.configureSfx({ muted: () => muted });
  const scene = h.prepareBattleSfx([['petCall', { pet: 'owl' }]]); await scene.ready; scene.start();
  assert.ok(h.media.every(a => !a.plays.some(src => src.startsWith('blob:'))));
  muted = false; h.playSfx('petCall', { pet: 'owl', channel: 'battle' }); await wait(0);
  assert.equal(h.contexts.length, 1); assert.ok(h.media.some(a => a.plays.some(src => src.startsWith('blob:')))); scene.release();
  let release;
  const slow = audioHarness({ safari: true, controlledIdle: true, renderOffline: buffer => new Promise(resolve => { release = () => resolve(buffer); }) });
  const cold = slow.prepareBattleSfx([['block'], ['deflect'], ['heal']]); await wait(0); cold.start(); release(); await cold.ready;
  assert.equal(slow.contexts.length, 1, 'the startup deadline stops any remaining preparation'); cold.release();
});
