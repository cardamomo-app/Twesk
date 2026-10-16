import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,fight,validateState,SHOP} from '../engine.js';
import {combatSpellCue,describeCombatEvent} from '../combat-presentation.js';
import {monsterArt} from '../art.js';
const day='2026-10-08';
function encounter(){
  const state=freshState();state.name='Combat preview';state.xp.mind=300;state.xp.soul=300;state.xp.heart=300;
  state.inventory=['twig','guard'];state.equipped={weapon:'twig',armor:'guard',helmet:null,shield:null,boots:null};
  const rolls=[0,.99,.999,0,.99,.999,.999,0,.999,.99,0,0,.1];
  const result=fight(state,day,()=>rolls.shift()??.5);
  return {state,result};
}
test('combat records actual HP loss, blocked damage, stat bonuses, and pre-hit health',()=>{
  const {state,result}=encounter();
  assert.equal(result.won,true);assert.equal(result.initialHP,100);assert.equal(result.hp,42);
  assert.deepEqual(result.loadout,{weapon:'twig',armor:'guard',helmet:null,shield:null,boots:null});
  assert.deepEqual(new Set(result.events.map(e=>e.type)),new Set(['attack','hit','rally','deflect']));
  let hp=result.initialHP,enemy=112;
  for(const event of result.events){
    assert.equal(event.hpBefore,hp);assert.equal(event.enemyBefore,enemy);
    if(event.type==='attack'){
      assert.equal(event.amount,event.baseDamage+event.weaponBonus+event.mindBonus);
      assert.equal(event.actualDamage,enemy-event.enemy);assert.equal(event.mindBonus,4);assert.equal(event.weaponBonus,1);
    }
    if(event.type==='hit'){
      assert.equal(event.rawDamage-event.blocked,event.amount);assert.equal(event.blocked,3);assert.equal(event.actualDamage,hp-event.hp);
    }
    if(event.type==='rally')assert.equal(event.hp-hp,event.amount);
    if(event.type==='deflect')assert.equal(event.hp,hp);
    hp=event.hp;enemy=event.enemy;
  }
  assert.deepEqual(validateState(state),state);
});
test('presentation describes equipment and stats without changing the encounter or rewards',()=>{
  const {state,result}=encounter(),before=JSON.stringify(state);
  const context={monster:'Mossling',weapon:SHOP.find(i=>i.id==='twig'),armor:SHOP.find(i=>i.id==='guard')};
  const frames=result.events.map(e=>describeCombatEvent(e,context));
  assert.match(frames[0].badges.map(b=>b.label).join(' '),/Trail blade.*Mind/);
  const block=frames.find(f=>f.title==='Attack partially blocked');assert.equal(block.detail,'34 incoming − 3 blocked = 31 damage');
  assert.match(frames.find(f=>f.tone==='deflect').detail,/no damage/);
  assert.equal(frames.find(f=>f.tone==='rally').float,'+15 HP');
  assert.equal(frames.at(-1).float,'−4 HP'); // Actual remaining health, not overkill damage.
  assert.equal(JSON.stringify(state),before);
});
test('older saved encounters remain readable without new metadata',()=>{
  const description=describeCombatEvent({type:'hit',amount:9,hp:50,enemy:60});
  assert.equal(description.float,'−9 HP');assert.equal(description.detail,'9 damage');
  const {state}=encounter();for(const r of state.battles){delete r.loadout;delete r.levels;delete r.initialHP;delete r.maxHP;delete r.playerName;}
  assert.doesNotThrow(()=>validateState(state));
});
test('spell animation cues follow the recorded bonus, including twin strikes and both Starfall effects',()=>{
  for(const id of ['ember','ward','storm','starfall']) {
    const state=freshState();state.preparedSpell=id;state.supplies[id]=1;
    const result=fight(state,day,()=>0),spell=SHOP.find(i=>i.id===id),before=JSON.stringify(result);
    for(const event of result.events) {
      const cue=combatSpellCue(event,spell);
      if(event.type==='attack'&&spell.boosts.attack) assert.deepEqual(cue,{id,mode:'attack'});
      else if(event.type==='hit'&&event.spellBlock) assert.deepEqual(cue,{id,mode:'guard'});
      else assert.equal(cue,null);
    }
    assert.equal(JSON.stringify(result),before);
    assert.equal(state.preparedSpell,null);assert.equal(state.supplies[id],0);
    assert.deepEqual(combatSpellCue({type:'attack',strike:'twin'},spell),spell.boosts.attack?{id,mode:'attack'}:null);
    for(const event of [{type:'attack',spellBonus:0},{type:'hit',spellBlock:0},{type:'deflect'},{type:'rally'},null])
      assert.equal(combatSpellCue(event,spell),null);
  }
  assert.equal(combatSpellCue({type:'attack',spellBonus:3},null),null);
  assert.equal(combatSpellCue({type:'attack',spellBonus:3},{id:'unknown'}),null);
});
test('defeated monster art uses X eyes and an accessible defeated description',()=>{
  assert.match(monsterArt(1,true),/defeated-eyes/);assert.match(monsterArt(1,true),/defeated, with X eyes/);
  assert.doesNotMatch(monsterArt(1,false),/defeated-eyes/);
});
test('backup replay data rejects invalid events and unknown equipment',()=>{
  const {state}=encounter();state.battles[0].events[0].type='unknown';assert.throws(()=>validateState(state));
  const next=encounter().state;next.battles[0].loadout.weapon='unknown';assert.throws(()=>validateState(next));
});
