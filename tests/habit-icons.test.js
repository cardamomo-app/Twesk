import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,validateState,completeHabit,combatStats} from '../engine.js';
import {HABIT_ICONS,habitIconChoice,resolvedHabitIcon} from '../habit-icons.js';

test('legacy icons retain water and category defaults; explicit choices survive renaming and backup',()=>{
  const state=freshState(),water=state.habits[0];
  assert.equal(habitIconChoice(water),'leaf');assert.equal(resolvedHabitIcon(water),'leaf');
  assert.equal(resolvedHabitIcon(state.habits.find(h=>h.category==='mind')),'mind');
  assert.equal(resolvedHabitIcon(state.habits.find(h=>h.category==='harm')),'harm');
  water.icon='water';water.title='Stay hydrated';
  assert.equal(resolvedHabitIcon(water),'water');assert.equal(validateState(JSON.parse(JSON.stringify(state))).habits[0].icon,'water');
  water.icon='category';assert.equal(resolvedHabitIcon(water),'body');
});
test('habit icon choices are validated without changing rewards or combat',()=>{
  const state=freshState(),habit=state.habits[0],before=combatStats(state);
  habit.icon='music';assert.deepEqual(combatStats(state),before);assert.equal(completeHabit(state,habit.id,'2026-10-08').amount,10);assert.equal(state.xp.body,10);
  assert.doesNotThrow(()=>validateState(state));
  for(const icon of ['unknown','<script>',null,3]){habit.icon=icon;assert.throws(()=>validateState(state));}
  delete habit.icon;assert.doesNotThrow(()=>validateState(state));
  assert.equal(new Set(HABIT_ICONS.map(i=>i.id)).size,HABIT_ICONS.length);
});
