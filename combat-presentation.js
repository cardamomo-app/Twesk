// Presentation only. These descriptions never roll dice or modify rewards.
import { combatPetCue } from './combat-pet-art.js?v=0.41.1';
export function combatSpellCue(event, spell) {
  if (!event || !['ember', 'ward', 'storm', 'starfall'].includes(spell?.id)) return null;
  // Twin strikes inherit half of the first strike, including its spell damage.
  if (event.type === 'attack' && (event.spellBonus > 0 || (event.strike === 'twin' && spell.boosts?.attack > 0)))
    return { id: spell.id, mode: 'attack' };
  if (event.type === 'hit' && event.spellBlock > 0) return { id: spell.id, mode: 'guard' };
  return null;
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
