const stats=['body','mind','soul','heart'];
export const ACHIEVEMENT_GROUPS=[['all','All seals'],['journey','Journey'],['tasks','Tasks'],['body','Body'],['mind','Mind'],['soul','Soul'],['heart','Heart'],['monsters','Monsters'],['vault','Vault'],['journal','Journal']];
const milestones=(group,metric,thresholds,titles,verb)=>thresholds.map((target,i)=>({id:`${group}-${target}`,group,metric,target,title:titles[i],description:verb(target),tier:Math.min(4,i+1)}));
export const ACHIEVEMENTS=[
  {id:'first-level',group:'journey',metric:'highestLevel',target:2,title:'The Awakening',description:'Reach level 2 in any stat',tier:1},
  {id:'fourfold',group:'journey',metric:'lowestLevel',target:2,title:'Fourfold Adventurer',description:'Reach level 2 in all four stats',tier:3},
  ...milestones('tasks','tasks',[1,10,50,100],['First Contract','Errand Runner','Guild Regular','Quest Keeper'],n=>`Complete ${n} ${n===1?'task':'tasks'}`),
  ...milestones('body','body',[10,50,100],['Trail Walker','Iron Roots','Titan’s Stride'],n=>`Complete ${n} Body habits`),
  ...milestones('mind','mind',[10,50,100],['Curious Apprentice','Lore Keeper','Archmage of Ideas'],n=>`Complete ${n} Mind habits`),
  ...milestones('soul','soul',[10,50,100],['Stillwater Initiate','Inner Compass','Keeper of the Flame'],n=>`Complete ${n} Soul habits`),
  ...milestones('heart','heart',[10,50,100],['Kindred Spirit','Hearth Keeper','Heart of the Realm'],n=>`Complete ${n} Heart habits`),
  ...milestones('monsters','monsters',[1,3,8,25],['Mossbreaker','Monster Scout','Chapter Champion','Realm Guardian'],n=>`Defeat ${n} ${n===1?'monster':'monsters'}`),
  ...milestones('vault','notes',[1,10,50],['Pocket Scribe','Idea Alchemist','Vault Curator'],n=>`Save ${n} ${n===1?'entry':'entries'} to the Vault`),
  ...milestones('journal','journals',[1,10,30],['First Page','Mirror Mage','Chronicler'],n=>`Write ${n} journal ${n===1?'entry':'entries'}`),
];
export function createProgress(){return {tasks:0,habits:Object.fromEntries(stats.map(c=>[c,0])),notes:0,journals:0,earned:{}};}
export function ensureProgress(s){
  if(s.progress===undefined){
    const p=createProgress();p.tasks=s.tasks.filter(t=>t.done).length;
    for(const c of stats)p.habits[c]=s.habits.filter(h=>h.category===c).reduce((sum,h)=>sum+h.logs.length,0);
    p.notes=s.notes.length;p.journals=s.notes.filter(n=>n.kind==='journal').length;s.progress=p;
  }
  return s.progress;
}
export const defeatedCount=s=>s.monster.number-1+(s.monster.defeatedOn?1:0);
export function achievementValue(s,badge){
  const p=ensureProgress(s);
  if(badge.metric==='highestLevel')return Math.max(...stats.map(c=>Math.floor(s.xp[c]/300)+1));
  if(badge.metric==='lowestLevel')return Math.min(...stats.map(c=>Math.floor(s.xp[c]/300)+1));
  if(badge.metric==='monsters')return defeatedCount(s);
  return stats.includes(badge.metric)?p.habits[badge.metric]:p[badge.metric];
}
export function awardAchievements(s,day){
  const p=ensureProgress(s),earned=[];
  for(const badge of ACHIEVEMENTS)if(!p.earned[badge.id]&&achievementValue(s,badge)>=badge.target){p.earned[badge.id]=day;earned.push(badge);}
  return earned;
}
export function monsterStatus(s,n){
  if(n<s.monster.number||(n===s.monster.number&&s.monster.defeatedOn))return 'defeated';
  if(n===s.monster.number)return 'available';
  if(n===s.monster.number+1)return 'next';
  return 'locked';
}
