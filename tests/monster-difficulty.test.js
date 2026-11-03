import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';

const cleared = '2026-11-02';
const unlocked = '2026-11-03';
function approaching(number, level) {
  const state = E.freshState();
  state.monster = { number: number - 1, defeatedOn: cleared };
  for (const stat of E.CATEGORIES) state.xp[stat] = 300 * (level - 1);
  return state;
}

test('the difficulty floor starts after #24, protects light builds, and caps stronger ones', () => {
  for (const [number, level, difficulty] of [[24, 50, undefined], [25, 50, 27], [64, 5, undefined], [64, 10, 91], [64, 50, 92]]) {
    const state = approaching(number, level);
    E.rollover(state, cleared);
    assert.equal(state.monster.number, number - 1);
    E.rollover(state, unlocked);
    assert.equal(state.monster.number, number);
    assert.equal(state.monster.difficulty, difficulty);
    assert.equal(state.monster.defeatedOn, null);
  }
});

test('the lock survives reload and defeat, while a level-up helps against the same opponent', () => {
  let state = approaching(64, 10);
  state.gold = 5000;
  for (const item of ['eclipse', 'sunplate', 'crown', 'aegis', 'windstep', 'drake']) E.buy(state, item);
  state.hp = Math.round(E.maxHP(state) * .7);
  E.rollover(state, unlocked);
  state = E.validateState(state);
  const locked = E.monsterStats(64, 91);
  const before = E.estimateOdds(E.oddsInput(state));
  state.xp.mind += 300;
  E.rollover(state, unlocked);
  assert.equal(state.monster.difficulty, 91);
  assert.ok(E.estimateOdds(E.oddsInput(state)) > before);

  const withoutFloor = { ...state, monster: { number: 64, defeatedOn: null } };
  assert.ok(E.estimateOdds(E.oddsInput(withoutFloor)) > E.estimateOdds(E.oddsInput(state)));
  assert.deepEqual(E.combatStats(state), E.combatStats(withoutFloor), 'the lock affects only the monster');

  const result = E.fight(state, unlocked, () => .6);
  assert.equal(result.won, false);
  assert.equal(result.monster, 64);
  assert.equal(result.difficulty, 91);
  assert.equal(result.events[0].enemyBefore, locked.hp);
  assert.equal(result.events[1].rawDamage, locked.attack + 2);
  E.rollover(state, '2026-11-04');
  const restored = E.validateState(state);
  assert.equal(restored.monster.difficulty, 91);
  assert.equal(restored.battles[0].difficulty, 91);
  assert.throws(() => E.validateState({ ...restored, monster: { ...restored.monster, difficulty: 93 } }));
  assert.throws(() => E.validateState({ ...restored, battles: [{ ...result, difficulty: 63 }] }));
});

test('already unlocked legacy monsters keep their original difficulty', () => {
  const old = E.validateState({ ...approaching(65, 50), monster: { number: 64, defeatedOn: null } });
  E.rollover(old, unlocked);
  assert.equal(E.oddsInput(old).monster.difficulty, undefined);
  const result = E.fight(old, unlocked, () => .6);
  assert.equal(result.difficulty, undefined);
  assert.equal(result.events[0].enemyBefore, E.monsterStats(64).hp);
});
