import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
const day=n=>`2026-10-${String(n).padStart(2,'0')}`;
const repeat=n=>Array(n).fill('word').join(' ');
const habit=(s,category='body')=>s.habits.find(h=>h.category===category);

test('starting state round-trips as a backup with no equipment and 100 HP',()=>{
  const s=E.freshState();assert.deepEqual(E.validateState(s),s);assert.equal(E.maxHP(s),100);assert.equal(s.gold,0);
  for(const c of E.CATEGORIES)assert.equal(E.level(s,c),1);
});
test('positive habits pay once per calendar day, with reversible category-only XP',()=>{
  const s=E.freshState(),h=habit(s);
  assert.equal(E.completeHabit(s,h.id,day(1)).amount,10);
  assert.throws(()=>E.completeHabit(s,h.id,day(1)));
  assert.deepEqual(s.xp,{body:10,mind:0,soul:0,heart:0});
  E.undoHabit(s,h.id,day(1));assert.equal(s.xp.body,0);
  assert.equal(E.completeHabit(s,h.id,day(1)).amount,10);
});
test('momentum grows 10/12/15 and decays 12/11/10 without HP penalties',()=>{
  const s=E.freshState(),h=habit(s);
  assert.deepEqual([1,2,3].map(d=>E.completeHabit(s,h.id,day(d)).amount),[10,12,15]);
  assert.equal(E.momentum(h,day(4)),1.5);
  assert.equal(E.momentum(h,day(5)),1.2);
  assert.equal(E.momentum(h,day(6)),1.1);
  assert.equal(E.momentum(h,day(7)),1);
  E.rollover(s,day(31));assert.equal(s.hp,100);assert.equal(s.xp.body,37);
  assert.equal(E.completeHabit(s,h.id,day(6)).amount,11);
  assert.equal(E.completeHabit(s,h.id,day(7)).amount,12);
  assert.equal(E.completeHabit(s,h.id,day(8)).amount,15);
});
test('a representative active stat levels on days 8, 14, and 21',()=>{
  const s=E.freshState(),hs=s.habits.filter(h=>h.category==='body'),ups=[];
  for(let d=1;d<=21;d++) {const before=E.level(s,'body');for(const h of hs)E.completeHabit(s,h.id,day(d));if(E.level(s,'body')>before)ups.push(d);}
  assert.deepEqual(ups,[8,14,21]);assert.equal(s.hp,E.maxHP(s));assert.equal(s.xp.mind,0);
});
test('Body level changes preserve missing health and undo reverses it',()=>{
  const s=E.freshState(),h=habit(s);s.xp.body=290;s.hp=60;
  E.completeHabit(s,h.id,day(1));assert.equal(E.maxHP(s),115);assert.equal(s.hp,75);
  E.undoHabit(s,h.id,day(1));assert.equal(E.maxHP(s),100);assert.equal(s.hp,60);
});
test('task undo reverses its original reward, including after spending',()=>{
  const s=E.freshState(),t=s.tasks[0];assert.equal(E.toggleTask(s,t.id),4);s.gold=0;
  assert.equal(E.toggleTask(s,t.id),-4);assert.equal(s.gold,-4);assert.throws(()=>E.buy(s,'potion'));
  E.toggleTask(s,t.id);assert.equal(s.gold,0);
});
test('note length pays incremental gold once with a daily six-gold cap',()=>{
  const s=E.freshState();let r=E.saveNote(s,{text:'hello'},day(1));const id=r.note.id;
  assert.equal(r.reward,1);assert.equal(E.saveNote(s,{id,text:repeat(50)},day(1)).reward,1);
  assert.equal(E.saveNote(s,{id,text:repeat(150)},day(1)).reward,1);
  assert.equal(E.saveNote(s,{id,text:'short'},day(1)).reward,0);
  assert.equal(E.saveNote(s,{id,text:repeat(150)},day(2)).reward,0);
  assert.equal(E.saveNote(s,{text:repeat(160)},day(1)).reward,3);
  assert.equal(E.saveNote(s,{text:'another'},day(1)).reward,0);
  assert.equal(s.gold,6);assert.throws(()=>E.saveNote(s,{text:' '},day(1)));
});
test('note conversion creates one task that keeps its hashtags; review pays once per day',()=>{
  const s=E.freshState(),{note}=E.saveNote(s,{text:'Buy a sketchbook #art'},day(1));
  const t=E.convertNote(s,note.id);assert.equal(t.title,'Buy a sketchbook #art');assert.deepEqual(E.tags(t.title),['#art']);assert.equal(t.inbox,true);assert.equal(note.status,'kept');
  assert.equal(E.convertNote(s,note.id).id,t.id);
  assert.equal(E.rewardReview(s,day(1)),4);assert.equal(E.rewardReview(s,day(1)),0);
});
test('Harm can be logged repeatedly, costs actual HP, and undo restores actual loss',()=>{
  const s=E.freshState(),h=habit(s,'harm');s.hp=4;
  assert.equal(E.logHarm(s,h.id,day(1)),3);assert.equal(E.logHarm(s,h.id,day(1)),1);
  assert.equal(s.hp,0);assert.equal(s.pendingRecovery,true);
  E.undoHarm(s,h.id,h.harmLogs.at(-1).id,day(1));assert.equal(s.hp,1);
  assert.equal(s.xp.body,0);assert.equal(s.gold,0);
});
test('journal recovery is capped and paid once per entry, with Heart bonuses',()=>{
  const s=E.freshState();s.hp=0;s.pendingRecovery=true;
  const r=E.saveNote(s,{text:repeat(120),recovery:true},day(1));assert.equal(r.healed,60);assert.equal(s.hp,60);assert.equal(r.note.kind,'journal');
  assert.equal(E.saveNote(s,{id:r.note.id,text:repeat(200),recovery:true},day(1)).healed,0);
  s.xp.heart=300;
  const r2=E.saveNote(s,{text:repeat(200),recovery:true},day(1));assert.equal(r2.healed,40);assert.equal(s.hp,100);
});
test('equipment prices, slots, ownership, potion spending and healing',()=>{
  const s=E.freshState();s.gold=1000;
  E.buy(s,'twig');assert.equal(s.gold,965);assert.equal(s.equipped.weapon,'twig');assert.throws(()=>E.buy(s,'twig'));
  E.buy(s,'iron');E.equip(s,'iron');assert.equal(E.combatStats(s).attack,3);assert.throws(()=>E.equip(s,'star'));
  E.buy(s,'potion');s.hp=50;s.xp.heart=300;assert.equal(E.usePotion(s),33);assert.equal(s.hp,83);assert.equal(s.potions,0);
});
test('exact combat odds match the independently verified balance draft',()=>{
  const s=E.freshState();assert.ok(Math.abs(E.victoryOdds(s)-.3353768709708887)<1e-10);
  const baseline=E.victoryOdds(s);s.inventory=['twig'];s.equipped.weapon='twig';const gear=E.victoryOdds(s);assert.ok(gear>baseline&&gear<.42);
  s.equipped.weapon=null;
  for(const cat of E.CATEGORIES){s.xp[cat]=300;s.hp=E.maxHP(s);assert.ok(E.victoryOdds(s)>gear);s.xp[cat]=0;s.hp=100;}
});
test('seeded battle sampling agrees with the displayed probability',()=>{
  let seed=3291;const rng=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
  const s=E.freshState();let wins=0;
  for(let i=0;i<10000;i++){s.hp=100;s.monster.defeatedOn=null;s.inventory=[];s.gold=0;const r=E.fight(s,day(1),rng);if(r.won)wins++;assert.ok(s.hp>=0&&s.hp<=100);}
  assert.ok(Math.abs(wins/10000-E.victoryOdds(E.freshState()))<.02);
});
test('defeat gives no loot, remains retryable after reflection, victory pays only once',()=>{
  const s=E.freshState();s.hp=1;const loss=E.fight(s,day(1),()=>0);assert.equal(loss.won,false);assert.equal(loss.loot,null);assert.equal(s.hp,0);assert.equal(s.pendingRecovery,true);
  assert.throws(()=>E.fight(s,day(1)));
  E.saveNote(s,{text:repeat(200),recovery:true},day(1));
  const rolls=[.999,0,.999,0,.999,0,.999,.9,.5];const win=E.fight(s,day(1),()=>rolls.shift()??.5);assert.equal(win.won,true);assert.equal(win.loot.type,'equipment');assert.equal(s.inventory.length,1);
  assert.throws(()=>E.fight(s,day(1)));E.rollover(s,day(1));assert.equal(s.monster.number,1);
  E.rollover(s,day(2));assert.equal(s.monster.number,2);assert.equal(s.monster.defeatedOn,null);
  E.rollover(s,day(30));assert.equal(s.monster.number,2);
});
test('timezone rollover and date gaps handle midnight and month boundaries',()=>{
  assert.equal(E.dateKey(new Date('2026-10-08T00:30:00Z'),'America/New_York'),'2026-10-07');
  assert.equal(E.dateKey(new Date('2026-10-08T00:30:00Z'),'Atlantic/Madeira'),'2026-10-08');
  assert.equal(E.daysBetween('2026-09-30','2026-10-02'),2);
});
test('invalid backups are rejected without touching current progress',()=>{
  for(const change of [s=>s.hp=1000,s=>s.xp.body=-1,s=>s.settings.timezone='nonsense',s=>s.inventory=['unknown'],s=>s.tasks[0].tier='unknown',s=>s.habits[0].logs=[{day:'bad',xp:10}],s=>s.notes=[{id:'bad',text:'hello'}]]){
    const s=E.freshState();change(s);assert.throws(()=>E.validateState(s));
  }
});

