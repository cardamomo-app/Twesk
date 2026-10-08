import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
const day=n=>`2026-10-${String(n).padStart(2,'0')}`;
const repeat=n=>Array(n).fill('word').join(' ');
const habit=(s,category='body')=>s.habits.find(h=>h.category===category);

test('starting state round-trips as a backup with no equipment and 100 HP',()=>{
  const s=E.freshState();assert.deepEqual(E.validateState(s),s);assert.equal(E.maxHP(s),100);assert.equal(s.gold,0);
  for(const c of E.CATEGORIES)assert.equal(E.level(s,c),1);
});
test('positive habits pay once per calendar day, with reversible category-only XP',()=>{
  const s=E.freshState(),h=habit(s);
  assert.equal(E.completeHabit(s,h.id,day(1)).amount,10);
  assert.throws(()=>E.completeHabit(s,h.id,day(1)));
  assert.deepEqual(s.xp,{body:10,mind:0,soul:0,heart:0});
  E.undoHabit(s,h.id,day(1));assert.equal(s.xp.body,0);
  assert.equal(E.completeHabit(s,h.id,day(1)).amount,10);
});
test('momentum grows 10/12/15 and decays 12/11/10 without HP penalties',()=>{
  const s=E.freshState(),h=habit(s);
  assert.deepEqual([1,2,3].map(d=>E.completeHabit(s,h.id,day(d)).amount),[10,12,15]);
  assert.equal(E.momentum(h,day(4)),1.5);
  assert.equal(E.momentum(h,day(5)),1.2);
  assert.equal(E.momentum(h,day(6)),1.1);
  assert.equal(E.momentum(h,day(7)),1);
  E.rollover(s,day(31));assert.equal(s.hp,100);assert.equal(s.xp.body,37);
  assert.equal(E.completeHabit(s,h.id,day(6)).amount,11);
  assert.equal(E.completeHabit(s,h.id,day(7)).amount,12);
  assert.equal(E.completeHabit(s,h.id,day(8)).amount,15);
});
test('a representative active stat levels on days 8, 14, and 21',()=>{
  const s=E.freshState(),hs=s.habits.filter(h=>h.category==='body'),ups=[];
  for(let d=1;d<=21;d++) {const before=E.level(s,'body');for(const h of hs)E.completeHabit(s,h.id,day(d));if(E.level(s,'body')>before)ups.push(d);}
  assert.deepEqual(ups,[8,14,21]);assert.equal(s.hp,E.maxHP(s));assert.equal(s.xp.mind,0);
});
test('Body level changes preserve missing health and undo reverses it',()=>{
  const s=E.freshState(),h=habit(s);s.xp.body=290;s.hp=60;
  E.completeHabit(s,h.id,day(1));assert.equal(E.maxHP(s),115);assert.equal(s.hp,75);
  E.undoHabit(s,h.id,day(1));assert.equal(E.maxHP(s),100);assert.equal(s.hp,60);
});
test('task undo reverses its original reward, including after spending',()=>{
  const s=E.freshState(),t=s.tasks[0];assert.equal(E.toggleTask(s,t.id),4);s.gold=0;
  assert.equal(E.toggleTask(s,t.id),-4);assert.equal(s.gold,-4);assert.throws(()=>E.buy(s,'potion'));
  E.toggleTask(s,t.id);assert.equal(s.gold,0);
});
test('note length pays incremental gold once with a daily six-gold cap',()=>{
  const s=E.freshState();let r=E.saveNote(s,{text:'hello'},day(1));const id=r.note.id;
  assert.equal(r.reward,1);assert.equal(E.saveNote(s,{id,text:repeat(50)},day(1)).reward,1);
  assert.equal(E.saveNote(s,{id,text:repeat(150)},day(1)).reward,1);
  assert.equal(E.saveNote(s,{id,text:'short'},day(1)).reward,0);
  assert.equal(E.saveNote(s,{id,text:repeat(150)},day(2)).reward,0);
  assert.equal(E.saveNote(s,{text:repeat(160)},day(1)).reward,3);
  assert.equal(E.saveNote(s,{text:'another'},day(1)).reward,0);
  assert.equal(s.gold,6);assert.throws(()=>E.saveNote(s,{text:' '},day(1)));
});
test('note conversion creates one task with hashtags removed; review pays once per day',()=>{
  const s=E.freshState(),{note}=E.saveNote(s,{text:'Buy a sketchbook #art'},day(1));
  const t=E.convertNote(s,note.id);assert.equal(t.title,'Buy a sketchbook');assert.equal(t.inbox,true);assert.equal(note.status,'kept');
  assert.equal(E.convertNote(s,note.id).id,t.id);
  assert.equal(E.rewardReview(s,day(1)),4);assert.equal(E.rewardReview(s,day(1)),0);
});
test('Harm can be logged repeatedly, costs actual HP, and undo restores actual loss',()=>{
  const s=E.freshState(),h=habit(s,'harm');s.hp=4;
  assert.equal(E.logHarm(s,h.id,day(1)),3);assert.equal(E.logHarm(s,h.id,day(1)),1);
  assert.equal(s.hp,0);assert.equal(s.pendingRecovery,true);
  E.undoHarm(s,h.id,h.harmLogs.at(-1).id,day(1));assert.equal(s.hp,1);
  assert.equal(s.xp.body,0);assert.equal(s.gold,0);
});
test('journal recovery is capped and paid once per entry, with Heart bonuses',()=>{
  const s=E.freshState();s.hp=0;s.pendingRecovery=true;
  const r=E.saveNote(s,{text:repeat(120),recovery:true},day(1));assert.equal(r.healed,60);assert.equal(s.hp,60);assert.equal(r.note.kind,'journal');
  assert.equal(E.saveNote(s,{id:r.note.id,text:repeat(200),recovery:true},day(1)).healed,0);
  s.xp.heart=300;
  const r2=E.saveNote(s,{text:repeat(200),recovery:true},day(1));assert.equal(r2.healed,40);assert.equal(s.hp,100);
});
test('equipment prices, slots, ownership, potion spending and healing',()=>{
  const s=E.freshState();s.gold=1000;
  E.buy(s,'twig');assert.equal(s.gold,965);assert.equal(s.equipped.weapon,'twig');assert.throws(()=>E.buy(s,'twig'));
  E.buy(s,'iron');E.equip(s,'iron');assert.equal(E.combatStats(s).attack,3);assert.throws(()=>E.equip(s,'star'));
  E.buy(s,'potion');s.hp=50;s.xp.heart=300;assert.equal(E.usePotion(s),33);assert.equal(s.hp,83);assert.equal(s.potions,0);
});
test('exact combat odds match the independently verified balance draft',()=>{
  const s=E.freshState();assert.ok(Math.abs(E.victoryOdds(s)-.3353768709708887)<1e-10);
  const baseline=E.victoryOdds(s);s.inventory=['twig'];s.equipped.weapon='twig';const gear=E.victoryOdds(s);assert.ok(gear>baseline&&gear<.42);
  s.equipped.weapon=null;
  for(const cat of E.CATEGORIES){s.xp[cat]=300;s.hp=E.maxHP(s);assert.ok(E.victoryOdds(s)>gear);s.xp[cat]=0;s.hp=100;}
});
test('seeded battle sampling agrees with the displayed probability',()=>{
  let seed=3291;const rng=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
  const s=E.freshState();let wins=0;
  for(let i=0;i<10000;i++){s.hp=100;s.monster.defeatedOn=null;s.inventory=[];s.gold=0;const r=E.fight(s,day(1),rng);if(r.won)wins++;assert.ok(s.hp>=0&&s.hp<=100);}
  assert.ok(Math.abs(wins/10000-E.victoryOdds(E.freshState()))<.02);
});
test('defeat gives no loot, remains retryable after reflection, victory pays only once',()=>{
  const s=E.freshState();s.hp=1;const loss=E.fight(s,day(1),()=>0);assert.equal(loss.won,false);assert.equal(loss.loot,null);assert.equal(s.hp,0);assert.equal(s.pendingRecovery,true);
  assert.throws(()=>E.fight(s,day(1)));
  E.saveNote(s,{text:repeat(200),recovery:true},day(1));
  const rolls=[.999,0,.999,0,.999,0,.999,.9,.5];const win=E.fight(s,day(1),()=>rolls.shift()??.5);assert.equal(win.won,true);assert.equal(win.loot.type,'equipment');assert.equal(s.inventory.length,1);
  assert.throws(()=>E.fight(s,day(1)));E.rollover(s,day(1));assert.equal(s.monster.number,1);
  E.rollover(s,day(2));assert.equal(s.monster.number,2);assert.equal(s.monster.defeatedOn,null);
  E.rollover(s,day(30));assert.equal(s.monster.number,2);
});
test('timezone rollover and date gaps handle midnight and month boundaries',()=>{
  assert.equal(E.dateKey(new Date('2026-10-08T00:30:00Z'),'America/New_York'),'2026-10-07');
  assert.equal(E.dateKey(new Date('2026-10-08T00:30:00Z'),'Atlantic/Madeira'),'2026-10-08');
  assert.equal(E.daysBetween('2026-09-30','2026-10-02'),2);
});
test('invalid backups are rejected without touching current progress',()=>{
  for(const change of [s=>s.hp=1000,s=>s.xp.body=-1,s=>s.settings.timezone='nonsense',s=>s.inventory=['unknown'],s=>s.tasks[0].tier='unknown',s=>s.habits[0].logs=[{day:'bad',xp:10}],s=>s.notes=[{id:'bad',text:'hello'}]]){
    const s=E.freshState();change(s);assert.throws(()=>E.validateState(s));
  }
});

test('archiving a kept note works without paying another review reward',()=>{
  const s=E.freshState(),{note}=E.saveNote(s,{text:'Keep this idea'},day(1));
  E.reviewNote(s,note.id,'kept',day(1));const gold=s.gold;
  E.reviewNote(s,note.id,'archived',day(2));assert.equal(note.status,'archived');assert.equal(s.gold,gold);
});
test('backup identifiers and note dates cannot break markup or rendering',()=>{
  const s=E.freshState();s.tasks[0].id='a" onclick="bad';assert.throws(()=>E.validateState(s));
  const t=E.freshState();E.saveNote(t,{text:'Hi'},day(1));t.notes[0].created='not a date';assert.throws(()=>E.validateState(t));
});
