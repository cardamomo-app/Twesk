import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { combatHealthImpacts } from '../combat-presentation.js';
const item = id => E.SHOP.find(i => i.id === id);
const context = { spell: item('starfall'), pet: item('drake') };
const attack = (extra = {}) => ({ type: 'attack', amount: 30, spellBonus: 4, petBonus: 5, hpBefore: 50, enemyBefore: 50, hp: 50, enemy: 20, ...extra });

test('weapon, spell, and pet each remove only their own damage at their own impact', () => {
  const e = attack(), before = JSON.stringify(e), p = combatHealthImpacts(e, context);
  assert.deepEqual(p.beats.map(b => [b.phase, b.enemy, b.floats[0].amount]), [['impact',29,21],['spell',25,4],['pet',20,5]]);
  assert.equal(JSON.stringify(e), before, 'splitting the replay never changes the saved fight');
});
test('finishing blows cap each contribution at remaining HP, including zero overkill', () => {
  for (const [remaining, expected] of [[2,[2,0,0]], [24,[21,3,0]], [28,[21,4,3]]]) {
    const p = combatHealthImpacts(attack({ enemyBefore: remaining, enemy: 0 }), context);
    assert.deepEqual(p.beats.map(b => b.floats.filter(f => f.kind === 'damage').reduce((n,f) => n+f.amount,0)), expected);
    assert.equal(p.beats.at(-1).enemy, 0);
    assert.ok(p.beats.every(b => b.enemy >= 0));
  }
});
test('inherited twin bonuses retain exact rounding and work with earlier replay logs', () => {
  const first = attack({ amount: 31 });
  for (const extra of [{ petBonus: 3 }, {}]) {
    const e = { type:'attack', strike:'twin', amount:16, hpBefore:50, hp:50, enemyBefore:50, enemy:34, ...extra };
    const p = combatHealthImpacts(e, { ...context, previousAttack:first });
    assert.deepEqual(p.beats.map(b => b.floats[0].amount), [11,2,3]);
  }
  const old = { type:'attack', amount:12, hp:40, enemy:0 };
  const p = combatHealthImpacts(old, { hpBefore:40, enemyBefore:5 });
  assert.equal(p.beats.length,1); assert.equal(p.beats[0].floats[0].amount,5);
});
test('drain healing follows damage beats and pet healing follows the cat arrival', () => {
  const drain = combatHealthImpacts(attack({ hpBefore:10, hp:16, healed:6 }),context);
  assert.deepEqual(drain.beats.map(b => b.hp),[14,15,16]);
  const rally = combatHealthImpacts({ type:'rally', amount:30, petHeal:20, hpBefore:50, hp:80, enemyBefore:40, enemy:40 },{ pet:item('cat') });
  assert.deepEqual(rally.beats.map(b => [b.phase,b.hp,b.floats[0].amount]),[['impact',60,10],['pet',80,20]]);
});
test('defensive assists prevent damage at the incoming hit and thorns show their own damage', () => {
  const e = { type:'hit', amount:18, rawDamage:30, blocked:12, spellBlock:3, petBlock:3, thorns:2, hpBefore:100, hp:82, enemyBefore:50, enemy:48 };
  const p = combatHealthImpacts(e,{ spell:item('ward'),pet:item('tortoise') });
  assert.deepEqual(p.beats.map(b => [b.hp,b.enemy]),[[82,48],[82,48],[82,48]]);
  assert.deepEqual(p.beats.flatMap(b => b.floats.filter(f => f.kind==='block').map(f => [b.phase,f.amount])),[['impact',6],['spell',3],['pet',3]]);
  assert.equal(p.beats[0].floats.find(f => f.label==='Thorns').amount,2);
});
test('every impact reconciles with recorded health for spells, pets, weapon powers, and legacy replays', () => {
  for (const pet of [null,'fox','owl','tortoise','cat','drake']) for (const spell of [null,'ember','ward','starfall']) for (const weapon of [null,'fang','eclipse']) {
    const s=E.freshState(); s.xp.body=300; s.xp.heart=300; s.monster.number=8;
    const shield=E.SHOP.find(i => i.type==='shield'&&i.power?.thorns)?.id;
    s.inventory=[pet,weapon,shield].filter(Boolean); s.activePet=pet; s.equipped.weapon=weapon; s.equipped.shield=shield||null;
    s.preparedSpell=spell; if(spell)s.supplies[spell]=1; s.hp=E.maxHP(s);
    const r=E.fight(s,'2026-10-29',()=>0);
    for (const legacy of [false,true]) {
      let hp=r.initialHP,enemy=E.monsterStats(r.monster).hp;
      for(let i=0;i<r.events.length;i++) {
        const e=structuredClone(r.events[i]); if(legacy){delete e.hpBefore;delete e.enemyBefore;delete e.actualDamage;}
        const p=combatHealthImpacts(e,{ spell:item(spell),pet:item(pet),previousAttack:r.events[i-1],hpBefore:hp,enemyBefore:enemy });
        for (const b of p.beats) {
          for(const side of ['player','monster']) {
            const delta=b.floats.filter(f => f.side===side).reduce((sum,f) => sum+(f.kind==='heal'?f.amount:f.kind==='damage'?-f.amount:0),0);
            assert.equal(delta,side==='player'?b.hp-hp:b.enemy-enemy,JSON.stringify({pet,spell,weapon,e,b}));
          }
          hp=b.hp;enemy=b.enemy;
        }
        assert.equal(hp,e.hp);assert.equal(enemy,e.enemy);
      }
    }
  }
});
