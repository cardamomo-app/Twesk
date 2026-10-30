// Presentation only. These descriptions never roll dice or modify rewards.
import { combatPetCue } from './combat-pet-art.js?v=0.42.7';
export function combatSpellCue(event, spell) {
  if (!event || !['ember', 'ward', 'storm', 'starfall'].includes(spell?.id)) return null;
  // Twin strikes inherit half of the first strike, including its spell damage.
  if (event.type === 'attack' && (event.spellBonus > 0 || (event.strike === 'twin' && spell.boosts?.attack > 0)))
    return { id: spell.id, mode: 'attack' };
  if (event.type === 'hit' && event.spellBlock > 0) return { id: spell.id, mode: 'guard' };
  return null;
}
// Split recorded health changes into visual impacts, without rerolling the fight.
// Allocate remaining HP in landing order so overkill never invents extra damage.
export function combatHealthImpacts(event, { spell, pet, previousAttack, hpBefore, enemyBefore } = {}) {
  if (!event) return { before: { hp: hpBefore, enemy: enemyBefore }, beats: [] };
  const before = {
    hp: event.hpBefore ?? hpBefore ?? (event.type === 'hit' ? event.hp + (event.actualDamage ?? event.amount) : event.type === 'rally' ? event.hp - event.amount : event.hp - (event.healed || 0)),
    enemy: event.enemyBefore ?? enemyBefore ?? event.enemy + (event.type === 'attack' ? event.actualDamage ?? event.amount : event.thorns || 0),
  };
  let hp = before.hp, enemy = before.enemy;
  const spellCue = combatSpellCue(event, spell), petCue = combatPetCue(event, pet);
  const beats = ['impact', ...(spellCue ? ['spell'] : []), ...(petCue ? ['pet'] : [])].map(phase => ({ phase, hp, enemy, floats: [] }));
  const byPhase = Object.fromEntries(beats.map(b => [b.phase, b]));
  const number = (beat, side, amount, kind = 'damage', label = '') => {
    if (amount) beat.floats.push({ side, amount, kind, label });
  };
  if (event.type === 'attack') {
    let spellBonus = spellCue ? event.spellBonus || 0 : 0, petBonus = petCue ? event.petBonus || 0 : 0;
    if (event.strike === 'twin' && previousAttack?.type === 'attack') {
      const first = previousAttack.amount, firstPet = previousAttack.petBonus || 0, firstSpell = previousAttack.spellBonus || 0;
      if (petCue && event.petBonus === undefined) petBonus = Math.ceil(first / 2) - Math.ceil((first - firstPet) / 2);
      if (spellCue && event.spellBonus === undefined) spellBonus = Math.ceil((first - firstPet) / 2) - Math.ceil((first - firstPet - firstSpell) / 2);
    }
    // Missing legacy metadata stays in the weapon hit rather than guessing bonuses.
    petBonus = Math.min(event.amount, petBonus);
    spellBonus = Math.min(event.amount - petBonus, spellBonus);
    const raw = { impact: event.amount - spellBonus - petBonus, spell: spellBonus, pet: petBonus };
    const damage = Math.max(0, before.enemy - event.enemy), healing = Math.max(0, event.hp - before.hp);
    let dealt = 0, restored = 0;
    for (const beat of beats) {
      const amount = Math.min(enemy - event.enemy, raw[beat.phase] || 0);
      enemy -= amount; dealt += amount;
      const cumulativeHealing = damage ? Math.round(healing * dealt / damage) : healing;
      const healed = cumulativeHealing - restored; restored = cumulativeHealing; hp += healed;
      number(beat, 'monster', amount, 'damage', beat.phase === 'spell' ? spell.name : beat.phase === 'pet' ? pet.name : '');
      number(beat, 'player', healed, 'heal', 'Drain');
      Object.assign(beat, { hp, enemy });
    }
  } else if (event.type === 'rally') {
    const healing = Math.max(0, event.hp - before.hp), petHealing = petCue ? Math.min(healing, event.petHeal || 0) : 0;
    hp += healing - petHealing;
    number(byPhase.impact, 'player', healing - petHealing, 'heal', 'Heart');
    Object.assign(byPhase.impact, { hp, enemy });
    if (byPhase.pet) {
      hp += petHealing;
      number(byPhase.pet, 'player', petHealing, 'heal', pet.name);
      Object.assign(byPhase.pet, { hp, enemy });
    }
  } else {
    for (const beat of beats) Object.assign(beat, { hp: event.hp, enemy: event.enemy });
    if (event.type === 'hit') {
      number(byPhase.impact, 'player', before.hp - event.hp);
      number(byPhase.impact, 'monster', before.enemy - event.enemy, 'damage', 'Thorns');
      number(byPhase.impact, 'player', Math.max(0, (event.blocked || 0) - (spellCue ? event.spellBlock || 0 : 0) - (petCue ? event.petBlock || 0 : 0)), 'block');
      if (byPhase.spell) number(byPhase.spell, 'player', event.spellBlock, 'block', spell.name);
      if (byPhase.pet) number(byPhase.pet, 'player', event.petBlock, 'block', pet.name);
    } else if (event.type === 'deflect' || event.type === 'stagger') {
      const beat = petCue?.mode === 'deflect' ? byPhase.pet : byPhase.impact;
      beat.floats.push({ side: event.type === 'stagger' ? 'monster' : 'player', kind: 'deflect', text: event.type === 'stagger' ? 'STAGGERED' : 'DEFLECTED', label: petCue?.mode === 'deflect' ? pet.name : '' });
    }
  }
  return { before, beats };
}
export function describeCombatEvent(event, { monster = 'Monster', weapon, armor, shield, spell, pet } = {}) {
  const damage = event.actualDamage ?? event.amount;
  const badges = [];
  if (event.type === 'attack') {
    if (event.weaponBonus) badges.push({label:`+${event.weaponBonus} ${weapon?.name || 'weapon'}`,tone:'gear'});
    if (event.mindBonus) badges.push({label:`+${event.mindBonus} Mind · weakness exploited`,tone:'mind'});
    if (event.spellBonus) badges.push({label:`+${event.spellBonus} ${spell?.name || 'Ember spell'}`,tone:'soul'});
    if (event.petBonus) badges.push({label:`+${event.petBonus} ${pet?.name || 'companion'}`,tone:'gear'});
    if (event.critBonus) badges.push({label:`+${event.critBonus} critical hit`,tone:'gear'});
    if (event.venomBonus) badges.push({label:`+${event.venomBonus} venom`,tone:'gear'});
    if (event.healed) badges.push({label:`+${event.healed} HP drained`,tone:'heart'});
    if (event.sunder) badges.push({label:`Monster attack −${event.sunder} · sundered`,tone:'gear'});
    const strike={dagger:'Dagger strike',axe:'Axe swing'}[weapon?.kind]||'Sword strike';
    if (event.strike==='twin') return {title:'Quick second strike',detail:`Half damage, ${event.amount}${event.enemy===0?' · finishing blow':''}`,float:`−${damage} HP`,target:'monster',tone:'attack',badges,duration:1300};
    return {title:event.critBonus?'Critical hit!':weapon?strike:'You attack',detail:`${event.amount} attack damage${event.enemy===0?' · finishing blow':''}`,float:`−${damage} HP`,target:'monster',tone:'attack',badges,duration:1650};
  }
  if (event.type === 'hit') {
    const armorBlock=event.blocked-(event.spellBlock||0)-(event.petBlock||0)-(event.shieldBlock||0);
    if (armorBlock) badges.push({label:`Blocked ${armorBlock} · ${armor?.name || 'armor'}`,tone:'gear'});
    if (event.spellBlock) badges.push({label:`Blocked ${event.spellBlock} · ${spell?.name || 'Stone ward'}`,tone:'soul'});
    if (event.petBlock) badges.push({label:`Blocked ${event.petBlock} · ${pet?.name || 'companion'}`,tone:'gear'});
    if (event.shieldBlock) badges.push({label:`Halved · ${shield?.name || 'shield'} raised`,tone:'gear'});
    if (event.thorns) badges.push({label:`${event.thorns} thorns back at ${monster}`,tone:'gear'});
    if (event.sunder) badges.push({label:`−${event.sunder} sundered`,tone:'gear'});
    return {title:event.blocked?'Attack partially blocked':`${monster} attacks`,detail:event.rawDamage!=null?`${event.rawDamage} incoming − ${event.blocked || 0} blocked = ${event.amount} damage`:`${event.amount} damage`,float:`−${damage} HP`,target:'player',tone:'hit',badges,duration:event.blocked?1850:1650};
  }
  if (event.type === 'deflect') {
    const companion = combatPetCue(event, pet);
    // At Soul 1 the deflect came from a tonic or companion, not from Soul itself.
    badges.push(companion ? {label:`${pet.name} · attack diverted`,tone:'gear'} : {label:event.soulLevel>1?`Soul Lv. ${event.soulLevel} · attack deflected`:event.soulLevel===1?'Quick feet · attack deflected':'Soul · attack deflected',tone:'soul'});
    return {title:'Deflected!',detail:`${monster} misses. You take no damage.`,float:'DEFLECTED',target:'player',tone:'deflect',badges,duration:1850};
  }
  if (event.type === 'stagger') {
    badges.push({label:`${weapon?.name || 'Your weapon'} · loses its turn`,tone:'gear'});
    return {title:weapon?.id==='frostbite'?'Frozen!':'Staggered!',detail:`${monster} reels and loses its attack.`,float:weapon?.id==='frostbite'?'FROZEN':'STAGGERED',target:'monster',tone:'deflect',badges,duration:1700};
  }
  if (event.type === 'rally') {
    const companion = combatPetCue(event, pet);
    badges.push({label:event.heartLevel>1?`Heart Lv. ${event.heartLevel} · once per encounter`:'Rally · once per encounter',tone:'heart'});
    if (companion) badges.push({label:`+${companion.amount} HP · ${pet.name}`,tone:'heart'});
    return {title:companion?'Moonlit rally':'Heart rally',detail:companion?`${pet.name} purrs you back onto your feet.`:'You recover after a heavy hit.',float:`+${event.amount} HP`,target:'player',tone:'rally',badges,duration:1900};
  }
  return {title:'Ready',detail:'',float:'',target:null,tone:'ready',badges,duration:1000};
}
