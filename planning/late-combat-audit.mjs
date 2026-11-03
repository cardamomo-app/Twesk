// Run from the repository with: node planning/late-combat-audit.mjs
// Compare the base curve and the unlock-time floor with the shipped combat engine.
import * as E from '../engine.js';

const gear = {
  starter: [],
  basic: ['twig', 'linen', 'cap', 'buckler', 'trailboots'],
  large: ['iron', 'guard', 'helm', 'kite', 'rangerboots', 'owl'],
  special: ['star', 'moon', 'starhelm', 'thornwall', 'windstep', 'cat'],
  legendary: ['eclipse', 'sunplate', 'crown', 'aegis', 'windstep', 'drake'],
};
function equipment(ids) {
  const state = E.freshState();
  state.gold = 10000;
  for (const id of ids) E.buy(state, id);
  return { inventory: state.inventory, equipped: state.equipped, activePet: state.activePet };
}
const sets = Object.fromEntries(Object.entries(gear).map(([tier, ids]) => [tier, equipment(ids)]));
function tierAt(number, day = Infinity) {
  if (day < 5) return 'starter';
  if (number < 16) return 'basic';
  if (number < 30) return 'large';
  if (number < 64) return 'special';
  return 'legendary';
}
function equipSet(state, tier) {
  const set = sets[tier];
  Object.assign(state, { ...set, inventory: [...set.inventory], equipped: { ...set.equipped } });
}
const odds = state => Math.round(100 * E.estimateOdds(E.oddsInput(state)));
const dates = Array.from({ length: 242 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
const display = (state, fraction, prepared = false) => odds({
  ...state,
  hp: Math.round(E.maxHP(state) * fraction),
  preparedSpell: prepared ? 'starfall' : null,
  tonic: prepared ? 'swift-tonic' : null,
});

const checkpoints = [];
for (const [number, levels, profile] of [
  ...[30, 48, 64, 96, 120, 160, 240].flatMap(n => [7, 14].map(days => [
    n, 1 + Math.floor((n - 1) / days), days === 7 ? 'active' : 'light',
  ])),
  [64, { body: 13, mind: 6, soul: 11, heart: 10 }, 'uneven'],
]) {
  const state = E.freshState();
  state.monster = { number: number - 1, defeatedOn: dates[0] };
  equipSet(state, tierAt(number));
  for (const stat of E.CATEGORIES) state.xp[stat] = 300 * ((levels[stat] ?? levels) - 1);
  E.rollover(state, dates[1]);
  const base = { ...state, monster: { number, defeatedOn: null } };
  const wounded = display(state, .7);
  const priorTier = number >= 64 ? 'special' : 'large';
  const lowerGear = { ...state, equipped: { ...sets[priorTier].equipped } };
  const sameHP = Math.round(E.maxHP(lowerGear) * .7);
  const betterGearAtSameHP = odds({ ...state, hp: sameHP });
  const lessGearAtSameHP = odds({ ...lowerGear, hp: sameHP });
  const lowerSlot = slot => display({
    ...state, equipped: { ...state.equipped, [slot]: lowerGear.equipped[slot] },
  }, .7);
  const levelUp = { ...state, xp: { ...state.xp, mind: state.xp.mind + 300 } };
  checkpoints.push({
    number, profile, levels: typeof levels === 'number' ? levels : Object.values(levels).join('/'),
    effective: state.monster.difficulty ?? number,
    base70: display(base, .7), baseFull: display(base, 1),
    floor70: wounded, floorFull: display(state, 1),
    floor70Prepped: display(state, .7, true), floorFullPrepped: display(state, 1, true),
    lowerGearSameHP: lessGearAtSameHP, betterGearSameHP: betterGearAtSameHP,
    lowerWeapon70: lowerSlot('weapon'), lowerArmor70: lowerSlot('armor'), mindUp70: display(levelUp, .7),
  });
}
console.log('Same encounter and XP, without consuming a day after losses.');
console.table(checkpoints);

// Seed each run independently. These campaigns recover to full before one attempt
// per day, earn XP daily, and provision gear by encounter tier without a gold budget.
function random(seed) {
  return () => {
    let n = seed = (seed + 0x6D2B79F5) >>> 0;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
const trials = 250;
const results = [];
for (const [profile, pace] of [['active', 7], ['light', 14]]) {
  for (const useFloor of [false, true]) {
    const atDay = new Map([120, 240].map(day => [day, []]));
    for (let trial = 0; trial < trials; trial++) {
      const state = E.freshState(), rng = random(28403 + trial * 9283);
      let equippedTier = '', strengthened = 0, lateFights = 0;
      for (let day = 1; day <= 240; day++) {
        E.rollover(state, dates[day]);
        if (!useFloor) delete state.monster.difficulty;
        const tier = tierAt(state.monster.number, day);
        if (tier !== equippedTier) {
          equipSet(state, tier);
          equippedTier = tier;
        }
        for (const stat of E.CATEGORIES) state.xp[stat] = Math.floor(300 * day / pace);
        state.hp = E.maxHP(state);
        if (state.monster.number > 24) {
          lateFights++;
          if (state.monster.difficulty) strengthened++;
        }
        E.fight(state, dates[day], rng);
        atDay.get(day)?.push({
          wins: state.monster.number - (state.monster.defeatedOn ? 0 : 1),
          strengthened, lateFights,
        });
      }
    }
    for (const [day, runs] of atDay) {
      const sorted = runs.map(run => run.wins).sort((a, b) => a - b);
      const boosted = runs.reduce((sum, run) => sum + run.strengthened, 0);
      const late = runs.reduce((sum, run) => sum + run.lateFights, 0);
      results.push({
        profile, curve: useFloor ? 'floor' : 'current', day, medianWins: sorted[Math.floor(trials / 2)],
        middle80Percent: `${sorted[Math.floor(trials * .1)]}–${sorted[Math.floor(trials * .9)]}`,
        lateAttemptsStrengthened: Math.round(100 * boosted / late) + '%',
      });
    }
  }
}
console.log('Campaigns with failed days included, full HP, and no spell or tonic.');
console.table(results);