test('archiving a kept note works without paying another review reward',()=>{
  const s=E.freshState(),{note}=E.saveNote(s,{text:'Keep this idea'},day(1));
  E.reviewNote(s,note.id,'kept',day(1));const gold=s.gold;
  E.reviewNote(s,note.id,'archived',day(2));assert.equal(note.status,'archived');assert.equal(s.gold,gold);
});
test('backup identifiers and note dates cannot break markup or rendering',()=>{
  const s=E.freshState();s.tasks[0].id='a" onclick="bad';assert.throws(()=>E.validateState(s));
  const t=E.freshState();E.saveNote(t,{text:'Hi'},day(1));t.notes[0].created='not a date';assert.throws(()=>E.validateState(t));
});

test('new saves use the device timezone and older saves keep theirs',()=>{
  const s=E.freshState();assert.equal(s.settings.timezone,E.deviceTimezone());assert.doesNotThrow(()=>E.dateKey(new Date(),s.settings.timezone));
  const old=E.freshState();old.settings.timezone='Atlantic/Madeira';delete old.settings.lastBackup;delete old.settings.backupNudge;
  const restored=E.validateState(JSON.parse(JSON.stringify(old)));
  assert.equal(restored.settings.timezone,'Atlantic/Madeira');assert.equal(restored.settings.lastBackup,null);assert.equal(restored.settings.backupNudge,null);
  for(const bad of ['yesterday',42])assert.throws(()=>E.validateState({...E.freshState(),settings:{...E.freshState().settings,lastBackup:bad}}));
});
test('backup reminders wait a week, need progress, and reset after export or snooze',()=>{
  const s=E.freshState();s.settings.backupNudge=day(1);
  assert.equal(E.backupDue(s,day(10)),false,'nothing to lose yet');
  E.completeHabit(s,habit(s).id,day(1));
  assert.equal(E.backupDue(s,day(7)),false);assert.equal(E.backupDue(s,day(8)),true);
  s.settings.lastBackup=day(8);assert.equal(E.backupDue(s,day(14)),false);assert.equal(E.backupDue(s,day(15)),true);
  s.settings.backupNudge=day(15);assert.equal(E.backupDue(s,day(21)),false);assert.equal(E.backupDue(s,day(22)),true);
  const unstarted=E.freshState();unstarted.gold=50;assert.equal(E.backupDue(unstarted,day(30)),false,'clock starts when the app first opens');
});

