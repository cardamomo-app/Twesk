// Companion identities and recorded-event cues. Presentation never rolls dice or changes damage.
export const PET_COMBAT = Object.freeze({
  fox: { color: '#85b482', mode: 'deflect', label: 'Leafstep' },
  owl: { color: '#b8a4d3', mode: 'attack', label: 'Opening spotted' },
  tortoise: { color: '#a6b781', mode: 'guard', label: 'Shell guard' },
  cat: { color: '#c3b5e4', mode: 'heal', label: 'Moonlit purr' },
  drake: { color: '#efa06b', mode: 'attack', label: 'Ember breath' },
});
export function combatPetCue(event, pet) {
  const profile = PET_COMBAT[pet?.id];
  if (!profile || !event) return null;
  let amount;
  if (profile.mode === 'attack' && event.type === 'attack') {
    // Older twin-strike logs omit the inherited bonus; show the assist without inventing a number.
    if (event.petBonus > 0) amount = event.petBonus;
    else if (event.strike === 'twin' && event.petBonus === undefined) amount = null;
    else return null;
  } else if (profile.mode === 'guard' && event.type === 'hit' && event.petBlock > 0) amount = event.petBlock;
  else if (profile.mode === 'deflect' && event.type === 'deflect' && event.petDeflect === true) amount = null;
  else if (profile.mode === 'heal' && event.type === 'rally' && event.petHeal > 0) amount = event.petHeal;
  else return null;
  const reward = profile.mode === 'attack' ? amount == null ? 'Attack assisted' : `+${amount} attack`
    : profile.mode === 'guard' ? `${amount} blocked` : profile.mode === 'heal' ? `+${amount} HP` : 'Attack diverted';
  return { id: pet.id, ...profile, amount, reward };
}
const feather = '<path d="M87 13C38 9 15 40 22 91l29-23 21-4-9-10 20-8-8-10Z" fill="currentColor"/><path d="m22 91 44-54M38 72l1-23m9 13 19-3" fill="none" stroke="#f7edff" stroke-width="3"/>';
const flame = '<path d="M14 65V42h17V25h16V7h13v18h15v16h19v38H77v16H39V80H24V65Z" fill="currentColor"/><path d="M39 74V52h14V31h11v25h14v23H39Z" fill="#ffe1a0"/><path d="M53 63h11v16H53Z" fill="#fff8e0"/>';
const shell = '<path d="M60 10 103 31v33L86 91l-26 19-26-19-17-27V31Z" fill="var(--panel)" fill-opacity=".9" stroke="currentColor" stroke-width="4"/><path d="m60 32 20 13v25L60 84 40 70V45Zm0 0V15M40 45l-20-7m20 32-10 16m50-41 20-7M80 70l10 16M60 84v20" fill="none" stroke="currentColor" stroke-width="3"/>';
const leaves = '<path d="M23 26q27-7 22 20-26 7-22-20Zm52 47q27-7 22 20-26 7-22-20ZM81 17q-25-2-23 23 25 2 23-23Z" fill="currentColor"/><path d="M23 88Q6 37 56 18m40 13q27 49-27 70" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>';
const moon = '<path d="M70 12a43 43 0 1 0 36 66A36 36 0 0 1 70 12Z" fill="currentColor" fill-opacity=".8"/><path d="m86 22 5 13 13 5-13 5-5 13-5-13-13-5 13-5ZM31 75h10V65h9v10h10v9H50v10h-9V84H31Z" fill="#f9edcf"/>';
export function combatPetArt(cue) {
  if (!cue) return '';
  const art = { owl: feather, drake: flame, tortoise: shell, fox: leaves, cat: moon }[cue.id];
  const projectile = cue.mode === 'attack' || cue.mode === 'heal';
  return `<div class="combat-pet-effect pet-effect-${cue.id} pet-effect-${cue.mode}" style="--pet-color:${cue.color}" aria-hidden="true">${projectile ? `<svg class="pet-projectile" viewBox="0 0 120 120">${art}</svg>` : ''}<svg class="pet-impact" viewBox="0 0 120 120">${art}${cue.mode === 'attack' ? '<path d="M53 2h10v14H53ZM8 47h14v10H8Zm87 31h14v10H95ZM36 99h10v14H36Z" fill="currentColor"/>' : ''}</svg></div>`;
}
