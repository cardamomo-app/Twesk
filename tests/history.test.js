import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
const day=n=>`2026-10-${String(n).padStart(2,'0')}`;

test('history records tasks and gold by day, and undo reverses the original day',()=>{
  const s=E.freshState(),[a,b]=s.tasks;
  E.toggleTask(s,a.id,day(1));E.toggleTask(s,b.id,day(2));
  assert.deepEqual(s.history[day(1)],{tasks:1,gold:4,levels:[]});assert.equal(s.history[day(2)].tasks,1);
  E.toggleTask(s,a.id,day(3));assert.deepEqual(s.history[day(1)],{tasks:0,gold:0,levels:[]},'undo applies to the day it was completed');
  assert.equal(s.history[day(3)],undefined);
});
test('level-ups are recorded on their day and removed when the level-up is undone',()=>{
  const s=E.freshState(),h=s.habits.find(h=>h.category==='mind'&&h.base===10);s.xp.mind=295;
  assert.equal(E.completeHabit(s,h.id,day(4)).leveled,true);assert.deepEqual(s.history[day(4)].levels,['mind']);
  E.undoHabit(s,h.id,day(4));assert.deepEqual(s.history[day(4)].levels,[]);
});
test('day summaries combine habits, XP, harm, tasks, notes, journals, and battles',()=>{
  const s=E.freshState(),body=s.habits.find(h=>h.category==='body'),soul=s.habits.find(h=>h.category==='soul'),harm=s.habits.find(h=>h.category==='harm');
  E.completeHabit(s,body.id,day(5));E.completeHabit(s,soul.id,day(5));E.logHarm(s,harm.id,day(5));E.toggleTask(s,s.tasks[2].id,day(5));
  E.saveNote(s,{text:'An idea'},day(5));E.saveNote(s,{text:'Dear diary',kind:'journal'},day(5));
  const d=E.daySummary(s,day(5),()=>day(5));
  assert.equal(d.habits.length,2);assert.equal(d.xp.body,10);assert.equal(d.xp.soul,soul.base);assert.equal(d.harm[0].count,1);
  assert.equal(d.tasks,1);assert.equal(d.gold,18);assert.equal(d.notes,1);assert.equal(d.journals,1);
  assert.equal(E.daySummary(s,day(6),()=>day(5)).habits.length,0);
});
test('older saves rebuild history from dated tasks; invalid history is rejected',()=>{
  const s=E.freshState();E.toggleTask(s,s.tasks[0].id,day(7));delete s.history;
  const migrated=E.validateState(JSON.parse(JSON.stringify(s)));assert.deepEqual(migrated.history[day(7)],{tasks:1,gold:4,levels:[]});
  for(const bad of [{nope:{tasks:1,gold:0,levels:[]}},{[day(1)]:{tasks:-1,gold:0,levels:[]}},{[day(1)]:{tasks:1,gold:0,levels:['luck']}},[]]){
    const x=E.freshState();x.history=bad;assert.throws(()=>E.validateState(x));
  }
});
test('history keeps a bounded number of days',()=>{
  const s=E.freshState();
  for(let i=0;i<820;i++){const d=new Date(Date.UTC(2024,0,1+i)).toISOString().slice(0,10);const t=E.saveTask(s,{title:'t',tier:'quick'},d);E.toggleTask(s,t.id,d);}
  assert.equal(Object.keys(s.history).length,800);assert.ok(!s.history['2024-01-01']);
  s.tasks=s.tasks.slice(0,50);assert.doesNotThrow(()=>E.validateState(JSON.parse(JSON.stringify(s))));
});
