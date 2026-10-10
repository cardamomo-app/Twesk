// Twesk sound effects, synthesized locally with Web Audio (no audio files).
// One shared context runs through a compressor with a light reverb send.
// Repeated sounds draw from random variants, and quick successive rewards climb
// a pentatonic scale so a run of completed tasks sounds increasingly triumphant.
let ctx, master, reverbIn, noiseBuf;
let isMuted = () => false;
let channel = 'ui';
const channels = new Map();
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const C5 = 523.25;
let combo = 0,
  lastReward = 0;

const rand = (a, b) => a + Math.random() * (b - a);
const pick = list => list[Math.floor(Math.random() * list.length)];
const semis = n => 2 ** (n / 12);

export function configureSfx({ muted }) {
  isMuted = muted;
}
function setup() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
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
function impulse(seconds, decay) {
  const length = Math.floor(ctx.sampleRate * seconds),
    buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
  }
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
  const now = performance.now();
  combo = now - lastReward < 3500 ? Math.min(combo + 1, PENTATONIC.length - 3) : 0;
  lastReward = now;
  return combo;
}

const SOUNDS = {
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

export function unlockSfx() {
  try {
    setup();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch {}
}
// Play a named sound. Options: delay (seconds), channel (for stopping a group), plus sound-specific settings.
export function playSfx(name, options = {}) {
  if (isMuted() || !SOUNDS[name]) return;
  try {
    unlockSfx();
    channel = options.channel || 'ui';
    SOUNDS[name](ctx.currentTime + 0.01 + (options.delay || 0), options);
  } catch {
  } finally {
    channel = 'ui';
  }
}
export function stopSfx(name = 'ui') {
  for (const source of channels.get(name) || []) {
    try {
      source.stop();
    } catch {}
  }
  channels.get(name)?.clear();
}
export const SOUND_NAMES = Object.keys(SOUNDS);
