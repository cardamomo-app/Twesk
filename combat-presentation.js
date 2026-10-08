// Presentation only. These descriptions never roll dice or modify rewards.
export function describeCombatEvent(event, { monster = 'Monster', weapon, armor, spell } = {}) {
  const damage = event.actualDamage ?? event.amount;
  const badges = [];
  if (event.type === 'attack') {
    if (event.weaponBonus) badges.push({label:`+${event.weaponBonus} ${weapon?.name || 'weapon'}`,tone:'gear'});
    if (event.mindBonus) badges.push({label:`+${event.mindBonus} Mind · weakness exploited`,tone:'mind'});
    if (event.spellBonus) badges.push({label:`+${event.spellBonus} ${spell?.name || 'Ember spell'}`,tone:'soul'});
    return {title:weapon?'Sword strike':'You attack',detail:`${event.amount} attack damage${event.enemy===0?' · finishing blow':''}`,float:`−${damage} HP`,target:'monster',tone:'attack',badges,duration:1650};
  }
  if (event.type === 'hit') {
    const armorBlock=event.blocked-(event.spellBlock||0);
    if (armorBlock) badges.push({label:`Blocked ${armorBlock} · ${armor?.name || 'armor'}`,tone:'gear'});
    if (event.spellBlock) badges.push({label:`Blocked ${event.spellBlock} · ${spell?.name || 'Stone ward'}`,tone:'soul'});
    return {title:event.blocked?'Attack partially blocked':`${monster} attacks`,detail:event.rawDamage!=null?`${event.rawDamage} incoming − ${event.blocked || 0} blocked = ${event.amount} damage`:`${event.amount} damage`,float:`−${damage} HP`,target:'player',tone:'hit',badges,duration:event.blocked?1850:1650};
  }
  if (event.type === 'deflect') {
    badges.push({label:`Soul${event.soulLevel?` Lv. ${event.soulLevel}`:''} · attack deflected`,tone:'soul'});
    return {title:'Deflected!',detail:`${monster} misses. You take no damage.`,float:'DEFLECTED',target:'player',tone:'deflect',badges,duration:1850};
  }
  if (event.type === 'rally') {
    badges.push({label:`Heart${event.heartLevel?` Lv. ${event.heartLevel}`:''} · once per encounter`,tone:'heart'});
    return {title:'Heart rally',detail:'You recover after a heavy hit.',float:`+${event.amount} HP`,target:'player',tone:'rally',badges,duration:1900};
  }
  return {title:'Ready',detail:'',float:'',target:null,tone:'ready',badges,duration:1000};
}
