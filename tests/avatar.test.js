import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,validateState,SHOP,combatStats,fight} from '../engine.js';
import {DEFAULT_APPEARANCE} from '../appearance.js';
import {avatarArt,avatarFaceArt} from '../avatar-model.js';

test('old backups gain appearance defaults and invalid appearance is rejected',()=>{
  const legacy=freshState();delete legacy.appearance;
  assert.deepEqual(validateState(legacy).appearance,DEFAULT_APPEARANCE);
  const invalid=freshState();invalid.appearance.hair='<script>';
  assert.throws(()=>validateState(invalid));
});
test('appearance is saved without affecting character combat stats',()=>{
  const state=freshState(),before=combatStats(state);
  state.appearance={skin:'deep',hair:'silver',outfit:'rose',style:'braids'};
  assert.deepEqual(validateState(state).appearance,state.appearance);
  assert.deepEqual(combatStats(state),before);
});
test('character geometry rotates through every side without invalid coordinates or clipping',()=>{
  for(const armor of [null,...SHOP.filter(i=>i.type==='armor')])for(const angle of [-Math.PI,-Math.PI/2,0,Math.PI/2,Math.PI]){
    const art=avatarArt(SHOP.find(i=>i.id==='star'),armor,true,{angle,appearance:{...DEFAULT_APPEARANCE,style:'braids'}});
    assert.doesNotMatch(art,/NaN|Infinity|undefined/);
    const coordinates=[...art.matchAll(/points="([^"]+)"/g)].flatMap(m=>m[1].split(' ').map(p=>p.split(',').map(Number)));
    assert.ok(coordinates.every(([x,y])=>x>=0&&x<=240&&y>=0&&y<=260));
    assert.match(art,/data-part="blade rune"/);
    if(armor?.tier==='special')assert.match(art,/data-part="cape"/);
  }
  assert.notEqual(avatarArt(),avatarArt(null,null,false,{angle:Math.PI}));
});
test('combat replay preserves appearance from the moment the encounter began',()=>{
  const state=freshState();state.appearance.hair='copper';
  const result=fight(state,'2026-10-08',()=>.5);
  state.appearance.hair='silver';
  assert.equal(result.appearance.hair,'copper');
  assert.doesNotThrow(()=>validateState(state));
});
test('profile portraits show the customized face with bounded hair and no body or equipment',()=>{
  const defaultFace=avatarFaceArt();
  for(const style of ['swept','crop','braids']){
    const portrait=avatarFaceArt({...DEFAULT_APPEARANCE,style,skin:'deep',hair:'silver'});
    assert.doesNotMatch(portrait,/NaN|Infinity|undefined|data-part="(?:tunic|boot|blade|plinth)"/);
    assert.match(portrait,/data-part="head"/);assert.match(portrait,/data-part="eye"/);assert.notEqual(portrait,defaultFace);
    const [x,y,w,h]=portrait.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
    const points=[...portrait.matchAll(/points="([^"]+)"/g)].flatMap(m=>m[1].split(' ').map(p=>p.split(',').map(Number)));
    assert.ok(points.every(([px,py])=>px>=x&&px<=x+w&&py>=y&&py<=y+h));
  }
  assert.equal(avatarFaceArt({...DEFAULT_APPEARANCE,outfit:'rose'}),defaultFace);
  assert.notEqual(avatarFaceArt({...DEFAULT_APPEARANCE,hair:'copper'}),defaultFace);
});
