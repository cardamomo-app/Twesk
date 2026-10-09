import {APPEARANCE,DEFAULT_APPEARANCE,appearanceOption,validAppearance} from './appearance.js';
import {createProgress,ensureProgress,awardAchievements,ACHIEVEMENTS} from './achievements.js?v=0.10.0';
import {validHabitIcon} from './habit-icons.js?v=0.10.0';
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
export const maxHP = s => 100 + 15 * (level(s, 'body') - 1) + (SHOP.find(i => i.id === s.equipped?.helmet)?.bonus || 0);
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
    notes: [], noteGold: {}, reviewDates: [], inventory: [], equipped: { weapon: null, armor: null, helmet: null }, potions: 0,
    supplies: {}, preparedSpell: null, tonic: null, activePet: null, wardrobe: [],
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
// Summary for the habit details view: next reward, streak, totals, and the last `days` days.
export function habitStats(h, today, days = 28) {
  const harm = h.category === 'harm', logs = harm ? h.harmLogs : h.logs;
  const counts = new Map(); for (const l of logs) counts.set(l.day, (counts.get(l.day) || 0) + 1);
  const shift = (day, n) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const doneToday = counts.has(today), nextDay = doneToday && !harm ? shift(today, 1) : today;
  let streak = 0; for (let day = doneToday ? today : shift(today, -1); counts.has(day); day = shift(day, -1)) streak++;
  const factor = harm ? 1 : momentum(h, nextDay);
  return {
    harm, doneToday, streak, factor, next: harm ? h.base : Math.round(h.base * factor),
    total: logs.length, earned: harm ? logs.reduce((n, l) => n + l.damage, 0) : logs.reduce((n, l) => n + l.xp, 0),
    history: Array.from({ length: days }, (_, i) => { const day = shift(today, i - days + 1); return { day, count: counts.get(day) || 0 }; }),
  };
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
export function togglePin(s, id) {
  const note = s.notes.find(n => n.id === id);
  if (!note) throw new Error('Note not found.');
  if (note.pinned) delete note.pinned; else note.pinned = true;
  return !!note.pinned;
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
  { id: 'ember', name: 'Ember spell', type: 'spell', tier: 'basic', price: 20, bonus: 3, effect: 'attack', boosts: { attack: 3 }, description: '+3 damage on every attack in your next fight' },
  { id: 'ward', name: 'Stone ward', type: 'spell', tier: 'large', price: 25, bonus: 3, effect: 'armor', boosts: { armor: 3 }, description: 'Block 3 extra damage on every hit in your next fight' },
  { id: 'storm', name: 'Storm lance', type: 'spell', tier: 'special', price: 45, boosts: { attack: 6 }, description: '+6 damage on every attack in your next fight' },
  { id: 'starfall', name: 'Starfall', type: 'spell', tier: 'legendary', price: 60, boosts: { attack: 4, armor: 2 }, description: '+4 damage and block 2 on every hit in your next fight' },
  { id: 'swift-tonic', name: 'Swiftness tonic', type: 'potion', tonic: true, tier: 'large', price: 35, bonus: 0, boosts: { dodge: .1 }, description: '+10% deflect chance for your next fight · stacks with a spell' },
  { id: 'fort-tonic', name: 'Fortitude tonic', type: 'potion', tonic: true, tier: 'special', price: 25, bonus: 0, boosts: { rally: 15 }, description: '+15 HP to your rally for your next fight · works at any Heart level' },
  { id: 'fox', name: 'Fern fox', type: 'pet', tier: 'basic', price: 80, bonus: 0, boosts: { dodge: .04 }, description: 'Keen ears · +4% deflect chance' },
  { id: 'owl', name: 'Dusk owl', type: 'pet', tier: 'large', price: 125, bonus: 0, boosts: { attack: 3 }, description: 'Spots openings · +3 attack' },
  { id: 'tortoise', name: 'Stone tortoise', type: 'pet', tier: 'large', price: 150, bonus: 0, boosts: { armor: 3 }, description: 'Shell guard · blocks 3 per hit' },
  { id: 'cat', name: 'Moon cat', type: 'pet', tier: 'special', price: 250, bonus: 0, boosts: { rally: 20 }, description: 'Purrs you back up · +20 HP rally, even at Heart 1' },
  { id: 'drake', name: 'Ember drake', type: 'pet', tier: 'legendary', price: 600, bonus: 0, boosts: { attack: 5 }, description: 'Breathes fire alongside you · +5 attack' },
  { id: 'cap', name: 'Leather cap', type: 'helmet', tier: 'basic', price: 35, bonus: 5, description: '+5 maximum HP · snug and simple' },
  { id: 'helm', name: 'Ironwood helm', type: 'helmet', tier: 'large', price: 125, bonus: 12, description: '+12 maximum HP · cheek guards included' },
  { id: 'starhelm', name: 'Starlit helm', type: 'helmet', tier: 'special', price: 250, bonus: 20, description: '+20 maximum HP · crested and gleaming' },
  { id: 'crown', name: 'Sunforged crown', type: 'helmet', tier: 'legendary', price: 600, bonus: 32, description: '+32 maximum HP · fit for a legend' },
  { id: 'dawn', name: 'Dawnbreaker', type: 'weapon', tier: 'legendary', price: 600, bonus: 8, description: '+8 attack · forged at first light' },
  { id: 'sunplate', name: 'Sunforged plate', type: 'armor', tier: 'legendary', price: 600, bonus: 8, description: 'Reduce each hit by 8 · with a crimson cape' },
];
export const isConsumable = item => ['potion','spell'].includes(item.type);
export const itemCount = (s,id) => id==='potion' ? s.potions : (s.supplies?.[id] || (s.inventory.includes(id)?1:0));
export const preparedSpell = s => SHOP.find(i=>i.type==='spell'&&i.id===s.preparedSpell);
export const activeTonic = s => SHOP.find(i=>i.tonic&&i.id===s.tonic);
export const activePetItem = s => SHOP.find(i=>i.type==='pet'&&i.id===s.activePet);
export const GEAR_SLOTS = ['weapon','armor','helmet'];
// Equipping or removing a helmet shifts current HP with the maximum, like a Body level-up.
function setGear(s,type,id) {
  const before=maxHP(s); s.equipped[type]=id;
  if(type==='helmet'&&s.hp>0) s.hp=Math.max(1,Math.min(maxHP(s),s.hp+maxHP(s)-before));
}
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
    else if (!s.equipped[item.type]) setGear(s,item.type,id);
  }
  return item;
}
export function equip(s,id) {
  if (!s.inventory.includes(id)) throw new Error('This item is not in your inventory.');
  const item = SHOP.find(i => i.id === id);
  if(!item||isConsumable(item))throw new Error('Choose equipment or a companion.');
  if(item.type==='pet') { s.activePet=s.activePet===id?null:id; return; }
  setGear(s,item.type,s.equipped[item.type] === id ? null : id);
}
// Cosmetics: priced appearance options are bought once into the wardrobe, as "key:id".
export const cosmeticKey = (key,id) => `${key}:${id}`;
export const ownableCosmetic = entry => { const [key,id]=String(entry).split(':'); return !!appearanceOption(key,id)?.price; };
export const cosmeticOwned = (s,key,id) => !appearanceOption(key,id)?.price || (s.wardrobe||[]).includes(cosmeticKey(key,id));
export const appearanceUnlocked = (s,look) => Object.keys(APPEARANCE).every(key=>cosmeticOwned(s,key,{...DEFAULT_APPEARANCE,...look}[key]));
export function buyCosmetic(s,key,id) {
  const option=appearanceOption(key,id);
  if(!option?.price) throw new Error('This style is already free to wear.');
  if(cosmeticOwned(s,key,id)) throw new Error('You already own this style.');
  if(s.gold<option.price) throw new Error('A little more gold needed.');
  s.gold-=option.price; s.wardrobe.push(cosmeticKey(key,id)); s.appearance[key]=id;
  return option;
}
export function setAppearance(s,key,id) {
  if(!appearanceOption(key,id)) throw new Error('Unknown style.');
  if(!cosmeticOwned(s,key,id)) throw new Error('Buy this style first.');
  s.appearance[key]=id;
}
export function prepareSpell(s,id) {
  if(!SHOP.some(i=>i.id===id&&i.type==='spell')||!itemCount(s,id))throw new Error('Buy this spell first.');
  s.preparedSpell=s.preparedSpell===id?null:id;
  return s.preparedSpell;
}
export function usePotion(s,id='potion') {
  const item=SHOP.find(i=>i.id===id&&i.type==='potion');
  if (!item||!itemCount(s,id)) throw new Error('You don’t have this potion yet.');
  if (item.tonic) {
    if (s.tonic) throw new Error(`${activeTonic(s).name} is already active for your next fight.`);
    s.supplies[id]--; s.tonic=id; return 0;
  }
  if (s.hp === maxHP(s)) throw new Error('You’re already at full health.');
  const amount = id==='full-potion'?maxHP(s)-s.hp:Math.min(maxHP(s)-s.hp, Math.floor(item.bonus*healingMultiplier(s)));
  if(id==='potion')s.potions--;else s.supplies[id]--;
  s.hp += amount; s.pendingRecovery = s.hp < maxHP(s); return amount;
}
export function rollover(s,today) {
  reopenTasks(s,today);
  if (s.monster.defeatedOn && s.monster.defeatedOn < today) { s.monster.number++; s.monster.defeatedOn = null; }
}
// Soul deflect chance rises quickly at first and levels off below 50%, so late fights stay real.
export const soulDeflect = soulLevel => .5*(1-.76**(soulLevel-1));
// Gold loot grows with each monster until #17, then holds at a quest-sized 40.
export const monsterGold = number => 8+2*Math.min(number-1,16);
export function monsterStats(number) {
  return { hp: Math.round(112*(1+.06*(number-1))), attack: 24+Math.floor(.8*(number-1)+.5) };
}
// Bonuses from the prepared spell, active tonic, and companion, by source and in total.
export function boostSources(s) {
  return { spell: preparedSpell(s)?.boosts || {}, tonic: activeTonic(s)?.boosts || {}, pet: activePetItem(s)?.boosts || {} };
}
const boostTotal = (s,key) => Object.values(boostSources(s)).reduce((n,b)=>n+(b[key]||0),0);
export function combatStats(s) {
  return {
    hp: s.hp, max: maxHP(s), attack: 4*(level(s,'mind')-1)+(SHOP.find(i => i.id === s.equipped.weapon)?.bonus || 0)+boostTotal(s,'attack'),
    armor: (SHOP.find(i => i.id === s.equipped.armor)?.bonus || 0)+boostTotal(s,'armor'),
    dodge: Math.min(.75, soulDeflect(level(s,'soul'))+boostTotal(s,'dodge')), rally: 15*(level(s,'heart')-1)+boostTotal(s,'rally'),
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
// Exact odds for early encounters; a fixed-seed sample of the same rules keeps larger ones responsive.
export function estimateOdds(s) {
  const p=combatStats(s), m=monsterStats(s.monster.number);
  if(p.max<200 && m.hp<200) return victoryOdds(s);
  let wins=0, seed=123456789;
  const rng=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<15000;i++) {
    let hp=p.hp, enemy=m.hp, ready=true;
    while(hp>0&&enemy>0) {
      enemy-=10+2*Math.floor(rng()*13)+p.attack;
      if(enemy<=0) {wins++;break;}
      if(rng()<p.dodge) continue;
      hp-=Math.max(1,m.attack-10+2*Math.floor(rng()*11)-p.armor);
      if(hp>0&&ready&&p.rally&&hp<=p.max/2) {hp=Math.min(p.max,hp+p.rally);ready=false;}
    }
  }
  return wins/15000;
}
// The combat-relevant state with `item` equipped or prepared, for before/after comparisons.
export function withItem(s,item) {
  const next={...s,equipped:{...s.equipped}};
  if(item.type==='spell') next.preparedSpell=item.id;
  else if(item.tonic) next.tonic=item.id;
  else if(item.type==='pet') next.activePet=item.id;
  else { next.equipped[item.type]=item.id; if(item.type==='helmet') next.hp=Math.min(maxHP(next),s.hp+maxHP(next)-maxHP(s)); }
  return next;
}
export const oddsInput = s => ({hp:s.hp,xp:s.xp,equipped:s.equipped,preparedSpell:s.preparedSpell,tonic:s.tonic??null,activePet:s.activePet??null,monster:{number:s.monster.number}});
export function fight(s,today,rng=Math.random) {
  if (!s.hp) throw new Error('Recover some HP before fighting.');
  if (s.monster.defeatedOn) throw new Error('Your next opponent arrives tomorrow.');
  const p=combatStats(s), m=monsterStats(s.monster.number), events=[];
  const spell=preparedSpell(s), tonic=activeTonic(s), pet=activePetItem(s), boosts=boostSources(s);
  if(spell) { s.supplies[spell.id]--;s.preparedSpell=null; }
  if(tonic) s.tonic=null;
  let hp=p.hp, enemy=m.hp, ready=true, round=0;
  const roll=(min,count)=>min+2*Math.floor(rng()*count);
  while (hp>0 && enemy>0) {
    round++;
    const baseDamage=roll(10,13), weaponBonus=SHOP.find(i=>i.id===s.equipped.weapon)?.bonus||0;
    const damage=baseDamage+p.attack, enemyBefore=enemy; enemy=Math.max(0,enemy-damage);
    events.push({type:'attack',round,amount:damage,actualDamage:enemyBefore-enemy,baseDamage,weaponBonus,mindBonus:4*(level(s,'mind')-1),spellBonus:boosts.spell.attack||0,petBonus:boosts.pet.attack||0,hpBefore:hp,enemyBefore,hp,enemy});
    if (!enemy) break;
    if (p.dodge && rng()<p.dodge) { events.push({type:'deflect',round,amount:0,soulLevel:level(s,'soul'),hpBefore:hp,enemyBefore:enemy,hp,enemy}); continue; }
    const rawDamage=roll(m.attack-10,11), injury=Math.max(1,rawDamage-p.armor), hpBefore=hp;
    hp=Math.max(0,hp-injury);
    // Attribute blocked damage: spell first, then companion, then armor.
    const blocked=rawDamage-injury, spellBlock=Math.min(boosts.spell.armor||0,blocked), petBlock=Math.min(boosts.pet.armor||0,blocked-spellBlock);
    events.push({type:'hit',round,amount:injury,actualDamage:hpBefore-hp,rawDamage,blocked,armorBonus:p.armor-(boosts.spell.armor||0)-(boosts.pet.armor||0),spellBlock,petBlock,hpBefore,enemyBefore:enemy,hp,enemy});
    if (hp && ready && p.rally && hp<=p.max/2) {
      const healed=Math.min(p.max-hp,p.rally), hpBefore=hp; hp+=healed; ready=false;
      events.push({type:'rally',round,amount:healed,heartLevel:level(s,'heart'),hpBefore,enemyBefore:enemy,hp,enemy});
    }
  }
  s.hp=hp; let loot=null;
  if (!enemy) {
    s.monster.defeatedOn=today;
    if (rng()<.75) { const gold=monsterGold(s.monster.number); s.gold+=gold; loot={type:'gold',amount:gold}; }
    else {
      const tier=s.monster.number<=3?'basic':s.monster.number<=7?'large':'special'; // legendary gear is gold-only
      const choices=SHOP.filter(i=>i.tier===tier && GEAR_SLOTS.includes(i.type) && !s.inventory.includes(i.id));
      if (!choices.length) { const gold=monsterGold(s.monster.number); s.gold+=gold; loot={type:'gold',amount:gold}; }
      else { const item=choices[Math.floor(rng()*choices.length)]; s.inventory.push(item.id); loot={type:'equipment',id:item.id}; }
    }
  } else s.pendingRecovery=true;
  const result={id:uid(),day:today,monster:s.monster.number,won:enemy===0,loot,hp,events,spell:spell?.id||null,tonic:tonic?.id||null,pet:pet?.id||null,initialHP:p.hp,maxHP:p.max,playerName:s.name,appearance:{...(s.appearance||DEFAULT_APPEARANCE)},loadout:{...s.equipped},levels:Object.fromEntries(CATEGORIES.map(c=>[c,level(s,c)]))};
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
  s.appearance={...DEFAULT_APPEARANCE,...s.appearance};
  if (s.hp>maxHP(s)||!array(s.tasks)||!array(s.habits,300)||!array(s.notes)||!array(s.inventory,SHOP.filter(i=>!isConsumable(i)).length)||!array(s.reviewDates)||!array(s.battles,50)) fail();
  if (!s.settings||!text(s.settings.timezone,100)||!['light','dark'].includes(s.settings.theme)||typeof s.settings.muted!=='boolean'||typeof s.settings.reducedMotion!=='boolean') fail();
  try { dateKey(new Date(),s.settings.timezone); } catch { fail(); }
  s.settings.lastBackup ??= null; s.settings.backupNudge ??= null;
  if (![s.settings.lastBackup,s.settings.backupNudge].every(v=>v===null||date(v))) fail();
  if (!s.monster||!integer(s.monster.number,1,500)||(s.monster.defeatedOn!==null&&!date(s.monster.defeatedOn))) fail();
  if (!integer(s.potions)||typeof s.pendingRecovery!=='boolean'||!s.noteGold||typeof s.noteGold!=='object'||Array.isArray(s.noteGold)) fail();
  if (!Object.entries(s.noteGold).every(([k,v])=>date(k)&&integer(v,0,6))||!s.reviewDates.every(date)) fail();
  s.supplies ??= {};s.preparedSpell ??= null;s.activePet ??= null;s.tonic ??= null;s.wardrobe ??= [];if(s.equipped&&s.equipped.helmet===undefined)s.equipped.helmet=null;
  if(typeof s.supplies!=='object'||Array.isArray(s.supplies)||!Object.entries(s.supplies).every(([id,n])=>id!=='potion'&&SHOP.some(i=>i.id===id&&isConsumable(i))&&integer(n)))fail();
  if(s.preparedSpell!==null&&(!preparedSpell(s)||!itemCount(s,s.preparedSpell)))fail();
  if(s.activePet!==null&&(!s.inventory.includes(s.activePet)||!SHOP.some(i=>i.id===s.activePet&&i.type==='pet')))fail();
  if (!s.equipped||!s.inventory.every(id=>SHOP.some(i=>i.id===id&&!isConsumable(i)))||new Set(s.inventory).size!==s.inventory.length) fail();
  if(s.tonic!==null&&!activeTonic(s))fail();
  if(!Array.isArray(s.wardrobe)||!s.wardrobe.every(ownableCosmetic)||new Set(s.wardrobe).size!==s.wardrobe.length||!appearanceUnlocked(s,s.appearance))fail();
  for(const type of GEAR_SLOTS) if(s.equipped[type]!==null&&(!s.inventory.includes(s.equipped[type])||!SHOP.some(i=>i.id===s.equipped[type]&&i.type===type))) fail();
  const unique=a=>new Set(a.map(x=>x.id)).size===a.length;
  if (![s.tasks,s.habits,s.notes].every(unique)) fail();
  for(const t of s.tasks) if(!id(t.id)||!text(t.title,500)||!Object.hasOwn(TASK_GOLD,t.tier)||typeof t.done!=='boolean'||!integer(t.earned,0,40)||(t.done?t.earned!==TASK_GOLD[t.tier]:t.earned!==0)) fail();
  for(const t of s.tasks) if((t.repeat!==undefined&&!Object.hasOwn(REPEATS,t.repeat))||(t.due!=null&&!date(t.due))||(t.doneOn!==undefined&&!date(t.doneOn))||(t.repeat&&t.done&&!t.due)) fail();
  for(const h of s.habits) {
    if(h.icon!==undefined&&!validHabitIcon(h.icon))fail();
    if(!id(h.id)||!text(h.title,200)||![...CATEGORIES,'harm'].includes(h.category)||!(h.category==='harm'?[3,7,12]:[10,20,30]).includes(h.base)||!array(h.logs)||!array(h.harmLogs)) fail();
    if(!h.logs.every(l=>date(l.day)&&integer(l.xp,0,45))||new Set(h.logs.map(l=>l.day)).size!==h.logs.length||!h.harmLogs.every(l=>id(l.id)&&date(l.day)&&integer(l.damage,0,12))) fail();
  }
  for(const n of s.notes) if(!id(n.id)||!text(n.text)||(!text(n.created,100)||Number.isNaN(Date.parse(n.created)))||!integer(n.paid,0,3)||!['inbox','kept','archived'].includes(n.status)||!['note','journal'].includes(n.kind)||typeof n.healed!=='boolean'||(n.pinned!==undefined&&n.pinned!==true)) fail();
  for(const battle of s.battles) {
    if(!id(battle.id)||!date(battle.day)||!integer(battle.monster,1,500)||typeof battle.won!=='boolean'||!integer(battle.hp)||!array(battle.events,2000)||!battle.events.length) fail();
    for(const event of battle.events) {
      if(!event||!['attack','hit','deflect','rally'].includes(event.type)||!integer(event.amount)||!integer(event.hp)||!integer(event.enemy)) fail();
      for(const key of ['round','actualDamage','baseDamage','weaponBonus','mindBonus','spellBonus','spellBlock','hpBefore','enemyBefore','rawDamage','blocked','armorBonus','soulLevel','heartLevel']) if(event[key]!==undefined&&!integer(event[key])) fail();
    }
    if(battle.won) {
      if(!battle.loot||!['gold','equipment'].includes(battle.loot.type)) fail();
      if(battle.loot.type==='gold'&&!integer(battle.loot.amount)) fail();
      if(battle.loot.type==='equipment'&&!SHOP.some(i=>i.id===battle.loot.id&&GEAR_SLOTS.includes(i.type))) fail();
    } else if(battle.loot!==null) fail();
    if(battle.initialHP!==undefined&&!integer(battle.initialHP)) fail();
    if(battle.maxHP!==undefined&&!integer(battle.maxHP,1)) fail();
    if(battle.playerName!==undefined&&!text(battle.playerName,80)) fail();
    if(battle.appearance!==undefined&&!validAppearance(battle.appearance))fail();
    if(battle.spell!=null&&!SHOP.some(i=>i.id===battle.spell&&i.type==='spell'))fail();
    if(battle.tonic!=null&&!SHOP.some(i=>i.id===battle.tonic&&i.tonic))fail();
    if(battle.pet!=null&&!SHOP.some(i=>i.id===battle.pet&&i.type==='pet'))fail();
    if(battle.loadout) for(const type of GEAR_SLOTS) if(battle.loadout[type]!=null&&!SHOP.some(i=>i.id===battle.loadout[type]&&i.type===type)) fail();
    if(battle.levels&&!CATEGORIES.every(c=>integer(battle.levels[c],1))) fail();
  }
  const migrateProgress=s.progress===undefined,p=ensureProgress(s);
  if(!p||typeof p!=='object'||Array.isArray(p)||!integer(p.tasks)||!integer(p.notes)||!integer(p.journals)||p.journals>p.notes||!p.habits||!CATEGORIES.every(c=>integer(p.habits[c]))||!p.earned||typeof p.earned!=='object'||Array.isArray(p.earned))fail();
  if(!Object.entries(p.earned).every(([id,day])=>ACHIEVEMENTS.some(a=>a.id===id)&&date(day)))fail();
  if(migrateProgress)awardAchievements(s,dateKey(new Date(),s.settings.timezone));
  s.revision=integer(s.revision)?s.revision:0;
  return s;
}
