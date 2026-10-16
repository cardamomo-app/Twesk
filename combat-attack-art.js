// Attack identities and original SVG effects. Presentation only: no combat rolls or state changes.
const line = d => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
const star = (x, y, r = 9) => `<path d="m${x} ${y-r} ${r*.3} ${r*.7} ${r*.7} ${r*.3}-${r*.7} ${r*.3}-${r*.3} ${r*.7}-${r*.3}-${r*.7}-${r*.7}-${r*.3} ${r*.7}-${r*.3}Z" fill="currentColor"/>`;
const chips = '<path d="M25 19h8v8h-8Zm61 9h6v6h-6ZM14 67h7v7h-7Zm79 17h9v9h-9ZM47 99h6v6h-6Z" fill="currentColor"/>';
const leaves = '<path d="m20 29 17 2-6 15-14-5Zm66 39 18-3-4 17-16-1ZM49 93l14-9 5 16-12 7Z" fill="currentColor"/>';
const crystal = '<path d="m26 18 7 19-7 15-8-15Zm66 37 9 21-9 19-10-19ZM47 84l7 13-7 15-7-15Z" fill="currentColor" stroke="#e7faff" stroke-width="1.5"/>';
const crescent = '<path d="M83 18A45 45 0 1 0 100 85 36 36 0 0 1 83 18Z" fill="currentColor" fill-opacity=".8"/>';
const punch = '<path d="M38 35h13V23h14v12h14v17h10v25H76v14H43V78H30V52h8Z" fill="currentColor" fill-opacity=".35"/>' + line('M26 21 36 34m53-12-9 12M18 83l14-7m56 8 15 8');
const flare = star(60, 60, 29) + chips;
const profile = (id, color, motion, trail, impact, voice, pitch = 1, projectile = '') => Object.freeze({ id, color, motion, trail, impact, voice, pitch, projectile });
export const WEAPON_ATTACKS = Object.freeze({
  unarmed: profile('unarmed', '#c39875', 'punch', punch, line('M40 48h40v30H40Z') + chips, 'fist', .9),
  twig: profile('twig', '#8cae78', 'slash', line('M94 17Q28 39 25 101') + line('M89 30Q43 50 38 89'), leaves, 'leaf', 1.15),
  iron: profile('iron', '#9eb9cb', 'slash', '<path d="M99 14Q24 30 18 104L35 94Q44 46 99 14Z" fill="currentColor"/>' + line('M101 23Q56 49 47 85'), chips + line('M48 39 69 82m-30-13 43-21'), 'steel', .8),
  star: profile('star', '#c7b4ef', 'slash', line('M98 13Q21 42 26 103') + star(84, 32, 12) + star(48, 65, 7) + star(25, 100, 9), star(60, 60, 24) + star(91, 26) + star(27, 86), 'chime', 1.35),
  dawn: profile('dawn', '#efc469', 'slash', '<path d="M101 16 82 69 25 105 45 61Z" fill="currentColor" fill-opacity=".55"/>' + line('M100 17 25 105M86 15 18 91M109 30 40 110'), flare + line('M60 15v14m0 62v14M15 60h14m62 0h14'), 'solar', .95),
  fang: profile('fang', '#d4b392', 'thrust', line('M20 87 97 26M25 101l79-61') + '<path d="m83 21 18 3-5 17Zm5 18 17 2-5 15Z" fill="currentColor"/>', line('M33 36 60 72 87 36M38 83l22-11 22 11'), 'dagger', 1.5),
  hatchet: profile('hatchet', '#bf9162', 'chop', '<path d="M27 17Q94 28 97 78L66 100Q78 52 27 17Z" fill="currentColor" fill-opacity=".7"/>' + line('M30 21 77 83'), '<path d="m31 21 12 9-6 9-12-8Zm49 52 21 9-6 12-20-12ZM40 83l12-9 11 15-14 12Z" fill="currentColor"/>', 'wood', .85),
  viper: profile('viper', '#83b88a', 'thrust', line('M18 102C14 66 84 83 65 46S95 27 104 14') + '<path d="m96 9 13 5-6 15-9-8Z" fill="currentColor"/>', '<path d="m32 30 20 4-10 19-16-10Zm40 41 19-5 10 18-21 6Z" fill="currentColor"/>', 'venom', 1.2),
  bearded: profile('bearded', '#b5a3a0', 'chop', '<path d="M27 12 90 28 106 68 81 103 58 99 72 65Z" fill="currentColor" fill-opacity=".6"/>' + line('M31 17 80 95'), line('M22 24 58 55 51 78 75 99M58 55l31-13M51 78l-29 9') + chips, 'stone', .65),
  nightshade: profile('nightshade', '#b197d4', 'thrust', '<path d="M16 97 89 16 108 12 99 33Z" fill="currentColor" fill-opacity=".75"/>' + line('M25 108 95 47') + star(92, 20, 6), crescent + star(81, 86, 8), 'shadow', 1.4),
  frostbite: profile('frostbite', '#8bcbd9', 'chop', '<path d="M24 13 72 24 102 61 86 99 62 108 62 74Z" fill="currentColor" fill-opacity=".55"/>' + line('M24 17 81 99') + crystal, crystal + line('M60 26v68M31 43l58 34M31 77l58-34'), 'ice', .8),
  eclipse: profile('eclipse', '#b38dd2', 'thrust', crescent + line('M19 97 97 27M29 106l75-53') + star(93, 23, 8), '<circle cx="60" cy="60" r="25" fill="#49405d"/><path d="M60 35a25 25 0 0 1 0 50 20 20 0 0 0 0-50Z" fill="currentColor"/>' + star(95, 35, 7), 'eclipse', .95),
});
export const MONSTER_ATTACKS = Object.freeze([
  profile('mossling', '#8aa76b', 'root', line('M101 22C50 13 17 51 36 79S78 101 99 82') + line('M87 35Q38 30 41 65'), leaves + line('M18 90q20-35 38-10t43-16'), 'leaf', .75),
  profile('emberback', '#eda263', 'breath', '<path d="M20 83V59h15V41h18V23h20v18h17v23h14v29H76v13H47V93Z" fill="currentColor" fill-opacity=".65"/><path d="M45 84V65h15V44h12v40Z" fill="#ffe4a2"/>', chips + star(60, 60, 27), 'fire', .9, '<path d="M10 70h19V49h19V25h17v14h16v16h19v30H77v15H47V85H10Z" fill="currentColor"/><path d="M42 80V61h15V42h13v38Z" fill="#ffe5a5"/>'),
  profile('cloud-wisp', '#b4b6df', 'hover', line('M18 72C8 29 91 16 102 54S38 104 32 68s44-40 48-9-24 28-24 8'), '<path d="M17 80h22v8H17Zm58-58h28v8H75ZM43 48h33v8H43Z" fill="currentColor"/>', 'wind', 1.2, line('M15 73C5 30 85 20 95 51S38 96 33 66s42-32 41-5-20 22-20 6')),
  profile('pebblejaw', '#a8b4ba', 'snap', '<path d="M18 25 49 40 44 59 22 52Zm84 0L71 40l5 19 22-7ZM22 82l22-17 5 19-31 16Zm76 0L76 65l-5 19 31 16Z" fill="currentColor"/>' + line('M48 45 60 60 72 45M48 75l12-15 12 15'), chips + line('M40 28 59 54 46 76 62 99M59 54l31-11'), 'stone', .8),
  profile('duskhorn', '#baa1cf', 'ram', line('M43 101V35l-19-9V12m19 39 22-17V18m12 83V35l20-9V12M77 51 55 35') + '<path d="M47 75h26l-13 29Z" fill="currentColor"/>', '<path d="m60 20 14 27 27 13-27 13-14 27-14-27-27-13 27-13Z" fill="currentColor" fill-opacity=".4"/>' + star(25, 24, 7) + star(96, 91, 7), 'horn', .8),
  profile('frost-sprout', '#9cd8df', 'bloom', crystal + line('M60 22v77M26 39l68 41M26 80l68-41') + star(60, 60, 13), crystal + '<path d="m60 36 17 24-17 26-17-26Z" fill="currentColor" fill-opacity=".45"/>', 'ice', 1.3, '<path d="m59 12 12 35 32 13-32 13-12 35-13-35-32-13 32-13Z" fill="currentColor"/><path d="m59 36 8 24-8 24-9-24Z" fill="#ecffff"/>'),
  profile('sunstone-golem', '#dfbf72', 'slam', '<path d="M33 23h54v16h10v38H83v16H37V77H23V39h10Z" fill="currentColor" fill-opacity=".5"/>' + line('M38 39v25m14-27v27m15-27v27m15-25v25'), '<ellipse cx="60" cy="79" rx="46" ry="19" fill="none" stroke="currentColor" stroke-width="5"/>' + chips + line('M60 57 45 87 51 103m9-46 23 31 16 3'), 'solar', .6),
  profile('moonmoth', '#c3a5d7', 'flutter', crescent + star(25, 30, 7) + star(76, 45, 5) + star(101, 87, 9), '<circle cx="60" cy="60" r="30" fill="none" stroke="currentColor" stroke-width="2"/>' + star(41, 41, 12) + star(83, 67, 10) + star(39, 90, 7), 'lunar', 1.25, crescent + star(30, 29, 7) + star(79, 47, 5) + star(102, 94, 7)),
]);
export const weaponAttackProfile = weapon => WEAPON_ATTACKS[weapon?.id] || WEAPON_ATTACKS.unarmed;
export const monsterAttackProfile = number => MONSTER_ATTACKS[((Math.max(1, Math.floor(number || 1)) - 1) % MONSTER_ATTACKS.length)];
export function combatAttackCue(event, { weapon, monster = 1 } = {}) {
  if (!event) return null;
  if (event.type === 'attack' || event.type === 'stagger') return {
    profile: weaponAttackProfile(weapon), side: 'player', stagger: event.type === 'stagger', twin: event.strike === 'twin',
    venom: event.venomBonus > 0, critical: event.critBonus > 0, sunder: event.sunder > 0, drain: event.healed > 0, missed: false,
  };
  if (event.type === 'hit' || event.type === 'deflect') return { profile: monsterAttackProfile(monster), side: 'monster', missed: event.type === 'deflect' };
  return null;
}
const svg = (cls, art) => `<svg class="${cls}" viewBox="0 0 120 120" aria-hidden="true">${art}</svg>`;
export function combatAttackArt(cue) {
  if (!cue) return '';
  const { profile: p } = cue;
  const power = cue.stagger ? p.id === 'frostbite' ? 'freeze' : 'stagger' : cue.critical ? 'critical' : cue.venom ? 'venom' : cue.sunder ? 'sunder' : '';
  const powers = {
    freeze: '<path d="m20 99 2-56 16 27 4-58 18 30 18-30 4 58 16-27 2 56Z" fill="currentColor" fill-opacity=".25" stroke="currentColor" stroke-width="3"/>' + crystal,
    stagger: star(25, 30, 10) + star(94, 43, 9) + star(58, 15, 7),
    critical: line('M23 23 97 97M97 23 23 97') + star(60, 60, 23),
    venom: '<path d="M30 20q-18 28 0 28t0-28M83 62q-17 26 0 26t0-26M53 87q-10 18 0 18t0-18" fill="currentColor"/>',
    sunder: line('M27 18 59 49 49 72 64 104M59 49l31-13M49 72l-29 8'),
  };
  return `<div class="combat-attack attack-${cue.side} attack-${p.id} motion-${p.motion}${cue.twin ? ' attack-twin' : ''}${cue.missed ? ' attack-missed' : ''}${cue.stagger ? ' attack-stagger' : ''}" style="--attack-color:${p.color}" aria-hidden="true">${!cue.stagger && p.projectile ? svg('attack-projectile', p.projectile) : ''}${!cue.stagger ? svg('attack-trail', p.trail) : ''}${!cue.stagger && !cue.missed ? svg('attack-impact', p.impact) : ''}${power ? svg('attack-power power-' + power, powers[power]) : ''}${cue.drain ? svg('attack-drain', '<circle cx="60" cy="60" r="10" fill="currentColor"/>' + star(40, 48, 6) + star(78, 71, 5)) : ''}</div>`;
}
