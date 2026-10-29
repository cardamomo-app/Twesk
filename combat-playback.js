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
    resetFrame() { last = null; },
    stop() { stopped = true; jobs.clear(); if (frame !== null) cancelFrame(frame); frame = null; },
  };
}
// Weapon impact first, then the spell and companion get distinct readable beats.
// Durations also leave room for the complete burst, recovery motion, and caption.
export function combatTurnTiming({ duration = 1650, spell, pet, reduced = false } = {}) {
  const impact = reduced ? 100 : 400;
  const spellStart = !reduced && spell?.mode === 'attack' ? 150 : 0;
  const spellImpact = spell ? reduced ? 220 : spell.mode === 'attack' ? 600 : 400 : null;
  const petStart = pet ? reduced ? 80 : spell ? 350 : 150 : 0;
  const petImpact = pet ? reduced ? 340 : petStart + 450 : null;
  const lastImpact = Math.max(impact, spellImpact || 0, petImpact || 0);
  return { impact, spellStart, spellImpact, petStart, petImpact,
    duration: Math.max(reduced ? Math.max(1200, duration - 200) : duration, lastImpact + (reduced ? 700 : 1000)) };
}

// Remember the frames actually shown, without seeking or restarting native motion.
export function recordCombatAnimationFrame(animation, record) {
  if (animation.playState === 'idle') return;
  record.painted = Math.max(record.painted ?? 0, animation.currentTime ?? 0);
  record.finished ||= animation.playState === 'finished' || record.painted >= record.end;
}
// A stall can advance native time without painting it. Recover those unseen frames,
// but never go behind a frame already shown or replay a completed damage number.
export function syncCombatAnimation(animation, record, elapsed, paused = false) {
  if (animation.playState === 'idle') return; // A replaced CSS effect was cancelled.
  const current = animation.currentTime ?? 0;
  const time = Math.min(record.end, Math.max(record.painted ?? current, elapsed - record.start, 0));
  record.finished ||= time >= record.end;
  if (time !== current) animation.currentTime = time;
  if (paused || record.finished) {
    if (animation.playState !== 'paused') animation.pause();
  } else if (animation.playState !== 'running') animation.play();
}
