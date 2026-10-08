import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import {ACHIEVEMENTS,awardAchievements,achievementValue,monsterStatus,defeatedCount} from '../achievements.js';
import {monsterArt,monsterGeometry,monsterName} from '../monster-art.js';
import {badgeArt} from '../badge-art.js';
const day='2026-10-08';

test('seals unlock once, remain earned after undo, and do not change currency or XP',()=>{
  const s=E.freshState();E.toggleTask(s,s.tasks[0].id);const before={gold:s.gold,xp:{...s.xp},hp:s.hp};
  assert.deepEqual(awardAchievements(s,day).map(b=>b.id),['tasks-1']);
  assert.deepEqual({gold:s.gold,xp:s.xp,hp:s.hp},before);assert.deepEqual(awardAchievements(s,day),[]);
  E.toggleTask(s,s.tasks[0].id);assert.equal(s.progress.tasks,0);assert.equal(s.progress.earned['tasks-1'],day);
  E.toggleTask(s,s.tasks[0].id);assert.equal(s.progress.tasks,1);assert.deepEqual(awardAchievements(s,'2026-10-09'),[]);
});
test('task and category totals survive deleting records while completions remain reversible',()=>{
  const s=E.freshState(),task=s.tasks[0],habit=s.habits.find(h=>h.category==='mind');
  E.toggleTask(s,task.id);s.tasks=s.tasks.filter(t=>t.id!==task.id);assert.equal(s.progress.tasks,1);
  E.completeHabit(s,habit.id,day);E.undoHabit(s,habit.id,day);assert.equal(s.progress.habits.mind,0);
  E.completeHabit(s,habit.id,day);s.habits=s.habits.filter(h=>h.id!==habit.id);assert.equal(s.progress.habits.mind,1);assert.equal(s.progress.habits.body,0);
  assert.deepEqual(E.validateState(s),s);
});
test('habit seals count completions only in their own category, excluding Harm',()=>{
  const s=E.freshState(),h=s.habits.find(h=>h.category==='heart'),harm=s.habits.find(h=>h.category==='harm');
  for(let i=1;i<=10;i++)E.completeHabit(s,h.id,`2026-10-${String(i).padStart(2,'0')}`);
  E.logHarm(s,harm.id,day);
  const earned=awardAchievements(s,day).map(b=>b.id);assert.ok(earned.includes('heart-10'));assert.ok(!earned.includes('body-10'));
  assert.equal(s.progress.habits.heart,10);assert.equal(s.progress.habits.body,0);
});
test('first level and four-stat growth award the intended journey seals',()=>{
  const s=E.freshState();s.xp.body=300;
  assert.deepEqual(awardAchievements(s,day).map(b=>b.id),['first-level']);
  s.xp.mind=s.xp.soul=s.xp.heart=300;
  assert.deepEqual(awardAchievements(s,day).map(b=>b.id),['fourfold']);
});
test('Vault and journal totals count entries, never edits, conversions or review',()=>{
  const s=E.freshState(),a=E.saveNote(s,{text:'A thought'},day).note;
  E.saveNote(s,{id:a.id,text:'A revised thought'},day);E.convertNote(s,a.id);E.reviewNote(s,a.id,'archived',day);
  assert.equal(s.progress.notes,1);assert.equal(s.progress.journals,0);
  const j=E.saveNote(s,{text:'A journal entry',kind:'journal'},day).note;E.saveNote(s,{id:j.id,text:'A longer journal entry'},day);
  assert.equal(s.progress.notes,2);assert.equal(s.progress.journals,1);
  s.hp=0;E.saveNote(s,{id:a.id,text:'Recover with this old thought',recovery:true},day);
  assert.equal(s.progress.notes,2);assert.equal(s.progress.journals,2);
  E.saveNote(s,{text:'New recovery entry',recovery:true},day);assert.equal(s.progress.notes,3);assert.equal(s.progress.journals,3);
  const ids=awardAchievements(s,day).map(b=>b.id);assert.ok(ids.includes('vault-1'));assert.ok(ids.includes('journal-1'));
});
test('old saves reconstruct available totals and earned seals without requiring retained battles',()=>{
  const s=E.freshState();E.toggleTask(s,s.tasks[0].id);E.completeHabit(s,s.habits[0].id,day);E.saveNote(s,{text:'Old journal',kind:'journal'},day);s.monster.number=73;s.battles=[];delete s.progress;
  const migrated=E.validateState(s);assert.equal(migrated.progress.tasks,1);assert.equal(migrated.progress.habits.body,1);assert.equal(migrated.progress.notes,1);assert.equal(migrated.progress.journals,1);
  assert.equal(defeatedCount(migrated),72);assert.ok(migrated.progress.earned['monsters-25']);assert.ok(migrated.progress.earned['tasks-1']);
  assert.deepEqual(E.validateState(migrated),migrated);
});
test('bestiary statuses obey victory and next-day unlocking, including chapter boundaries',()=>{
  const s=E.freshState();assert.deepEqual([1,2,3].map(n=>monsterStatus(s,n)),['available','next','locked']);
  s.monster.number=8;s.monster.defeatedOn=day;
  assert.equal(defeatedCount(s),8);assert.equal(monsterStatus(s,1),'defeated');assert.equal(monsterStatus(s,8),'defeated');assert.equal(monsterStatus(s,9),'next');
  E.rollover(s,'2026-10-09');assert.equal(monsterStatus(s,9),'available');assert.equal(monsterStatus(s,10),'next');assert.equal(monsterStatus(s,11),'locked');
  assert.equal(monsterName(9),'Mossling 2');assert.equal(defeatedCount(s),8);
});
test('backups reject forged badge IDs, invalid dates, negative counts and malformed progress',()=>{
  for(const change of [s=>s.progress.tasks=-1,s=>s.progress.habits.body='10',s=>s.progress.journals=1,s=>s.progress.earned={'unknown-seal':day},s=>s.progress.earned={'tasks-1':'not-a-date'},s=>s.progress=null]){
    const s=E.freshState();change(s);assert.throws(()=>E.validateState(s));
  }
});
test('all eight monsters have distinct bounded geometry and grayscale X-eyed defeated art',()=>{
  const art=new Set();
  for(let n=1;n<=8;n++){
    const geometry=monsterGeometry(n);assert.ok(geometry.length>=18);art.add(JSON.stringify(geometry));
    for(const defeated of [false,true]){
      const svg=monsterArt(n,defeated);assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
      const points=[...svg.matchAll(/points="([^"]+)"/g)].flatMap(m=>m[1].split(' ').map(p=>p.split(',').map(Number)));
      assert.ok(points.every(([x,y])=>x>=0&&x<=240&&y>=0&&y<=260),`monster ${n} fits its view`);
      if(defeated){assert.match(svg,/class="defeated-eyes"/);for(const b of monsterGeometry(n,true)){const channels=b.color.slice(1).match(/../g);assert.equal(channels[0],channels[1]);assert.equal(channels[1],channels[2]);}}
      else assert.doesNotMatch(svg,/defeated-eyes/);
    }
  }
  assert.equal(art.size,8);
});
test('all seals have unique IDs, defined progress and original tiered artwork',()=>{
  assert.equal(new Set(ACHIEVEMENTS.map(b=>b.id)).size,ACHIEVEMENTS.length);
  const s=E.freshState();for(const b of ACHIEVEMENTS){assert.ok(Number.isFinite(achievementValue(s,b)));assert.match(badgeArt(b,true),/<svg/);assert.doesNotMatch(badgeArt(b),/undefined/);}
});
