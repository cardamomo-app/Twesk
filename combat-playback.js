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
  const spellStart = spell?.mode === 'attack' ? impact : 0;
  const spellImpact = spell ? spell.mode === 'guard' ? impact : reduced ? 220 : 600 : null;
  const defendingPet = pet && ['guard', 'deflect'].includes(pet.mode);
  const petStart = pet ? defendingPet ? 0 : spell?.mode === 'attack' ? spellImpact : impact : 0;
  const petImpact = pet ? defendingPet ? impact : petStart + (reduced ? 120 : 200) : null;
  const lastImpact = Math.max(impact, spellImpact || 0, petImpact || 0);
  return { impact, spellStart, spellImpact, petStart, petImpact,
    duration: Math.max(reduced ? Math.max(1200, duration - 200) : duration, lastImpact + (reduced ? 700 : 1000)) };
}

// Launch each travelling assist only after the previous hit has actually landed.
// Native animation arrivals drive the sequence; the clock covers missing motion.
// An early/duplicate signal cannot release future effects or compress the cascade.
export function createCombatCascade({ clock, timing, phases, reduced = false, onLaunch, onLand, onComplete }) {
  const launched = new Set(['impact']), ready = new Set(), pending = new Map();
  let next = 0, stopped = false;
  const defensive = phase => phase !== 'impact' && timing[`${phase}Impact`] === timing.impact;
  const schedule = (phase, delay) => pending.set(phase, clock.after(delay, () => arrive(phase)));
  const launch = phase => {
    if (launched.has(phase)) return;
    launched.add(phase); onLaunch(phase);
    if (!defensive(phase)) schedule(phase, timing[`${phase}Impact`] - timing[`${phase}Start`] + (reduced ? 0 : 100));
  };
  function arrive(phase) {
    if (stopped || !launched.has(phase) || ready.has(phase) || phases.indexOf(phase) < next) return;
    ready.add(phase); clock.cancel(pending.get(phase)); pending.delete(phase);
    while (next < phases.length && ready.has(phases[next])) {
      onLand(phases[next++]);
      if (next === phases.length) { stopped = true; onComplete(); return; }
      const following = phases[next];
      if (defensive(following)) ready.add(following);
      else { launch(following); return; }
    }
  }
  for (const phase of phases) if (defensive(phase)) launch(phase);
  schedule('impact', timing.impact);
  return { arrive, stop() { stopped = true; for (const id of pending.values()) clock.cancel(id); pending.clear(); } };
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
