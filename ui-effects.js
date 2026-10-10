// Celebration: reward sounds, flying coins, particle bursts, confetti, count-ups, and level banners.
// Sounds respect Mute; motion respects Reduce motion and the system preference.
import { goldArt } from './art.js?v=0.19.1';
import * as E from './engine.js?v=0.19.1';
import { configureSfx, playSfx } from './sfx.js?v=0.19.1';
import { $, app, icon } from './ui-core.js?v=0.19.1';

configureSfx({ muted: () => app.state.settings.muted });
export const sound = (name = 'reward', options) => playSfx(name, options);
export const motionOK = () =>
  !app.state.settings.reducedMotion && !matchMedia('(prefers-reduced-motion: reduce)').matches;

const PALETTES = {
  gold: ['#f2cf6b', '#dfae45', '#fff1b8', '#c98f2c'],
  xp: ['#a99af0', '#7964c8', '#d9d0ff'],
  body: ['#86b39a', '#b8dcc6', '#5f8f75'],
  mind: ['#86afd0', '#bcd8ee', '#5d8db5'],
  soul: ['#b8a0d8', '#ddd0f0', '#9178b8'],
  heart: ['#e0a3b3', '#f5ccd7', '#c27b8f'],
  confetti: ['#f2cf6b', '#7964c8', '#86b39a', '#e0a3b3', '#86afd0', '#fff1b8'],
};
const centerOf = target => {
  const r = target.getBoundingClientRect ? target.getBoundingClientRect() : target;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};
// Particles flying out from a point: sparks for checks, coins, and seals.
export function burst(target, { palette = 'gold', count = 14, distance = 70, size = 6 } = {}) {
  if (!target || !motionOK()) return;
  const { x, y } = centerOf(target),
    colors = PALETTES[palette] || PALETTES.gold;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span'),
      angle = (i / count) * Math.PI * 2 + Math.random() * 0.5,
      reach = distance * (0.55 + Math.random() * 0.6);
    p.className = 'burst-particle' + (i % 3 ? '' : ' star');
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    p.style.setProperty('--dx', Math.cos(angle) * reach + 'px');
    p.style.setProperty('--dy', Math.sin(angle) * reach + 'px');
    p.style.setProperty('--size', size * (0.6 + Math.random() * 0.8) + 'px');
    p.style.setProperty('--color', colors[i % colors.length]);
    p.style.animationDelay = Math.random() * 60 + 'ms';
    $('#effects').append(p);
    setTimeout(() => p.remove(), 1000);
  }
}
// Confetti falling through an element (used on the victory stage).
export function confetti(container, count = 70) {
  if (!container || !motionOK()) return;
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  layer.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('i');
    piece.style.setProperty('--x', Math.random() * 100 + '%');
    piece.style.setProperty('--drift', (Math.random() - 0.5) * 160 + 'px');
    piece.style.setProperty('--spin', (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540) + 'deg');
    piece.style.setProperty('--color', PALETTES.confetti[i % PALETTES.confetti.length]);
    piece.style.setProperty('--fall', 1.6 + Math.random() * 1.2 + 's');
    piece.style.animationDelay = Math.random() * 450 + 'ms';
    if (i % 4 === 0) piece.className = 'round';
    layer.append(piece);
  }
  container.append(layer);
  setTimeout(() => layer.remove(), 3400);
}
// Animate a number in an element from one value to another.
export function countUp(el, from, to, { delay = 0, duration = 600 } = {}) {
  if (!el) return;
  if (!motionOK() || from === to) {
    el.textContent = to;
    return;
  }
  el.textContent = from;
  const start = performance.now() + delay;
  const step = now => {
    const progress = Math.min(1, Math.max(0, (now - start) / duration)),
      eased = 1 - (1 - progress) ** 3;
    el.textContent = Math.round(from + (to - from) * eased);
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const walletNumber = () => $('#gold-target .gold-value > span');
// Floating amount, coins flying to the purse, a coin cascade on arrival, and a purse count-up.
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
  if (kind !== 'gold') return;
  const dest = $('#gold-target')?.getBoundingClientRect();
  if (!motionOK() || !dest?.width) {
    sound('coins', { amount });
    return;
  }
  const coins = Math.min(9, 3 + Math.floor(amount / 6));
  for (let i = 0; i < coins; i++) {
    const c = document.createElement('span');
    c.className = 'flying-coin';
    c.innerHTML = goldArt(1, true);
    c.style.left = rect.left + rect.width / 2 + 'px';
    c.style.top = rect.top + 'px';
    c.style.setProperty('--dx', dest.left + dest.width / 2 - rect.left - rect.width / 2 + 'px');
    c.style.setProperty('--dy', dest.top + dest.height / 2 - rect.top + 'px');
    c.style.setProperty('--arc', -40 - Math.random() * 50 + 'px');
    c.style.animationDelay = i * 55 + 'ms';
    $('#effects').append(c);
    setTimeout(() => c.remove(), 1400);
  }
  sound('coins', { amount, delay: 0.72 });
  setTimeout(() => {
    const wallet = $('#gold-target');
    wallet?.classList.remove('wallet-bump');
    void wallet?.offsetWidth;
    wallet?.classList.add('wallet-bump');
    burst(wallet, { palette: 'gold', count: 10, distance: 45, size: 5 });
  }, 760);
  countUp(walletNumber(), app.state.gold - amount, app.state.gold, { delay: 760, duration: 520 });
}
// A short banner and fanfare for a stat level-up. Does not block interaction.
export function celebrateLevel(category) {
  sound('levelUp');
  const banner = document.createElement('div');
  banner.className = `level-banner ${category}`;
  banner.setAttribute('role', 'status');
  banner.innerHTML = `<span class="level-banner-icon">${icon(category)}</span><span><small>LEVEL UP</small><strong>${E.CATEGORY_META[category].label} · Level ${E.level(app.state, category)}</strong></span>`;
  $('#effects').append(banner);
  setTimeout(() => banner.remove(), 2600);
  const chip = $(`.stat-chip.${category}`);
  if (chip) {
    chip.classList.add('leveled');
    setTimeout(() => chip.classList.remove('leveled'), 1600);
    burst(chip, { palette: category, count: 18, distance: 80 });
  }
  if (motionOK())
    setTimeout(() => burst(banner, { palette: category, count: 22, distance: 140, size: 7 }), 350);
}
