import {DEFAULT_APPEARANCE,validAppearance} from './appearance.js';
import {createProgress,ensureProgress,awardAchievements,ACHIEVEMENTS} from './achievements.js?v=0.7.0';
import {validHabitIcon} from './habit-icons.js?v=0.7.4';
export const CATEGORIES = ['body', 'mind', 'soul', 'heart'];
export const TASK_GOLD = { quick: 4, standard: 10, hard: 18, quest: 40 };
export const CATEGORY_META = {
  body: { label: 'Body', subtitle: 'Care for your physical self', icon: 'body' },
  mind: { label: 'Mind', subtitle: 'Learn, practice, create', icon: 'mind' },
  soul: { label: 'Soul', subtitle: 'Make space within', icon: 'soul' },
  heart: { label: 'Heart', subtitle: 'Connect and care', icon: 'heart' },
  harm: { label: 'Harm', subtitle: 'Notice what takes a toll', icon: 'harm' },
};
export const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function dateKey(now = new Date(), timezone = 'Atlantic/Madeira') {
  const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = type => parts.find(p => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function deviceTimezone() {
  try { const zone = Intl.DateTimeFormat().resolvedOptions().timeZone; dateKey(new Date(), zone); return zone; }
  catch { return 'UTC'; }
}
export function daysBetween(a, b) { return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000); }
export const level = (s, stat) => Math.floor(s.xp[stat] / 300) + 1;
export const maxHP = s => 100 + 15 * (level(s, 'body') - 1);
export const healingMultiplier = s => 1 + .1 * (level(s, 'heart') - 1);
export const words = text => (text.trim().match(/\S+/gu) || []).length;
export const noteEntitlement = text => words(text) >= 150 ? 3 : words(text) >= 50 ? 2 : words(text) ? 1 : 0;

export function freshState() {
  const habit = (title, category, base) => ({ id: uid(), title, category, base, logs: [], harmLogs: [], created: Date.now() });
  return {
    version: 1, revision: 0, name: 'Adventurer', gold: 0, hp: 100,
    appearance: {...DEFAULT_APPEARANCE},
    xp: { body: 0, mind: 0, soul: 0, heart: 0 },
    tasks: [
      { id: uid(), title: 'Reply to that email', tier: 'quick', done: false, earned: 0 },
      { id: uid(), title: 'Clear a little space on your desk', tier: 'quick', done: false, earned: 0 },
      { id: uid(), title: 'Finish something you’ve been putting off', tier: 'hard', done: false, earned: 0 },
    ],
    habits: [
      habit('Drink enough water', 'body', 10), habit('Get a good night’s sleep', 'body', 10), habit('Eat nourishing meals', 'body', 10),
      habit('Read a few pages', 'mind', 10), habit('Practice a skill', 'mind', 20),
      habit('Take a mindful pause', 'soul', 10), habit('Write a reflection', 'soul', 20),
      habit('Check in with someone', 'heart', 20), habit('Do something kind', 'heart', 10),
      habit('Mindless scrolling', 'harm', 3), habit('Fast food', 'harm', 7),
    ],
    notes: [], noteGold: {}, reviewDates: [], inventory: [], equipped: { weapon: null, armor: null }, potions: 0,
    supplies: {}, preparedSpell: null, activePet: null,
    progress: createProgress(),
    monster: { number: 1, defeatedOn: null }, battles: [], pendingRecovery: false,
    settings: { theme: 'light', muted: false, reducedMotion: false, timezone: deviceTimezone(), lastBackup: null, backupNudge: null },
  };
}

export function momentum(habit, today) {
  const logs = [...habit.logs].filter(l => l.day < today).sort((a,b) => a.day.localeCompare(b.day));
  if (!logs.length) return 1;
  let factor = 1;
  for (let i = 1; i < logs.length; i++) {
    const missed = Math.max(0, daysBetween(logs[i-1].day, logs[i].day) - 1);
    if (missed === 0) factor = factor < 1.2 ? 1.2 : 1.5;
    else for (let j = 0; j < Math.min(3, missed); j++) factor = decay(factor);
  }
  const missed = Math.max(0, daysBetween(logs.at(-1).day, today) - 1);
  if (!missed) return factor < 1.2 ? 1.2 : 1.5;
  for (let j = 0; j < Math.min(3, missed); j++) factor = decay(factor);
  return factor;
}
function decay(f) { return f > 1.2 ? 1.2 : f > 1.1 ? 1.1 : 1; }
export function completeHabit(s, id, today) {
  const h = s.habits.find(h => h.id === id);
  if (!h || h.category === 'harm') throw new Error('Choose a positive habit.');
  if (h.logs.some(l => l.day === today)) throw new Error('Already completed today.');
  const amount = Math.round(h.base * momentum(h, today));
  const beforeLevel = level(s, h.category), beforeHP = maxHP(s);
  ensureProgress(s).habits[h.category]++;
  h.logs.push({ day: today, xp: amount }); s.xp[h.category] += amount;
  s.hp = Math.max(0, Math.min(maxHP(s), s.hp + maxHP(s) - beforeHP));
  return { amount, category: h.category, leveled: level(s, h.category) > beforeLevel };
}
export function undoHabit(s, id, today) {
  const h = s.habits.find(h => h.id === id), log = h?.logs.find(l => l.day === today);
  if (!log) throw new Error('Nothing to undo today.');
  const beforeHP = maxHP(s);
  const progress=ensureProgress(s);progress.habits[h.category]=Math.max(0,progress.habits[h.category]-1);
  s.xp[h.category] -= log.xp; h.logs = h.logs.filter(l => l !== log);
  s.hp = Math.max(0, Math.min(maxHP(s), s.hp + maxHP(s) - beforeHP));
  return log.xp;
}
export function logHarm(s, id, today) {
  const h = s.habits.find(h => h.id === id);
  if (!h || h.category !== 'harm') throw new Error('Choose a Harm habit.');
  const damage = Math.min(s.hp, h.base);
  s.hp -= damage; h.harmLogs.push({ id: uid(), day: today, damage });
  if (!s.hp) s.pendingRecovery = true;
  return damage;
}
export function undoHarm(s, id, logId, today) {
  const h = s.habits.find(h => h.id === id), l = h?.harmLogs.find(l => l.id === logId && l.day === today);
  if (!l) throw new Error('Nothing to undo.');
  s.hp = Math.min(maxHP(s), s.hp + l.damage); h.harmLogs = h.harmLogs.filter(x => x !== l);
  return l.damage;
}
export const TAG_PATTERN = /#[\p{L}\p{N}_-]+/gu;
export const tags = text => [...new Set((text.match(TAG_PATTERN) || []).map(t => t.toLowerCase()))];
export const REPEATS = { daily: 'Every day', weekdays: 'Weekdays', weekly: 'Every week', monthly: 'Every month' };
// The date a recurring task reopens after being completed on `day`. Missed occurrences never pile up.
export function nextOccurrence(day, repeat) {
  const d = new Date(`${day}T12:00:00Z`), key = () => d.toISOString().slice(0, 10);
  if (repeat === 'daily') d.setUTCDate(d.getUTCDate() + 1);
  else if (repeat === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
  else if (repeat === 'weekdays') do d.setUTCDate(d.getUTCDate() + 1); while ([0, 6].includes(d.getUTCDay()));
  else if (repeat === 'monthly') {
    const target = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1);
    d.setUTCDate(Math.min(target, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
  } else throw new Error('Unknown repeat.');
  return key();
}
export function saveTask(s, { id, title, tier, repeat = null, sort = false }, today) {
  title = String(title || '').trim();
  if (!title) throw new Error('Give this task a name.');
  if (repeat !== null && !Object.hasOwn(REPEATS, repeat)) throw new Error('Unknown repeat.');
  let task = s.tasks.find(t => t.id === id);
  if (!task) { task = { id: uid(), title, tier, done: false, earned: 0 }; s.tasks.unshift(task); }
  task.title = title;
  if (!task.done) task.tier = tier;
  if (sort) task.inbox = false;
  if (repeat) { task.repeat = repeat; task.due = task.done ? nextOccurrence(task.doneOn || today, repeat) : null; }
  else { delete task.repeat; delete task.due; }
  return task;
}
export function toggleTask(s, id, today) {
  const task = s.tasks.find(t => t.id === id);
  if (!task) throw new Error('Task not found.');
  const progress=ensureProgress(s);
  if (task.done) {
    const amount = task.earned; s.gold -= amount; task.done = false; task.earned = 0; progress.tasks=Math.max(0,progress.tasks-1);
    delete task.doneOn; if (task.repeat) task.due = null;
    return -amount;
  }
  progress.tasks++;
  const amount = TASK_GOLD[task.tier]; task.done = true; task.earned = amount; s.gold += amount;
  if (today) task.doneOn = today;
  if (task.repeat) task.due = nextOccurrence(today, task.repeat);
  return amount;
}
// Recurring tasks whose next date has arrived return to the to-do list. Earned gold stays earned.
export function reopenTasks(s, today) {
  let reopened = 0;
  for (const t of s.tasks) if (t.repeat && t.done && t.due && t.due <= today) { t.done = false; t.earned = 0; t.due = null; delete t.doneOn; reopened++; }
  return reopened;
}
export function saveNote(s, { id, text, kind = 'note', recovery = false }, today) {
  if (!text.trim()) throw new Error('Write something first.');
  const progress=ensureProgress(s);
  let note = s.notes.find(n => n.id === id);
  if (!note) {
    note = { id: uid(), text: '', created: new Date().toISOString(), paid: 0, status: 'inbox', kind:recovery?'journal':kind, healed: false };s.notes.unshift(note);
    progress.notes++;if(note.kind==='journal')progress.journals++;
  }
  note.text = text.trim();
  const remaining = Math.max(0, 6 - (s.noteGold[today] || 0));
  const reward = Math.max(0, Math.min(remaining, noteEntitlement(text) - note.paid));
  note.paid += reward; s.gold += reward; s.noteGold[today] = (s.noteGold[today] || 0) + reward;
  let healed = 0;
  if (recovery && !note.healed) {
    if(note.kind!=='journal')progress.journals++;
    healed = Math.min(maxHP(s)-s.hp, Math.floor(words(text)/2*healingMultiplier(s)));
    s.hp += healed; note.healed = true; note.kind = 'journal'; note.monster = s.monster.number;
    s.pendingRecovery = s.hp < maxHP(s);
  }
  return { note, reward, healed };
}
export function convertNote(s, id, tier = 'quick') {
  const note = s.notes.find(n => n.id === id);
  if (!note) throw new Error('Note not found.');
  if (note.taskId) return s.tasks.find(t => t.id === note.taskId) || null;
  // Hashtags carry over, so a captured task joins the note's projects.
  const base = note.text.replace(TAG_PATTERN,'').trim().split('\n')[0].replace(/\s+/g,' ').trim(), noteTags = tags(note.text).join(' ');
  const title = [base.slice(0, Math.max(0, 159 - noteTags.length)) || (noteTags ? '' : 'Captured task'), noteTags].filter(Boolean).join(' ').slice(0,160) || 'Captured task';
  const task = { id: uid(), title, tier, done: false, earned: 0, source: note.id, inbox: true };
  s.tasks.unshift(task); note.taskId = task.id; note.status = 'kept'; return task;
}
export function reviewNote(s, id, status, today) {
  const note = s.notes.find(n => n.id === id);
  if (!note) throw new Error('Note not found.');
  const pending = note.status === 'inbox';
  note.status = status;
  return pending ? rewardReview(s,today) : 0;
}
export function rewardReview(s,today) {
  if (s.reviewDates.includes(today)) return 0;
  s.reviewDates.push(today); s.gold += 4; return 4;
}
export const SHOP = [
  { id: 'potion', name: 'Healing potion', type: 'potion', tier: 'basic', price: 10, bonus: 30, description: 'Restore 30 HP · Heart improves healing' },
  { id: 'twig', name: 'Trail blade', type: 'weapon', tier: 'basic', price: 35, bonus: 1, description: '+1 attack · a trusty beginning' },
  { id: 'linen', name: 'Wayfarer vest', type: 'armor', tier: 'basic', price: 35, bonus: 1, description: 'Reduce each hit by 1' },
  { id: 'iron', name: 'Ironwood sword', type: 'weapon', tier: 'large', price: 125, bonus: 3, description: '+3 attack · made to last' },
  { id: 'guard', name: 'Mossguard armor', type: 'armor', tier: 'large', price: 125, bonus: 3, description: 'Reduce each hit by 3' },
  { id: 'star', name: 'Starlight edge', type: 'weapon', tier: 'special', price: 250, bonus: 5, description: '+5 attack · a little extraordinary' },
  { id: 'moon', name: 'Moonstone mail', type: 'armor', tier: 'special', price: 250, bonus: 5, description: 'Reduce each hit by 5' },
  { id: 'greater-potion', name: 'Greater healing potion', type: 'potion', tier: 'large', price: 20, bonus: 65, description: 'Restore 65 HP · Heart improves healing' },
  { id: 'full-potion', name: 'Full healing potion', type: 'potion', tier: 'special', price: 35, bonus: 0, description: 'Restore all missing HP, at any Body level' },
  { id: 'ember', name: 'Ember spell', type: 'spell', tier: 'basic', price: 20, bonus: 3, effect: 'attack', description: '+3 damage on every attack in your next fight' },
  { id: 'ward', name: 'Stone ward', type: 'spell', tier: 'large', price: 25, bonus: 3, effect: 'armor', description: 'Block 3 extra damage on every hit in your next fight' },
  { id: 'fox', name: 'Fern fox', type: 'pet', tier: 'basic', price: 80, bonus: 0, description: 'A fox companion · cosmetic, stays with you' },
  { id: 'owl', name: 'Dusk owl', type: 'pet', tier: 'large', price: 125, bonus: 0, description: 'An owl companion · cosmetic, stays with you' },
  { id: 'cat', name: 'Moon cat', type: 'pet', tier: 'special', price: 250, bonus: 0, description: 'A cat companion · cosmetic, stays with you' },
];
export const isConsumable = item => ['potion','spell'].includes(item.type);
export const itemCount = (s,id) => id==='potion' ? s.potions : (s.supplies?.[id] || (s.inventory.includes(id)?1:0));
export const preparedSpell = s => SHOP.find(i=>i.type==='spell'&&i.id===s.preparedSpell);
export function buy(s, id) {
  const item = SHOP.find(i => i.id === id);
  if (!item) throw new Error('Item not found.');
  if (!isConsumable(item) && s.inventory.includes(id)) throw new Error('You already own this.');
  if (s.gold < item.price) throw new Error('A little more gold needed.');
  s.gold -= item.price;
  if (id==='potion') s.potions++;
  else if(isConsumable(item)) { s.supplies ||= {}; s.supplies[id]=(s.supplies[id]||0)+1; }
  else {
    s.inventory.push(id);
    if(item.type==='pet') { if(!s.activePet)s.activePet=id; }
    else if (!s.equipped[item.type]) s.equipped[item.type] = id;
  }
  return item;
}
export function equip(s,id) {
  if (!s.inventory.includes(id)) throw new Error('This item is not in your inventory.');
  const item = SHOP.find(i => i.id === id);
  if(!item||isConsumable(item))throw new Error('Choose equipment or a companion.');
  if(item.type==='pet') { s.activePet=s.activePet===id?null:id; return; }
  s.equipped[item.type] = s.equipped[item.type] === id ? null : id;
}
export function prepareSpell(s,id) {
  if(!SHOP.some(i=>i.id===id&&i.type==='spell')||!itemCount(s,id))throw new Error('Buy this spell first.');
  s.preparedSpell=s.preparedSpell===id?null:id;
  return s.preparedSpell;
}
export function usePotion(s,id='potion') {
  const item=SHOP.find(i=>i.id===id&&i.type==='potion');
  if (!item||!itemCount(s,id)) throw new Error('You don’t have this potion yet.');
  if (s.hp === maxHP(s)) throw new Error('You’re already at full health.');
  const amount = id==='full-potion'?maxHP(s)-s.hp:Math.min(maxHP(s)-s.hp, Math.floor(item.bonus*healingMultiplier(s)));
  if(id==='potion')s.potions--;else s.supplies[id]--;
  s.hp += amount; s.pendingRecovery = s.hp < maxHP(s); return amount;
}
export function rollover(s,today) {
  reopenTasks(s,today);
  if (s.monster.defeatedOn && s.monster.defeatedOn < today) { s.monster.number++; s.monster.defeatedOn = null; }
}
export function monsterStats(number) {
  return { hp: Math.round(112*(1+.06*(number-1))), attack: 24+Math.floor(.8*(number-1)+.5) };
}
export function combatStats(s) {
  const spell=preparedSpell(s);
  return {
    hp: s.hp, max: maxHP(s), attack: 4*(level(s,'mind')-1)+(SHOP.find(i => i.id === s.equipped.weapon)?.bonus || 0)+(spell?.effect==='attack'?spell.bonus:0),
    armor: (SHOP.find(i => i.id === s.equipped.armor)?.bonus || 0)+(spell?.effect==='armor'?spell.bonus:0),
    dodge: 1-.88**(level(s,'soul')-1), rally: 15*(level(s,'heart')-1),
  };
}
export function victoryOdds(s) {
  const p = combatStats(s), m = monsterStats(s.monster.number);
  if (p.hp <= 0) return 0;
  const cache = new Map();
  function odds(hp, enemy, ready) {
    const key = `${hp},${enemy},${+ready}`;
    if (cache.has(key)) return cache.get(key);
    let sum = 0;
    for (let roll=10; roll<=34; roll+=2) {
      const left = enemy-roll-p.attack;
      if (left <= 0) { sum++; continue; }
      let branch = p.dodge ? p.dodge*odds(hp,left,ready) : 0;
      for (let hit=m.attack-10; hit<=m.attack+10; hit+=2) {
        let remaining = hp-Math.max(1,hit-p.armor), nextReady=ready;
        if (remaining<=0) continue;
        if (ready && p.rally && remaining <= p.max/2) { remaining=Math.min(p.max,remaining+p.rally); nextReady=false; }
        branch += (1-p.dodge)*odds(remaining,left,nextReady)/11;
      }
      sum += branch;
    }
    const result=sum/13; cache.set(key,result); return result;
  }
  return odds(p.hp,m.hp,true);
}
export function fight(s,today,rng=Math.random) {
  if (!s.hp) throw new Error('Recover some HP before fighting.');
  if (s.monster.defeatedOn) throw new Error('Your next opponent arrives tomorrow.');
  const p=combatStats(s), m=monsterStats(s.monster.number), events=[];
  const spell=preparedSpell(s);
  if(spell) { s.supplies[spell.id]--;s.preparedSpell=null; }
  let hp=p.hp, enemy=m.hp, ready=true, round=0;
  const roll=(min,count)=>min+2*Math.floor(rng()*count);
  while (hp>0 && enemy>0) {
    round++;
    const baseDamage=roll(10,13), weaponBonus=SHOP.find(i=>i.id===s.equipped.weapon)?.bonus||0;
    const damage=baseDamage+p.attack, enemyBefore=enemy; enemy=Math.max(0,enemy-damage);
    events.push({type:'attack',round,amount:damage,actualDamage:enemyBefore-enemy,baseDamage,weaponBonus,mindBonus:4*(level(s,'mind')-1),spellBonus:spell?.effect==='attack'?spell.bonus:0,hpBefore:hp,enemyBefore,hp,enemy});
    if (!enemy) break;
    if (p.dodge && rng()<p.dodge) { events.push({type:'deflect',round,amount:0,soulLevel:level(s,'soul'),hpBefore:hp,enemyBefore:enemy,hp,enemy}); continue; }
    const rawDamage=roll(m.attack-10,11), injury=Math.max(1,rawDamage-p.armor), hpBefore=hp;
    hp=Math.max(0,hp-injury);
    const spellBlock=spell?.effect==='armor'?Math.min(spell.bonus,rawDamage-injury):0;
    events.push({type:'hit',round,amount:injury,actualDamage:hpBefore-hp,rawDamage,blocked:rawDamage-injury,armorBonus:p.armor-(spell?.effect==='armor'?spell.bonus:0),spellBlock,hpBefore,enemyBefore:enemy,hp,enemy});
    if (hp && ready && p.rally && hp<=p.max/2) {
      const healed=Math.min(p.max-hp,p.rally), hpBefore=hp; hp+=healed; ready=false;
      events.push({type:'rally',round,amount:healed,heartLevel:level(s,'heart'),hpBefore,enemyBefore:enemy,hp,enemy});
    }
  }
  s.hp=hp; let loot=null;
  if (!enemy) {
    s.monster.defeatedOn=today;
    if (rng()<.75) { const gold=8+2*(s.monster.number-1); s.gold+=gold; loot={type:'gold',amount:gold}; }
    else {
      const tier=s.monster.number<=3?'basic':s.monster.number<=7?'large':'special';
      const choices=SHOP.filter(i=>i.tier===tier && ['weapon','armor'].includes(i.type) && !s.inventory.includes(i.id));
      if (!choices.length) { const gold=8+2*(s.monster.number-1); s.gold+=gold; loot={type:'gold',amount:gold}; }
      else { const item=choices[Math.floor(rng()*choices.length)]; s.inventory.push(item.id); loot={type:'equipment',id:item.id}; }
    }
  } else s.pendingRecovery=true;
  const result={id:uid(),day:today,monster:s.monster.number,won:enemy===0,loot,hp,events,spell:spell?.id||null,initialHP:p.hp,maxHP:p.max,playerName:s.name,appearance:{...(s.appearance||DEFAULT_APPEARANCE)},loadout:{...s.equipped},levels:Object.fromEntries(CATEGORIES.map(c=>[c,level(s,c)]))};
  s.battles.unshift(result); s.battles=s.battles.slice(0,50); return result;
}

// A backup reminder is due after a week without a backup or a snooze, once there is progress worth keeping.
export function backupDue(s,today,days=7) {
  const since=[s.settings.lastBackup,s.settings.backupNudge].filter(Boolean).sort().pop();
  const progress=s.gold>0||CATEGORIES.some(c=>s.xp[c]>0)||s.progress.tasks>0||s.progress.notes>0||s.battles.length>0;
  return !!since&&progress&&daysBetween(since,today)>=days;
}

export function validateState(value) {
  const s=JSON.parse(JSON.stringify(value));
  const fail=()=>{ throw new Error('This file is not a valid Twesk backup.'); };
  const integer=(n,min=0,max=1e8)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
  const text=(v,max=100000)=>typeof v==='string'&&v.length<=max;
  const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v);
  const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v));
  const array=(a,max=10000)=>Array.isArray(a)&&a.length<=max;
  if (!s||s.version!==1||!text(s.name,80)||!integer(s.gold,-1e8)||!integer(s.hp)||!s.xp||!CATEGORIES.every(k=>integer(s.xp[k]))) fail();
  if(s.appearance===undefined)s.appearance={...DEFAULT_APPEARANCE};
  if(!validAppearance(s.appearance))fail();
  if (s.hp>maxHP(s)||!array(s.tasks)||!array(s.habits,300)||!array(s.notes)||!array(s.inventory,SHOP.filter(i=>!isConsumable(i)).length)||!array(s.reviewDates)||!array(s.battles,50)) fail();
  if (!s.settings||!text(s.settings.timezone,100)||!['light','dark'].includes(s.settings.theme)||typeof s.settings.muted!=='boolean'||typeof s.settings.reducedMotion!=='boolean') fail();
  try { dateKey(new Date(),s.settings.timezone); } catch { fail(); }
  s.settings.lastBackup ??= null; s.settings.backupNudge ??= null;
  if (![s.settings.lastBackup,s.settings.backupNudge].every(v=>v===null||date(v))) fail();
  if (!s.monster||!integer(s.monster.number,1,500)||(s.monster.defeatedOn!==null&&!date(s.monster.defeatedOn))) fail();
  if (!integer(s.potions)||typeof s.pendingRecovery!=='boolean'||!s.noteGold||typeof s.noteGold!=='object'||Array.isArray(s.noteGold)) fail();
  if (!Object.entries(s.noteGold).every(([k,v])=>date(k)&&integer(v,0,6))||!s.reviewDates.every(date)) fail();
  s.supplies ??= {};s.preparedSpell ??= null;s.activePet ??= null;
  if(typeof s.supplies!=='object'||Array.isArray(s.supplies)||!Object.entries(s.supplies).every(([id,n])=>id!=='potion'&&SHOP.some(i=>i.id===id&&isConsumable(i))&&integer(n)))fail();
  if(s.preparedSpell!==null&&(!preparedSpell(s)||!itemCount(s,s.preparedSpell)))fail();
  if(s.activePet!==null&&(!s.inventory.includes(s.activePet)||!SHOP.some(i=>i.id===s.activePet&&i.type==='pet')))fail();
  if (!s.equipped||!s.inventory.every(id=>SHOP.some(i=>i.id===id&&!isConsumable(i)))||new Set(s.inventory).size!==s.inventory.length) fail();
  for(const type of ['weapon','armor']) if(s.equipped[type]!==null&&(!s.inventory.includes(s.equipped[type])||!SHOP.some(i=>i.id===s.equipped[type]&&i.type===type))) fail();
  const unique=a=>new Set(a.map(x=>x.id)).size===a.length;
  if (![s.tasks,s.habits,s.notes].every(unique)) fail();
  for(const t of s.tasks) if(!id(t.id)||!text(t.title,500)||!Object.hasOwn(TASK_GOLD,t.tier)||typeof t.done!=='boolean'||!integer(t.earned,0,40)||(t.done?t.earned!==TASK_GOLD[t.tier]:t.earned!==0)) fail();
  for(const t of s.tasks) if((t.repeat!==undefined&&!Object.hasOwn(REPEATS,t.repeat))||(t.due!=null&&!date(t.due))||(t.doneOn!==undefined&&!date(t.doneOn))||(t.repeat&&t.done&&!t.due)) fail();
  for(const h of s.habits) {
    if(h.icon!==undefined&&!validHabitIcon(h.icon))fail();
    if(!id(h.id)||!text(h.title,200)||![...CATEGORIES,'harm'].includes(h.category)||!(h.category==='harm'?[3,7,12]:[10,20,30]).includes(h.base)||!array(h.logs)||!array(h.harmLogs)) fail();
    if(!h.logs.every(l=>date(l.day)&&integer(l.xp,0,45))||new Set(h.logs.map(l=>l.day)).size!==h.logs.length||!h.harmLogs.every(l=>id(l.id)&&date(l.day)&&integer(l.damage,0,12))) fail();
  }
  for(const n of s.notes) if(!id(n.id)||!text(n.text)||(!text(n.created,100)||Number.isNaN(Date.parse(n.created)))||!integer(n.paid,0,3)||!['inbox','kept','archived'].includes(n.status)||!['note','journal'].includes(n.kind)||typeof n.healed!=='boolean') fail();
  for(const battle of s.battles) {
    if(!id(battle.id)||!date(battle.day)||!integer(battle.monster,1,500)||typeof battle.won!=='boolean'||!integer(battle.hp)||!array(battle.events,2000)||!battle.events.length) fail();
    for(const event of battle.events) {
      if(!event||!['attack','hit','deflect','rally'].includes(event.type)||!integer(event.amount)||!integer(event.hp)||!integer(event.enemy)) fail();
      for(const key of ['round','actualDamage','baseDamage','weaponBonus','mindBonus','spellBonus','spellBlock','hpBefore','enemyBefore','rawDamage','blocked','armorBonus','soulLevel','heartLevel']) if(event[key]!==undefined&&!integer(event[key])) fail();
    }
    if(battle.won) {
      if(!battle.loot||!['gold','equipment'].includes(battle.loot.type)) fail();
      if(battle.loot.type==='gold'&&!integer(battle.loot.amount)) fail();
      if(battle.loot.type==='equipment'&&!SHOP.some(i=>i.id===battle.loot.id&&['weapon','armor'].includes(i.type))) fail();
    } else if(battle.loot!==null) fail();
    if(battle.initialHP!==undefined&&!integer(battle.initialHP)) fail();
    if(battle.maxHP!==undefined&&!integer(battle.maxHP,1)) fail();
    if(battle.playerName!==undefined&&!text(battle.playerName,80)) fail();
    if(battle.appearance!==undefined&&!validAppearance(battle.appearance))fail();
    if(battle.spell!=null&&!SHOP.some(i=>i.id===battle.spell&&i.type==='spell'))fail();
    if(battle.loadout) for(const type of ['weapon','armor']) if(battle.loadout[type]!==null&&!SHOP.some(i=>i.id===battle.loadout[type]&&i.type===type)) fail();
    if(battle.levels&&!CATEGORIES.every(c=>integer(battle.levels[c],1))) fail();
  }
  const migrateProgress=s.progress===undefined,p=ensureProgress(s);
  if(!p||typeof p!=='object'||Array.isArray(p)||!integer(p.tasks)||!integer(p.notes)||!integer(p.journals)||p.journals>p.notes||!p.habits||!CATEGORIES.every(c=>integer(p.habits[c]))||!p.earned||typeof p.earned!=='object'||Array.isArray(p.earned))fail();
  if(!Object.entries(p.earned).every(([id,day])=>ACHIEVEMENTS.some(a=>a.id===id)&&date(day)))fail();
  if(migrateProgress)awardAchievements(s,dateKey(new Date(),s.settings.timezone));
  s.revision=integer(s.revision)?s.revision:0;
  return s;
}
