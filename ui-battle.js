// The monster card, victory odds, and animated encounters.
import * as E from './engine.js?v=0.22.9';
import { avatarArt, monsterArt, monsterName, itemArt } from './art.js?v=0.22.9';
import { describeCombatEvent } from './combat-presentation.js?v=0.22.9';
import { playSfx, stopSfx, unlockSfx } from './sfx.js?v=0.22.9';
import { burst, confetti, countUp, motionOK } from './ui-effects.js?v=0.22.9';
import { $, app, esc, icon, modalShell, persist, today, view } from './ui-core.js?v=0.22.9';
import { announceBadges, commit } from './ui-modal.js?v=0.22.9';
import { oddsKey, percent, requestOdds } from './ui-odds.js?v=0.22.9';
export function renderMonster() {
  const number = app.state.monster.number,
    won = !!app.state.monster.defeatedOn,
    spell = E.preparedSpell(app.state),
    tonic = E.activeTonic(app.state);
  return `<section class="panel monster-panel ${won ? 'cleared' : ''}"><div class="monster-heading"><span class="section-kicker">${won ? 'A LITTLE VICTORY' : 'A CHALLENGE AWAITS'}</span><span class="chapter">#${String(number).padStart(2, '0')}</span></div><button class="monster-scene" data-action="bestiary" aria-label="Inspect ${esc(monsterName(number))} in the monster collection" title="Open monster collection">${monsterArt(number, won)}</button><h3>${monsterName(number)}</h3><p>${won ? 'Defeated. Enjoy your well-earned pause.' : 'Waiting here until you feel ready.'}</p>${won ? `<div class="victory-note">${icon('check')}Next opponent arrives tomorrow</div>` : `<div class="readiness"><span>Estimated victory chance</span><strong id="chance-value">${app.chance === null ? '…' : Math.round(app.chance * 100) + '%'}</strong></div><div class="readiness-bar"><div id="chance-bar" style="width:${(app.chance || 0) * 100}%"></div></div>${spell ? `<button class="prepared-spell" data-action="open-spells">${icon('soul')}<span>${spell.name} prepared<small>Consumed in your next fight</small></span></button>` : ''}${tonic ? `<button class="prepared-spell" data-action="open-tonics">${icon('heart')}<span>${tonic.name} active<small>Lasts for your next fight</small></span></button>` : ''}<button class="button primary fight-button" data-action="fight" ${app.state.hp === 0 ? 'disabled' : ''}>${icon('sword')}Challenge ${monsterName(number)}</button>${app.state.hp === 0 ? '<button class="text-button" data-action="recover">Recover HP to fight</button>' : '<small class="fight-hint">Your stats, gear, spells & health shape your chances.</small>'}`}${app.state.battles.some(r => r.monster === number) ? '<button class="text-button replay-button" data-action="replay-battle">' + icon('undo') + 'Replay last encounter</button>' : ''}</section>`;
}
export function updateOdds() {
  const key = oddsKey(app.state);
  if (key === app.chanceKey) return;
  app.chanceKey = key;
  app.chance = null;
  const value = $('#chance-value');
  if (value) value.textContent = '…';
  requestOdds(app.state).then(chance => {
    if (key !== app.chanceKey) return;
    app.chance = chance;
    const v = $('#chance-value'),
      bar = $('#chance-bar');
    if (v) v.textContent = chance === null ? 'Unavailable' : percent(chance);
    if (bar) bar.style.width = (chance || 0) * 100 + '%';
  });
}
function renderBattleModal() {
  const r = app.modal.result,
    finished = app.modal.finished,
    index = app.modal.index ?? -1;
  const event = index >= 0 ? r.events[Math.min(index, r.events.length - 1)] : null;
  const previous = index > 0 ? r.events[index - 1] : null,
    enemyMax = E.monsterStats(r.monster).hp;
  const maximum = r.maxHP || E.maxHP(app.state),
    initial = r.initialHP ?? app.modal.initialHP;
  const hp = finished
    ? r.hp
    : event
      ? app.modal.impact
        ? event.hp
        : (event.hpBefore ?? previous?.hp ?? initial)
      : initial;
  const enemy = finished
    ? r.won
      ? 0
      : r.events.at(-1).enemy
    : event
      ? app.modal.impact
        ? event.enemy
        : (event.enemyBefore ?? previous?.enemy ?? enemyMax)
      : enemyMax;
  const loadout = r.loadout || app.state.equipped,
    weapon = E.SHOP.find(i => i.id === loadout.weapon),
    armor = E.SHOP.find(i => i.id === loadout.armor),
    helmet = E.SHOP.find(i => i.id === loadout.helmet),
    shield = E.SHOP.find(i => i.id === loadout.shield) || null,
    boots = E.SHOP.find(i => i.id === loadout.boots) || null,
    pet = E.SHOP.find(i => i.id === r.pet),
    tonic = E.SHOP.find(i => i.id === r.tonic);
  const levels = r.levels || Object.fromEntries(E.CATEGORIES.map(c => [c, E.level(app.state, c)]));
  const context = {
      monster: monsterName(r.monster),
      weapon,
      armor,
      shield,
      spell: E.SHOP.find(i => i.id === r.spell),
      pet,
    },
    step = event ? describeCombatEvent(event, context) : null;
  const round = event?.round || Math.floor(Math.max(0, index) / 2) + 1;
  const stageClass = finished
    ? `outcome ${r.won ? 'victory' : 'defeat'}`
    : event
      ? `event-${event.type}${event.enemy === 0 ? ' finishing-strike' : ''}${event.hp === 0 ? ' fatal-hit' : ''}${isHeavy(event, r.monster) ? ' heavy-blow' : ''}`
      : 'ready';
  const effect = side =>
    !finished && step?.target === side
      ? `<div class="combat-float ${step.tone}">${esc(step.float)}</div>${event.type === 'hit' && event.blocked ? `<div class="combat-block">${icon('shield')}BLOCKED ${event.blocked}</div>` : ''}${event.type === 'deflect' ? `<div class="deflect-ring">${icon('soul')}</div>` : ''}${event.type === 'stagger' ? `<div class="deflect-ring stagger-ring">${icon(weapon?.kind === 'axe' && weapon.tier === 'special' ? 'sparkle' : 'sword')}</div>` : ''}${event.type === 'rally' ? '<div class="healing-ring"></div>' : ''}${['attack', 'hit'].includes(event.type) ? '<svg class="strike-arc" viewBox="0 0 120 120" aria-hidden="true"><path d="M93 11Q21 42 24 105"/><path d="M107 18Q50 42 42 91"/></svg><svg class="hit-sparks" viewBox="0 0 100 100" aria-hidden="true"><path d="m50 14 0 20m0 32v20M14 50h20m32 0h20M24 24l14 14m24 24 14 14M24 76l14-14m24-24 14-14"/></svg>' : ''}`
      : '';
  const historyEnd = finished ? r.events.length : Math.max(0, index);
  const history = r.events.slice(Math.max(0, historyEnd - 4), historyEnd);
  const chips = [
    ...(r.spell ? [{ label: `${E.SHOP.find(i => i.id === r.spell)?.name} · this fight`, tone: 'soul' }] : []),
    ...(tonic ? [{ label: `${tonic.name} · this fight`, tone: 'soul' }] : []),
    ...(pet
      ? [{ label: `${pet.name} · ${pet.description.split('·')[1]?.trim() || 'companion'}`, tone: 'gear' }]
      : []),
    ...(helmet ? [{ label: `${helmet.name} · +${helmet.bonus} max HP`, tone: 'gear' }] : []),
    { label: `Body ${levels.body} · ${maximum} max HP`, tone: 'body' },
    ...(weapon
      ? [{ label: `${weapon.name} · +${weapon.bonus} attack${weapon.power ? ' · ' + weapon.description.split('·')[1].trim() : ''}`, tone: 'gear' }]
      : [{ label: 'Unarmed', tone: 'gear' }]),
    ...(armor ? [{ label: `${armor.name} · −${armor.bonus} damage`, tone: 'gear' }] : []),
    ...(shield ? [{ label: `${shield.name} · ${shield.bonus}% block`, tone: 'gear' }] : []),
    ...(boots ? [{ label: `${boots.name} · +${boots.bonus}% deflect`, tone: 'gear' }] : []),
    ...(levels.mind > 1
      ? [{ label: `Mind ${levels.mind} · +${4 * (levels.mind - 1)} attack`, tone: 'mind' }]
      : []),
    ...(levels.soul > 1
      ? [
          {
            label: `Soul ${levels.soul} · ${Math.round(E.soulDeflect(levels.soul) * 100)}% deflect`,
            tone: 'soul',
          },
        ]
      : []),
    ...(levels.heart > 1
      ? [{ label: `Heart ${levels.heart} · ${15 * (levels.heart - 1)} rally`, tone: 'heart' }]
      : []),
  ];
  return modalShell(
    finished ? (r.won ? 'Victory!' : 'Defeated') : `Encounter · ${monsterName(r.monster)}`,
    `<div class="battle-body">
    <div class="battle-toolbar"><span>${finished ? `${round} rounds` : `${index < 0 ? 'GET READY' : `ROUND ${round} · ${event?.type === 'attack' ? 'YOUR TURN' : event?.type === 'rally' ? 'RECOVERY' : 'MONSTER’S TURN'}`}`}</span><div>${app.modal.replay ? '<span class="replay-label">REPLAY</span>' : ''}<span>${finished ? 'Encounter complete' : `Step ${Math.max(0, index + 1)} / ${r.events.length}`}</span><button class="icon-button" data-action="battle-mute" title="${app.state.settings.muted ? 'Unmute combat' : 'Mute combat'}" aria-label="${app.state.settings.muted ? 'Unmute combat' : 'Mute combat'}">${icon(app.state.settings.muted ? 'mute' : 'sound')}</button></div></div>
    <div class="battle-stage ${stageClass}" id="battle-stage">${finished && r.won ? '<div class="victory-banner" aria-hidden="true"><span class="victory-rays"></span><strong>VICTORY</strong></div>' : ''}
      <div class="battle-fighter player"><div class="fighter-scene"><div class="fighter-motion">${avatarArt(weapon, armor, false, { appearance: r.appearance || app.state.appearance, helmet, shield, boots })}</div>${effect('player')}</div><strong>${esc(r.playerName || app.state.name)}</strong><div class="health-bar" role="progressbar" aria-label="Adventurer health" aria-valuemin="0" aria-valuemax="${maximum}" aria-valuenow="${hp}" id="battle-player-bar"><div style="width:${(hp / maximum) * 100}%"></div></div><small id="battle-player-hp">${hp} / ${maximum} HP</small></div>
      <div class="battle-divider"><span>VS</span><i></i></div>
      <div class="battle-fighter monster"><div class="fighter-scene"><div class="fighter-motion">${monsterArt(r.monster, finished && r.won)}</div>${effect('monster')}</div><strong>${monsterName(r.monster)}</strong><div class="health-bar enemy" role="progressbar" aria-label="Monster health" aria-valuemin="0" aria-valuemax="${enemyMax}" aria-valuenow="${enemy}" id="battle-enemy-bar"><div style="width:${(enemy / enemyMax) * 100}%"></div></div><small id="battle-enemy-hp">${enemy} / ${enemyMax} HP</small></div>
    </div>
    <div class="battle-step ${finished ? (r.won ? 'won' : 'lost') : step?.tone || 'ready'}" aria-live="polite"><strong>${finished ? (r.won ? `${monsterName(r.monster)} defeated` : 'Your adventurer falls') : step ? esc(step.title) : 'Ready your stance'}</strong><p>${finished ? (app.modal.replay ? 'This is a replay. Health and rewards stay unchanged.' : r.won ? 'Loot collected. Your next opponent arrives tomorrow.' : 'Reflect to recover HP, then try again when you feel ready.') : step ? esc(step.detail) : 'You attack first. Equipment and stats apply automatically.'}</p><div class="combat-badges">${(!finished && step ? step.badges : []).map(b => `<span class="combat-badge ${b.tone}">${esc(b.label)}</span>`).join('')}</div></div>
    ${finished ? `<div class="battle-result">${r.won ? `<div class="loot-box loot-reveal">${r.loot.type === 'gold' ? icon('coin') + `<strong>+${r.loot.amount} gold</strong>` : itemArt(E.SHOP.find(i => i.id === r.loot.id)) + `<strong>${E.SHOP.find(i => i.id === r.loot.id).name}</strong>`}<span>${app.modal.replay ? 'Previously earned' : r.loot.type === 'gold' ? 'Added to your pouch' : 'Added to your equipment'}</span></div><button class="button primary wide" data-action="close-modal">Back to dashboard</button>` : `${!app.modal.replay ? `<button class="button primary wide" data-action="recover">${icon('pencil')}Reflect & recover</button>` : ''}<button class="button secondary wide" data-action="close-modal">Back to dashboard</button>`}</div>` : ''}
    <div class="combat-loadout">${chips.map(b => `<span class="${b.tone}">${esc(b.label)}</span>`).join('')}</div>
    ${
      history.length
        ? `<details class="combat-history" ${finished ? 'open' : ''}><summary>Encounter log <span>${historyEnd} ${historyEnd === 1 ? 'step' : 'steps'}</span></summary><ol>${(finished
            ? r.events
            : history
          )
            .map(e => {
              const d = describeCombatEvent(e, context);
              return `<li class="${d.tone}"><span>${esc(d.title)}</span><strong>${esc(d.float)}</strong>${d.badges.length ? `<small>${esc(d.badges.map(b => b.label).join(' · '))}</small>` : ''}</li>`;
            })
            .join('')}</ol></details>`
        : ''
    }
    ${finished ? '' : '<button class="text-button battle-skip" data-action="skip-battle">Skip to result</button>'}
  </div>`,
    'battle-modal',
  );
}
const battleTimers = new Set();
const battleAudio = {
  unlock: unlockSfx,
  play: (name, options) => playSfx(name, { ...options, channel: 'battle' }),
  stop: () => stopSfx('battle'),
};
// The top quarter of attack rolls land as heavy blows: bigger sound and a stage shake.
const isHeavy = (event, monster) =>
  event.type === 'attack'
    ? event.baseDamage >= 30
    : event.type === 'hit' && event.rawDamage >= E.monsterStats(monster).attack + 6;
