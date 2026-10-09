// Long-term balance simulation: plays a year of daily use through the real engine rules.
// Run: node planning/long-term-sim.mjs [days]
// Three player profiles; seeded randomness so results are repeatable.
import * as E from '../engine.js';

const DAYS = Number(process.argv[2] || 365);
const shift = (day, n) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
function seeded(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const PROFILES = {
  light: { habitRate: 0.45, tasks: [1, 0, 0, 0], hardEvery: 0, notesPerDay: 0.3, reviewRate: 0.2, fightAt: 0.6 },
  steady: { habitRate: 0.75, tasks: [3, 0, 1, 0], hardEvery: 0, notesPerDay: 1, reviewRate: 0.6, fightAt: 0.6 },
  intense: { habitRate: 0.95, tasks: [4, 1, 1, 0], questEvery: 7, notesPerDay: 1.5, reviewRate: 0.9, fightAt: 0.55 },
};
const words = n => Array(n).fill('word').join(' ');

function simulate(name, profile) {
  const rng = seeded(42),
    s = E.freshState();
  s.tasks = [];
  const start = '2026-01-01',
    log = { name, spent: {}, buys: [], wins: 0, losses: 0, goldEarned: 0, milestones: {} };
  const snapshot = (day, i) => ({
    day: i,
    gold: s.gold,
    levels: E.CATEGORIES.map(c => E.level(s, c)).join('/'),
    monster: s.monster.number,
    owned: s.inventory.length,
  });
  const samples = [];
  for (let i = 0; i < DAYS; i++) {
    const day = shift(start, i);
    E.rollover(s, day);
    const goldBefore = s.gold;
    // Habits
    for (const h of s.habits.filter(h => h.category !== 'harm'))
      if (rng() < profile.habitRate) E.completeHabit(s, h.id, day);
    for (const h of s.habits.filter(h => h.category === 'harm')) if (rng() < 0.15) E.logHarm(s, h.id, day);
    // Tasks: [quick, standard, hard, quest] per day, weekdays only
    const weekday = ![0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay());
    if (weekday)
      ['quick', 'standard', 'hard', 'quest'].forEach((tier, k) => {
        for (let n = 0; n < profile.tasks[k]; n++) {
          const t = E.saveTask(s, { title: `${tier} ${i}-${n}`, tier }, day);
          E.toggleTask(s, t.id, day);
        }
      });
    if (profile.questEvery && i % profile.questEvery === 0) {
      const t = E.saveTask(s, { title: `quest ${i}`, tier: 'quest' }, day);
      E.toggleTask(s, t.id, day);
    }
    s.tasks = s.tasks.filter(t => !t.done);
    // Vault
    let notes = Math.floor(profile.notesPerDay) + (rng() < profile.notesPerDay % 1 ? 1 : 0);
    for (let n = 0; n < notes; n++) E.saveNote(s, { text: words(rng() < 0.3 ? 160 : 40) }, day);
    if (rng() < profile.reviewRate) {
      const inbox = s.notes.find(n => n.status === 'inbox');
      if (inbox) E.reviewNote(s, inbox.id, 'kept', day);
    }
    s.notes = s.notes.slice(0, 40);
    log.goldEarned += s.gold - goldBefore;
    // Shopping: best affordable upgrade per slot, keep potions for recovery
    // Pets: buy the next pet up when affordable, keep 100 gold in reserve, and use the newest.
    const nextPet = E.SHOP.filter(x => x.type === 'pet' && !s.inventory.includes(x.id)).sort((a, b) => a.price - b.price)[0];
    if (nextPet && s.gold >= nextPet.price + 100) {
      E.buy(s, nextPet.id);
      if (s.activePet !== nextPet.id) E.equip(s, nextPet.id);
      log.spent.pets = (log.spent.pets || 0) + nextPet.price;
    }
    for (const type of ['weapon', 'armor', 'helmet']) {
      const current = E.SHOP.find(x => x.id === s.equipped[type])?.bonus || 0;
      const upgrade = E.SHOP.filter(x => x.type === type && x.bonus > current && !s.inventory.includes(x.id) && x.price <= s.gold).sort(
        (a, b) => b.bonus - a.bonus,
      )[0];
      if (upgrade) {
        E.buy(s, upgrade.id);
        E.equip(s, upgrade.id);
        if (s.equipped[type] !== upgrade.id) E.equip(s, upgrade.id);
        log.buys.push(`${upgrade.name} day ${i}`);
        log.spent[type] = (log.spent[type] || 0) + upgrade.price;
      }
    }
    // Recovery: potion if affordable, otherwise a journal entry
    if (s.hp < E.maxHP(s)) {
      if (s.hp < E.maxHP(s) * 0.6 && s.gold >= 35 + 60) {
        E.buy(s, 'full-potion');
        E.usePotion(s, 'full-potion');
        log.spent.potions = (log.spent.potions || 0) + 35;
      } else if (s.pendingRecovery || s.hp === 0) E.saveNote(s, { text: words(200), recovery: true }, day);
    }
    // Fight when odds are good
    if (!s.monster.defeatedOn && s.hp > 0 && E.estimateOdds(E.oddsInput(s)) >= profile.fightAt) {
      const result = E.fight(s, day, rng);
      result.won ? log.wins++ : log.losses++;
    }
    if ([29, 89, 179, 364].includes(i)) samples.push(snapshot(day, i + 1));
    if (!log.milestones.allGear && ['star', 'moon'].every(id => s.inventory.includes(id))) log.milestones.allGear = i + 1;
    if (!log.milestones.allShop && E.SHOP.filter(x => !E.isConsumable(x)).every(x => s.inventory.includes(x.id))) log.milestones.allShop = i + 1;
  }
  const odds = E.estimateOdds(E.oddsInput({ ...s, hp: E.maxHP(s) }));
  return { ...log, samples, finalGold: s.gold, finalOdds: Math.round(odds * 100) + '%', monster: s.monster.number };
}

for (const [name, profile] of Object.entries(PROFILES)) {
  const r = simulate(name, profile);
  console.log(`\n== ${name} ==`);
  console.log(`gold earned ${r.goldEarned} (≈${Math.round(r.goldEarned / DAYS)}/day) · spent ${JSON.stringify(r.spent)} · final balance ${r.finalGold}`);
  console.log(`fights: ${r.wins} won, ${r.losses} lost · monster #${r.monster} · next-fight odds at full HP ${r.finalOdds}`);
  console.log(`all rare gear owned by day ${r.milestones.allGear ?? 'never'} · every gear, helmet and pet owned by day ${r.milestones.allShop ?? 'never'}`);
  for (const x of r.samples) console.log(`  day ${x.day}: gold ${x.gold}, levels B/M/S/H ${x.levels}, monster #${x.monster}`);
}