test('recurring tasks pay each completion and reopen on their next date without piling up',()=>{
  const s=E.freshState(),t=E.saveTask(s,{title:'Water plants #home',tier:'quick',repeat:'daily'},day(1));
  assert.equal(E.toggleTask(s,t.id,day(1)),4);assert.equal(t.due,day(2));assert.equal(s.progress.tasks,1);
  E.rollover(s,day(1));assert.equal(t.done,true,'stays done today');
  E.rollover(s,day(5));assert.equal(t.done,false);assert.equal(t.earned,0);assert.equal(s.gold,4,'earned gold stays');
  assert.equal(E.toggleTask(s,t.id,day(5)),4);assert.equal(s.gold,8);assert.equal(s.progress.tasks,2);
  assert.equal(E.toggleTask(s,t.id,day(5)),-4);assert.equal(t.due,null);assert.equal(s.gold,4);
  assert.doesNotThrow(()=>E.validateState(JSON.parse(JSON.stringify(s))));
});
test('repeat schedules handle weekends and short months',()=>{
  assert.equal(E.nextOccurrence('2026-10-09','weekdays'),'2026-10-12');
  assert.equal(E.nextOccurrence('2026-10-12','weekdays'),'2026-10-13');
  assert.equal(E.nextOccurrence('2026-10-08','weekly'),'2026-10-15');
  assert.equal(E.nextOccurrence('2026-01-31','monthly'),'2026-02-28');
  assert.equal(E.nextOccurrence('2026-12-31','daily'),'2027-01-01');
});
test('editing a task sets or clears its repeat, and project tags are case-insensitive',()=>{
  const s=E.freshState(),t=s.tasks[0];E.toggleTask(s,t.id,day(3));
  E.saveTask(s,{id:t.id,title:t.title,tier:'hard',repeat:'weekly'},day(4));assert.equal(t.repeat,'weekly');assert.equal(t.due,day(10));assert.equal(t.tier,'quick','done tasks keep their tier');
  E.saveTask(s,{id:t.id,title:t.title,tier:'quick',repeat:null},day(4));assert.equal(t.repeat,undefined);assert.equal(t.due,undefined);
  assert.deepEqual(E.tags('Plan #Trip and book #trip #Hotel-2'),['#trip','#hotel-2']);
  assert.throws(()=>E.saveTask(s,{title:'x',tier:'quick',repeat:'hourly'},day(4)));
  for(const change of [x=>x.tasks[0].repeat='hourly',x=>x.tasks[0].due='soon',x=>{x.tasks[0].repeat='daily';x.tasks[0].done=true;x.tasks[0].earned=4;}]){
    const bad=E.freshState();change(bad);assert.throws(()=>E.validateState(bad));
  }
});