// Victory: confetti, a stamped banner, a glowing loot reveal, and a gold count-up.
function celebrateOutcome(r) {
  if (!r.won) return;
  const stage = $('#battle-stage');
  confetti(stage, 80);
  const loot = $('#overlay .loot-box');
  if (!loot) return;
  setTimeout(() => burst(loot, { palette: 'gold', count: 22, distance: 110, size: 7 }), motionOK() ? 900 : 0);
  if (r.loot.type === 'gold') {
    const amount = loot.querySelector('strong');
    const number = document.createElement('span');
    amount.textContent = '+';
    amount.append(number, ' gold');
    countUp(number, 0, r.loot.amount, { delay: 900, duration: 700 });
  }
}
function scheduleBattle(fn, delay) {
  const timer = setTimeout(() => {
    battleTimers.delete(timer);
    fn();
  }, delay);
  battleTimers.add(timer);
}
function stopBattlePlayback() {
  for (const timer of battleTimers) clearTimeout(timer);
  battleTimers.clear();
  battleAudio.stop();
}
export function finishBattlePlayback(playSound = true) {
  stopBattlePlayback();
  app.busy = false;
  if (app.modal?.type !== 'battle') return;
  app.modal.index = app.modal.result.events.length - 1;
  app.modal.finished = true;
  app.modal.impact = true;
  view.renderModal();
  if (playSound) battleAudio.play(app.modal.result.won ? 'victory' : 'defeat');
  celebrateOutcome(app.modal.result);
  if (!app.modal.replay && app.pendingBadges.length) {
    announceBadges(app.pendingBadges);
    app.pendingBadges = [];
  }
}
function animateBattle(result, initialHP, replay = false) {
  stopBattlePlayback();
  battleAudio.unlock();
  app.busy = true;
  app.modal = { type: 'battle', result, index: -1, initialHP, finished: false, impact: false, replay };
  view.render();
  scheduleBattle(() => battleAudio.play('start'), 250);
  const reduced = app.state.settings.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const advance = () => {
    if (app.modal?.type !== 'battle') return;
    app.modal.index++;
    app.modal.impact = false;
    if (app.modal.index >= result.events.length) {
      finishBattlePlayback();
      return;
    }
    const event = result.events[app.modal.index],
      description = describeCombatEvent(event);
    view.renderModal();
    const heavy = isHeavy(event, result.monster),
      finishing = event.type === 'attack' && event.enemy === 0;
    if (event.type === 'attack') scheduleBattle(() => battleAudio.play('swing', { who: 'player' }), 120);
    if (event.type === 'hit' || event.type === 'deflect')
      scheduleBattle(() => battleAudio.play('swing', { who: 'monster' }), 120);
    scheduleBattle(
      () => {
        if (app.modal?.type !== 'battle') return;
        app.modal.impact = true;
        $('#battle-stage')?.classList.add('impacted');
        const maximum = result.maxHP || E.maxHP(app.state),
          enemyMax = E.monsterStats(result.monster).hp;
        const player = $('#battle-player-bar'),
          enemy = $('#battle-enemy-bar');
        if (player) {
          player.firstElementChild.style.width = (event.hp / maximum) * 100 + '%';
          player.setAttribute('aria-valuenow', event.hp);
          $('#battle-player-hp').textContent = `${event.hp} / ${maximum} HP`;
        }
        if (enemy) {
          enemy.firstElementChild.style.width = (event.enemy / enemyMax) * 100 + '%';
          enemy.setAttribute('aria-valuenow', event.enemy);
          $('#battle-enemy-hp').textContent = `${event.enemy} / ${enemyMax} HP`;
        }
        if (event.type === 'attack') {
          battleAudio.play(finishing ? 'finisher' : 'impact', { target: 'monster', heavy });
          scheduleBattle(() => battleAudio.play('grunt', { who: 'monster' }), finishing ? 140 : 80);
        }
        if (event.type === 'hit') {
          if (event.blocked) battleAudio.play('block');
          battleAudio.play('impact', { target: 'player', heavy });
          scheduleBattle(() => battleAudio.play('grunt', { who: 'player' }), 80);
        }
        if (event.type === 'deflect' || event.type === 'stagger') battleAudio.play('deflect');
        if (event.type === 'rally') battleAudio.play('heal');
      },
      reduced ? 100 : 400,
    );
    scheduleBattle(advance, reduced ? Math.max(1200, description.duration - 200) : description.duration);
  };
  scheduleBattle(advance, 1000);
}
export const modals = {
  battle() {
    return renderBattleModal();
  },
};
export const actions = {
  fight(b, { a, id, sourceRect }) {
    const initialHP = app.state.hp,
      result = commit(() => E.fight(app.state, today()), { deferBadges: true });
    if (result) animateBattle(result, initialHP);
  },
  'skip-battle'(b, { a, id, sourceRect }) {
    finishBattlePlayback();
  },
  'replay-battle'(b, { a, id, sourceRect }) {
    const result = app.state.battles.find(r => r.monster === app.state.monster.number);
    if (result) animateBattle(result, result.initialHP ?? result.events[0]?.hp ?? app.state.hp, true);
  },
  'battle-mute'(b, { a, id, sourceRect }) {
    app.state.settings.muted = !app.state.settings.muted;
    persist();
    if (app.state.settings.muted) battleAudio.stop();
    b.innerHTML = icon(app.state.settings.muted ? 'mute' : 'sound');
    b.setAttribute('aria-label', app.state.settings.muted ? 'Unmute combat' : 'Mute combat');
    b.title = app.state.settings.muted ? 'Unmute combat' : 'Mute combat';
  },
};
