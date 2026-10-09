// Delights: single-use moments of fun bought in the shop. They play over the app without blocking it
// (only balloons can be clicked, to pop them) and Escape ends one early. Sounds follow Mute; with
// Reduce motion, each becomes a gentle glow instead of moving particles.
import { $, app, today } from './ui-core.js?v=0.16.0';
import { burst, motionOK, sound } from './ui-effects.js?v=0.16.0';
import { stopSfx } from './sfx.js?v=0.16.0';

const COLORS = ['#e86f7f', '#6fa8e8', '#f2c14e', '#7fc9a0', '#b48be8', '#f29b6b'];
const rand = (a, b) => a + Math.random() * (b - a);
let current = null;

export function stopDelight() {
  if (!current) return;
  for (const timer of current.timers) clearTimeout(timer);
  current.layer.remove();
  stopSfx('delight');
  document.body.classList.remove('disco-dancing');
  document.querySelectorAll('.treat-hop').forEach(el => el.classList.remove('treat-hop'));
  current = null;
}
export const delightPlaying = () => !!current;

function balloons(layer, after) {
  for (let i = 0; i < 14; i++) {
    const b = document.createElement('button');
    b.className = 'balloon';
    b.tabIndex = -1;
    const duration = rand(6.5, 9.5),
      delay = rand(0, 2.2);
    Object.assign(b.style, {
      left: rand(4, 92) + '%',
      animationDuration: `${duration}s, ${rand(2.2, 3.4)}s`,
      animationDelay: `${delay}s, 0s`,
    });
    b.style.setProperty('--color', COLORS[i % COLORS.length]);
    b.style.setProperty('--sway', rand(12, 34) + 'px');
    b.addEventListener('pointerdown', () => {
      sound('pop', { channel: 'delight' });
      burst(b, { palette: 'confetti', count: 10, distance: 46, size: 5 });
      b.remove();
    });
    layer.append(b);
  }
  after(12000);
}
function treat(layer, after) {
  const pet = $('#app .pet-companion');
  sound('treat', { channel: 'delight' });
  if (pet) {
    pet.classList.add('treat-hop');
    const r = pet.getBoundingClientRect(),
      heart = document.createElement('span');
    heart.className = 'treat-heart';
    Object.assign(heart.style, { left: r.left + r.width / 2 + 'px', top: r.top + 'px' });
    heart.textContent = '♥';
    layer.append(heart);
  }
  after(1800);
}
function fireworks(layer, after) {
  layer.classList.add('night');
  const { innerWidth: w, innerHeight: h } = window;
  for (let i = 0; i < 9; i++) {
    const launch = rand(300, 6200),
      x = rand(0.12, 0.88) * w,
      apex = rand(0.15, 0.42) * h,
      color = COLORS[i % COLORS.length];
    current.timers.push(
      setTimeout(() => {
        const rocket = document.createElement('span');
        rocket.className = 'rocket';
        Object.assign(rocket.style, { left: x + 'px', top: h + 'px' });
        rocket.style.setProperty('--rise', apex - h + 'px');
        layer.append(rocket);
        sound('rocket', { channel: 'delight' });
        current?.timers.push(
          setTimeout(() => {
            rocket.remove();
            sound('burst', { channel: 'delight' });
            const flash = document.createElement('span');
            flash.className = 'burst-flash';
            Object.assign(flash.style, { left: x + 'px', top: apex + 'px' });
            flash.style.setProperty('--color', color);
            layer.append(flash);
            // Two rings of streaks pointing outward, like a chrysanthemum shell.
            for (let p = 0; p < 56; p++) {
              const spark = document.createElement('span'),
                angle = (p / 28) * Math.PI * 2 + (p >= 28 ? 0.11 : 0),
                reach = p >= 28 ? rand(55, 85) : rand(110, 160);
              spark.className = 'spark';
              Object.assign(spark.style, { left: x + 'px', top: apex + 'px' });
              spark.style.setProperty('--dx', Math.cos(angle) * reach + 'px');
              spark.style.setProperty('--dy', Math.sin(angle) * reach + 'px');
              spark.style.setProperty('--angle', angle + Math.PI / 2 + 'rad');
              spark.style.setProperty('--color', p % 5 ? color : '#fff6d8');
              layer.append(spark);
            }
          }, 750),
        );
      }, launch),
    );
  }
  after(8600);
}
function disco(layer, after) {
  layer.classList.add('disco');
  layer.innerHTML =
    '<div class="disco-ball"><i></i></div>' +
    ['#ff6fb5', '#6fd6ff', '#ffd36f', '#9b7bff']
      .map((c, i) => `<div class="beam" style="--color:${c};--i:${i}"></div>`)
      .join('') +
    '<div class="disco-sparkles"></div>';
  // On the page rather than on elements, so the dance survives dashboard redraws.
  document.body.classList.add('disco-dancing');
  sound('disco', { channel: 'delight', bars: 6 });
  after(12800);
}

export function playDelight(id) {
  stopDelight();
  const layer = document.createElement('div');
  layer.id = 'delight-layer';
  layer.className = `delight-layer ${id}`;
  layer.setAttribute('aria-hidden', 'true');
  document.body.append(layer);
  current = { layer, timers: [] };
  const after = ms => current.timers.push(setTimeout(stopDelight, ms));
  if (id === 'drift') {
    sound('drift', { channel: 'delight' });
    renderAmbience();
    return after(0);
  }
  if (!motionOK()) {
    // Reduce motion: a short, soft glow in the delight's colors, with its sound.
    layer.classList.add('gentle');
    sound(id === 'fireworks' ? 'burst' : id === 'disco' ? 'drift' : id === 'treat' ? 'treat' : 'pop', {
      channel: 'delight',
    });
    return after(2600);
  }
  ({ balloons, treat, fireworks, disco })[id]?.(layer, after);
}

// Seasonal drift: petals, leaves, or snow over the dashboard until the end of the day.
export function renderAmbience() {
  const ambience = app.state.ambience,
    active = ambience && ambience.day === today() && motionOK();
  const layer = $('#ambience');
  if (!active) return layer?.remove();
  if (layer?.dataset.kind === ambience.kind) return;
  layer?.remove();
  const next = document.createElement('div');
  next.id = 'ambience';
  next.className = `ambience ${ambience.kind}`;
  next.dataset.kind = ambience.kind;
  next.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 26; i++) {
    const flake = document.createElement('i');
    Object.assign(flake.style, {
      left: rand(0, 100) + '%',
      animationDuration: `${rand(9, 16)}s, ${rand(3, 5)}s`,
      animationDelay: `${-rand(0, 16)}s, ${-rand(0, 5)}s`,
    });
    flake.style.setProperty('--size', rand(6, 12) + 'px');
    flake.style.setProperty('--sway', rand(20, 60) + 'px');
    next.append(flake);
  }
  document.body.append(next);
}

// Escape ends a delight before it can close anything else.
export function installDelights() {
  document.addEventListener(
    'keydown',
    event => {
      if (event.key !== 'Escape' || !current) return;
      event.preventDefault();
      event.stopPropagation();
      stopDelight();
    },
    true,
  );
}
