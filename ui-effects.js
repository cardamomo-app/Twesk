// Reward sounds and the floating gold/XP animation.
import { goldArt } from './art.js?v=0.7.4';
import { playCoinSound } from './coin-sound.js';
import { $, app } from './ui-core.js?v=0.8.0';
let audio;
export function sound(kind = 'reward') {
  if (app.state.settings.muted) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
    if (kind === 'coins') {
      playCoinSound(audio);
      return;
    }
    const t = audio.currentTime;
    [kind === 'harm' ? 200 : 660, kind === 'harm' ? 150 : 880].forEach((freq, i) => {
      const o = audio.createOscillator(),
        g = audio.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0, t + i * 0.07);
      g.gain.linearRampToValueAtTime(0.035, t + i * 0.07 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.07 + 0.16);
      o.connect(g);
      g.connect(audio.destination);
      o.start(t + i * 0.07);
      o.stop(t + i * 0.07 + 0.17);
    });
  } catch {}
}
export function rewardEffect(target, amount, kind = 'gold') {
  if (!target) return;
  const rect = target.getBoundingClientRect ? target.getBoundingClientRect() : target,
    el = document.createElement('span');
  el.className = 'reward-pop ' + kind;
  el.textContent = `+${amount}${kind === 'gold' ? ' gold' : ' XP'}`;
  el.style.left = rect.left + rect.width / 2 + 'px';
  el.style.top = rect.top + 'px';
  $('#effects').append(el);
  setTimeout(() => el.remove(), 1100);
  if (
    kind !== 'gold' ||
    app.state.settings.reducedMotion ||
    matchMedia('(prefers-reduced-motion: reduce)').matches
  )
    return;
  const dest = $('#gold-target')?.getBoundingClientRect();
  if (!dest) return;
  dest.width &&
    $('#gold-target').animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.07)' }, { transform: 'scale(1)' }],
      { duration: 380, delay: 750 },
    );
  for (let i = 0; i < 4; i++) {
    const c = document.createElement('span');
    c.className = 'flying-coin';
    c.innerHTML = goldArt(1, true);
    c.style.left = rect.left + rect.width / 2 + 'px';
    c.style.top = rect.top + 'px';
    c.style.setProperty('--dx', dest.left + dest.width / 2 - rect.left - rect.width / 2 + 'px');
    c.style.setProperty('--dy', dest.top + dest.height / 2 - rect.top + 'px');
    c.style.animationDelay = i * 55 + 'ms';
    $('#effects').append(c);
    setTimeout(() => c.remove(), 1200);
  }
}
