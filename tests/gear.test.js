import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import {describeCombatEvent} from '../combat-presentation.js';
const day='2026-10-12';
const funded=()=>Object.assign(E.freshState(),{gold:5000});
const seeded=(seed=4242)=>()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
// Replays a fight's events and checks that every step follows from the one before.
function checkChain(result){
  let hp=result.initialHP,enemy=E.monsterStats(result.monster).hp;
  for(const e of result.events){
    assert.equal(e.hpBefore,hp);assert.equal(e.enemyBefore,enemy);
    if(e.type==='attack'){assert.equal(e.actualDamage,enemy-e.enemy);assert.equal(e.hp-hp,e.healed||0);}
    if(e.type==='hit'){assert.equal(e.rawDamage-e.blocked,e.amount);assert.equal(e.actualDamage,hp-e.hp);assert.equal(enemy-e.enemy,e.thorns||0);}
    if(['stagger','deflect'].includes(e.type)){assert.equal(e.hp,hp);assert.equal(e.enemy,enemy);}
    hp=e.hp;enemy=e.enemy;
  }
  assert.equal(hp,result.hp);
}
function fights(id,count=300){
  const s=funded();E.buy(s,id);assert.ok(Object.values(s.equipped).includes(id),'new gear fills an empty slot');
  const rng=seeded(),results=[];
  for(let i=0;i<count;i++){s.hp=E.maxHP(s);s.monster.defeatedOn=null;s.inventory=[id];results.push(E.fight(s,day,rng));}
  assert.doesNotThrow(()=>E.validateState(JSON.parse(JSON.stringify(s))));
  return {s,results,events:results.flatMap(r=>r.events)};
}

test('shields and boots are new gear slots, and older saves gain them empty',()=>{
  const s=funded();E.buy(s,'buckler');E.buy(s,'trailboots');
  assert.equal(s.equipped.shield,'buckler');assert.equal(s.equipped.boots,'trailboots');
  assert.ok(Math.abs(E.combatStats(s).dodge-.03)<1e-9,'boots add deflect chance');
  E.equip(s,'trailboots');assert.equal(E.combatStats(s).dodge,0);
  const old=E.freshState();delete old.equipped.shield;delete old.equipped.boots;
  assert.deepEqual(E.validateState(old).equipped,{weapon:null,armor:null,helmet:null,shield:null,boots:null});
  const bad=funded();bad.equipped.shield='twig';bad.inventory=['twig'];assert.throws(()=>E.validateState(bad));
});
test('daggers strike twice for half damage, crit, and drain', ()=>{
  const twin=fights('fang').events.filter(e=>e.strike==='twin');
  assert.ok(twin.length>20);
  const {events}=fights('fang');
  for(let i=1;i<events.length;i++)if(events[i].strike==='twin')assert.equal(events[i].amount,Math.ceil(events[i-1].amount/2));
  const crits=fights('nightshade').events.filter(e=>e.critBonus);
  assert.ok(crits.length>20);for(const e of crits)assert.equal(e.amount,2*e.baseDamage+e.weaponBonus+e.mindBonus);
  const eclipse=fights('eclipse');assert.ok(eclipse.events.some(e=>e.healed>0));eclipse.results.forEach(checkChain);
  assert.match(describeCombatEvent(crits[0],{weapon:E.SHOP.find(i=>i.id==='nightshade')}).title,/Critical/);
});
test('venom builds by one per strike up to its cap',()=>{
  const {results}=fights('viper',50);
  for(const r of results){const strikes=r.events.filter(e=>e.type==='attack');strikes.forEach((e,i)=>assert.equal(e.venomBonus||0,Math.min(i,3)));checkChain(r);}
});
test('axes stagger the monster or sunder its attacks',()=>{
  const stagger=fights('frostbite');assert.ok(stagger.events.some(e=>e.type==='stagger'));stagger.results.forEach(checkChain);
  assert.equal(describeCombatEvent(stagger.events.find(e=>e.type==='stagger'),{weapon:E.SHOP.find(i=>i.id==='frostbite')}).float,'FROZEN');
  const sunder=fights('bearded',80);
  for(const r of sunder.results){let dent=0;for(const e of r.events){if(e.type==='attack')dent=Math.min(4,dent+1);if(e.type==='attack'||e.type==='hit')assert.equal(e.sunder,dent);}}
});
test('raised shields halve a hit after armor, and thorned shields strike back',()=>{
  const {events,results}=fights('thornwall');
  const raised=events.filter(e=>e.shieldBlock!==undefined);assert.ok(raised.length>20);
  for(const e of raised){assert.equal(e.shieldBlock,Math.floor((e.amount+e.shieldBlock)/2));assert.ok(e.thorns>0);}
  results.forEach(checkChain);
  assert.match(describeCombatEvent(raised[0],{shield:E.SHOP.find(i=>i.id==='thornwall')}).badges.map(b=>b.label).join(),/Thornwall shield raised.*thorns/);
});
test('odds with powered gear agree with real fights, and plain gear keeps exact odds',()=>{
  for(const id of ['fang','hatchet','kite']){
    const s=funded();E.buy(s,id);const expected=E.estimateOdds(E.oddsInput(s));
    assert.ok(expected>E.victoryOdds(E.freshState()),`${id} helps`);
    const rng=seeded(99);let wins=0;
    for(let i=0;i<5000;i++){s.hp=100;s.monster.defeatedOn=null;s.inventory=[id];if(E.fight(s,day,rng).won)wins++;}
    assert.ok(Math.abs(wins/5000-expected)<.025,`${id}: ${wins/5000} vs ${expected}`);
  }
  const plain=funded();E.buy(plain,'twig');assert.equal(E.estimateOdds(E.oddsInput(plain)),E.victoryOdds(plain));
});
