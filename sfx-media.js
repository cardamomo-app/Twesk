// Safari can lose a tab's live Web Audio output until the window is closed, even after reload.
// Play locally rendered WAV effects through reusable media elements instead. No microphone,
// network audio, continuous silent loop, or live AudioContext is needed for this output path.
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

export function createMediaSoundPlayer({ render, muted, createAudio, now = () => performance.now(), wallNow = () => Date.now(), voices = 12, cacheBytes = 12 * 1024 * 1024 }) {
  const pool = [], clips = new Map(), cancelled = new Map(), pending = new Set();
  let epoch = 0, bytes = 0, refreshOnGesture = false;
  let lastUse = wallNow();
  const valid = request => request.epoch === epoch && request.generation === (cancelled.get(request.channel) || 0) &&
    !muted() && now() - request.asked < request.maxAge + request.delay;
  function trim() {
    for (const [key, clip] of clips) {
      if (clips.size <= 40 && bytes <= cacheBytes) break;
      if (!clip.url || clip.users) continue;
      URL.revokeObjectURL(clip.url); bytes -= clip.bytes; clips.delete(key);
    }
  }
  function release(slot) {
    slot.serial++;
    slot.audio.onended = null; slot.audio.onerror = null;
    try { slot.audio.pause(); } catch {}
    if (slot.clip) slot.clip.users--;
    slot.clip = null; slot.busy = false; slot.priming = false; slot.channel = null;
    trim();
  }
  function makePool() {
    if (pool.length) return;
    for (let i = 0; i < voices; i++) {
      const audio = createAudio(); audio.preload = 'auto'; audio.loop = false;
      audio.setAttribute?.('playsinline', '');
      pool.push({ audio, unlocked: false, busy: false, serial: 0, started: -Infinity, clip: null, channel: null });
    }
  }
  function unlock({ gesture = false } = {}) {
    if (muted()) return;
    makePool();
    if (gesture && refreshOnGesture) {
      // Keep the same elements: Safari grants autoplay permission per element.
      // Reload their output on the next real gesture, without replaying an old reward.
      for (const slot of pool) {
        release(slot); slot.unlocked = false; slot.audio.src = SILENCE;
        try { slot.audio.load(); } catch {}
      }
      refreshOnGesture = false;
    }
    for (const slot of pool) {
      if (slot.unlocked || slot.busy || slot.priming) continue;
      slot.audio.src = SILENCE; slot.priming = true;
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
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Sound rendering timed out.')), 2000); }),
    ]).then(blob => {
      if (clips.get(key) !== clip) throw new Error('An interrupted audio render was discarded.');
      clip.url = URL.createObjectURL(blob); clip.bytes = blob.size; bytes += clip.bytes;
      return clip;
    }).catch(error => { if (clips.get(key) === clip) clips.delete(key); throw error; }).finally(() => clearTimeout(timeout));
    return clip.ready;
  }
  function start(clip, request) {
    if (!valid(request)) { clip.users--; trim(); return; }
    makePool();
    const slot = pool.find(s => !s.busy && s.unlocked) || pool.find(s => !s.busy) || pool.reduce((a, b) => a.started <= b.started ? a : b);
    release(slot); slot.clip = clip; slot.busy = true;
    slot.channel = request.channel; slot.started = now(); slot.audio.src = clip.url;
    const serial = slot.serial;
    // Reload even an unchanged cached URL, reopening the media route after an idle/sleep gap.
    try { slot.audio.load(); } catch {}
    try { slot.audio.currentTime = 0; } catch {}
    slot.audio.onended = () => { if (slot.serial === serial) release(slot); };
    slot.audio.onerror = () => { if (slot.serial === serial) { slot.unlocked = false; release(slot); } };
    try {
      Promise.resolve(slot.audio.play()).then(() => { if (slot.serial === serial) slot.unlocked = true; })
        .catch(() => { if (slot.serial === serial) { slot.unlocked = false; release(slot); } });
    } catch { slot.unlocked = false; release(slot); }
    trim();
  }
  function play(plan, { channel = 'ui', delay = 0, maxAge = 800 } = {}) {
    if (muted() || !plan.length) return Promise.resolve(false);
    const wall = wallNow();
    if (wall - lastUse > 90000 || wall < lastUse) wake();
    lastUse = wall;
    unlock();
    const request = { channel, delay: Math.max(0, delay * 1000), maxAge, asked: now(), epoch, generation: cancelled.get(channel) || 0 };
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
  function stop(channel = null) {
    if (channel === null) epoch++; else cancelled.set(channel, (cancelled.get(channel) || 0) + 1);
    for (const job of pending) if (channel === null || job.channel === channel) {
      clearTimeout(job.timer); job.clip.users--; pending.delete(job);
    }
    for (const slot of pool) if (channel === null || slot.channel === channel) release(slot);
    trim();
  }
  function wake() {
    stop(); refreshOnGesture = true;
    // A render interrupted during sleep must not poison a cached effect forever.
    for (const [key, clip] of clips) if (!clip.url) clips.delete(key);
  }
  function dispose() {
    stop();
    for (const slot of pool) { slot.audio.src = ''; try { slot.audio.load(); } catch {} }
    pool.length = 0;
    for (const clip of clips.values()) clip.ready.then(c => URL.revokeObjectURL(c.url)).catch(() => {});
    clips.clear(); bytes = 0;
  }
  return { unlock, play, stop, wake, dispose };
}
