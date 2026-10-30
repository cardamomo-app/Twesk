// Safari can lose a tab's live Web Audio output until the window is closed, even after reload.
// Play locally rendered WAV effects through reusable media elements instead. No microphone,
// network audio, continuous silent loop, or live AudioContext is needed for this output path.
// Effects are rendered ahead of time where possible (prepare), kept small (trimmed tails), and
// each media element keeps its last clip loaded, so replaying it needs no reload.
// WebKit report: https://bugs.webkit.org/show_bug.cgi?id=291892
const SILENCE = 'data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export function audioBufferWav(buffer) {
  const channels = buffer.numberOfChannels, frames = buffer.length, rate = buffer.sampleRate;
  const bytes = new ArrayBuffer(44 + frames * channels * 2), view = new DataView(bytes);
  const text = (at, s) => { for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * channels * 2, true);
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); text(36, 'data');
  view.setUint32(40, bytes.byteLength - 44, true);
  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  let offset = 44;
  for (let f = 0; f < frames; f++) for (let c = 0; c < channels; c++) {
    const sample = Math.max(-1, Math.min(1, data[c][f] || 0));
    view.setInt16(offset, Math.round(sample * (sample < 0 ? 32768 : 32767)), true); offset += 2;
  }
  return new Blob([bytes], { type: 'audio/wav' });
}


// Cut the silent end of a rendered effect (reverb tails are budgeted generously), with a short fade.
export function trimmedBuffer(buffer, { threshold = .001, fade = .02 } = {}) {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  let end = 0;
  for (const data of channels) for (let i = data.length - 1; i > end; i--) if (Math.abs(data[i]) > threshold) { end = i; break; }
  const fadeFrames = Math.round(fade * buffer.sampleRate), length = Math.min(buffer.length, end + 1 + fadeFrames);
  const trimmed = channels.map(data => {
    const out = data.slice(0, length);
    for (let i = Math.max(0, length - fadeFrames); i < length; i++) out[i] *= (length - i) / fadeFrames;
    return out;
  });
  return { numberOfChannels: trimmed.length, sampleRate: buffer.sampleRate, length, getChannelData: c => trimmed[c] };
}

