// Twesk sound effects, synthesized locally (no downloaded audio assets).
// Most browsers use a shared Web Audio mix; Safari plays offline-rendered WAVs through media elements.
// Repeated sounds draw from random variants, and quick successive rewards climb
// a pentatonic scale so a run of completed tasks sounds increasingly triumphant.
import { audioBufferWav, createMediaSoundPlayer, trimmedBuffer } from './sfx-media.js?v=0.41.8';
let ctx, master, reverbIn, noiseBuf, clock = null, stale = false, recovering = null;
let recording = null, offlineRendering = false;
// Setting localStorage 'twesk.sfx-media' to '1' forces the media path in any browser, for testing.
const forceMedia = (() => { try { return typeof localStorage !== 'undefined' && localStorage.getItem('twesk.sfx-media') === '1'; } catch { return false; } })();
const safariMedia = typeof navigator !== 'undefined' && (forceMedia || /AppleWebKit/i.test(navigator.userAgent || '') &&
  (!/Chrome|Chromium|Edg|OPR|Android/i.test(navigator.userAgent || '') || /iPhone|iPad|iPod/i.test(navigator.userAgent || ''))) &&
  typeof window !== 'undefined' && !!(window.OfflineAudioContext || window.webkitOfflineAudioContext) && typeof window.Audio === 'function';
const mediaPlayer = safariMedia ? createMediaSoundPlayer({ render: renderMediaPlan, muted: () => isMuted(), createAudio: () => new window.Audio() }) : null;
const cancelled = new Map();
let lastWind = -Infinity;
let isMuted = () => false;
let channel = 'ui';
const channels = new Map();
let globalCancel = 0;
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const C5 = 523.25;
let combo = 0,
  lastReward = 0;

