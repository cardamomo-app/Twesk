import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,toggleTask,saveNote,validateState} from '../engine.js';
import {SAVE_KEY,PREVIOUS_SAVE_KEY,resetProgress,restorePreviousProgress} from '../save-recovery.js';
function storage(){const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}
test('reset returns the whole adventure to its starting state and preserves a recoverable save',()=>{
  const old=freshState(),store=storage();old.name='Hero';old.revision=42;toggleTask(old,old.tasks[0].id);saveNote(old,{text:'Keep this journal',kind:'journal'},'2026-10-08');old.xp.body=900;old.monster.number=3;
  store.setItem(SAVE_KEY,JSON.stringify(old));
  const reset=resetProgress(store,old);
  assert.equal(reset.revision,43);assert.equal(reset.name,'Adventurer');assert.equal(reset.gold,0);assert.equal(reset.hp,100);assert.equal(reset.monster.number,1);assert.deepEqual(reset.xp,{body:0,mind:0,soul:0,heart:0});assert.equal(reset.tasks.length,3);assert.ok(reset.tasks.every(t=>!t.done));assert.equal(reset.notes.length,0);assert.equal(reset.inventory.length,0);assert.deepEqual(reset.progress.earned,{});assert.equal(reset.progress.tasks,0);assert.deepEqual(JSON.parse(store.getItem(PREVIOUS_SAVE_KEY)),old);assert.deepEqual(validateState(JSON.parse(store.getItem(SAVE_KEY))),reset);
  const restored=restorePreviousProgress(store,reset);
  assert.deepEqual({...restored,revision:old.revision},old);assert.equal(restored.revision,44);assert.deepEqual(JSON.parse(store.getItem(PREVIOUS_SAVE_KEY)),reset);
  const swapped=restorePreviousProgress(store,restored);assert.equal(swapped.name,'Adventurer');assert.equal(swapped.revision,45);
});
test('failed reset writes preserve the active save and previous recovery copy',()=>{
  const old=freshState(),store=storage(),raw=JSON.stringify(old);store.setItem(SAVE_KEY,raw);store.setItem(PREVIOUS_SAVE_KEY,'existing recovery');
  const write=store.setItem;store.setItem=(key,value)=>{if(key===SAVE_KEY)throw new Error('Storage full');write(key,value);};
  assert.throws(()=>resetProgress(store,old),/Storage full/);assert.equal(store.getItem(SAVE_KEY),raw);assert.equal(store.getItem(PREVIOUS_SAVE_KEY),'existing recovery');
});
test('restore validates the recovery copy before replacing any progress',()=>{
  const old=freshState(),store=storage(),raw=JSON.stringify(old);store.setItem(SAVE_KEY,raw);
  assert.throws(()=>restorePreviousProgress(store,old),/no previous save/);
  store.setItem(PREVIOUS_SAVE_KEY,'{"version":1}');assert.throws(()=>restorePreviousProgress(store,old));assert.equal(store.getItem(SAVE_KEY),raw);assert.equal(store.getItem(PREVIOUS_SAVE_KEY),'{"version":1}');
});
