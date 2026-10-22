import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { combatPetArt, combatPetCue, PET_COMBAT } from '../combat-pet-art.js';
import { describeCombatEvent } from '../combat-presentation.js';
const day = '2026-10-22';
const pet = id => E.SHOP.find(i => i.id === id);
const state = id => { const s = E.freshState(); s.inventory = [id]; s.activePet = id; return s; };

test('each companion has its own effect, triggered only by the recorded contribution', () => {
  const events = {
    fox: { type: 'deflect', petDeflect: true }, owl: { type: 'attack', petBonus: 3 },
    tortoise: { type: 'hit', petBlock: 3 }, cat: { type: 'rally', petHeal: 20 }, drake: { type: 'attack', petBonus: 5 },
  };
  const art = new Set();
  for (const id of Object.keys(PET_COMBAT)) {
    const e = events[id], before = JSON.stringify(e), cue = combatPetCue(e, pet(id));
    assert.equal(cue.id, id); assert.ok(cue.label); assert.ok(cue.reward);
    const svg = combatPetArt(cue); assert.match(svg, /<svg/); assert.doesNotMatch(svg, /undefined|NaN|Infinity/); art.add(svg);
    assert.equal(JSON.stringify(e), before, 'presentation never changes the event');
    for (const wrong of [null, { type: 'stagger' }, { type: 'hit', petBlock: 0 }, { type: 'attack', petBonus: 0 }])
      assert.equal(combatPetCue(wrong, pet(id)), null);
  }
  assert.equal(art.size, 5); assert.equal(combatPetArt(null), '');
  assert.equal(combatPetCue(events.owl, null), null); assert.equal(combatPetCue(events.owl, { id: 'unknown' }), null);
});
test('fox deflections distinguish its extra chance from Soul with the strongest defensive loadout', () => {
  const s = state('fox'), r = E.fight(s, day, () => 0);
  assert.ok(r.events.some(e => e.petDeflect));
  for (const e of r.events.filter(e => e.type === 'deflect')) {
    assert.equal(e.petDeflect, true); assert.equal(combatPetCue(e, pet('fox')).mode, 'deflect');
    assert.match(describeCombatEvent(e, { pet: pet('fox') }).badges[0].label, /Fern fox/);
  }
  const soul = state('fox'); soul.xp.soul = 300;
  const natural = E.fight(soul, day, () => 0);
  for (const e of natural.events.filter(e => e.type === 'deflect')) {
    assert.equal(e.petDeflect, undefined); assert.equal(combatPetCue(e, pet('fox')), null);
  }
  const assist = state('fox'); assist.xp.soul = 300;
  assert.ok(E.fight(assist, day, () => .13).events.some(e => e.petDeflect), 'the fox owns only the extra interval');
  const cap = state('fox'); cap.xp.soul = 30000; cap.tonic = 'swift-tonic';
  const boots = E.SHOP.filter(i => i.type === 'boots').sort((a,b) => b.bonus-a.bonus)[0];
  cap.inventory.push(boots.id); cap.equipped.boots = boots.id;
  assert.ok(Math.abs(E.combatStats(cap).dodge-.73)<1e-10);
  const extra=structuredClone(cap);
  assert.ok(!E.fight(cap, day, () => .68).events.some(e => e.petDeflect), 'natural deflections do not get false pet credit');
  assert.ok(E.fight(extra, day, () => .70).events.some(e => e.petDeflect), 'the extra chance remains correctly attributed');
});
test('cat records its actual rally contribution, including Heart and capped healing', () => {
  for (const heart of [0, 300, 30000]) {
    const s = state('cat'); s.xp.heart = heart;
    const r = E.fight(s, day, () => 0), rally = r.events.find(e => e.type === 'rally');
    assert.ok(rally);
    const expected = Math.max(0, rally.amount - 15 * (E.level(s, 'heart') - 1));
    assert.equal(rally.petHeal || 0, expected);
    assert.equal(rally.hp-rally.hpBefore, rally.amount);
    const cue = combatPetCue(rally, pet('cat'));
    if (expected) {
      assert.equal(cue.amount, expected); assert.equal(cue.mode, 'heal');
      assert.match(describeCombatEvent(rally, { pet: pet('cat') }).badges.map(b => b.label).join(), /Moon cat/);
    } else assert.equal(cue, null);
  }
});
test('tortoise blocks stack with a spell and attack pets assist inherited twin strikes', () => {
  const s = state('tortoise'); s.preparedSpell = 'ward'; s.supplies.ward = 1;
  const r = E.fight(s, day, () => 0);
  for (const e of r.events.filter(e => e.type === 'hit')) {
    assert.equal(e.spellBlock, 3); assert.equal(e.petBlock, 3); assert.equal(e.rawDamage-e.amount, 6);
    assert.equal(combatPetCue(e, pet('tortoise')).amount, 3);
  }
  for (const id of ['owl', 'drake']) {
    const s = state(id); s.inventory.push('fang'); s.equipped.weapon = 'fang';
    const r = E.fight(s, day, () => 0); let first;
    assert.ok(r.events.some(e => e.strike === 'twin'));
    for (const e of r.events.filter(e => e.type === 'attack')) {
      if (e.strike !== 'twin') { first = e; assert.equal(e.petBonus, pet(id).boosts.attack); }
      else assert.equal(e.petBonus, Math.ceil(first.amount/2)-Math.ceil((first.amount-first.petBonus)/2));
      assert.equal(combatPetCue(e, pet(id)).amount, e.petBonus);
    }
    assert.equal(combatPetCue({ type: 'attack', strike: 'twin' }, pet(id)).amount, null, 'legacy replays never invent a precise bonus');
  }
});
test('companion replay metadata preserves hats and validates optional fields while older logs still load', () => {
  const s = state('fox'); s.inventory.push('tiny-crown'); s.petHat = 'tiny-crown';
  const r = E.fight(s, day, () => 0); assert.equal(r.petHat, 'tiny-crown');
  s.petHat = null; assert.equal(r.petHat, 'tiny-crown');
  assert.doesNotThrow(() => E.validateState(structuredClone(s)));
  for (const change of [b => b.petHat = 'unknown', b => b.events[0].petBonus = -1,
    b => b.events[0].petBlock = 1.5, b => b.events[0].petHeal = '20', b => b.events[0].petDeflect = 1]) {
    const bad = structuredClone(s); change(bad.battles[0]); assert.throws(() => E.validateState(bad));
  }
  delete r.petHat;
  for (const e of r.events) { delete e.petDeflect; delete e.petHeal; }
  assert.doesNotThrow(() => E.validateState(structuredClone(s)));
});