export function createMediaSoundPlayer({ render, muted, createAudio, now = () => performance.now(), wallNow = () => Date.now(), voices = 12, cacheBytes = 8 * 1024 * 1024, maxClips = 160 }) {
  const pool = [], clips = new Map(), cancelled = new Map(), pending = new Set(), retained = new Map();
  let epoch = 0, bytes = 0;
  let lastUse = wallNow();
  const valid = request => request.epoch === epoch && request.generation === (cancelled.get(request.channel) || 0) &&
    !muted() && now() - request.asked < request.maxAge + request.delay;
  // Least recently used clips go first; a clip that is playing or waiting to play is kept.
  function trim() {
    for (const [key, clip] of clips) {
      if (clips.size <= maxClips && bytes <= cacheBytes) break;
      if (!clip.url || clip.users || retained.has(key)) continue;
      URL.revokeObjectURL(clip.url); bytes -= clip.bytes; clips.delete(key);
    }
  }
  function release(slot) {
    slot.serial++;
    slot.audio.onended = null; slot.audio.onerror = null;
    try { slot.audio.pause(); } catch {}
    if (slot.clip) slot.clip.users--;
    slot.clip = null; slot.busy = false; slot.priming = false; slot.channel = null; slot.preloaded = false;
    trim();
  }
  function makePool() {
    if (pool.length) return;
    for (let i = 0; i < voices; i++) {
      const audio = createAudio(); audio.preload = 'auto'; audio.loop = false;
      audio.setAttribute?.('playsinline', '');
      pool.push({ audio, unlocked: false, busy: false, serial: 0, started: -Infinity, clip: null, channel: null, loaded: null, stale: false });
    }
  }
  // Safari grants playback per element during a gesture. Only elements that are not yet
  // authorized (or lost it) are primed with silence, so a gesture never reloads the whole pool.
  function unlock() {
    if (muted()) return;
    makePool();
    for (const slot of pool) {
      if (slot.unlocked || slot.busy || slot.priming) continue;
      slot.audio.src = SILENCE; slot.loaded = null; slot.priming = true;
      const serial = ++slot.serial;
      try {
        Promise.resolve(slot.audio.play()).then(() => { if (serial === slot.serial) slot.unlocked = true; })
          .catch(() => {}).finally(() => { if (serial === slot.serial) slot.priming = false; });
      } catch { slot.priming = false; }
    }
  }
  function clipFor(plan) {
    const key = JSON.stringify(plan);
    if (clips.has(key)) { const clip = clips.get(key); clip.users++; clips.delete(key); clips.set(key, clip); return clip.ready; }
    const clip = { users: 1, bytes: 0, url: null };
    clips.set(key, clip);
    let timeout;
    clip.ready = Promise.race([
      Promise.resolve().then(() => render(plan)),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Sound rendering timed out.')), plan.some(p => p.t > 8) ? 10000 : 2000); }),
    ]).then(blob => {
      if (clips.get(key) !== clip) throw new Error('An interrupted audio render was discarded.');
      clip.url = URL.createObjectURL(blob); clip.bytes = blob.size; bytes += clip.bytes;
      return clip;
    }).catch(error => { if (clips.get(key) === clip) clips.delete(key); throw error; }).finally(() => clearTimeout(timeout));
    return clip.ready;
  }
  // Render a clip ahead of time without playing it, so the first real use starts at once.
  function prepare(plan) {
    if (!plan.length) return Promise.resolve(false);
    return clipFor(plan).then(clip => { clip.users--; trim(); return true; }).catch(() => false);
  }
  function start(clip, request) {
    if (!valid(request)) { clip.users--; trim(); return; }
    makePool();
    // Prefer an idle element that already holds this clip: replaying it needs no reload.
    const idle = pool.filter(s => !s.busy && !s.priming);
    const slot = idle.find(s => s.unlocked && s.loaded === clip.url) || idle.filter(s => s.unlocked && !s.preloaded).sort((a, b) => a.started - b.started)[0] ||
      idle.find(s => !s.preloaded) || idle.at(-1) || pool.reduce((a, b) => a.started <= b.started ? a : b);
    release(slot); slot.clip = clip; slot.busy = true;
    slot.channel = request.channel; slot.started = now();
    // A new clip, or an element left idle across sleep, reloads; a warm element just rewinds.
    if (slot.loaded !== clip.url || slot.stale) {
      slot.audio.src = clip.url; slot.loaded = clip.url; slot.stale = false;
      try { slot.audio.load(); } catch {}
    }
    try { slot.audio.currentTime = request.offset; } catch {}
    const serial = slot.serial;
    slot.audio.onended = () => { if (slot.serial === serial) release(slot); };
    slot.audio.onerror = () => { if (slot.serial === serial) { slot.unlocked = false; slot.loaded = null; release(slot); } };
    try {
      Promise.resolve(slot.audio.play()).then(() => { if (slot.serial === serial) slot.unlocked = true; })
        .catch(() => { if (slot.serial === serial) { slot.unlocked = false; slot.loaded = null; release(slot); } });
    } catch { slot.unlocked = false; slot.loaded = null; release(slot); }
    trim();
  }
  function play(plan, { channel = 'ui', delay = 0, maxAge = 800, offset = 0 } = {}) {
    if (muted() || !plan.length) return Promise.resolve(false);
    const wall = wallNow();
    // After a long rest (or a clock jump), each element reloads its clip the next time it plays.
    if (wall - lastUse > 90000 || wall < lastUse) markStale();
    lastUse = wall;
    unlock();
    const request = { channel, delay: Math.max(0, delay * 1000), offset: Math.max(0, offset), maxAge, asked: now(), epoch, generation: cancelled.get(channel) || 0 };
    return clipFor(plan).then(clip => {
      if (!valid(request)) { clip.users--; trim(); return false; }
      const remaining = request.asked + request.delay - now();
      if (remaining <= 0) start(clip, request);
      else {
        // Hold the clip until its coin-flight or combat delay lands, including during cache eviction.
        const job = { channel, timer: null, clip };
        job.timer = setTimeout(() => { pending.delete(job); start(clip, request); }, remaining);
        pending.add(job);
      }
      return true;
    }).catch(() => false);
  }
  // Load/decode encounter tracks before the fight, without playing or stealing a
  // voice. Safari can play a whole encounter without restarting media mid-hit.
  async function preload(plan) {
    if (!has(plan)) return () => {};
    const clip = await clipFor(plan); makePool();
    const slot = pool.find(s => !s.busy && !s.priming && !s.clip);
    if (!slot) { clip.users--; trim(); return () => {}; }
    slot.clip = clip; slot.preloaded = true; slot.loaded = clip.url; slot.stale = false;
    slot.audio.src = clip.url;
    try { slot.audio.load(); } catch {}
    if (typeof slot.audio.addEventListener === 'function' && slot.audio.readyState < 3) await new Promise(resolve => {
      let timer;
      const ready = () => { clearTimeout(timer); slot.audio.removeEventListener('canplaythrough', ready); slot.audio.removeEventListener('error', ready); resolve(); };
      slot.audio.addEventListener('canplaythrough', ready, { once: true }); slot.audio.addEventListener('error', ready, { once: true });
      timer = setTimeout(ready, 1200);
    });
    return () => { if (slot.preloaded && slot.clip === clip) release(slot); };
  }
  function position(plan) {
    const clip = clips.get(JSON.stringify(plan));
    const slot = pool.find(s => s.busy && s.clip === clip && !s.audio.paused);
    return slot ? slot.audio.currentTime : null;
  }
  function stop(channel = null) {
    if (channel === null) epoch++; else cancelled.set(channel, (cancelled.get(channel) || 0) + 1);
    for (const job of pending) if (channel === null || job.channel === channel) {
      clearTimeout(job.timer); job.clip.users--; pending.delete(job);
    }
    for (const slot of pool) if (channel === null || slot.channel === channel) release(slot);
    trim();
  }
  function markStale() { for (const slot of pool) slot.stale = true; }
  // Returning from sleep or a hidden window: drop what was playing, and reload elements lazily as they are used.
  function wake() {
    stop(); markStale();
    // A render interrupted during sleep must not poison a cached effect forever.
    for (const [key, clip] of clips) if (!clip.url) clips.delete(key);
  }
  function dispose() {
    stop();
    for (const slot of pool) { slot.audio.src = ''; try { slot.audio.load(); } catch {} }
    pool.length = 0;
    for (const clip of clips.values()) clip.ready.then(c => URL.revokeObjectURL(c.url)).catch(() => {});
    clips.clear(); retained.clear(); bytes = 0;
  }
  // An encounter holds its small set of clips until it ends. Ordinary UI sounds
  // cannot evict them and force an offline render in the middle of an attack.
  function retain(plans) {
    const keys = [...new Set(plans.map(plan => JSON.stringify(plan)))];
    for (const key of keys) retained.set(key, (retained.get(key) || 0) + 1);
    let released = false;
    return () => {
      if (released) return; released = true;
      for (const key of keys) { const count = retained.get(key) - 1; if (count) retained.set(key, count); else retained.delete(key); }
      trim();
    };
  }
  const has = plan => !!clips.get(JSON.stringify(plan))?.url;
  const stats = () => ({ clips: clips.size, bytes });
  return { unlock, prepare, preload, position, play, stop, wake, dispose, stats, retain, has };
}
