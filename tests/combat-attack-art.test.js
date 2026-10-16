import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { MONSTERS } from '../monster-art.js';
import { WEAPON_ATTACKS, MONSTER_ATTACKS, weaponAttackProfile, monsterAttackProfile, combatAttackCue, combatAttackArt } from '../combat-attack-art.js';

test('every weapon and creature species has distinct attack geometry, with safe legacy fallbacks', () => {
  const weapons = E.SHOP.filter(i => i.type === 'weapon');
  assert.equal(Object.keys(WEAPON_ATTACKS).length, weapons.length + 1);
  const profiles = [weaponAttackProfile(null), ...weapons.map(weaponAttackProfile)];
  assert.equal(new Set(profiles.map(p => p.trail)).size, profiles.length);
  assert.equal(MONSTER_ATTACKS.length, MONSTERS.length);
  assert.equal(new Set(MONSTER_ATTACKS.map(p => p.trail)).size, MONSTERS.length);
  assert.equal(new Set(MONSTER_ATTACKS.map(p => p.motion)).size, MONSTERS.length);
  for (const p of [...profiles, ...MONSTER_ATTACKS]) {
    assert.match(p.color, /^#[a-f0-9]{6}$/i);
    assert.ok(p.trail && p.impact && p.voice && p.pitch > 0);
    assert.doesNotMatch(p.trail + p.impact + p.projectile, /NaN|Infinity|undefined/);
  }
  assert.equal(weaponAttackProfile({ id: 'unknown' }), WEAPON_ATTACKS.unarmed);
  for (let n = 1; n <= MONSTERS.length; n++) assert.equal(monsterAttackProfile(n + 16), monsterAttackProfile(n));
});

test('missed creature attacks show their signature but no impact, damage, or invented status effect', () => {
  for (let monster = 1; monster <= MONSTERS.length; monster++) {
    const cue = combatAttackCue({ type: 'deflect' }, { monster });
    const art = combatAttackArt(cue);
    assert.equal(cue.profile, MONSTER_ATTACKS[monster - 1]);
    assert.match(art, /attack-missed/); assert.doesNotMatch(art, /class="attack-impact"|class="attack-power|attack-drain/);
    assert.match(combatAttackArt(combatAttackCue({ type: 'hit' }, { monster })), /class="attack-impact"/);
  }
  for (const type of ['rally', 'unknown']) assert.equal(combatAttackCue({ type }), null);
  assert.equal(combatAttackArt(null), '');
});

test('weapon powers animate only when the recorded encounter activates them, without altering results', () => {
  const seen = new Set();
  for (const id of ['fang', 'hatchet', 'viper', 'bearded', 'nightshade', 'frostbite', 'eclipse']) {
    for (let seed = 1; seed <= 8; seed++) {
      const s = E.freshState(); s.gold = 1000; s.xp.body = 1500; s.hp = E.maxHP(s); s.monster.number = 5;
      E.buy(s, id); let roll = seed;
      const result = E.fight(s, '2026-10-16', () => ((roll = (Math.imul(1664525, roll) + 1013904223) >>> 0), roll / 4294967296));
      const before = JSON.stringify(result), weapon = E.SHOP.find(i => i.id === id);
      for (const event of result.events) {
        const cue = combatAttackCue(event, { weapon, monster: 5 });
        if (!cue || cue.side !== 'player') continue;
        const art = combatAttackArt(cue);
        for (const [flag, expected, cls] of [
          ['venom', event.venomBonus > 0, 'power-venom'], ['critical', event.critBonus > 0, 'power-critical'],
          ['sunder', event.sunder > 0, 'power-sunder'], ['drain', event.healed > 0, 'attack-drain'],
          ['twin', event.strike === 'twin', 'attack-twin'],
        ]) {
          assert.equal(cue[flag], expected); assert.equal(art.includes(cls), expected);
          if (expected) seen.add(flag);
        }
        if (event.type === 'stagger') { assert.match(art, id === 'frostbite' ? /power-freeze/ : /power-stagger/); seen.add(id); }
      }
      assert.equal(JSON.stringify(result), before);
    }
  }
  assert.deepEqual([...seen].sort(), ['critical', 'drain', 'frostbite', 'hatchet', 'sunder', 'twin', 'venom'].sort());
});
