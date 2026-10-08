import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import {itemArt} from '../equipment-art.js';
import {describeCombatEvent} from '../combat-presentation.js';
const day='2026-10-08';
const funded=()=>Object.assign(E.freshState(),{gold:2000});

test('legacy saves retain their gold, gear and potion stock when catalog fields migrate',()=>{
  const s=funded();E.buy(s,'twig');E.buy(s,'potion');
  delete s.supplies;delete s.preparedSpell;delete s.activePet;
  const migrated=E.validateState(s);
  assert.equal(migrated.gold,1955);assert.equal(migrated.potions,1);assert.equal(migrated.equipped.weapon,'twig');
  assert.deepEqual(migrated.supplies,{});assert.equal(migrated.preparedSpell,null);assert.equal(migrated.activePet,null);
});
test('all potion sizes stack and heal without wasting a charge at full health',()=>{
  const s=funded();s.xp.heart=300;
  for(const id of ['potion','greater-potion','full-potion']){
    E.buy(s,id);E.buy(s,id);assert.equal(E.itemCount(s,id),2);
    assert.throws(()=>E.usePotion(s,id));assert.equal(E.itemCount(s,id),2);
  }
  s.hp=0;assert.equal(E.usePotion(s,'greater-potion'),71);assert.equal(s.hp,71);
  assert.equal(E.usePotion(s),29);assert.equal(s.hp,100);
  s.xp.body=3000;s.hp=1;s.pendingRecovery=true;
  assert.equal(E.usePotion(s,'full-potion'),249);assert.equal(s.hp,250);assert.equal(s.pendingRecovery,false);
  assert.deepEqual(E.validateState(s),s);
});
test('spells are reserved without spending a charge; only one is prepared',()=>{
  const s=funded();assert.throws(()=>E.prepareSpell(s,'ember'));
  E.buy(s,'ember');E.buy(s,'ember');E.buy(s,'ward');
  E.prepareSpell(s,'ember');assert.equal(E.combatStats(s).attack,3);assert.equal(E.itemCount(s,'ember'),2);
  E.prepareSpell(s,'ward');assert.equal(E.combatStats(s).attack,0);assert.equal(E.combatStats(s).armor,3);
  assert.equal(E.itemCount(s,'ember'),2);
  E.prepareSpell(s,'ward');assert.equal(s.preparedSpell,null);assert.equal(E.itemCount(s,'ward'),1);
  assert.throws(()=>E.prepareSpell(s,'potion'));
});
test('a spell is consumed once on victory or defeat and preserved in replay metadata',()=>{
  for(const id of ['ember','ward'])for(const hp of [1,100]){
    const s=funded();E.buy(s,id);E.buy(s,id);E.prepareSpell(s,id);s.hp=hp;
    const rolls=[.999,0,.999,0,.999,0,.999,.999,.999];
    const result=E.fight(s,day,()=>hp===1?0:(rolls.shift()??.999));
    assert.equal(result.won,hp===100);assert.equal(s.preparedSpell,null);assert.equal(E.itemCount(s,id),1);assert.equal(result.spell,id);
    if(id==='ember')for(const e of result.events.filter(e=>e.type==='attack')){
      assert.equal(e.amount,e.baseDamage+e.weaponBonus+e.mindBonus+3);assert.equal(e.spellBonus,3);
      assert.match(describeCombatEvent(e).badges.map(b=>b.label).join(),/Ember spell/);
    }
    if(id==='ward')for(const e of result.events.filter(e=>e.type==='hit')){
      assert.equal(e.spellBlock,3);assert.equal(e.armorBonus,0);assert.equal(e.rawDamage-e.amount,3);
      assert.match(describeCombatEvent(e).badges.map(b=>b.label).join(),/Stone ward/);
      assert.doesNotMatch(describeCombatEvent(e).badges.map(b=>b.label).join(),/armor/);
    }
    assert.deepEqual(E.validateState(s),s);
  }
  const s=funded();E.buy(s,'ember');E.prepareSpell(s,'ember');s.hp=0;
  assert.throws(()=>E.fight(s,day));assert.equal(E.itemCount(s,'ember'),1);assert.equal(s.preparedSpell,'ember');
  s.hp=100;s.monster.defeatedOn=day;assert.throws(()=>E.fight(s,day));assert.equal(E.itemCount(s,'ember'),1);
});
test('prepared spells improve the real win probability and agree with sampled battles',()=>{
  const baseline=E.victoryOdds(E.freshState());
  for(const id of ['ember','ward']){
    const s=funded();E.buy(s,id);E.prepareSpell(s,id);const expected=E.victoryOdds(s);assert.ok(expected>baseline);
    let seed=8261,wins=0;
    const rng=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<6000;i++){
      s.hp=100;s.monster.defeatedOn=null;s.supplies[id]=1;s.preparedSpell=id;
      if(E.fight(s,day,rng).won)wins++;
    }
    assert.ok(Math.abs(wins/6000-expected)<.025,`${id}: ${wins/6000} vs ${expected}`);
  }
});
test('pet ownership is permanent, selecting one is exclusive and cosmetic',()=>{
  const s=funded(),before=E.combatStats(s);
  E.buy(s,'fox');assert.equal(s.activePet,'fox');assert.throws(()=>E.buy(s,'fox'));
  E.buy(s,'owl');assert.equal(s.activePet,'fox');E.equip(s,'owl');assert.equal(s.activePet,'owl');
  E.equip(s,'owl');assert.equal(s.activePet,null);assert.deepEqual(s.inventory,['fox','owl']);
  assert.deepEqual(E.combatStats(s),before);assert.deepEqual(E.validateState(s),s);
});
test('consumables and pet backup fields reject invalid ownership, quantities and types',()=>{
  for(const change of [s=>s.supplies={ember:-1},s=>s.supplies={twig:1},s=>s.supplies={potion:1},s=>s.supplies=[],s=>s.preparedSpell='ember',s=>s.activePet='fox',s=>s.inventory=['ward'],s=>{s.inventory=['twig'];s.activePet='twig';}]){
    const s=funded();change(s);assert.throws(()=>E.validateState(s));
  }
});
test('monster equipment drops stay weapons or armor after catalog expansion',()=>{
  const s=funded(),rolls=[.999,0,.999,0,.999,0,.999,.999,.999];
  const result=E.fight(s,day,()=>rolls.shift()??.999);
  assert.equal(result.loot.type,'equipment');assert.ok(['weapon','armor'].includes(E.SHOP.find(i=>i.id===result.loot.id).type));
});
test('every catalog item has finite, distinct voxel artwork',()=>{
  const art=E.SHOP.map(item=>itemArt(item));
  for(const svg of art){assert.match(svg,/<polygon/);assert.doesNotMatch(svg,/NaN|Infinity|undefined/);}
  assert.equal(new Set(art).size,E.SHOP.length);
});
