// A visible-time clock for combat. A slow frame stretches the replay instead of
// skipping an impact; nothing catches up while the window is hidden or asleep.
export function createCombatClock({ requestFrame, cancelFrame, hidden = () => false, onFrame = () => {}, onResync = () => {}, maxFrame = 50 }) {
  let elapsed = 0, last = null, nextId = 0, frame = null, stopped = false;
  const jobs = new Map();
  function tick(timestamp) {
    frame = null;
    if (stopped) return;
    if (hidden()) last = null;
    else {
      const gap = last === null ? 0 : Math.max(0, timestamp - last);
      const resync = last === null || gap > maxFrame;
      elapsed += Math.min(maxFrame, gap);
      last = timestamp;
      // Jobs scheduled by a callback wait for another frame, even with zero delay.
      const due = [...jobs].filter(([, job]) => job.at <= elapsed);
      for (const [id, job] of due) {
        if (stopped) break;
        if (jobs.delete(id)) job.run();
      }
      if (!stopped) { if (resync) onResync(elapsed); onFrame(elapsed); }
    }
    if (!stopped) frame = requestFrame(tick);
  }
  frame = requestFrame(tick);
  return {
    get elapsed() { return elapsed; },
    after(delay, run) { if (stopped) return; const id = ++nextId; jobs.set(id, { at: elapsed + Math.max(0, delay), run }); return id; },
    cancel(id) { jobs.delete(id); },
    resetFrame() { last = null; },
    stop() { stopped = true; jobs.clear(); if (frame !== null) cancelFrame(frame); frame = null; },
  };
}
// Weapon impact first, then the spell and companion get distinct readable beats.
// Durations also leave room for the complete burst, recovery motion, and caption.
export function combatTurnTiming({ duration = 1650, spell, pet, reduced = false } = {}) {
  const impact = reduced ? 100 : 400;
  const spellStart = !reduced && spell?.mode === 'attack' ? 150 : 0;
  const spellImpact = spell ? spell.mode === 'guard' ? impact : reduced ? 220 : 600 : null;
  const defendingPet = pet && ['guard', 'deflect'].includes(pet.mode);
  const petStart = pet ? defendingPet ? 0 : reduced ? 80 : spell ? 350 : 150 : 0;
  const petImpact = pet ? defendingPet ? impact : reduced ? 340 : petStart + 450 : null;
  const lastImpact = Math.max(impact, spellImpact || 0, petImpact || 0);
  return { impact, spellStart, spellImpact, petStart, petImpact,
    duration: Math.max(reduced ? Math.max(1200, duration - 200) : duration, lastImpact + (reduced ? 700 : 1000)) };
}

// The same hit timings as the visuals, mixed before combat for Safari's media path.
export function combatSoundTimeline(turn, { reduced = false } = {}) {
  const events = [], add = (at, sounds) => events.push(...sounds.map(([name, options]) => [at, name, options]));
  const { timing, spell, pet, healthPlan, finishingPhase } = turn;
  add(reduced ? 40 : 120, turn.launch);
  if (spell) add(timing.spellStart, [['spellCast', { spell: spell.id, mode: spell.mode }]]);
  if (pet) add(timing.petStart, [['petCall', { pet: pet.id }]]);
  for (const beat of healthPlan.beats) {
    const at = beat.phase === 'impact' ? timing.impact : timing[`${beat.phase}Impact`];
    if (beat.phase === 'impact') add(at, turn.impact);
    if (beat.phase === 'spell') add(at, [['spellImpact', { spell: spell.id, mode: spell.mode }]]);
    if (beat.phase === 'pet') add(at, [['petImpact', { pet: pet.id }]]);
    if (beat.phase === finishingPhase && beat.phase !== 'impact') add(at, [['finisher', { target: 'monster', heavy: false }]]);
    const targets = new Set(beat.floats.filter(f => f.kind === 'damage').map(f => f.side));
    add(at + (beat.phase === finishingPhase ? 140 : 80), turn.grunt.filter(([, options]) => targets.has(options.who === 'monster' ? 'monster' : 'player')));
  }
  return events.sort((a, b) => a[0] - b[0]);
}

// Animation arrivals and the fallback clock share this gate. Each hit lands once,
// in order, even when both signals arrive or the app returns from a hidden window.
export function createCombatImpactSequence(phases, land) {
  let next = 0;
  return phase => {
    const last = phases.indexOf(phase);
    while (next <= last) land(phases[next++]);
  };
}

// Native animations keep painting on the compositor even when the replay clock
// stalls. Never seek backward: that repeats a swing or a floating damage number.
export function syncCombatAnimation(animation, record, elapsed, paused = false) {
  if (animation.playState === 'idle') return; // A replaced CSS effect was cancelled.
  const current = animation.currentTime ?? 0;
  const time = Math.min(record.end, Math.max(current, elapsed - record.start, 0));
  record.finished ||= animation.playState === 'finished' || time >= record.end;
  if (time > current) animation.currentTime = time;
  if (paused || record.finished) {
    if (animation.playState !== 'paused') animation.pause();
  } else if (animation.playState === 'paused') animation.play();
}