test('shared odds estimate matches exact odds early and compares loadouts without changing the save',()=>{
  const s=E.freshState();assert.equal(E.estimateOdds(E.oddsInput(s)),E.victoryOdds(s));
  const blade=E.SHOP.find(i=>i.id==='iron'),ward=E.SHOP.find(i=>i.id==='ward');
  const armed=E.withItem(s,blade);assert.equal(E.combatStats(armed).attack,3);assert.equal(s.equipped.weapon,null,'original untouched');
  assert.ok(E.estimateOdds(armed)>E.estimateOdds(s));
  assert.equal(E.combatStats(E.withItem(s,ward)).armor,3);assert.equal(s.preparedSpell,null);
  const late=E.freshState();late.monster.number=40;late.xp.body=3000;late.hp=E.maxHP(late);
  const odds=E.estimateOdds(E.oddsInput(late));assert.ok(odds>=0&&odds<=1);assert.equal(E.estimateOdds(E.oddsInput(late)),odds,'sampling is deterministic');
});
test('habit details report next reward, streak, totals, and a dated history',()=>{
  const s=E.freshState(),h=s.habits.find(h=>h.base===10&&h.category==='body');
  for(const d of [3,4,5])E.completeHabit(s,h.id,day(d));
  let st=E.habitStats(h,day(6));assert.equal(st.streak,3,'yesterday keeps the streak');assert.equal(st.next,15);assert.equal(st.factor,1.5);assert.equal(st.doneToday,false);
  E.completeHabit(s,h.id,day(6));st=E.habitStats(h,day(6));assert.equal(st.streak,4);assert.equal(st.doneToday,true);assert.equal(st.next,15,'tomorrow keeps momentum');
  assert.equal(st.total,4);assert.equal(st.earned,10+12+15+15);assert.equal(st.history.length,28);assert.equal(st.history.at(-1).day,day(6));assert.equal(st.history.at(-1).count,1);
  assert.equal(E.habitStats(h,day(9)).streak,0);assert.equal(E.habitStats(h,day(9)).next,11,'two missed days lower momentum two steps');
  const harm=s.habits.find(h=>h.category==='harm');E.logHarm(s,harm.id,day(6));E.logHarm(s,harm.id,day(6));
  const hs=E.habitStats(harm,day(6));assert.equal(hs.harm,true);assert.equal(hs.history.at(-1).count,2);assert.equal(hs.earned,2*harm.base);
});
test('notes can be pinned and unpinned, and pins survive backups',()=>{
  const s=E.freshState(),{note}=E.saveNote(s,{text:'Important #plan'},day(1));
  assert.equal(E.togglePin(s,note.id),true);assert.equal(E.validateState(JSON.parse(JSON.stringify(s))).notes[0].pinned,true);
  assert.equal(E.togglePin(s,note.id),false);assert.equal(note.pinned,undefined);
  note.pinned='yes';assert.throws(()=>E.validateState(s));
});
test('a task moved back to the Vault becomes an inbox note and returns intact',()=>{
  const s=E.freshState(),t=E.saveTask(s,{title:'Fix the #home shelf',tier:'hard',repeat:'weekly'},day(1)),gold=s.gold,notes=s.progress.notes;
  const {note,undo}=E.returnTaskToVault(s,t.id);
  assert.ok(!s.tasks.some(x=>x.id===t.id));assert.equal(note.status,'inbox');assert.equal(note.text,'Fix the #home shelf');
  assert.equal(s.gold,gold,'no note gold');assert.equal(s.progress.notes,notes,'no Vault progress');
  assert.doesNotThrow(()=>E.validateState(JSON.parse(JSON.stringify(s))));
  const back=E.convertNote(s,note.id);
  assert.equal(back.title,'Fix the #home shelf');assert.equal(back.tier,'hard');assert.equal(back.repeat,'weekly');assert.equal(note.taskTitle,undefined);
  const {undo:u2}=E.returnTaskToVault(s,back.id);E.undoReturnTaskToVault(s,u2);
  assert.equal(s.tasks[0].id,back.id);assert.equal(s.notes.filter(n=>n.id===note.id)[0].status,'kept','the source note is linked again');
  assert.throws(()=>E.undoReturnTaskToVault(s,undo),/changed|already/);
});
test('a task made from a note reopens that note, and completed tasks cannot move back',()=>{
  const s=E.freshState(),{note}=E.saveNote(s,{text:'Plan the trip\nCheck trains and hotels #travel'},day(1));
  const t=E.convertNote(s,note.id);E.reviewNote(s,note.id,'kept',day(1));
  const {note:back}=E.returnTaskToVault(s,t.id);
  assert.equal(back.id,note.id);assert.equal(back.status,'inbox');assert.equal(back.taskId,undefined);assert.match(back.text,/hotels/,'the full original note returns');
  const done=s.tasks[0];E.toggleTask(s,done.id,day(2));assert.throws(()=>E.returnTaskToVault(s,done.id),/Completed/);
  const bad=E.freshState();E.saveNote(bad,{text:'x'},day(1));bad.notes[0].taskTier='huge';assert.throws(()=>E.validateState(bad));
});
