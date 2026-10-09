import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import {APPEARANCE,DEFAULT_APPEARANCE} from '../appearance.js';
import {avatarArt,avatarFaceArt} from '../avatar-model.js';
import {describeCombatEvent} from '../combat-presentation.js';
const day='2026-10-08';
const funded=()=>Object.assign(E.freshState(),{gold:5000});

test('Soul deflect levels off below 50% and monster gold stops growing at 40',()=>{
  assert.equal(E.soulDeflect(1),0);assert.ok(Math.abs(E.soulDeflect(2)-.12)<1e-9);
  assert.ok(E.soulDeflect(10)>.44&&E.soulDeflect(10)<.5);assert.ok(E.soulDeflect(200)<=.5);
  assert.equal(E.monsterGold(1),8);assert.equal(E.monsterGold(17),40);assert.equal(E.monsterGold(300),40);
});
test('helmets raise maximum HP and shift current HP when equipped or removed',()=>{
  const s=funded();s.hp=80;E.buy(s,'helm');
  assert.equal(s.equipped.helmet,'helm','auto-equipped into the empty slot');assert.equal(E.maxHP(s),112);assert.equal(s.hp,92);
  E.equip(s,'helm');assert.equal(E.maxHP(s),100);assert.equal(s.hp,80);
  E.equip(s,'helm');s.hp=5;E.equip(s,'helm');assert.equal(s.hp,1,'removing a helmet never knocks you out');
  s.hp=0;E.equip(s,'helm');assert.equal(s.hp,0,'and never revives you');
  assert.doesNotThrow(()=>E.validateState(JSON.parse(JSON.stringify(s))));
});
test('pets, spells, and tonics stack their bonuses into combat stats',()=>{
  const s=funded();const base=E.combatStats(s);
  E.buy(s,'owl');assert.equal(E.combatStats(s).attack,base.attack+3);
  E.buy(s,'storm');E.prepareSpell(s,'storm');assert.equal(E.combatStats(s).attack,base.attack+9);
  E.buy(s,'swift-tonic');E.usePotion(s,'swift-tonic');assert.equal(s.tonic,'swift-tonic');
  assert.ok(Math.abs(E.combatStats(s).dodge-.1)<1e-9);
  E.buy(s,'fort-tonic');assert.throws(()=>E.usePotion(s,'fort-tonic'),/already active/);assert.equal(E.itemCount(s,'fort-tonic'),1);
  E.buy(s,'cat');assert.equal(s.activePet,'owl','buying another pet keeps the current companion');
  E.equip(s,'cat');assert.equal(E.combatStats(s).rally,20,'the cat rallies even at Heart 1');
});
test('a fight consumes the spell and tonic, keeps the pet, and records them for replay',()=>{
  const s=funded();E.buy(s,'tortoise');E.buy(s,'ember');E.prepareSpell(s,'ember');E.buy(s,'swift-tonic');E.usePotion(s,'swift-tonic');
  const result=E.fight(s,day,()=>.5);
  assert.equal(s.preparedSpell,null);assert.equal(s.tonic,null);assert.equal(s.activePet,'tortoise');
  assert.equal(result.spell,'ember');assert.equal(result.tonic,'swift-tonic');assert.equal(result.pet,'tortoise');
  for(const e of result.events.filter(e=>e.type==='hit')){
    assert.equal(e.rawDamage-e.amount,e.blocked);assert.ok(e.petBlock<=3);
    if(e.petBlock)assert.match(describeCombatEvent(e,{pet:E.SHOP.find(i=>i.id==='tortoise')}).badges.map(b=>b.label).join(),/Stone tortoise/);
  }
  for(const e of result.events.filter(e=>e.type==='deflect'))assert.doesNotMatch(describeCombatEvent(e).badges[0].label,/Soul Lv\. 1/);
  assert.doesNotThrow(()=>E.validateState(JSON.parse(JSON.stringify(s))));
});
test('the shop comparison helper models every slot without touching the save',()=>{
  const s=funded();
  for(const item of E.SHOP.filter(i=>!['potion'].includes(i.type)||i.tonic)){
    const next=E.withItem(s,item),stats=E.combatStats(next);
    assert.ok(Object.values(stats).every(Number.isFinite));
  }
  assert.equal(E.combatStats(E.withItem(s,E.SHOP.find(i=>i.id==='crown'))).max,132);
  assert.equal(s.equipped.helmet,null);assert.equal(s.activePet,null);assert.equal(s.tonic,null);
});
test('styles must be bought before they can be worn, and purchases survive backups',()=>{
  const s=funded();
  assert.throws(()=>E.setAppearance(s,'style','mohawk'),/Buy this style/);
  E.setAppearance(s,'hair','copper');assert.equal(s.appearance.hair,'copper','free looks need no purchase');
  const gold=s.gold;E.buyCosmetic(s,'style','mohawk');
  assert.equal(s.gold,gold-100);assert.equal(s.appearance.style,'mohawk');assert.deepEqual(s.wardrobe,['style:mohawk']);
  assert.throws(()=>E.buyCosmetic(s,'style','mohawk'),/already own/);assert.throws(()=>E.buyCosmetic(s,'style','swept'),/free/);
  const restored=E.validateState(JSON.parse(JSON.stringify(s)));assert.equal(restored.appearance.style,'mohawk');
  const cheat=E.freshState();cheat.appearance.beard='full';assert.throws(()=>E.validateState(cheat),'unpaid styles are rejected');
  const poor=E.freshState();assert.throws(()=>E.buyCosmetic(poor,'beard','full'),/more gold/);
});
test('older saves gain empty helmet, tonic, and wardrobe fields',()=>{
  const s=E.freshState();delete s.tonic;delete s.wardrobe;s.equipped={weapon:null,armor:null};delete s.appearance.beard;delete s.appearance.accessory;
  const migrated=E.validateState(s);
  assert.equal(migrated.equipped.helmet,null);assert.equal(migrated.tonic,null);assert.deepEqual(migrated.wardrobe,[]);
  assert.equal(migrated.appearance.beard,'none');
});
test('every style, helmet, and legendary piece renders within bounds from every side',()=>{
  const helmets=[null,...E.SHOP.filter(i=>i.type==='helmet')],looks=[];
  for(const [key,options] of Object.entries(APPEARANCE))for(const o of options)looks.push({...DEFAULT_APPEARANCE,[key]:o.id});
  looks.push({...DEFAULT_APPEARANCE,style:'mohawk',beard:'full',accessory:'glasses'});
  for(const look of looks)for(const helmet of helmets)for(const angle of [-Math.PI,-Math.PI/2,0,Math.PI/2]){
    const art=avatarArt(E.SHOP.find(i=>i.id==='dawn'),E.SHOP.find(i=>i.id==='sunplate'),true,{angle,appearance:look,helmet});
    assert.doesNotMatch(art,/NaN|Infinity|undefined/);
    const points=[...art.matchAll(/points="([^"]+)"/g)].flatMap(m=>m[1].split(' ').map(p=>p.split(',').map(Number)));
    assert.ok(points.every(([x,y])=>x>=0&&x<=240&&y>=0&&y<=260),`${JSON.stringify(look)} ${helmet?.id} ${angle}`);
  }
  assert.match(avatarFaceArt({...DEFAULT_APPEARANCE,beard:'full',accessory:'glasses'}),/data-part="glasses"/);
  assert.doesNotMatch(avatarArt(null,null,false,{appearance:{...DEFAULT_APPEARANCE,style:'mohawk'},helmet:E.SHOP.find(i=>i.id==='helm')}),/data-part="mohawk"/,'helmets hide tall hair');
});