// Sounds draw their variation from `random`; recording for the media bank swaps in a seeded one,
// so each sound has a few fixed variants that can be rendered once and reused.
let random = Math.random, forcedCombo = null;
const rand = (a, b) => a + random() * (b - a);
const pick = list => list[Math.floor(random() * list.length)];
const seeded = seed => () => ((seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296);
const VARIANTS = 3;
const semis = n => 2 ** (n / 12);

export function configureSfx({ muted }) {
  isMuted = muted;
}
function mixableSession() {
  try { if (navigator.audioSession && navigator.audioSession.type !== 'ambient') navigator.audioSession.type = 'ambient'; } catch {}
}
function setup() {
  if (ctx && ctx.state !== 'closed') return;
  // Short game effects should mix with music/video instead of claiming exclusive playback.
  // AudioSession is optional; older Safari and other browsers keep their usual Web Audio behavior.
  mixableSession();
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  const created = ctx;
  ctx.addEventListener?.('statechange', () => { if (ctx === created && ctx.state === 'running') clock = null; });
  clock = null;
  connectMix();
}
function connectMix() {
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value = 12;
  compressor.ratio.value = 3.5;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.2;
  master = ctx.createGain();
  master.gain.value = 0.85;
  master.connect(compressor);
  compressor.connect(ctx.destination);
  const reverb = ctx.createConvolver(),
    wet = ctx.createGain();
  reverb.buffer = impulse(1.8, 2.8);
  wet.gain.value = 0.22;
  reverbIn = ctx.createGain();
  reverbIn.connect(reverb);
  reverb.connect(wet);
  wet.connect(master);
}
// The reverb's noise impulse is made once per sample rate and copied into each context that needs it.
const impulses = new Map();
function impulse(seconds, decay) {
  const length = Math.floor(ctx.sampleRate * seconds), key = `${ctx.sampleRate}:${seconds}:${decay}`,
    buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  if (!impulses.has(key)) impulses.set(key, [0, 1].map(() => Float32Array.from({ length }, (_, i) => (Math.random() * 2 - 1) * (1 - i / length) ** decay)));
  impulses.get(key).forEach((data, c) => buffer.getChannelData(c).set(data));
  return buffer;
}
function noiseBuffer() {
  if (!noiseBuf) {
    const length = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}
// Connect a voice to the mix (optionally panned and sent to reverb); returns nodes to clean up.
function output(node, { verb = 0.2, pan = 0 }) {
  const nodes = [];
  let last = node;
  if (pan && ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    last.connect(panner);
    last = panner;
    nodes.push(panner);
  }
  last.connect(master);
  if (verb) {
    const send = ctx.createGain();
    send.gain.value = verb;
    last.connect(send);
    send.connect(reverbIn);
    nodes.push(send);
  }
  return nodes;
}
function finish(source, nodes) {
  if (offlineRendering) return; // The short-lived offline graph is released with its rendered buffer.
  const set = channels.get(channel) || new Set();
  channels.set(channel, set);
  set.add(source);
  source.onended = () => {
    set.delete(source);
    for (const node of nodes) node.disconnect();
  };
}
function envelope(gain, t, vol, attack, dur) {
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function tone({
  t,
  f,
  f2,
  dur,
  vol = 0.1,
  type = 'sine',
  attack = 0.005,
  verb = 0.2,
  pan = 0,
  filter,
  detune = 0,
}) {
  if (recording) { recording.push({ kind: 'tone', t, f, f2, dur, vol, type, attack, verb, pan, filter, detune }); return; }
  const osc = ctx.createOscillator(),
    gain = ctx.createGain(),
    nodes = [osc, gain];
  osc.type = type;
  osc.detune.value = detune;
  osc.frequency.setValueAtTime(f, t);
  if (f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  let last = osc;
  if (filter) {
    const biquad = ctx.createBiquadFilter();
    biquad.type = filter.type;
    biquad.Q.value = filter.q ?? 0.7;
    biquad.frequency.setValueAtTime(filter.f, t);
    if (filter.f2) biquad.frequency.exponentialRampToValueAtTime(filter.f2, t + (filter.time || dur));
    osc.connect(biquad);
    last = biquad;
    nodes.push(biquad);
  }
  envelope(gain, t, vol, attack, dur);
  last.connect(gain);
  nodes.push(...output(gain, { verb, pan }));
  osc.start(t);
  osc.stop(t + dur + 0.05);
  finish(osc, nodes);
}
function noise({
  t,
  dur,
  vol = 0.1,
  type = 'bandpass',
  f = 1000,
  f2,
  q = 0.8,
  attack = 0.003,
  verb = 0.15,
  pan = 0,
}) {
  if (recording) { recording.push({ kind: 'noise', t, dur, vol, type, f, f2, q, attack, verb, pan }); return; }
  const source = ctx.createBufferSource(),
    filter = ctx.createBiquadFilter(),
    gain = ctx.createGain();
  source.buffer = noiseBuffer();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(f, t);
  if (f2) filter.frequency.exponentialRampToValueAtTime(f2, t + dur);
  envelope(gain, t, vol, attack, dur);
  source.connect(filter);
  filter.connect(gain);
  const nodes = [source, filter, gain, ...output(gain, { verb, pan })];
  source.start(t, Math.random() * 1.5);
  source.stop(t + dur + 0.05);
  finish(source, nodes);
}
// Metallic bell: inharmonic partials with staggered decay.
function bell(f, t, vol, dur = 0.8, verb = 0.35, pan = 0) {
  [
    [1, 1],
    [2.0, 0.35],
    [2.76, 0.45],
    [4.07, 0.18],
    [5.4, 0.12],
  ].forEach(([ratio, amp], i) =>
    tone({ t, f: f * ratio, dur: dur / (1 + i * 0.6), vol: vol * amp, attack: 0.002, verb, pan }),
  );
}
// Marimba-like pluck: warm fundamental plus a short bright attack.
function pluck(f, t, vol, dur = 0.5, verb = 0.3) {
  tone({ t, f, dur, vol, verb });
  tone({ t, f: f * 4, dur: 0.07, vol: vol * 0.35, verb: 0 });
  tone({ t, f: f * 2, dur: dur * 0.5, vol: vol * 0.25, type: 'triangle', verb });
}
// Soft brass: two detuned saws through an opening low-pass filter.
function brass(f, t, dur, vol = 0.06, pan = 0) {
  for (const detune of [-7, 7])
    tone({
      t,
      f,
      dur,
      vol,
      type: 'sawtooth',
      attack: 0.04,
      detune,
      verb: 0.35,
      pan,
      filter: { type: 'lowpass', f: 500, f2: 2800, time: 0.09, q: 1 },
    });
}
function timpani(f, t, vol = 0.25) {
  tone({ t, f: f * 1.15, f2: f, dur: 0.6, vol, verb: 0.4 });
  noise({ t, dur: 0.12, vol: vol * 0.4, type: 'lowpass', f: 300, verb: 0.3 });
}
function cymbal(t, dur = 1.4, vol = 0.09) {
  noise({ t, dur, vol, type: 'highpass', f: 5200, q: 0.5, attack: 0.004, verb: 0.5 });
  noise({ t, dur: dur * 0.5, vol: vol * 0.6, type: 'bandpass', f: 9000, q: 0.6, verb: 0.3 });
}
function sparkleRun(root, t, notes = 7, gap = 0.045, vol = 0.035) {
  for (let i = 0; i < notes; i++)
    bell(root * semis(PENTATONIC[i]), t + i * gap, vol, 0.5, 0.5, rand(-0.4, 0.4));
}
function coinCascade(t, count, vol = 0.05) {
  let at = t;
  for (let i = 0; i < count; i++) {
    const v = vol * (1 - i / (count * 1.7));
    bell(rand(2300, 3600), at, v, rand(0.18, 0.3), 0.25, rand(-0.5, 0.5));
    noise({ t: at, dur: 0.02, vol: v * 1.2, type: 'highpass', f: 5000, verb: 0 });
    at += rand(0.04, 0.08) * (1 - i * 0.025);
  }
}
// Successive rewards within a few seconds step up the scale.
function comboStep() {
  if (forcedCombo !== null) return forcedCombo; // rendering a specific step ahead of time
  const now = performance.now();
  combo = now - lastReward < 3500 ? Math.min(combo + 1, PENTATONIC.length - 3) : 0;
  lastReward = now;
  return combo;
}

const SOUNDS = {
  // Two warm, overlapping notes in a major third: a gentle acknowledgment, with no error-like pitch drop.
  taskCreated(t) {
    tone({ t, f: 349.23, dur: .18, vol: .09, attack: .012, verb: .12 });
    tone({ t, f: 698.46, dur: .065, vol: .014, attack: .008, type: 'triangle', verb: .08 });
    tone({ t: t + .075, f: 440, dur: .24, vol: .085, attack: .012, verb: .12 });
    tone({ t: t + .075, f: 880, dur: .09, vol: .012, attack: .008, type: 'triangle', verb: .08 });
  },
  // A dry little ratchet and spring, only when the duration crosses a dial notch.
  wind(t, { direction = 1 } = {}) {
    noise({ t, dur: .028, vol: .075, type: 'bandpass', f: direction > 0 ? 2300 : 1700, q: 1.1, verb: 0 });
    tone({ t, f: direction > 0 ? 620 : 480, f2: 220, dur: .045, vol: .035, type: 'triangle', verb: 0 });
    noise({ t: t + .025, dur: .018, vol: .035, type: 'highpass', f: 3500, verb: 0 });
  },
  // A soft, warm resting note; resuming answers with a tiny upward step.
  focusPause(t) {
    tone({ t, f: 392, dur: .16, vol: .055, attack: .008, verb: .08 });
    tone({ t, f: 196, dur: .11, vol: .025, attack: .008, type: 'triangle', verb: .05 });
  },
  focusResume(t) {
    tone({ t, f: 392, dur: .1, vol: .045, attack: .008, verb: .08 });
    tone({ t: t + .055, f: 523.25, dur: .14, vol: .055, attack: .008, verb: .08 });
  },
  // A small campsite wind chime: an invitation to rest, rather than a victory fanfare.
  trailBell(t) {
    [880, 1174.66, 1318.51, 987.77].forEach((f, i) => bell(f, t + i * .23, .065, 1.5, .55, (i - 1.5) * .18));
    pluck(440, t + .8, .045, 1, .4);
  },
  // Ticking a task: a bright two-note pluck that climbs with a combo.
  check(t) {
    const root = C5 * semis(PENTATONIC[comboStep()]);
    pluck(root, t, 0.14);
    pluck(root * 1.5, t + 0.075, 0.12);
    noise({ t, dur: 0.03, vol: 0.05, type: 'highpass', f: 6000, verb: 0 });
  },
  // Coins landing in the purse; more coins and a flourish for bigger rewards.
  coins(t, { amount = 4 } = {}) {
    const count = amount >= 40 ? 11 : amount >= 18 ? 8 : amount >= 10 ? 6 : 4;
    coinCascade(t, count, 0.055);
    bell(2093, t + 0.02, 0.05, 0.6, 0.4);
    if (amount >= 18) sparkleRun(C5 * 2, t + count * 0.05, 5, 0.04, 0.025);
    if (amount >= 40) [261.6, 329.6, 392].forEach(f => brass(f, t + 0.05, 0.7, 0.04));
  },
  xp(t) {
    const root = 392 * semis(PENTATONIC[comboStep()]);
    pluck(root, t, 0.13);
    pluck(root * 1.25, t + 0.07, 0.11);
    pluck(root * 1.5, t + 0.14, 0.11);
    tone({ t: t + 0.14, f: root * 4, dur: 0.7, vol: 0.02, verb: 0.6 });
  },
  reward(t) {
    const root = C5 * semis(PENTATONIC[comboStep()]);
    pluck(root, t, 0.11);
    pluck(root * 2, t + 0.08, 0.09);
  },
  note(t) {
    noise({ t, dur: 0.09, vol: 0.05, type: 'bandpass', f: 3200, f2: 1800, q: 1.2 });
    noise({ t: t + 0.07, dur: 0.07, vol: 0.035, type: 'bandpass', f: 2600, f2: 4000, q: 1.2 });
    SOUNDS.reward(t + 0.05);
  },
  levelUp(t) {
    timpani(98, t, 0.2);
    [261.6, 329.6, 392].forEach((f, i) => brass(f, t + i * 0.11, 0.2, 0.05));
    [261.6, 329.6, 392, 523.25].forEach(f => brass(f, t + 0.36, 1.1, 0.04));
    tone({ t: t + 0.36, f: 130.8, dur: 1.1, vol: 0.06, type: 'triangle', verb: 0.3 });
    sparkleRun(C5 * 2, t + 0.4, 8, 0.04, 0.03);
    cymbal(t + 0.36, 1.3, 0.05);
  },
  badge(t) {
    sparkleRun(659.3, t, 8, 0.055, 0.04);
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) =>
      bell(f, t + 0.48 + i * 0.012, 0.045, 1.8, 0.6, (i - 1.5) * 0.25),
    );
    [261.6, 392, 523.25].forEach(f =>
      tone({ t: t + 0.45, f, dur: 1.6, vol: 0.03, attack: 0.15, type: 'triangle', verb: 0.6 }),
    );
    noise({ t: t + 0.2, dur: 1.4, vol: 0.025, type: 'highpass', f: 8000, attack: 0.3, verb: 0.5 });
  },
  purchase(t) {
    noise({ t, dur: 0.1, vol: 0.12, type: 'lowpass', f: 260, verb: 0.1 });
    bell(2093, t + 0.03, 0.07, 0.5);
    bell(2637, t + 0.12, 0.08, 0.9);
    coinCascade(t + 0.18, 4, 0.035);
  },
  equip(t) {
    noise({ t, dur: 0.12, vol: 0.25, type: 'bandpass', f: 1800, q: 1.5 });
    bell(pick([590, 640, 700]), t, 0.06, 0.4, 0.2);
    bell(pick([880, 940, 1010]), t + 0.06, 0.04, 0.35, 0.2);
  },
  potion(t) {
    for (let i = 0; i < 6; i++) {
      const f = rand(380, 820),
        at = t + i * rand(0.04, 0.075);
      tone({ t: at, f, f2: f * 2.2, dur: 0.07, vol: 0.06, verb: 0.2 });
    }
    [523.25, 659.3, 784, 1046.5].forEach((f, i) =>
      tone({ t: t + 0.35 + i * 0.07, f, dur: 0.6, vol: 0.04, verb: 0.6 }),
    );
  },
  spell(t) {
    noise({ t, dur: 0.6, vol: 0.06, type: 'bandpass', f: 500, f2: 4200, q: 2, attack: 0.08, verb: 0.5 });
    tone({ t, f: 440, f2: 1320, dur: 0.55, vol: 0.04, type: 'triangle', verb: 0.5 });
    bell(1760, t + 0.45, 0.04, 0.9, 0.6);
  },
  // Combat spells have a short charge, followed by an impact on the combat clock.
  spellCast(t, { spell = 'ember', mode = 'attack' } = {}) {
    if (mode === 'guard') {
      tone({ t, f: spell === 'ward' ? 110 : 330, f2: spell === 'ward' ? 220 : 660, dur: .36, vol: .09, type: 'triangle', attack: .04, verb: .4, pan: -.25 });
      noise({ t, dur: .3, vol: .06, f: 500, f2: 1800, attack: .04, verb: .35, pan: -.25 });
    } else if (spell === 'ember') {
      noise({ t, dur: .36, vol: .13, f: 450, f2: 2600, q: 1.2, attack: .03, verb: .25 });
      tone({ t, f: 180, f2: 580, dur: .33, vol: .06, type: 'triangle', verb: .3 });
    } else if (spell === 'storm') {
      tone({ t, f: 180, f2: 1600, dur: .34, vol: .055, type: 'sawtooth', filter: { type: 'lowpass', f: 1800 }, verb: .3 });
      for (let i = 0; i < 4; i++) noise({ t: t + i * .075, dur: .045, vol: .06, type: 'highpass', f: 3200, verb: .15 });
    } else if (spell === 'starfall') {
      [784, 1046.5, 1568].forEach((f, i) => bell(f, t + i * .09, .045, .45, .5, -.2 + i * .2));
    }
  },
  spellImpact(t, { spell = 'ember', mode = 'attack' } = {}) {
    if (mode === 'guard') {
      bell(spell === 'ward' ? 440 : 1046.5, t, .1, .65, .5, -.25);
      tone({ t, f: 130, f2: 65, dur: .25, vol: .12, verb: .3, pan: -.25 });
      noise({ t, dur: .18, vol: .1, f: 750, f2: 300, verb: .3, pan: -.25 });
    } else if (spell === 'ember') {
      noise({ t, dur: .42, vol: .16, f: 1500, f2: 180, verb: .35, pan: .25 });
      tone({ t, f: 110, f2: 45, dur: .32, vol: .12, verb: .35, pan: .25 });
      for (let i = 0; i < 3; i++) noise({ t: t + .06 + i * .06, dur: .025, vol: .035, type: 'highpass', f: 4200, pan: .25 });
    } else if (spell === 'storm') {
      noise({ t, dur: .08, vol: .22, type: 'highpass', f: 2400, verb: .5, pan: .25 });
      tone({ t, f: 90, f2: 35, dur: .45, vol: .15, verb: .45, pan: .25 });
      bell(1480, t + .025, .05, .5, .4, .25);
    } else if (spell === 'starfall') {
      [1046.5, 1318.5, 2093].forEach((f, i) => bell(f, t + i * .035, .055, .7, .55, .25));
      noise({ t, dur: .32, vol: .045, type: 'highpass', f: 5500, verb: .5, pan: .25 });
    }
  },
  harm(t) {
    tone({ t, f: 150, f2: 70, dur: 0.28, vol: 0.12, verb: 0.15 });
    noise({ t, dur: 0.12, vol: 0.05, type: 'lowpass', f: 320 });
  },

  // Delights
  pop(t) {
    noise({ t, dur: 0.06, vol: 0.22, type: 'bandpass', f: rand(1400, 2200), q: 0.9, attack: 0.001 });
    tone({ t, f: rand(500, 700), f2: 180, dur: 0.08, vol: 0.06, verb: 0.1 });
  },
  treat(t) {
    tone({ t, f: 330, f2: 700, dur: 0.18, vol: 0.08, type: 'triangle', verb: 0.2 });
    tone({ t: t + 0.16, f: 700, f2: 520, dur: 0.16, vol: 0.06, type: 'triangle', verb: 0.2 });
    pluck(1046.5, t + 0.3, 0.07, 0.4, 0.4);
  },
  drift(t) {
    noise({ t, dur: 1.6, vol: 0.05, type: 'bandpass', f: 600, f2: 1400, q: 0.6, attack: 0.5, verb: 0.5 });
    [784, 988, 1175, 1568].forEach((f, i) => bell(f, t + 0.3 + i * 0.22, 0.03, 1.2, 0.7, rand(-0.5, 0.5)));
  },
  rocket(t) {
    tone({
      t,
      f: rand(500, 700),
      f2: rand(1800, 2400),
      dur: 0.7,
      vol: 0.03,
      verb: 0.2,
      pan: rand(-0.6, 0.6),
    });
    noise({ t, dur: 0.7, vol: 0.06, type: 'highpass', f: 3000, attack: 0.1, verb: 0.1 });
  },
  burst(t) {
    const pan = rand(-0.7, 0.7);
    tone({ t, f: 70, f2: 35, dur: 0.6, vol: 0.28, verb: 0.6, pan });
    noise({ t, dur: 0.5, vol: 0.2, type: 'lowpass', f: 900, verb: 0.6, pan });
    for (let i = 0; i < 9; i++)
      noise({
        t: t + 0.15 + i * rand(0.04, 0.09),
        dur: 0.03,
        vol: 0.06,
        type: 'highpass',
        f: 4000,
        verb: 0.3,
        pan: pan + rand(-0.2, 0.2),
      });
  },
  // A short four-on-the-floor groove: kick, offbeat hats, a bassline, and chord stabs.
  disco(t, { bars = 6 } = {}) {
    const beat = 60 / 118,
      bass = [110, 110, 146.8, 164.8, 110, 110, 98, 123.5],
      chords = [
        [220, 277.2, 329.6],
        [196, 246.9, 293.7],
      ];
    for (let b = 0; b < bars * 4; b++) {
      const at = t + b * beat;
      tone({ t: at, f: 150, f2: 45, dur: 0.18, vol: 0.22, verb: 0.05 });
      noise({ t: at + beat / 2, dur: 0.05, vol: 0.05, type: 'highpass', f: 7000, verb: 0.05 });
      tone({
        t: at,
        f: bass[b % 8],
        dur: beat * 0.45,
        vol: 0.06,
        type: 'sawtooth',
        verb: 0.1,
        filter: { type: 'lowpass', f: 500, q: 4 },
      });
      tone({
        t: at + beat / 2,
        f: bass[b % 8] * 2,
        dur: beat * 0.3,
        vol: 0.04,
        type: 'sawtooth',
        verb: 0.1,
        filter: { type: 'lowpass', f: 700, q: 4 },
      });
      if (b % 2 === 1)
        for (const f of chords[Math.floor(b / 4) % 2])
          tone({
            t: at + beat / 2,
            f,
            dur: 0.18,
            vol: 0.025,
            type: 'square',
            verb: 0.35,
            filter: { type: 'lowpass', f: 2200 },
          });
      if (b % 8 === 0) bell(rand(1500, 2100), at, 0.02, 0.6, 0.6, rand(-0.5, 0.5));
    }
    cymbal(t + bars * 4 * beat, 1.2, 0.06);
  },

  // Combat
  // Setting off on an adventure: two soft footsteps, then a bright rising call.
  setOff(t) {
    noise({ t, dur: 0.05, vol: 0.05, type: 'lowpass', f: 900, verb: 0.05, pan: -0.15 });
    noise({ t: t + 0.16, dur: 0.05, vol: 0.05, type: 'lowpass', f: 800, verb: 0.05, pan: 0.15 });
    [392, 523.25, 659.3].forEach((f, i) => bell(f, t + 0.32 + i * 0.11, 0.05, 1.1, 0.45, (i - 1) * 0.2));
    tone({ t: t + 0.32, f: 196, dur: 0.9, vol: 0.035, attack: 0.08, type: 'triangle', verb: 0.4 });
  },
  start(t) {
    timpani(110, t, 0.22);
    brass(196, t + 0.05, 0.38, 0.05);
    brass(293.7, t + 0.05, 0.38, 0.035);
  },
  swing(t, { who = 'player' } = {}) {
    const player = who === 'player',
      pan = player ? -0.25 : 0.25;
    if (player) {
      const [a, b] = pick([
        [rand(700, 1000), rand(3200, 4600)],
        [rand(3000, 4200), rand(900, 1300)],
        [rand(1200, 1600), rand(5000, 6000)],
      ]);
      noise({ t, dur: rand(0.15, 0.24), vol: 0.45, f: a, f2: b, q: 1.4, attack: 0.03, pan, verb: 0.1 });
      tone({ t: t + 0.05, f: rand(1700, 2300), f2: rand(900, 1200), dur: 0.1, vol: 0.02, pan, verb: 0 });
    } else {
      noise({
        t,
        dur: rand(0.24, 0.32),
        vol: 0.5,
        f: rand(250, 400),
        f2: rand(1100, 1600),
        q: 1.1,
        attack: 0.05,
        pan,
        verb: 0.1,
      });
      noise({ t, dur: 0.3, vol: 0.18, type: 'lowpass', f: 180, attack: 0.08, pan });
    }
  },
  // Weapon signatures share a dry swing beneath their material or magical accent.
  weaponSwing(t, { voice = 'steel', pitch = 1 } = {}) {
    const axe = ['wood', 'stone', 'ice'].includes(voice), pan = -.2;
    noise({ t, dur: axe ? .25 : .15, vol: .2, f: (axe ? 550 : 1700) * pitch, f2: (axe ? 2100 : 3900) * pitch, attack: .02, verb: .12, pan });
    if (voice === 'fist') tone({ t: t + .05, f: 140, f2: 65, dur: .12, vol: .1, verb: .1, pan });
    else if (voice === 'leaf' || voice === 'wood') noise({ t: t + .03, dur: .14, vol: .065, type: 'highpass', f: 4200 * pitch, verb: .1, pan });
    else if (voice === 'steel' || voice === 'dagger') bell(voice === 'dagger' ? 1800 * pitch : 950 * pitch, t + .06, .035, .28, .2, pan);
    else if (voice === 'chime' || voice === 'solar') {
      bell(784 * pitch, t + .04, .045, .5, .4, pan);
      bell(1175 * pitch, t + .1, .025, .45, .4, .15);
    } else if (voice === 'venom') tone({ t: t + .03, f: 900, f2: 190, dur: .25, vol: .06, type: 'triangle', verb: .3, pan });
    else if (voice === 'stone') tone({ t: t + .06, f: 100, f2: 45, dur: .24, vol: .13, verb: .15, pan });
    else if (voice === 'ice') [1400, 2200, 2900].forEach((f, i) => bell(f * pitch, t + .04 + i * .035, .03, .32, .35, pan));
    else if (voice === 'shadow' || voice === 'eclipse') {
      tone({ t, f: 300 * pitch, f2: 90, dur: .32, vol: .07, type: 'triangle', verb: .45, pan });
      bell(voice === 'eclipse' ? 660 : 1320, t + .1, .025, .4, .5, pan);
    }
  },
  // The same creature signature accompanies both a hit and a narrowly avoided attack.
  creatureAttack(t, { voice = 'leaf', pitch = 1 } = {}) {
    const pan = .25;
    if (voice === 'leaf') {
      noise({ t, dur: .28, vol: .17, f: 1200 * pitch, f2: 3500, q: .8, verb: .15, pan });
      tone({ t: t + .05, f: 160, f2: 80, dur: .2, vol: .06, pan });
    } else if (voice === 'fire') {
      noise({ t, dur: .42, vol: .2, f: 380, f2: 1800, q: .8, attack: .035, verb: .3, pan });
      tone({ t, f: 85, f2: 140, dur: .3, vol: .06, pan });
    } else if (voice === 'wind') noise({ t, dur: .4, vol: .18, f: 600, f2: 2400 * pitch, q: 1.6, attack: .05, verb: .4, pan });
    else if (voice === 'stone') {
      [0, .09].forEach(d => { noise({ t: t + d, dur: .07, vol: .15, f: 1100, q: 1.1, pan }); tone({ t: t + d, f: 140 * pitch, f2: 60, dur: .13, vol: .1, pan }); });
    } else if (voice === 'horn') {
      noise({ t, dur: .3, vol: .19, f: 300, f2: 1100, attack: .03, pan });
      tone({ t, f: 150 * pitch, f2: 260, dur: .28, vol: .07, type: 'triangle', verb: .3, pan });
    } else if (voice === 'ice') [1046, 1568, 2093].forEach((f, i) => bell(f * pitch, t + i * .07, .045, .5, .4, pan));
    else if (voice === 'solar') {
      tone({ t, f: 85, f2: 40, dur: .35, vol: .19, verb: .3, pan });
      noise({ t: t + .06, dur: .25, vol: .14, type: 'lowpass', f: 480, verb: .3, pan });
      bell(660 * pitch, t + .12, .035, .5, .3, pan);
    } else if (voice === 'lunar') {
      noise({ t, dur: .35, vol: .06, type: 'highpass', f: 5000, attack: .06, verb: .5, pan });
      [1318, 1046, 784].forEach((f, i) => bell(f * pitch, t + i * .07, .035, .5, .5, pan));
    }
  },
  weaponPower(t, { power = 'critical' } = {}) {
    if (power === 'freeze') [1760, 2349, 3136].forEach((f, i) => bell(f, t + i * .055, .05, .65, .5, .25));
    else if (power === 'venom') [0, .08, .16].forEach(d => tone({ t: t + d, f: 460, f2: 170, dur: .1, vol: .045, type: 'triangle', verb: .2, pan: .25 }));
    else if (power === 'drain') [392, 587, 784].forEach((f, i) => tone({ t: t + i * .09, f, dur: .35, vol: .035, verb: .5, pan: .25 - i * .25 }));
    else if (power === 'sunder') { noise({ t, dur: .17, vol: .12, f: 550, f2: 200, verb: .15, pan: .25 }); tone({ t, f: 90, f2: 40, dur: .18, vol: .08, pan: .25 }); }
    else if (power === 'stagger') { tone({ t, f: 320, f2: 110, dur: .3, vol: .08, verb: .3, pan: .25 }); bell(920, t + .08, .035, .3, .3, .25); }
    else { noise({ t, dur: .055, vol: .14, type: 'highpass', f: 3500, pan: .25 }); bell(1568, t, .06, .4, .35, .25); }
  },
  impact(t, { target = 'monster', heavy = false } = {}) {
    const pan = target === 'monster' ? 0.25 : -0.25,
      f = rand(95, 125);
    tone({ t, f, f2: 40, dur: heavy ? 0.38 : 0.2, vol: heavy ? 0.32 : 0.28, pan, verb: heavy ? 0.4 : 0.15 });
    noise({ t, dur: 0.06, vol: 0.2, f: rand(1200, 2300), q: 1, pan, verb: 0.05 });
    if (heavy) {
      noise({ t, dur: 0.35, vol: 0.2, type: 'lowpass', f: 420, pan, verb: 0.35 });
      tone({ t, f: 58, f2: 30, dur: 0.5, vol: 0.2, verb: 0.3 });
      noise({ t: t + 0.01, dur: 0.12, vol: 0.08, type: 'highpass', f: 3500, pan });
    }
  },
  grunt(t, { who = 'monster' } = {}) {
    if (who === 'monster') {
      const f = rand(68, 105);
      for (const ratio of [1, 1.03, 0.5])
        tone({
          t,
          f: f * ratio,
          f2: f * ratio * 0.7,
          dur: rand(0.26, 0.36),
          vol: 0.11,
          type: 'sawtooth',
          pan: 0.25,
          verb: 0.15,
          filter: { type: 'lowpass', f: 700, q: 2 },
        });
    } else {
      const f = rand(150, 195);
      tone({
        t,
        f,
        f2: f * 0.72,
        dur: rand(0.15, 0.2),
        vol: 0.4,
        type: 'sawtooth',
        pan: -0.25,
        verb: 0.1,
        filter: { type: 'bandpass', f: rand(750, 950), q: 3 },
      });
      noise({ t, dur: 0.1, vol: 0.07, f: 1200, q: 2, pan: -0.25 });
    }
  },
  block(t) {
    const f = rand(820, 1180);
    bell(f, t, 0.13, 0.55, 0.3, -0.25);
    bell(f * 1.41, t + 0.005, 0.05, 0.35, 0.3, -0.25);
    noise({ t, dur: 0.05, vol: 0.18, type: 'highpass', f: 4000, pan: -0.25 });
    tone({ t, f: 140, f2: 60, dur: 0.12, vol: 0.1, pan: -0.25 });
  },
  deflect(t) {
    noise({ t, dur: 0.28, vol: 0.3, f: 2400, f2: 600, q: 1.3, attack: 0.02, pan: -0.25 });
    const f = rand(1400, 1900);
    tone({ t: t + 0.08, f, f2: f * 1.35, dur: 0.32, vol: 0.09, verb: 0.5, pan: -0.25 });
  },
  // Companion voices and assists are quiet enough to layer with weapons and spells.
  petCall(t, { pet } = {}) {
    if (pet === 'fox') {
      tone({ t, f: 650, f2: 920, dur: .1, vol: .045, type: 'triangle', verb: .1 });
      tone({ t: t + .08, f: 760, f2: 600, dur: .12, vol: .035, verb: .1 });
      noise({ t, dur: .14, vol: .035, f: 2600, type: 'highpass', verb: .1 });
    } else if (pet === 'owl') {
      tone({ t, f: 340, f2: 290, dur: .17, vol: .06, attack: .025, verb: .2 });
      tone({ t: t + .15, f: 420, f2: 350, dur: .18, vol: .045, attack: .025, verb: .2 });
      noise({ t: t + .08, dur: .17, vol: .035, f: 1900, verb: .1 });
    } else if (pet === 'tortoise') {
      tone({ t, f: 150, f2: 95, dur: .15, vol: .065, type: 'triangle', verb: .08 });
      noise({ t, dur: .06, vol: .05, f: 850, verb: .05 });
    } else if (pet === 'cat') {
      tone({ t, f: 440, f2: 590, dur: .19, vol: .045, attack: .02, verb: .2 });
      tone({ t: t + .1, f: 82, dur: .3, vol: .04, type: 'triangle', attack: .04, verb: .1 });
    } else if (pet === 'drake') {
      tone({ t, f: 115, f2: 170, dur: .22, vol: .055, type: 'triangle', attack: .025, verb: .15 });
      noise({ t: t + .1, dur: .24, vol: .07, f: 1700, f2: 3500, attack: .025, verb: .1 });
    }
  },
  petImpact(t, { pet } = {}) {
    if (pet === 'fox') {
      noise({ t, dur: .19, vol: .07, f: 2800, f2: 850, verb: .1 });
      tone({ t, f: 988, dur: .12, vol: .025, verb: .2 });
    } else if (pet === 'owl') {
      noise({ t, dur: .16, vol: .065, f: 3600, f2: 1500, verb: .1 });
      tone({ t: t + .025, f: 784, dur: .14, vol: .035, verb: .2 });
    } else if (pet === 'tortoise') {
      tone({ t, f: 120, f2: 65, dur: .19, vol: .09, type: 'triangle', verb: .1 });
      noise({ t, dur: .09, vol: .075, f: 950, q: 1.4, verb: .1 });
    } else if (pet === 'cat') {
      bell(880, t, .035, .5, .25);
      bell(1108.73, t + .08, .025, .5, .3);
      tone({ t, f: 82, dur: .35, vol: .035, type: 'triangle', attack: .04, verb: .1 });
    } else if (pet === 'drake') {
      noise({ t, dur: .27, vol: .09, f: 2200, f2: 500, verb: .12 });
      tone({ t, f: 210, f2: 80, dur: .16, vol: .06, type: 'triangle', verb: .1 });
    }
  },
  // A soft two-bell chime when a minute of focus restores HP.
  focusHeal(t) {
    bell(784, t, 0.03, 0.9, 0.6, -0.15);
    bell(1175, t + 0.12, 0.025, 1.1, 0.6, 0.15);
  },
  heal(t) {
    [523.25, 659.3, 784, 1046.5, 1318.5].forEach((f, i) =>
      tone({ t: t + i * 0.07, f, dur: 0.6, vol: 0.045, verb: 0.6, pan: -0.25 }),
    );
    noise({ t, dur: 0.8, vol: 0.02, type: 'highpass', f: 7000, attack: 0.2, verb: 0.5 });
  },
  finisher(t) {
    SOUNDS.impact(t, { target: 'monster', heavy: true });
    tone({
      t: t + 0.02,
      f: 320,
      f2: 55,
      dur: 0.75,
      vol: 0.06,
      type: 'sawtooth',
      verb: 0.5,
      filter: { type: 'lowpass', f: 900, f2: 200 },
    });
    cymbal(t + 0.02, 0.9, 0.04);
  },
  victory(t) {
    [0, 0.07, 0.13, 0.18, 0.22, 0.26].forEach((d, i) => timpani(98, t + d, 0.1 + i * 0.03));
    for (const d of [0.32, 0.48, 0.64]) [196, 246.9, 293.7].forEach(f => brass(f, t + d, 0.13, 0.05));
    [261.6, 329.6, 392, 523.25].forEach((f, i) => brass(f, t + 0.82, 1.5, 0.05, (i - 1.5) * 0.2));
    brass(130.8, t + 0.82, 1.5, 0.05);
    timpani(65.4, t + 0.82, 0.3);
    cymbal(t + 0.82, 1.8, 0.11);
    sparkleRun(C5 * 2, t + 0.9, 9, 0.045, 0.035);
    coinCascade(t + 1.5, 7, 0.04);
  },
  defeat(t) {
    [440, 349.2, 293.7].forEach((f, i) => pluck(f, t + i * 0.26, 0.1, 0.8, 0.5));
    tone({ t, f: 146.8, dur: 1.6, vol: 0.05, attack: 0.2, type: 'triangle', verb: 0.5 });
  },
};

// Build the same synth graph off the audio device, then hand a WAV to HTMLAudioElement.
// Graph construction is synchronous; restore globals before asynchronous rendering starts,
// so overlapping effects cannot steal one another's compressor, buffers, or reverb send.
// 32 kHz keeps every partial of these effects; trimming drops the unused end of the reverb budget.
const MEDIA_RATE = 32000;
function renderMediaPlan(plan) {
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const duration = Math.max(.04, ...plan.map(p => p.t + p.dur + .05 + (p.verb ? 1.8 : 0)));
  if (!Number.isFinite(duration) || duration > 90) throw new Error('Invalid sound duration.');
  // Only panned effects (combat, a few chimes) need stereo; centered ones are stored as mono, half the size.
  const offline = new Offline(plan.some(p => p.pan) ? 2 : 1, Math.ceil(duration * MEDIA_RATE), MEDIA_RATE);
  const previous = { ctx, master, reverbIn, noiseBuf, offlineRendering };
  try {
    ctx = offline; noiseBuf = null; offlineRendering = true; connectMix();
    for (const voice of plan) (voice.kind === 'tone' ? tone : noise)(voice);
  } finally {
    ({ ctx, master, reverbIn, noiseBuf, offlineRendering } = previous);
  }
  // Tails are cut once they fall below about −48 dB, well under what a short effect lets you hear.
  return offline.startRendering().then(buffer => audioBufferWav(trimmedBuffer(buffer, { threshold: .004 })));
}
// The synth voices of one sound, as data. A variant fixes its randomness; `combo` fixes the
// climbing pitch of reward sounds. Live play passes no combo, so the real streak advances.
function recordPlan(name, options, variant, combo = null) {
  const plan = [], previous = { random, forcedCombo };
  try { recording = plan; random = seeded(9973 + variant * 7919); forcedCombo = combo; SOUNDS[name](.01, options); }
  catch {} finally { recording = null; ({ random, forcedCombo } = previous); }
  return plan;
}
// Variation matters for short, frequent sounds; a long celebration keeps one version, saving memory.
const variantCounts = new Map();
function variantsFor(name, options) {
  const key = JSON.stringify([name, options]);
  if (!variantCounts.has(key)) {
    const plan = recordPlan(name, options, 0, 0);
    variantCounts.set(key, plan.length && Math.max(...plan.map(p => p.t + p.dur)) > 1 ? 1 : VARIANTS);
  }
  return variantCounts.get(key);
}
// Rendering ahead of time, one clip per idle moment, so clicks find their sound already made.
const COMBO_SOUNDS = new Set(['check', 'xp', 'reward', 'note']);
const COMBO_STEPS = PENTATONIC.length - 2;
const prepareQueue = [], preparationJobs = new Map();
let preparing = false, preparationEpoch = 0;
const idle = cb => typeof window !== 'undefined' && window.requestIdleCallback ? window.requestIdleCallback(cb, { timeout: 1500 }) : setTimeout(cb, 30);
function queuePreparation(job) {
  job.state = 'queued';
  prepareQueue.push(job);
}
function resumePrepared() {
  // Retry failed work on a new recovery event, rather than spinning on a broken renderer.
  preparationEpoch++;
  for (const job of preparationJobs.values()) if (job.state === 'failed') queuePreparation(job);
  drainPrepared();
}
function drainPrepared() {
  if (preparing || !prepareQueue.length || isMuted()) return;
  preparing = true;
  const step = () => {
    // Keep queued work while muted so unmuting resumes the same bank, including combat sounds.
    if (isMuted()) { preparing = false; return; }
    const job = prepareQueue.shift();
    if (!job) { preparing = false; return; }
    job.state = 'rendering';
    const epoch = preparationEpoch;
    Promise.resolve().then(() => mediaPlayer.prepare(job.plan())).then(Boolean, () => false).then(ready => {
      job.state = ready ? 'ready' : 'failed';
      // A wake can invalidate an in-flight render before it settles. Retry that job too.
      if (!ready && epoch !== preparationEpoch) queuePreparation(job);
    }).finally(() => idle(step));
  };
  idle(step);
}
// Queue sounds for the media bank: [[name, options], ...]. Elsewhere (live Web Audio) it does nothing.
export function prepareSfx(entries) {
  if (!mediaPlayer) return;
  for (const [name, options = {}] of entries) {
    if (!SOUNDS[name]) continue;
    const combos = COMBO_SOUNDS.has(name) ? Array.from({ length: COMBO_STEPS }, (_, i) => i) : [null];
    for (const combo of combos) for (let variant = 0; variant < variantsFor(name, options); variant++) {
      const key = JSON.stringify([name, options, combo, variant]);
      let job = preparationJobs.get(key);
      if (job && job.state !== 'failed') continue;
      if (!job) {
        job = { plan: () => recordPlan(name, options, variant, combo) };
        preparationJobs.set(key, job);
      }
      queuePreparation(job);
    }
  }
  drainPrepared();
}
// Everyday sounds outside combat; combat prepares its own set before a fight.
const EVERYDAY = [
  ['check'], ['xp'], ['reward'], ['note'], ['taskCreated'], ['purchase'], ['equip'], ['potion'], ['spell'], ['harm'],
  ...[4, 10, 18, 40].map(amount => ['coins', { amount }]), ['wind', { direction: 1 }], ['wind', { direction: -1 }],
  ['setOff'], ['focusPause'], ['focusResume'], ['focusHeal'], ['trailBell'], ['levelUp'], ['badge'], ['pop'], ['treat'],
];
// Start once the page has loaded and settled, so the bank never competes with the first render.
if (mediaPlayer) window.addEventListener('load', () => setTimeout(() => prepareSfx(EVERYDAY), 1200), { once: true });

// Browsers pause audio when the page hides, the Mac sleeps, or another tab starts playing; WebKit can leave it "interrupted", or
// running but silent after the output device changes. Any state other than running is resumed, and a
// context that is gone, stuck, or tied to an old output is rebuilt on the next tap or key press.
function rebuild() {
  try { ctx?.close(); } catch {}
  ctx = null;
  noiseBuf = null; clock = null;
  channels.clear();
  setup();
}
export function unlockSfx({ refresh = false } = {}) {
  try {
    if (mediaPlayer) {
      if (refresh) { mediaPlayer.wake(); resumePrepared(); }
      else drainPrepared();
      mixableSession(); mediaPlayer.unlock({ gesture: refresh }); return;
    }
    if (refresh) stale = !!ctx;
    if (stale || ctx?.state === 'closed' || frozen()) { stale = false; rebuild(); }
    setup();
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
  } catch {}
}
// A running clock that has stopped moving means the audio output was lost.
function frozen() {
  if (!ctx || ctx.state !== 'running') return false;
  const now = { audio: ctx.currentTime, wall: performance.now() }, last = clock;
  clock = now;
  return !!last && now.wall - last.wall > 1000 && now.audio - last.audio < 0.05;
}
// Gestures and returning to the app give interrupted audio an early chance to wake.
// Scheduled sounds also recover on their own, without relying on the next gesture.
function wake(event) {
  if (mediaPlayer) {
    const gesture = ['pointerdown', 'keydown', 'touchend'].includes(event?.type);
    if (!gesture) { mediaPlayer.wake(); resumePrepared(); }
    else drainPrepared();
    mixableSession(); mediaPlayer.unlock({ gesture });
    return;
  }
  if (!ctx) return;
  if (ctx.state === 'closed' || frozen()) stale = true;
  if (!stale && ctx.state === 'running') return;
  unlockSfx();
  const woken = ctx;
  setTimeout(() => { if (woken === ctx && ctx.state !== 'running') stale = true; }, 600);
}
if (typeof document !== 'undefined') {
  for (const type of ['pointerdown', 'keydown', 'touchend']) document.addEventListener(type, wake, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) clock = null; else wake(); });
  window.addEventListener('pageshow', wake);
  window.addEventListener('focus', wake);
  navigator.mediaDevices?.addEventListener?.('devicechange', () => {
    if (mediaPlayer) { mediaPlayer.wake(); resumePrepared(); }
    else stale = !!ctx;
  });
}
// A timer chime has no fresh click to wake Safari. Resume, then replace a refused or stuck
// context once, within a short deadline. Share recovery across simultaneous sounds; never loop.
async function resumeWithin(context, milliseconds) {
  let timeout;
  try {
    await Promise.race([
      context.resume().catch(() => {}),
      new Promise(resolve => { timeout = setTimeout(resolve, milliseconds); }),
    ]);
  } catch {} finally { clearTimeout(timeout); }
  return context === ctx && context.state === 'running';
}
function recoverAudio() {
  if (recovering) return recovering;
  recovering = (async () => {
    const interrupted = ctx;
    if (await resumeWithin(interrupted, 180)) return interrupted;
    // A gesture or an output-device change may already have replaced it while we waited.
    if (ctx !== interrupted) return ctx?.state === 'running' ? ctx : null;
    stale = false; rebuild();
    const replacement = ctx;
    return await resumeWithin(replacement, 400) ? replacement : null;
  })().catch(() => null).finally(() => { recovering = null; });
  return recovering;
}
// Play a named sound. Recovery drops outdated feedback instead of accumulating a delayed queue.
export function playSfx(name, options = {}) {
  if (isMuted() || !SOUNDS[name]) return;
  const asked = performance.now(), group = options.channel || 'ui', generation = cancelled.get(group) || 0;
  if (name === 'wind') {
    if (asked - lastWind < 35) return;
    lastWind = asked;
  }
  if (mediaPlayer) {
    const plan = recordPlan(name, options, Math.floor(Math.random() * variantsFor(name, options)));
    mixableSession();
    mediaPlayer.play(plan, { ...options, maxAge: name === 'wind' ? 150 : 800 });
    return;
  }
  const allGeneration = globalCancel;
  try {
    unlockSfx();
    const play = context => {
      if (!context || context !== ctx || context.state !== 'running' || isMuted() || allGeneration !== globalCancel ||
          (cancelled.get(group) || 0) !== generation || performance.now() - asked >= (name === 'wind' ? 150 : 800)) return;
      try {
        channel = group;
        SOUNDS[name](context.currentTime + 0.01 + (options.delay || 0), options);
      } catch {} finally { channel = 'ui'; }
    };
    if (ctx.state === 'running') play(ctx);
    else recoverAudio().then(play);
  } catch {}
}
export function stopSfx(name = 'ui') {
  if (name === null) {
    globalCancel++;
    for (const group of channels.keys()) stopSfx(group);
    mediaPlayer?.stop();
    return;
  }
  mediaPlayer?.stop(name);
  cancelled.set(name, (cancelled.get(name) || 0) + 1);
  for (const source of channels.get(name) || []) {
    try {
      source.stop();
    } catch {}
  }
  channels.get(name)?.clear();
}
export const SOUND_NAMES = Object.keys(SOUNDS);
// Size of the pre-rendered bank (Safari path), or null with live Web Audio.
export const sfxBankStats = () => mediaPlayer?.stats() ?? null;
