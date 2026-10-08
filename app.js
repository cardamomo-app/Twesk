import * as E from './engine.js?v=0.7.4';
import {avatarArt,avatarFaceArt,monsterArt,monsterName,itemArt,goldArt} from './art.js?v=0.7.4';
import {HABIT_ICONS,habitIconChoice,resolvedHabitIcon,validHabitIcon} from './habit-icons.js?v=0.7.4';
import {ACHIEVEMENTS,awardAchievements} from './achievements.js?v=0.7.0';
import {badgeArt} from './badge-art.js?v=0.7.0';
import {collectionBody} from './collection-view.js?v=0.7.4';
import {APPEARANCE} from './appearance.js';
import {describeCombatEvent} from './combat-presentation.js?v=0.6.0';
import {createCombatAudio} from './combat-audio.js';
import {playCoinSound} from './coin-sound.js';
import {PREVIOUS_SAVE_KEY,resetProgress,restorePreviousProgress} from './save-recovery.js?v=0.7.4';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY='twesk.v1';
const statTooltip=document.createElement('div');statTooltip.id='stat-tooltip';statTooltip.className='stat-tooltip';statTooltip.setAttribute('role','tooltip');statTooltip.hidden=true;document.body.append(statTooltip);
let statTipButton=null,statTipPinned=false,statTipHideTimer=0;
let rawSave=null;
let state, saveError=false, startupWarning='', taskView='active', vaultFilter='inbox', vaultSearch='', modal=null, busy=false, pendingImport=null;
let openCategories=new Set(['body']), chance=null, chanceKey='', lastDay='';
let avatarAngle=-.45,avatarZoom=1;
let shopCategory='weapon';
let collectionTab='seals',sealFilter='all',earnedOnly=false,monsterChapter=1,selectedMonster=1,pendingBadges=[];
const shopTabs=[['weapon','Weapons','sword'],['armor','Armor','shield'],['potion','Potions','heart'],['spell','Spells','soul'],['pet','Pets','pet']];
try { rawSave=localStorage.getItem(KEY); state=rawSave?E.validateState(JSON.parse(rawSave)):E.freshState(); }
catch { state=E.freshState(); startupWarning='Your previous save could not be read. It has been left untouched. Export a backup before replacing it.'; saveError=true; }
let protectSave=!!startupWarning;
const today=()=>E.dateKey(new Date(),state.settings.timezone);
function persist() {
  state.revision=(state.revision||0)+1;
  if(protectSave) return;
  try {localStorage.setItem(KEY,JSON.stringify(state));saveError=false;}catch {saveError=true;toast('Saving is unavailable. Export a backup to keep your progress.');}
}
function commit(fn,{deferBadges=false}={}) {
  if(busy) return;
  // Only commit a complete successful transaction.
  const previous=structuredClone(state);
  try {
    const result=fn(),newBadges=awardAchievements(state,today());render();persist();
    if(deferBadges)pendingBadges.push(...newBadges);else announceBadges(newBadges);
    return result;
  }catch(error){state=previous;toast(error.message);return undefined;}
}
const icons={
  plus:'<path d="M12 5v14M5 12h14"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',check:'<path d="m5 12 4 4L19 6"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',down:'<path d="m6 9 6 6 6-6"/>',more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  vault:'<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M3 5h18M9 10h6m-3 0v5"/>',
  moon:'<path d="M20 14a8 8 0 0 1-10-10 8 8 0 1 0 10 10Z"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',
  sound:'<path d="m10 5-5 4H2v6h3l5 4ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',mute:'<path d="m10 5-5 4H2v6h3l5 4ZM16 9l6 6m0-6-6 6"/>',
  settings:'<path d="m9 3-1 3-3 1v4l-2 1 2 2v3l3 1 1 3h5l1-3 3-1v-3l3-2-3-1V7l-3-1-1-3Z"/><circle cx="11.5" cy="12" r="3"/>',
  body:'<path d="M4 8v8m3-10v12m10-12v12m3-10v8M7 12h10"/>',
  mind:'<path d="M4 5h6l2 2 2-2h6v14h-6l-2 2-2-2H4ZM12 7v14"/>',
  soul:'<path d="M12 3c1 5 4 8 9 9-5 1-8 4-9 9-1-5-4-8-9-9 5-1 8-4 9-9Z"/>',
  heart:'<path d="M20 5c-3-3-7-1-8 1-1-2-5-4-8-1-5 5 3 11 8 15 5-4 13-10 8-15Z"/>',
  harm:'<path d="m13 2-8 12h6l-1 8 9-13h-7Z"/>',
  coin:'<circle cx="12" cy="12" r="8"/><path d="M12 7v10m3-8h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9"/>',
  sword:'<path d="m16 3 5 0v5L9 20l-5-5ZM3 12l9 9M4 20l-2 2"/>',
  pet:'<ellipse cx="12" cy="16" rx="5" ry="4"/><circle cx="5" cy="9" r="2"/><circle cx="10" cy="5" r="2"/><circle cx="16" cy="6" r="2"/><circle cx="20" cy="11" r="2"/>',
  medal:'<path d="m7 3 5 7 5-7M4 3h5l3 4 3-4h5l-5 9H9Z"/><path d="m12 10 3 2 4 1v4l-3 4h-8l-3-4v-4l4-1ZM12 14v4m-2-2h4"/>',
  shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/>',
  leaf:'<path d="M20 3c0 13-4 17-11 14C3 14 6 5 20 3ZM4 21 17 8"/>',
  pencil:'<path d="m16 3 5 5L8 21H3v-5ZM13 6l5 5"/>',
  search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',undo:'<path d="M9 4 3 10l6 6M3 10h11a6 6 0 0 1 0 12"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
};
function icon(name,cls='') {return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||HABIT_ICONS.find(i=>i.id===name)?.path||icons.soul}</svg>`;}
function iconButton(action,name,label,extra=''){return `<button class="icon-button" data-action="${action}" title="${esc(label)}" aria-label="${esc(label)}" ${extra}>${icon(name)}</button>`;}
function coin(n,voxel=false){return `<span class="gold-value ${voxel?'voxel-gold-value':''}" ${voxel?`title="${esc(n)} gold"`:''}>${voxel?goldArt(n):icon('coin')}<span>${esc(n)}</span></span>`;}
function dateLabel(){return new Intl.DateTimeFormat('en',{timeZone:state.settings.timezone,weekday:'long',month:'long',day:'numeric'}).format(new Date());}
function modalShell(title,body,cls='',subtitle='') {
  return `<div class="scrim" data-action="dismiss"><section class="modal ${cls}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-header"><div><h2 id="modal-title">${title}</h2>${subtitle?`<p>${subtitle}</p>`:''}</div>${iconButton('close-modal','close','Close')}</header>${body}</section></div>`;
}
function resetSettings(){
  let canRestore=false;try{canRestore=!!localStorage.getItem(PREVIOUS_SAVE_KEY);}catch{}
  return `<div class="backup-box reset-box"><h3>Start over</h3><p>Return to the beginning. A previous save stays available here for recovery.</p><div class="backup-actions"><button type="button" class="button danger" data-action="reset-progress">Reset progress</button>${canRestore?'<button type="button" class="button secondary" data-action="restore-previous">Restore previous progress</button>':''}</div></div>`;
}
function render(){
  hideStatTooltip();
  const day=today();E.rollover(state,day);lastDay=day;
  document.documentElement.dataset.theme=state.settings.theme;
  document.documentElement.dataset.motion=state.settings.reducedMotion?'reduced':'full';
  const completed=state.tasks.filter(t=>t.done).length;
  const habitsDone=state.habits.filter(h=>h.category!=='harm'&&h.logs.some(l=>l.day===day)).length;
  $('#app').innerHTML=`
    <header class="topbar"><div class="topbar-brand"><a class="wordmark" href="/" aria-label="Twesk home"><span class="logo-cube"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="m3 8 13-6 13 6v16l-13 6-13-6Z" fill="#7461d4"/><path d="m3 8 13 6 13-6-13-6Z" fill="#b9a8f2"/><path d="M16 14v16L3 24V8Z" fill="#937be2"/></svg></span>twesk<span class="beta">EARLY DAYS</span></a><time class="topbar-date" datetime="${day}">${esc(dateLabel())}</time></div>
    <div class="topbar-actions"><button class="capture-button" data-action="capture">${icon('plus')}Quick capture<kbd>⌘ K</kbd></button><span class="toolbar-divider"></span><button class="collection-button" data-action="achievements" title="Achievements and monster collection" aria-label="Open achievements">${icon('medal')}</button>${iconButton('theme',state.settings.theme==='dark'?'sun':'moon','Switch to '+(state.settings.theme==='dark'?'light':'dark')+' mode')}${iconButton('mute',state.settings.muted?'mute':'sound',state.settings.muted?'Unmute sounds':'Mute sounds')}${iconButton('settings','settings','Settings and backup')}<button class="profile-dot" data-action="settings" aria-label="Your profile">${avatarFaceArt(state.appearance)}</button></div></header>
    <main>
    ${saveError?'<div class="save-warning">'+esc(startupWarning||'Browser saving is unavailable. Export a backup in Settings to keep your progress.')+'</div>':''}
    <div class="dashboard">
      <section class="panel tasks-panel" aria-labelledby="tasks-heading"><div class="panel-heading"><div><span class="section-kicker">MAKE THINGS HAPPEN</span><h2 id="tasks-heading">Tasks <span class="count">${state.tasks.filter(t=>!t.done).length}</span></h2></div>${iconButton('new-task','plus','Add a task')}</div>
      <div class="task-tabs" role="group" aria-label="Task view"><button data-action="task-view" data-view="active" class="${taskView==='active'?'selected':''}">To do</button><button data-action="task-view" data-view="done" class="${taskView==='done'?'selected':''}">Completed <span>${completed}</span></button></div>
      <div class="tasks-scroll">${renderTasks()}</div>
      <button class="vault-card" data-action="vault"><span class="vault-symbol">${icon('vault')}</span><span><strong>The Vault</strong><small>${state.notes.filter(n=>n.status==='inbox').length?state.notes.filter(n=>n.status==='inbox').length+(state.notes.filter(n=>n.status==='inbox').length===1?' idea waiting to be sorted':' ideas waiting to be sorted'):'A home for thoughts, before they become plans'}</small></span>${icon('arrow')}</button>
      </section>
      <section class="panel habits-panel" aria-labelledby="habits-heading"><div class="panel-heading"><div><span class="section-kicker">GROW AT YOUR OWN PACE</span><h2 id="habits-heading">Habits</h2></div>${iconButton('new-habit','plus','Add a habit')}</div><div class="habits-scroll">${[...E.CATEGORIES,'harm'].map(renderCategory).join('')}</div></section>
      <aside class="character-column" aria-label="Your character and adventure">${renderCharacter()}${renderMonster()}</aside>
    </div><footer class="app-footer"><span><span class="local-dot"></span>${saveError?'Save unavailable':'Saved on this device'}</span><div class="day-summary" aria-label="Daily progress"><span>${icon('check')}<strong>${completed}</strong> tasks cleared</span><span>${icon('leaf')}<strong>${habitsDone}</strong> habits today</span></div><button data-action="vault">Open Vault <kbd>⌘ J</kbd></button></footer></main>`;
  renderModal();updateOdds();
}
function renderTasks(){
  const shown=state.tasks.filter(t=>taskView==='done'?t.done:!t.done);
  if(!shown.length)return `<div class="empty-state"><span class="empty-symbol">${icon('check')}</span><h3>${taskView==='done'?'Your wins will live here':'A little breathing room'}</h3><p>${taskView==='done'?'Complete a task to start your collection.':'Add a task, or bring an idea over from the Vault.'}</p>${taskView==='active'?'<button class="button secondary" data-action="new-task">Add your first task</button>':''}</div>`;
  const groups=[['inbox','From the Vault','Ready to find a place'],['quick','Little things','Quick wins · 4 gold'],['standard','A little focus','Some time and attention · 10 gold'],['hard','Deep work','Something more involved · 18 gold'],['quest','Side quests','Bigger milestones · 40 gold']];
  return groups.map(([tier,label,sub])=>{
    const tasks=shown.filter(t=>tier==='inbox'?t.inbox:!t.inbox&&t.tier===tier);if(!tasks.length)return '';
    return `<section class="task-group"><div class="group-heading"><h3>${label}</h3><span>${tasks.length}</span></div><p class="group-description">${sub}</p>${tasks.map(t=>`<div class="task-row ${t.done?'completed':''}"><button class="task-check" data-action="toggle-task" data-id="${t.id}" aria-label="${t.done?'Undo':'Complete'} ${esc(t.title)}">${t.done?icon('check'):''}</button><span class="task-title">${esc(t.title)}</span><span class="task-reward">${coin(E.TASK_GOLD[t.tier],true)}</span>${iconButton('edit-task','more','Edit '+t.title,`data-id="${t.id}"`)}</div>`).join('')}</section>`;
  }).join('');
}
function renderCategory(cat){
  const meta=E.CATEGORY_META[cat],harm=cat==='harm',open=openCategories.has(cat),habits=state.habits.filter(h=>h.category===cat),xp=harm?0:state.xp[cat]%300;
  const done=habits.filter(h=>h.logs.some(l=>l.day===today())).length;
  return `<section class="habit-category ${cat} ${open?'expanded':''}"><button class="category-header" data-action="category" data-category="${cat}" aria-expanded="${open}"><span class="category-symbol">${icon(meta.icon)}</span><span class="category-name"><strong>${meta.label}</strong><small>${harm?meta.subtitle:`${done}/${habits.length} today`}</small></span>${harm?'<span class="harm-tag">− HP</span>':`<span class="category-level">Lv. ${E.level(state,cat)}</span>`}${icon('chevron','category-chevron')}</button>${!harm?`<div class="category-progress" role="progressbar" aria-label="${meta.label} experience" aria-valuemin="0" aria-valuemax="300" aria-valuenow="${xp}"><div style="width:${xp/3}%"></div></div>`:''}${open?`<div class="category-body"><p class="category-subtitle">${harm?'Log it when it happens. A moment to notice.':meta.subtitle+` · ${xp}/300 XP`}</p>${habits.map(h=>{
    const log=h.logs.find(l=>l.day===today()),reward=harm?h.base:log?.xp||Math.round(h.base*E.momentum(h,today()));
    const harmCount=harm?h.harmLogs.filter(l=>l.day===today()).length:0;
    return `<div class="habit-row ${log?'done':''}"><button class="habit-complete" data-action="${harm?'harm':'habit'}" data-id="${h.id}" ${!harm?`aria-pressed="${!!log}"`:''} title="${esc(harm?'Log '+h.title:log?'Completed today · click to undo':'Complete '+h.title)}"><span class="habit-icon">${icon(log?'check':resolvedHabitIcon(h))}</span><span class="habit-name">${esc(h.title)}${harmCount?`<small>Logged ${harmCount}× today</small>`:log?'<small>Done for today</small>':''}</span><span class="xp-badge">${harm?'−':'+'}${reward} ${harm?'HP':'XP'}</span></button>${iconButton('edit-habit','more','Edit '+h.title,`data-id="${h.id}"`)}</div>`;
  }).join('')}<button class="add-habit" data-action="new-habit" data-category="${cat}">${icon('plus')}Add ${harm?'a Harm habit':'a habit'}</button></div>`:''}</section>`;
}
function petCompanion(){
  const pet=E.SHOP.find(i=>i.id===state.activePet);
  return pet?`<span class="pet-companion" role="img" aria-label="${esc(pet.name)} companion" title="${esc(pet.name)}">${itemArt(pet)}</span>`:'';
}
function potionCount(){return E.SHOP.filter(i=>i.type==='potion').reduce((n,i)=>n+E.itemCount(state,i.id),0);}
function statExplanation(category){
  const current=E.level(state,category),next=current+1;
  // Read benefits from the combat rules, excluding equipment and spell bonuses.
  const intrinsic={...state,equipped:{weapon:null,armor:null},preparedSpell:null};
  const stronger={...intrinsic,xp:{...state.xp,[category]:state.xp[category]+300}};
  const now=E.combatStats(intrinsic),then=E.combatStats(stronger);
  const percent=n=>(n*100).toLocaleString('en',{maximumFractionDigits:1})+'%';
  const details={
    body:{description:'Raises your maximum health so you can survive more damage.',now:`${now.max} maximum HP`,next:`${then.max} maximum HP`},
    mind:{description:'Exploit monster weaknesses. Extra damage applies to every attack and adds to your weapon and spell.',now:`+${now.attack} damage per attack`,next:`+${then.attack} damage per attack`},
    soul:{description:'A chance to deflect each incoming monster attack completely and take no damage.',now:`${percent(now.dodge)} deflect chance`,next:`${percent(then.dodge)} deflect chance`},
    heart:{description:'Rally once per fight when you survive a hit at half health or below. Recovery is capped by missing HP.',now:now.rally?`Recover up to ${now.rally} HP`:'No combat rally yet',next:`Recover up to ${then.rally} HP`,healing:`Also improves potions and recovery journaling: +${percent(E.healingMultiplier(intrinsic)-1)} now → +${percent(E.healingMultiplier(stronger)-1)} next level.`},
  };
  const d=details[category];
  return `<div class="stat-tip-heading">${icon(category)}<strong>${E.CATEGORY_META[category].label}</strong></div><p>${d.description}</p><div class="stat-tip-benefit"><span>Level ${current}<small>Current</small></span><strong>${d.now}</strong></div><div class="stat-tip-benefit next"><span>Level ${next}<small>Next</small></span><strong>${d.next}</strong></div>${d.healing?`<p class="stat-tip-healing">${d.healing}</p>`:''}<small class="stat-tip-xp">${state.xp[category]%300} / 300 XP toward level ${next}</small>`;
}
function hideStatTooltip(){
  clearTimeout(statTipHideTimer);
  if(statTipButton){statTipButton.removeAttribute('aria-describedby');statTipButton.setAttribute('aria-expanded','false');}
  statTipButton=null;statTipPinned=false;statTooltip.hidden=true;
}
function showStatTooltip(button,pinned=false){
  if(modal||busy)return;
  if(statTipButton!==button)hideStatTooltip();
  statTipButton=button;statTipPinned=pinned||statTipPinned;
  statTooltip.className='stat-tooltip '+button.dataset.stat;statTooltip.innerHTML=statExplanation(button.dataset.stat);
  const viewWidth=document.documentElement.clientWidth,viewHeight=document.documentElement.clientHeight;
  statTooltip.style.width=Math.min(300,viewWidth-24)+'px';statTooltip.hidden=false;
  button.setAttribute('aria-describedby','stat-tooltip');button.setAttribute('aria-expanded','true');
  const rect=button.getBoundingClientRect(),width=statTooltip.offsetWidth,height=statTooltip.offsetHeight;
  statTooltip.style.left=Math.max(12,Math.min(viewWidth-width-12,rect.left+rect.width/2-width/2))+'px';
  const top=rect.top-height-10>=12?rect.top-height-10:rect.bottom+10;
  statTooltip.style.top=Math.max(12,Math.min(viewHeight-height-12,top))+'px';
}
document.addEventListener('pointerover',event=>{
  if(event.target.closest('.stat-chip,#stat-tooltip'))clearTimeout(statTipHideTimer);
  const button=event.target.closest('.stat-chip');
  if(button&&event.pointerType!=='touch'&&!button.contains(event.relatedTarget)&&!statTipPinned)showStatTooltip(button);
});
document.addEventListener('pointerout',event=>{
  if(statTipPinned||!statTipButton)return;
  const from=event.target.closest('.stat-chip,#stat-tooltip');
  const to=event.relatedTarget;
  if(from&&!statTipButton.contains(to)&&!statTooltip.contains(to)&&document.activeElement!==statTipButton)statTipHideTimer=setTimeout(()=>{if(!statTipPinned)hideStatTooltip();},120);
});
document.addEventListener('focusin',event=>{if(event.target.matches('.stat-chip'))showStatTooltip(event.target);});
document.addEventListener('focusout',event=>{if(event.target.matches('.stat-chip')&&!statTipPinned)hideStatTooltip();});
document.addEventListener('pointerdown',event=>{if(!event.target.closest('.stat-chip,#stat-tooltip'))hideStatTooltip();});
window.addEventListener('resize',hideStatTooltip);
window.addEventListener('scroll',event=>{if(!statTooltip.contains(event.target))hideStatTooltip();},true);
function renderCharacter(){
  const weapon=E.SHOP.find(i=>i.id===state.equipped.weapon),armor=E.SHOP.find(i=>i.id===state.equipped.armor),hpMax=E.maxHP(state);
  return `<section class="panel character-panel"><div class="character-heading"><span class="section-kicker">YOUR ADVENTURER</span><button class="wallet" data-action="shop" id="gold-target" title="Open the shop" aria-label="${state.gold} gold · Open shop">${coin(state.gold,true)}</button></div><button class="avatar-scene avatar-interactive" data-avatar-view="dashboard" data-action="avatar-open" aria-label="Inspect and personalize your character. Drag to rotate; click to enlarge. Arrow keys rotate." title="Drag to rotate · Click to enlarge">${avatarArt(weapon,armor,false,{angle:avatarAngle,appearance:state.appearance})}${petCompanion()}</button><h2 class="character-name">${esc(state.name)}</h2><div class="health-label"><span>${icon('heart')}Health</span><strong>${state.hp}<span> / ${hpMax} HP</span></strong></div><div class="health-bar"><div style="width:${state.hp/hpMax*100}%"></div></div><div class="stat-chips">${E.CATEGORIES.map(c=>`<button class="stat-chip ${c}" data-action="stat-info" data-stat="${c}" aria-label="${E.CATEGORY_META[c].label}, level ${E.level(state,c)}. Combat benefits" aria-expanded="false">${icon(c)}<strong>${E.level(state,c)}</strong></button>`).join('')}</div><div class="character-actions"><button class="button secondary" data-action="shop">${icon('coin')}Shop</button><button class="button secondary" data-action="inventory">${icon('shield')}Inventory</button><button class="potion-button" data-action="potion" title="${potionCount()?'Open your potions':'Visit the shop for potions'}" aria-label="Open potions · ${potionCount()} owned">${itemArt(E.SHOP[0])}<span>${potionCount()}</span></button></div>${state.pendingRecovery&&state.hp<hpMax?'<button class="recovery-link" data-action="recover">'+icon('pencil')+'Write a reflection to recover</button>':''}</section>`;
}
function renderAvatarModal(){
  const weapon=E.SHOP.find(i=>i.id===state.equipped.weapon),armor=E.SHOP.find(i=>i.id===state.equipped.armor);
  return modalShell(esc(state.name),`<div class="character-studio"><div class="character-preview"><div class="avatar-turntable avatar-interactive" data-avatar-view="studio" tabindex="0" role="group" aria-label="Character model. Drag or use arrow keys to rotate."><div class="avatar-model-scale" style="--avatar-zoom:${avatarZoom}">${avatarArt(weapon,armor,true,{angle:avatarAngle,appearance:state.appearance})}</div>${petCompanion()}</div><div class="avatar-view-controls"><button class="icon-button" data-action="avatar-turn" data-direction="-1" aria-label="Rotate left">↶</button><button class="text-button" data-action="avatar-reset">Reset view</button><button class="icon-button" data-action="avatar-turn" data-direction="1" aria-label="Rotate right">↷</button><span></span><button class="icon-button" data-action="avatar-zoom" data-direction="-1" aria-label="Zoom out" ${avatarZoom<=.8?'disabled':''}>−</button><output aria-label="Character zoom">${Math.round(avatarZoom*100)}%</output><button class="icon-button" data-action="avatar-zoom" data-direction="1" aria-label="Zoom in" ${avatarZoom>=1.4?'disabled':''}>+</button></div></div><div class="appearance-panel"><h3>Appearance</h3>${Object.entries(APPEARANCE).map(([key,options])=>`<fieldset class="appearance-field"><legend>${{skin:'Skin tone',hair:'Hair color',outfit:'Clothing',style:'Hair style'}[key]}</legend><div class="${key==='style'?'hair-style-options':'appearance-swatches'}">${options.map(o=>`<button class="${key==='style'?'style-option':'appearance-swatch'} ${state.appearance[key]===o.id?'selected':''}" data-action="appearance" data-field="${key}" data-value="${o.id}" ${o.color?`style="--swatch:${o.color}"`:''} aria-label="${key==='style'?'Hair style':{skin:'Skin tone',hair:'Hair color',outfit:'Clothing'}[key]}: ${o.name}" aria-pressed="${state.appearance[key]===o.id}" title="${o.name}">${key==='style'?o.name:state.appearance[key]===o.id?icon('check'):''}</button>`).join('')}</div></fieldset>`).join('')}<div class="avatar-equipped"><h3>Wearing</h3>${[weapon,armor].map((item,i)=>`<div><span class="avatar-gear-icon">${item?itemArt(item):icon(i?'shield':'sword')}</span><span><strong>${item?item.name:i?'No armor':'Unarmed'}</strong><small>${item?`${item.bonus} ${i?'damage blocked':'attack bonus'}`:i?'Clothing only':'No weapon equipped'}</small></span></div>`).join('')}</div><p class="appearance-save-note">Appearance saves automatically. Armor covers your clothing.</p></div></div>`,'avatar-modal');
}
function renderMonster(){
  const number=state.monster.number,won=!!state.monster.defeatedOn,spell=E.preparedSpell(state);
  return `<section class="panel monster-panel ${won?'cleared':''}"><div class="monster-heading"><span class="section-kicker">${won?'A LITTLE VICTORY':'A CHALLENGE AWAITS'}</span><span class="chapter">#${String(number).padStart(2,'0')}</span></div><button class="monster-scene" data-action="bestiary" aria-label="Inspect ${esc(monsterName(number))} in the monster collection" title="Open monster collection">${monsterArt(number,won)}</button><h3>${monsterName(number)}</h3><p>${won?'Defeated. Enjoy your well-earned pause.':'Waiting here until you feel ready.'}</p>${won?`<div class="victory-note">${icon('check')}Next opponent arrives tomorrow</div>`:`<div class="readiness"><span>Estimated victory chance</span><strong id="chance-value">${chance===null?'…':Math.round(chance*100)+'%'}</strong></div><div class="readiness-bar"><div id="chance-bar" style="width:${(chance||0)*100}%"></div></div>${spell?`<button class="prepared-spell" data-action="open-spells">${icon('soul')}<span>${spell.name} prepared<small>Consumed in your next fight</small></span></button>`:''}<button class="button primary fight-button" data-action="fight" ${state.hp===0?'disabled':''}>${icon('sword')}Challenge ${monsterName(number)}</button>${state.hp===0?'<button class="text-button" data-action="recover">Recover HP to fight</button>':'<small class="fight-hint">Your stats, gear, spells & health shape your chances.</small>'}`}${state.battles.some(r=>r.monster===number)?'<button class="text-button replay-button" data-action="replay-battle">'+icon('undo')+'Replay last encounter</button>':''}</section>`;
}
const worker=new Worker('/combat-worker.js?v=0.7.4',{type:'module'});
worker.onmessage=({data})=>{if(data.key!==chanceKey)return;chance=data.error?null:data.chance;const v=$('#chance-value'),bar=$('#chance-bar');if(v)v.textContent=chance===null?'Unavailable':Math.round(chance*100)+'%';if(bar)bar.style.width=(chance||0)*100+'%';};
function updateOdds(){
  const key=JSON.stringify([state.hp,state.xp,state.equipped,state.monster.number,state.preparedSpell]);
  if(key!==chanceKey){chanceKey=key;chance=null;const v=$('#chance-value');if(v)v.textContent='…';worker.postMessage({state,key});}
}
function renderShop(inventory){
  const items=E.SHOP.filter(i=>i.type===shopCategory&&(!inventory||E.itemCount(state,i.id)>0)).sort((a,b)=>a.price-b.price);
  const labels={weapon:'One weapon at a time. New weapons fill an empty slot automatically.',armor:'One armor at a time. New armor fills an empty slot automatically.',potion:'Potions are used once. Healing is capped at your maximum HP.',spell:'Prepare one spell at a time. It is consumed when a fight starts, even on defeat. Switching or putting it away costs nothing.',pet:'Choose one companion. Pets are permanent and cosmetic.'};
  return modalShell(inventory?'Your inventory':'Shop',`<div class="shop-top"><div class="segmented"><button data-action="shop" class="${!inventory?'selected':''}">Shop</button><button data-action="inventory" class="${inventory?'selected':''}">Inventory</button></div><div class="shop-wallet"><span>Your gold</span><span class="wallet" aria-label="${state.gold} gold">${coin(state.gold,true)}</span></div></div>
    <div class="shop-tabs" role="tablist" aria-label="Item categories">${shopTabs.map(([key,label,symbol])=>`<button role="tab" id="shop-tab-${key}" aria-controls="shop-items" aria-selected="${shopCategory===key}" tabindex="${shopCategory===key?'0':'-1'}" data-action="shop-tab" data-category="${key}">${icon(symbol)}${label}</button>`).join('')}</div>
    <div id="shop-items" role="tabpanel" aria-labelledby="shop-tab-${shopCategory}" tabindex="0"><div class="shop-grid">${items.length?items.map(i=>{
      const count=E.itemCount(state,i.id),consumable=E.isConsumable(i),owned=!consumable&&count>0;
      const selected=i.type==='pet'?state.activePet===i.id:i.type==='spell'?state.preparedSpell===i.id:state.equipped[i.type]===i.id;
      const action=i.type==='potion'?'use-potion':i.type==='spell'?'prepare-spell':'equip';
      const useLabel=i.type==='potion'?'Use potion':i.type==='spell'?selected?'Prepared · put away':'Prepare for fight':i.type==='pet'?selected?'Companion · remove':'Choose companion':selected?'Equipped · remove':'Equip';
      return `<article class="shop-item ${i.tier} ${i.type} ${owned?'owned':''} ${selected?'item-selected':''}">${count?`<span class="item-count">${consumable?count+' owned':selected?icon('check')+'Selected':'Owned'}</span>`:''}<div class="item-art">${itemArt(i)}</div><div class="item-copy"><span class="item-tier">${i.type==='pet'?'COMPANION':i.type==='spell'?'ONE FIGHT':i.tier.toUpperCase()}</span><h3>${esc(i.name)}</h3><p>${esc(i.description)}</p></div>${!inventory?`<button class="button secondary" data-action="buy" data-id="${i.id}" aria-label="${owned?esc(i.name)+' owned':'Buy '+esc(i.name)+' for '+i.price+' gold'}" ${owned||state.gold<i.price?'disabled':''}>${owned?icon('check')+'Owned':`Buy ${coin(i.price,true)}`}</button>`:''}${count?`<button class="button ${inventory?'primary':'item-use'}" data-action="${action}" data-id="${i.id}" aria-label="${i.type==='potion'?'Use':i.type==='spell'?selected?'Put away':'Prepare':selected?'Remove':'Equip'} ${esc(i.name)}" ${i.type==='potion'&&state.hp===E.maxHP(state)?'disabled':''}>${i.type==='potion'&&state.hp===E.maxHP(state)?'Full health':useLabel}</button>`:''}</article>`;
    }).join(''):`<div class="empty-state"><span class="empty-symbol">${icon(shopTabs.find(t=>t[0]===shopCategory)[2])}</span><h3>No ${shopTabs.find(t=>t[0]===shopCategory)[1].toLowerCase()} in inventory</h3><button class="button primary" data-action="shop">Browse shop</button></div>`}</div></div><p class="shop-note">${labels[shopCategory]}</p>`,'shop-modal');
}
function renderModal(){
  $('#app').inert=!!modal;
  if(!modal){$('#overlay').innerHTML='';document.body.classList.remove('modal-open');return;}
  document.body.classList.add('modal-open');
  const type=modal.type;let content='';
  if(type==='task'){
    const t=state.tasks.find(t=>t.id===modal.id);
    content=modalShell(t?'Edit task':'A little thing to do',`<form id="task-form" class="form-body"><label>What’s on your mind?<input name="title" required maxlength="160" placeholder="Give this task a name" value="${esc(t?.title||modal.prefill||'')}" autofocus></label><label>How much does it ask of you?<select name="tier" ${t?.done?'disabled':''}>${Object.entries(E.TASK_GOLD).map(([k,v])=>`<option value="${k}" ${(t?.tier||'quick')===k?'selected':''}>${{quick:'Little thing',standard:'A little focus',hard:'Deep work',quest:'Side quest'}[k]} · ${v} gold</option>`).join('')}</select></label>${t?.inbox?'<label class="checkbox-label"><input type="checkbox" name="sort" checked>Move out of the task inbox</label>':''}<div class="form-actions">${t?`<button type="button" class="button danger subtle" data-action="delete-task" data-id="${t.id}">Delete task</button>`:'<span></span>'}<button class="button primary" type="submit">${t?'Save changes':'Add task'}${icon('plus')}</button></div></form>`);
  }
  if(type==='habit'){
    const h=state.habits.find(h=>h.id===modal.id),cat=h?.category||modal.category||'body';
    content=modalShell(h?'Edit habit':'Make room for a habit',`<form id="habit-form" class="form-body"><label>Habit name<input name="title" required maxlength="100" placeholder="Something you’d like to do" value="${esc(h?.title||'')}" autofocus></label><div class="form-grid"><label>Category<select name="category" ${h?'disabled':''}>${[...E.CATEGORIES,'harm'].map(c=>`<option value="${c}" ${cat===c?'selected':''}>${E.CATEGORY_META[c].label}</option>`).join('')}</select></label><label id="effort-label">${cat==='harm'?'HP cost':'Effort'}<select name="base" id="habit-base">${habitOptions(cat,h?.base)}</select></label></div><p class="form-help">${cat==='harm'?'Log it whenever it happens. It costs HP, with no XP or level.':'Available every day, once a day. No schedule to keep.'}</p>${renderHabitIconPicker(cat,h?habitIconChoice(h):'category')}${!h?`<div class="suggestions"><span class="small-label">A FEW IDEAS</span><div id="habit-suggestions">${suggestionButtons(cat)}</div></div>`:''}<div class="form-actions">${h?`<button type="button" class="button danger subtle" data-action="delete-habit" data-id="${h.id}">Remove habit</button>`:'<span></span>'}<button class="button primary">${h?'Save changes':'Add habit'}${icon('plus')}</button></div></form>`);
  }
  if(type==='capture'){
    const note=state.notes.find(n=>n.id===modal.id),recovery=modal.recovery;
    content=modalShell(recovery?'A moment to reflect':note?'Your captured thought':'Catch a thought',`<form id="capture-form" class="form-body">${!note&&!recovery?`<div class="segmented capture-kind"><button type="button" data-action="capture-kind" data-kind="note" class="${modal.kind==='note'?'selected':''}">${icon('pencil')}Note</button><button type="button" data-action="capture-kind" data-kind="journal" class="${modal.kind==='journal'?'selected':''}">${icon('mind')}Journal</button><button type="button" data-action="capture-kind" data-kind="task" class="${modal.kind==='task'?'selected':''}">${icon('check')}Task</button></div>`:''}${recovery?`<p class="reflection-prompt">What needs more care right now? What’s one thing you could do next?</p><div class="recovery-preview"><span>${icon('heart')}<strong id="preview-hp">${state.hp}</strong> / ${E.maxHP(state)} HP</span><span id="preview-heal">+0 HP</span></div><div class="health-bar"><div id="preview-bar" style="width:${state.hp/E.maxHP(state)*100}%"></div></div>`:''}<label class="sr-only" for="capture-text">${recovery?'Reflection':'Your note or task'}</label><textarea id="capture-text" name="text" required maxlength="50000" rows="${recovery?8:7}" placeholder="${recovery?'Take a breath, and write whatever comes to mind…':'Drop an idea, a reminder, a little something…\nAdd #tags to find it later.'}" autofocus>${esc(note?.text||'')}</textarea><div class="capture-meta"><span id="word-count">${E.words(note?.text||'')} words</span><span>${recovery?'2 words ≈ 1 HP · Heart improves healing':'Notes earn 1–3 gold · up to 6 per day'}</span></div><div class="form-actions">${note?`<button type="button" class="button subtle danger" data-action="delete-note" data-id="${note.id}">Archive</button>`:'<span></span>'}<button class="button primary" type="submit">${recovery?'Save & recover':note?'Save note':modal.kind==='task'?'Send to task inbox':modal.kind==='journal'?'Save journal':'Save to Vault'}${icon('arrow')}</button></div></form>`,recovery?'reflection-modal':'',recovery?'A little writing, a little healing. Saved privately in your Vault.':'');
  }
  if(type==='vault')content=modalShell('The Vault',`<div class="vault-toolbar"><label class="search-box">${icon('search')}<input id="vault-search" aria-label="Search notes and hashtags" placeholder="Search thoughts or #tags" value="${esc(vaultSearch)}"></label><button class="button secondary" data-action="capture">${icon('plus')}Capture</button></div><div class="vault-tabs segmented">${[['inbox','Needs review'],['kept','Notes'],['journal','Journal'],['all','All'],['archived','Archive']].map(([k,l])=>`<button data-action="vault-filter" data-filter="${k}" class="${vaultFilter===k?'selected':''}">${l}${k==='inbox'?` <span>${state.notes.filter(n=>n.status==='inbox').length}</span>`:''}</button>`).join('')}</div><div id="vault-results" class="vault-results">${renderNotes()}</div><footer class="vault-footer"><span>${state.reviewDates.includes(today())?'Review reward earned today · +4 gold':'Keep, convert, or archive an inbox note to earn +4 gold.'}</span></footer>`,'vault-modal','Thoughts first. Plans when you’re ready.');
  if(type==='shop'||type==='inventory')content=renderShop(type==='inventory');
  if(type==='settings')content=modalShell('Make yourself at home',`<form id="settings-form" class="form-body"><label>Your adventurer’s name<input name="name" required maxlength="40" value="${esc(state.name)}"></label><label>Your timezone<input name="timezone" list="timezones" required value="${esc(state.settings.timezone)}"><datalist id="timezones">${['Atlantic/Madeira','Europe/London','Europe/Lisbon','Europe/Berlin','America/New_York','America/Los_Angeles','Asia/Tokyo','Australia/Sydney','UTC'].map(z=>`<option value="${z}">`).join('')}</datalist></label><p class="form-help">Habits become available again at midnight here. No schedules and no damage for missed days.</p><label class="checkbox-label"><input type="checkbox" name="muted" ${state.settings.muted?'checked':''}>Mute little reward sounds</label><label class="checkbox-label"><input type="checkbox" name="reduced" ${state.settings.reducedMotion?'checked':''}>Reduce motion</label><div class="backup-box"><h3>Your progress stays on this device</h3><p>Back it up before clearing browser data or moving to another browser. There are no accounts or syncing yet.</p><div class="backup-actions"><button type="button" class="button secondary" data-action="export">${icon('download')}Export backup</button><button type="button" class="button secondary" data-action="import">${icon('upload')}Import backup</button></div><input type="file" id="import-file" accept="application/json,.json" hidden></div>${resetSettings()}${protectSave?'<p class="save-warning">The old save is protected. Saving these settings will begin a new save and replace it.</p>':''}<div class="form-actions"><span class="small-label">TWESK · MVP 0.1</span><button class="button primary">Save settings</button></div></form>`);
  if(type==='confirm-import')content=modalShell('Restore this backup?',`<div class="form-body"><p>This replaces the progress currently on this device with <strong>${esc(pendingImport?.name)}’s</strong> backup.</p><p>You can export your current progress first.</p><div class="form-actions"><button class="button secondary" data-action="export">Export current progress</button><button class="button primary" data-action="confirm-import">Restore backup</button></div></div>`);
  if(type==='confirm-reset')content=modalShell('Start a new adventure?',`<div class="form-body"><p>This resets your character, tasks, habits, Vault, equipment, gold, and achievements.</p><p>You’ll start at level 1 with full health and Mossling as your first opponent. Your current progress will be kept in Settings → Restore previous progress.</p><div class="backup-actions"><button class="button secondary" data-action="export">${icon('download')}Export backup</button></div><div class="form-actions"><button class="button secondary" data-action="settings">Keep current progress</button><button class="button danger" data-action="confirm-reset">Reset progress</button></div></div>`);
  if(type==='confirm-previous')content=modalShell('Restore previous progress?',`<div class="form-body"><p>Replace this adventure with the save kept before your last reset or restore. Your current adventure will become the recoverable previous save.</p><div class="form-actions"><button class="button secondary" data-action="settings">Keep current progress</button><button class="button primary" data-action="confirm-previous">Restore previous progress</button></div></div>`);
  if(type==='confirm-delete')content=modalShell('Remove this habit?',`<div class="form-body"><p><strong>${esc(modal.title)}</strong> will be removed. Your earned XP and levels stay with you.</p><div class="form-actions"><button class="button secondary" data-action="cancel-delete">Keep habit</button><button class="button danger" data-action="confirm-delete" data-id="${modal.id}">Remove habit</button></div></div>`);
  if(type==='battle')content=renderBattleModal();
  if(type==='avatar')content=renderAvatarModal();
  if(type==='achievements')content=modalShell('Achievements',collectionBody(state,{tab:collectionTab,filter:sealFilter,earnedOnly,chapter:monsterChapter,selectedMonster}),'collection-modal');
  $('#overlay').innerHTML=content;
}
function habitOptions(cat,selected){return (cat==='harm'?[[3,'Minor · 3 HP'],[7,'Moderate · 7 HP'],[12,'Substantial · 12 HP']]:[[10,'Small · 10 XP'],[20,'Standard · 20 XP'],[30,'Deep · 30 XP']]).map(([n,l])=>`<option value="${n}" ${selected===n?'selected':''}>${l}</option>`).join('');}
function habitIconOptions(category,selected){
  return HABIT_ICONS.map(i=>`<label class="habit-icon-option" title="${i.label}"><input type="radio" name="icon" value="${i.id}" aria-label="${i.label}" ${selected===i.id?'checked':''}><span aria-hidden="true">${icon(i.id==='category'?category:i.id)}</span></label>`).join('');
}
function renderHabitIconPicker(category,selected){
  return `<fieldset class="habit-icon-picker ${category}" id="habit-icon-picker"><legend>Habit icon <span id="habit-icon-label">${HABIT_ICONS.find(i=>i.id===selected).label}</span></legend><div class="habit-icon-options" id="habit-icon-options">${habitIconOptions(category,selected)}</div></fieldset>`;
}
const suggestions={body:['Go for a walk','Stretch a little','Exercise'],mind:['Draw something','Practice a language','Study something new'],soul:['Meditate','Journal','Spend time in nature'],heart:['Share a meal','Listen to someone','Express gratitude'],harm:['Late-night scrolling','Skip a meal','Smoke']};
function suggestionButtons(cat){return suggestions[cat].map(x=>`<button type="button" data-action="suggest-habit" data-title="${x}">${x}</button>`).join('');}
function renderNotes(){
  const notes=state.notes.filter(n=>(vaultFilter==='archived'?n.status==='archived':n.status!=='archived'&&(vaultFilter==='all'||(vaultFilter==='journal'?n.kind==='journal':n.status===vaultFilter)))&&`${n.text} ${n.kind==='journal'?'#reflection':''}`.toLowerCase().includes(vaultSearch.toLowerCase()));
  if(!notes.length)return `<div class="empty-state"><span class="empty-symbol">${icon('vault')}</span><h3>${vaultSearch?'Nothing found just yet':vaultFilter==='inbox'?'Room for a new thought':'A little space for your ideas'}</h3><p>${vaultSearch?'Try another word or hashtag.':'Capture something now. You can make sense of it later.'}</p><button class="button secondary" data-action="capture">${icon('plus')}Quick capture</button></div>`;
  return notes.map(n=>`<article class="note-card"><div class="note-top"><span>${n.kind==='journal'?icon('pencil')+' REFLECTION':'NOTE'} · ${esc(new Intl.DateTimeFormat('en',{month:'short',day:'numeric',timeZone:state.settings.timezone}).format(new Date(n.created)))}</span>${coin(n.paid)}</div><p class="note-text">${esc(n.text).replace(/(^|\s)(#[\p{L}\p{N}_-]+)/gu,'$1<span class="hashtag">$2</span>')}</p><div class="note-actions"><button class="text-button" data-action="edit-note" data-id="${n.id}">${icon('pencil')}Edit</button>${n.taskId?'<span class="converted">'+icon('check')+'Sent to tasks</span>':`<button class="text-button" data-action="convert-note" data-id="${n.id}">${icon('arrow')}Make a task</button>`}${n.status==='inbox'?`<button class="text-button" data-action="keep-note" data-id="${n.id}">Keep note</button>`:''}<button class="text-button archive" data-action="${n.status==='archived'?'restore-note':'archive-note'}" data-id="${n.id}">${n.status==='archived'?'Restore':'Archive'}</button></div></article>`).join('');
}
function renderBattleModal(){
  const r=modal.result,finished=modal.finished,index=modal.index??-1;
  const event=index>=0?r.events[Math.min(index,r.events.length-1)]:null;
  const previous=index>0?r.events[index-1]:null,enemyMax=E.monsterStats(r.monster).hp;
  const maximum=r.maxHP||E.maxHP(state),initial=r.initialHP??modal.initialHP;
  const hp=finished?r.hp:event?(modal.impact?event.hp:event.hpBefore??previous?.hp??initial):initial;
  const enemy=finished?(r.won?0:r.events.at(-1).enemy):event?(modal.impact?event.enemy:event.enemyBefore??previous?.enemy??enemyMax):enemyMax;
  const loadout=r.loadout||state.equipped,weapon=E.SHOP.find(i=>i.id===loadout.weapon),armor=E.SHOP.find(i=>i.id===loadout.armor);
  const levels=r.levels||Object.fromEntries(E.CATEGORIES.map(c=>[c,E.level(state,c)]));
  const context={monster:monsterName(r.monster),weapon,armor,spell:E.SHOP.find(i=>i.id===r.spell)},step=event?describeCombatEvent(event,context):null;
  const round=event?.round||Math.floor(Math.max(0,index)/2)+1;
  const stageClass=finished?`outcome ${r.won?'victory':'defeat'}`:event?`event-${event.type}${event.enemy===0?' finishing-strike':''}${event.hp===0?' fatal-hit':''}`:'ready';
  const effect=(side)=>!finished&&step?.target===side?`<div class="combat-float ${step.tone}">${esc(step.float)}</div>${event.type==='hit'&&event.blocked?`<div class="combat-block">${icon('shield')}BLOCKED ${event.blocked}</div>`:''}${event.type==='deflect'?`<div class="deflect-ring">${icon('soul')}</div>`:''}${event.type==='rally'?'<div class="healing-ring"></div>':''}${['attack','hit'].includes(event.type)?'<svg class="strike-arc" viewBox="0 0 120 120" aria-hidden="true"><path d="M93 11Q21 42 24 105"/><path d="M107 18Q50 42 42 91"/></svg><svg class="hit-sparks" viewBox="0 0 100 100" aria-hidden="true"><path d="m50 14 0 20m0 32v20M14 50h20m32 0h20M24 24l14 14m24 24 14 14M24 76l14-14m24-24 14-14"/></svg>':''}`:'';
  const historyEnd=finished?r.events.length:Math.max(0,index);
  const history=r.events.slice(Math.max(0,historyEnd-4),historyEnd);
  const chips=[...(r.spell?[{label:`${E.SHOP.find(i=>i.id===r.spell)?.name} · this fight`,tone:'soul'}]:[]),{label:`Body ${levels.body} · ${maximum} max HP`,tone:'body'},
    ...(weapon?[{label:`${weapon.name} · +${weapon.bonus} attack`,tone:'gear'}]:[{label:'Unarmed',tone:'gear'}]),
    ...(armor?[{label:`${armor.name} · −${armor.bonus} damage`,tone:'gear'}]:[]),
    ...(levels.mind>1?[{label:`Mind ${levels.mind} · +${4*(levels.mind-1)} attack`,tone:'mind'}]:[]),
    ...(levels.soul>1?[{label:`Soul ${levels.soul} · ${Math.round((1-.88**(levels.soul-1))*100)}% deflect`,tone:'soul'}]:[]),
    ...(levels.heart>1?[{label:`Heart ${levels.heart} · ${15*(levels.heart-1)} rally`,tone:'heart'}]:[])];
  return modalShell(finished?r.won?'Victory!':'Defeated':`Encounter · ${monsterName(r.monster)}`,`<div class="battle-body">
    <div class="battle-toolbar"><span>${finished?`${round} rounds`:`${index<0?'GET READY':`ROUND ${round} · ${event?.type==='attack'?'YOUR TURN':event?.type==='rally'?'RECOVERY':'MONSTER’S TURN'}`}`}</span><div>${modal.replay?'<span class="replay-label">REPLAY</span>':''}<span>${finished?'Encounter complete':`Step ${Math.max(0,index+1)} / ${r.events.length}`}</span><button class="icon-button" data-action="battle-mute" title="${state.settings.muted?'Unmute combat':'Mute combat'}" aria-label="${state.settings.muted?'Unmute combat':'Mute combat'}">${icon(state.settings.muted?'mute':'sound')}</button></div></div>
    <div class="battle-stage ${stageClass}" id="battle-stage">
      <div class="battle-fighter player"><div class="fighter-scene"><div class="fighter-motion">${avatarArt(weapon,armor,false,{appearance:r.appearance||state.appearance})}</div>${effect('player')}</div><strong>${esc(r.playerName||state.name)}</strong><div class="health-bar" role="progressbar" aria-label="Adventurer health" aria-valuemin="0" aria-valuemax="${maximum}" aria-valuenow="${hp}" id="battle-player-bar"><div style="width:${hp/maximum*100}%"></div></div><small id="battle-player-hp">${hp} / ${maximum} HP</small></div>
      <div class="battle-divider"><span>VS</span><i></i></div>
      <div class="battle-fighter monster"><div class="fighter-scene"><div class="fighter-motion">${monsterArt(r.monster,finished&&r.won)}</div>${effect('monster')}</div><strong>${monsterName(r.monster)}</strong><div class="health-bar enemy" role="progressbar" aria-label="Monster health" aria-valuemin="0" aria-valuemax="${enemyMax}" aria-valuenow="${enemy}" id="battle-enemy-bar"><div style="width:${enemy/enemyMax*100}%"></div></div><small id="battle-enemy-hp">${enemy} / ${enemyMax} HP</small></div>
    </div>
    <div class="battle-step ${finished?r.won?'won':'lost':step?.tone||'ready'}" aria-live="polite"><strong>${finished?r.won?`${monsterName(r.monster)} defeated`:'Your adventurer falls':step?esc(step.title):'Ready your stance'}</strong><p>${finished?modal.replay?'This is a replay. Health and rewards stay unchanged.':r.won?'Loot collected. Your next opponent arrives tomorrow.':'Reflect to recover HP, then try again when you feel ready.':step?esc(step.detail):'You attack first. Equipment and stats apply automatically.'}</p><div class="combat-badges">${(!finished&&step?step.badges:[]).map(b=>`<span class="combat-badge ${b.tone}">${esc(b.label)}</span>`).join('')}</div></div>
    <div class="combat-loadout">${chips.map(b=>`<span class="${b.tone}">${esc(b.label)}</span>`).join('')}</div>
    ${history.length?`<details class="combat-history" ${finished?'open':''}><summary>Encounter log <span>${historyEnd} ${historyEnd===1?'step':'steps'}</span></summary><ol>${(finished?r.events:history).map(e=>{const d=describeCombatEvent(e,context);return `<li class="${d.tone}"><span>${esc(d.title)}</span><strong>${esc(d.float)}</strong>${d.badges.length?`<small>${esc(d.badges.map(b=>b.label).join(' · '))}</small>`:''}</li>`;}).join('')}</ol></details>`:''}
    ${finished?r.won?`<div class="loot-box">${r.loot.type==='gold'?icon('coin')+`<strong>+${r.loot.amount} gold</strong>`:itemArt(E.SHOP.find(i=>i.id===r.loot.id))+`<strong>${E.SHOP.find(i=>i.id===r.loot.id).name}</strong>`}<span>${modal.replay?'Previously earned':r.loot.type==='gold'?'Added to your pouch':'Added to your equipment'}</span></div><button class="button primary wide" data-action="close-modal">Back to dashboard</button>`:`${!modal.replay?`<button class="button primary wide" data-action="recover">${icon('pencil')}Reflect & recover</button>`:''}<button class="button secondary wide" data-action="close-modal">Back to dashboard</button>`:'<button class="text-button battle-skip" data-action="skip-battle">Skip to result</button>'}
  </div>`,'battle-modal');
}
let lastFocused=null;
function openModal(value){hideStatTooltip();lastFocused=document.activeElement;modal=value;renderModal();requestAnimationFrame(()=>{const target=$('#overlay [autofocus]')||$('#overlay button');target?.focus();});}
function closeModal(){if(busy){finishBattlePlayback();return;}modal=null;if(today()!==lastDay){E.rollover(state,today());render();persist();}else renderModal();lastFocused?.focus?.();}
function toast(text,action=null){const el=document.createElement('div');el.className='toast';el.textContent=text;if(action){const b=document.createElement('button');b.textContent='Undo';b.onclick=()=>{action();el.remove();};el.append(b);}$('#toasts').append(el);while($('#toasts').children.length>3)$('#toasts').firstChild.remove();setTimeout(()=>el.remove(),6500);}
function announceBadges(badges){
  if(!badges.length)return;
  const badge=badges[0],el=document.createElement('button');el.className='badge-unlock';
  el.innerHTML=`${badgeArt(badge,true)}<span><small>SEAL EARNED${badges.length>1?' · +'+(badges.length-1)+' more':''}</small><strong>${esc(badge.title)}</strong><span>View achievements ↗</span></span>`;
  el.setAttribute('aria-label',`Seal earned: ${badge.title}. Open achievements`);
  el.onclick=()=>{if(busy)return;collectionTab='seals';sealFilter=badges.length>1?'all':badge.group;earnedOnly=true;openModal({type:'achievements'});lastFocused=$('[data-action="achievements"]');el.remove();};
  $('#toasts').append(el);setTimeout(()=>el.remove(),8000);
}
let audio;
function sound(kind='reward'){
  if(state.settings.muted)return;
  try{audio??=new(window.AudioContext||window.webkitAudioContext)();audio.resume();if(kind==='coins'){playCoinSound(audio);return;}const t=audio.currentTime;[kind==='harm'?200:660,kind==='harm'?150:880].forEach((freq,i)=>{const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(0,t+i*.07);g.gain.linearRampToValueAtTime(.035,t+i*.07+.01);g.gain.exponentialRampToValueAtTime(.0001,t+i*.07+.16);o.connect(g);g.connect(audio.destination);o.start(t+i*.07);o.stop(t+i*.07+.17);});}catch{}
}
function rewardEffect(target,amount,kind='gold'){
  if(!target)return;
  const rect=target.getBoundingClientRect?target.getBoundingClientRect():target,el=document.createElement('span');el.className='reward-pop '+kind;el.textContent=`+${amount}${kind==='gold'?' gold':' XP'}`;el.style.left=rect.left+rect.width/2+'px';el.style.top=rect.top+'px';$('#effects').append(el);setTimeout(()=>el.remove(),1100);
  if(kind!=='gold'||state.settings.reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const dest=$('#gold-target')?.getBoundingClientRect();if(!dest)return;
  dest.width&&$('#gold-target').animate([{transform:'scale(1)'},{transform:'scale(1.07)'},{transform:'scale(1)'}],{duration:380,delay:750});
  for(let i=0;i<4;i++){const c=document.createElement('span');c.className='flying-coin';c.innerHTML=goldArt(1,true);c.style.left=rect.left+rect.width/2+'px';c.style.top=rect.top+'px';c.style.setProperty('--dx',dest.left+dest.width/2-rect.left-rect.width/2+'px');c.style.setProperty('--dy',dest.top+dest.height/2-rect.top+'px');c.style.animationDelay=i*55+'ms';$('#effects').append(c);setTimeout(()=>c.remove(),1200);}
}
function performReview(id,status){const reward=commit(()=>E.reviewNote(state,id,status,today()));if(reward)toast('A little clarity. +4 gold for your review.');}
const battleTimers=new Set();
const battleAudio=createCombatAudio(()=>state.settings.muted);
function scheduleBattle(fn,delay){const timer=setTimeout(()=>{battleTimers.delete(timer);fn();},delay);battleTimers.add(timer);}
function stopBattlePlayback(){for(const timer of battleTimers)clearTimeout(timer);battleTimers.clear();battleAudio.stop();}
function finishBattlePlayback(playSound=true){
  stopBattlePlayback();busy=false;
  if(modal?.type!=='battle')return;
  modal.index=modal.result.events.length-1;modal.finished=true;modal.impact=true;renderModal();
  if(playSound)battleAudio.play(modal.result.won?'victory':'defeat');
  if(!modal.replay&&pendingBadges.length){announceBadges(pendingBadges);pendingBadges=[];}
}
function animateBattle(result,initialHP,replay=false){
  stopBattlePlayback();battleAudio.unlock();busy=true;
  modal={type:'battle',result,index:-1,initialHP,finished:false,impact:false,replay};render();
  const reduced=state.settings.reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches;
  const advance=()=>{
    if(modal?.type!=='battle')return;
    modal.index++;modal.impact=false;
    if(modal.index>=result.events.length){finishBattlePlayback();return;}
    const event=result.events[modal.index],description=describeCombatEvent(event);
    renderModal();
    if(event.type==='attack')scheduleBattle(()=>battleAudio.play('sword'),120);
    if(event.type==='hit'||event.type==='deflect')scheduleBattle(()=>battleAudio.play('sword'),120);
    scheduleBattle(()=>{
      if(modal?.type!=='battle')return;
      modal.impact=true;$('#battle-stage')?.classList.add('impacted');
      const maximum=result.maxHP||E.maxHP(state),enemyMax=E.monsterStats(result.monster).hp;
      const player=$('#battle-player-bar'),enemy=$('#battle-enemy-bar');
      if(player){player.firstElementChild.style.width=event.hp/maximum*100+'%';player.setAttribute('aria-valuenow',event.hp);$('#battle-player-hp').textContent=`${event.hp} / ${maximum} HP`;}
      if(enemy){enemy.firstElementChild.style.width=event.enemy/enemyMax*100+'%';enemy.setAttribute('aria-valuenow',event.enemy);$('#battle-enemy-hp').textContent=`${event.enemy} / ${enemyMax} HP`;}
      if(event.type==='attack'){battleAudio.play('impact');scheduleBattle(()=>battleAudio.play('grunt'),80);}
      if(event.type==='hit'){battleAudio.play(event.blocked?'block':'impact');scheduleBattle(()=>battleAudio.play('grunt'),80);}
      if(event.type==='deflect')battleAudio.play('deflect');
      if(event.type==='rally')battleAudio.play('heal');
    },reduced?100:400);
    scheduleBattle(advance,reduced?Math.max(1200,description.duration-200):description.duration);
  };
  scheduleBattle(advance,1000);
}
// Update only the model during a drag, preserving focus and pointer capture.
let avatarDrag=null,avatarFrame=0,suppressAvatarClick=null;
function refreshAvatarViews(){
  const weapon=E.SHOP.find(i=>i.id===state.equipped.weapon),armor=E.SHOP.find(i=>i.id===state.equipped.armor);
  for(const view of $$('[data-avatar-view]')){
    const art=avatarArt(weapon,armor,view.dataset.avatarView==='studio',{angle:avatarAngle,appearance:state.appearance});
    const old=view.querySelector('svg.avatar-art');if(old)old.outerHTML=art;
  }
}
document.addEventListener('pointerdown',event=>{
  suppressAvatarClick=null;
  const view=event.target.closest('[data-avatar-view]');if(!view||event.button!==0||!event.isPrimary)return;
  avatarDrag={view,id:event.pointerId,start:event.clientX,angle:avatarAngle,moved:false};
  view.setPointerCapture(event.pointerId);
});
document.addEventListener('pointermove',event=>{
  if(!avatarDrag||event.pointerId!==avatarDrag.id)return;
  const dx=event.clientX-avatarDrag.start;
  if(Math.abs(dx)>5)avatarDrag.moved=true;
  if(!avatarDrag.moved)return;
  avatarDrag.view.classList.add('dragging');avatarAngle=avatarDrag.angle+dx*.012;
  if(!avatarFrame)avatarFrame=requestAnimationFrame(()=>{avatarFrame=0;refreshAvatarViews();});
});
function endAvatarDrag(event){
  if(!avatarDrag||event.pointerId!==avatarDrag.id)return;
  const {view,moved,id}=avatarDrag;view.classList.remove('dragging');
  if(moved)suppressAvatarClick=view;
  if(view.hasPointerCapture(id))view.releasePointerCapture(id);
  avatarDrag=null;
  if(avatarFrame){cancelAnimationFrame(avatarFrame);avatarFrame=0;refreshAvatarViews();}
}
document.addEventListener('pointerup',endAvatarDrag);
document.addEventListener('pointercancel',endAvatarDrag);
document.addEventListener('click',event=>{
  if(suppressAvatarClick){const view=suppressAvatarClick;suppressAvatarClick=null;if(event.detail>0&&event.target.closest('[data-avatar-view]')===view){event.preventDefault();event.stopImmediatePropagation();}}
},true);
document.addEventListener('keydown',event=>{
  if(event.target.matches('[data-action="collection-tab"]')&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
    event.preventDefault();collectionTab=event.key==='Home'?'seals':event.key==='End'?'monsters':collectionTab==='seals'?'monsters':'seals';renderModal();$(`#collection-tab-${collectionTab}`)?.focus();return;
  }
  if(event.target.matches('[data-action="shop-tab"]')&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
    event.preventDefault();
    const index=shopTabs.findIndex(([key])=>key===shopCategory);
    shopCategory=shopTabs[event.key==='Home'?0:event.key==='End'?shopTabs.length-1:(index+(event.key==='ArrowLeft'?-1:1)+shopTabs.length)%shopTabs.length][0];
    renderModal();$(`#shop-tab-${shopCategory}`)?.focus();return;
  }
  if(!event.target.matches('[data-avatar-view]')||!['ArrowLeft','ArrowRight','Home'].includes(event.key))return;
  event.preventDefault();avatarAngle=event.key==='Home'?-.45:avatarAngle+(event.key==='ArrowLeft'?-1:1)*Math.PI/8;refreshAvatarViews();
});
$('#app').addEventListener('click',handleClick);$('#overlay').addEventListener('click',handleClick);
function handleClick(event){
  const b=event.target.closest('[data-action]');if(!b)return;
  if(b.dataset.action==='dismiss'&&event.target!==b)return;
  const a=b.dataset.action,id=b.dataset.id,sourceRect=b.getBoundingClientRect();
  if(busy&&!['skip-battle','close-modal','dismiss','battle-mute'].includes(a))return;
  if(a==='close-modal'||a==='dismiss')return closeModal();
  if(a==='stat-info'){if(statTipButton===b&&statTipPinned)hideStatTooltip();else showStatTooltip(b,true);return;}
  if(a==='avatar-open')openModal({type:'avatar'});
  if(a==='avatar-turn'){const direction=Number(b.dataset.direction);avatarAngle+=direction*Math.PI/4;renderModal();$(`[data-action="avatar-turn"][data-direction="${direction}"]`)?.focus();}
  if(a==='avatar-reset'){avatarAngle=-.45;avatarZoom=1;renderModal();refreshAvatarViews();$('[data-action="avatar-reset"]')?.focus();}
  if(a==='avatar-zoom'){const direction=Number(b.dataset.direction);avatarZoom=Math.round(Math.min(1.4,Math.max(.8,avatarZoom+direction*.2))*10)/10;renderModal();($(`[data-action="avatar-zoom"][data-direction="${direction}"]:not(:disabled)`)||$('[data-action="avatar-zoom"]:not(:disabled)'))?.focus();}
  if(a==='appearance'){const key=b.dataset.field,value=b.dataset.value;if(APPEARANCE[key]?.some(o=>o.id===value)){commit(()=>{state.appearance[key]=value;});$(`[data-action="appearance"][data-field="${key}"][data-value="${value}"]`)?.focus();}}
  if(a==='category'){openCategories.has(b.dataset.category)?openCategories.delete(b.dataset.category):openCategories.add(b.dataset.category);render();}
  if(a==='task-view'){taskView=b.dataset.view;render();}
  if(a==='new-task')openModal({type:'task'});
  if(a==='edit-task')openModal({type:'task',id});
  if(a==='toggle-task'){const r=commit(()=>E.toggleTask(state,id));if(r>0){sound('coins');rewardEffect(sourceRect,r);toast(`Task cleared. +${r} gold.`,()=>commit(()=>{if(state.tasks.find(t=>t.id===id)?.done)E.toggleTask(state,id);} ));}else if(r<0)toast('Task restored and reward reversed.');}
  if(a==='delete-task'){commit(()=>{state.tasks=state.tasks.filter(t=>t.id!==id);for(const n of state.notes)if(n.taskId===id)delete n.taskId;});closeModal();toast('Task removed.');}
  if(a==='new-habit')openModal({type:'habit',category:b.dataset.category||'body'});
  if(a==='edit-habit')openModal({type:'habit',id});
  if(a==='delete-habit'){const h=state.habits.find(h=>h.id===id);openModal({type:'confirm-delete',id,title:h.title});}
  if(a==='cancel-delete')openModal({type:'habit',id:modal.id});
  if(a==='confirm-delete'){commit(()=>{state.habits=state.habits.filter(h=>h.id!==id);});closeModal();toast('Habit removed. Earned XP stays with you.');}
  if(a==='suggest-habit'){$('#habit-form [name="title"]').value=b.dataset.title;$('#habit-form [name="title"]').focus();}
  if(a==='habit'){
    const h=state.habits.find(h=>h.id===id),done=h.logs.some(l=>l.day===today());
    const r=commit(()=>done?E.undoHabit(state,id,today()):E.completeHabit(state,id,today()));
    if(!done&&r){sound();rewardEffect(sourceRect,r.amount,'xp');toast(r.leveled?`${E.CATEGORY_META[r.category].label} reached level ${E.level(state,r.category)}!`:`+${r.amount} ${E.CATEGORY_META[r.category].label} XP.`,()=>commit(()=>E.undoHabit(state,id,today())));}else if(done)toast('Completion undone. XP restored to its previous value.');
  }
  if(a==='harm'){const day=today();const damage=commit(()=>E.logHarm(state,id,day));if(damage!==undefined){sound('harm');const log=state.habits.find(h=>h.id===id).harmLogs.at(-1);toast(`Noted. −${damage} HP.`,()=>commit(()=>E.undoHarm(state,id,log.id,day)));}}
  if(a==='capture')openModal({type:'capture',kind:'note'});
  if(a==='capture-kind'){const text=$('#capture-text').value;modal.kind=b.dataset.kind;renderModal();$('#capture-text').value=text;$('#word-count').textContent=E.words(text)+' words';$('#capture-text').focus();}
  if(a==='vault'){vaultSearch='';openModal({type:'vault'});}
  if(a==='vault-filter'){vaultFilter=b.dataset.filter;renderModal();}
  if(a==='edit-note')openModal({type:'capture',id});
  if(a==='convert-note'){const wasInbox=state.notes.find(n=>n.id===id)?.status==='inbox';const r=commit(()=>{const t=E.convertNote(state,id);if(wasInbox)E.rewardReview(state,today());return t;});if(r){toast('Sent to your task inbox'+(wasInbox?' · review saved.':'.'));sound();}}
  if(a==='keep-note')performReview(id,'kept');
  if(a==='archive-note')performReview(id,'archived');
  if(a==='restore-note'){commit(()=>{const n=state.notes.find(n=>n.id===id);if(n)n.status='kept';});toast('Note restored.');}
  if(a==='delete-note'){const n=state.notes.find(n=>n.id===id);commit(()=>{if(n.status==='inbox')E.reviewNote(state,id,'archived',today());else n.status='archived';});openModal({type:'vault'});toast('Note archived.');}
  if(a==='shop'||a==='inventory')openModal({type:a});
  if(a==='achievements'||a==='bestiary'){collectionTab=a==='bestiary'?'monsters':'seals';monsterChapter=Math.ceil(state.monster.number/8);selectedMonster=state.monster.number;openModal({type:'achievements'});}
  if(a==='collection-tab'){collectionTab=b.dataset.tab;renderModal();$(`#collection-tab-${collectionTab}`)?.focus();}
  if(a==='seal-filter'){sealFilter=b.dataset.filter;renderModal();$(`[data-action="seal-filter"][data-filter="${sealFilter}"]`)?.focus();}
  if(a==='earned-filter'){earnedOnly=!earnedOnly;renderModal();$('[data-action="earned-filter"]')?.focus();}
  if(a==='current-monster'){monsterChapter=Math.ceil(state.monster.number/8);selectedMonster=state.monster.number;renderModal();$('[data-action="current-monster"]')?.focus();}
  if(a==='monster-page'){monsterChapter=Math.min(Math.max(2,Math.ceil(state.monster.number/8)+1),Math.max(1,monsterChapter+Number(b.dataset.direction)));selectedMonster=(monsterChapter-1)*8+1;renderModal();$('#monster-chapter')?.focus();}
  if(a==='select-monster'){selectedMonster=Number(b.dataset.number);renderModal();$('#monster-details')?.focus();}
  if(a==='view-challenge'){closeModal();($('#app [data-action="fight"]:not(:disabled)')||$('#app [data-action="recover"]'))?.focus();}
  if(a==='buy'){const item=commit(()=>E.buy(state,id));if(item){sound();toast(`${item.name} is yours.`);}}
  if(a==='equip'){const result=commit(()=>{E.equip(state,id);return true;});if(result)toast(E.SHOP.find(i=>i.id===id)?.type==='pet'?'Companion updated.':'Equipment updated.');}
  if(a==='potion'){shopCategory='potion';openModal({type:potionCount()?'inventory':'shop'});}
  if(a==='use-potion'){const healed=commit(()=>E.usePotion(state,id));if(healed){sound();toast(`+${healed} HP restored.`);}}
  if(a==='prepare-spell'){const result=commit(()=>{E.prepareSpell(state,id);return true;});if(result)toast(state.preparedSpell?'Spell prepared for your next fight.':'Spell put away. It stays in your inventory.');}
  if(a==='open-spells'){shopCategory='spell';openModal({type:'inventory'});}
  if(a==='shop-tab'){shopCategory=b.dataset.category;renderModal();$(`[data-action="shop-tab"][data-category="${shopCategory}"]`)?.focus();}
  if(a==='theme'){commit(()=>{state.settings.theme=state.settings.theme==='light'?'dark':'light';});}
  if(a==='mute'){commit(()=>{state.settings.muted=!state.settings.muted;});}
  if(a==='settings')openModal({type:'settings'});
  if(a==='reset-progress')openModal({type:'confirm-reset'});
  if(a==='restore-previous')openModal({type:'confirm-previous'});
  if(a==='confirm-reset'||a==='confirm-previous'){
    try{
      const next=a==='confirm-reset'?resetProgress(localStorage,state,protectSave?rawSave:null):restorePreviousProgress(localStorage,state);
      state=next;rawSave=JSON.stringify(next);protectSave=false;startupWarning='';saveError=false;pendingImport=null;pendingBadges=[];
      taskView='active';vaultFilter='inbox';vaultSearch='';shopCategory='weapon';openCategories=new Set(['body']);
      collectionTab='seals';sealFilter='all';earnedOnly=false;monsterChapter=Math.ceil(state.monster.number/8);selectedMonster=state.monster.number;
      avatarAngle=-.45;avatarZoom=1;chanceKey='';chance=null;modal=null;$('#toasts').replaceChildren();$('#effects').replaceChildren();render();
      $('[data-action="settings"]')?.focus();toast(a==='confirm-reset'?'New adventure started. Previous progress is recoverable in Settings.':'Previous progress restored.');
    }catch(error){toast(error.message||'Progress could not be saved. Your adventure has not been reset.');}
  }
  if(a==='recover')openModal({type:'capture',recovery:true});
  if(a==='fight'){const initialHP=state.hp,result=commit(()=>E.fight(state,today()),{deferBadges:true});if(result)animateBattle(result,initialHP);}
  if(a==='skip-battle')finishBattlePlayback();
  if(a==='replay-battle'){const result=state.battles.find(r=>r.monster===state.monster.number);if(result)animateBattle(result,result.initialHP??result.events[0]?.hp??state.hp,true);}
  if(a==='battle-mute'){state.settings.muted=!state.settings.muted;persist();if(state.settings.muted)battleAudio.stop();b.innerHTML=icon(state.settings.muted?'mute':'sound');b.setAttribute('aria-label',state.settings.muted?'Unmute combat':'Mute combat');b.title=state.settings.muted?'Unmute combat':'Mute combat';}
  if(a==='export')exportBackup();
  if(a==='import')$('#import-file').click();
  if(a==='confirm-import'){state=pendingImport;pendingImport=null;protectSave=false;startupWarning='';persist();modal=null;chanceKey='';render();toast('Backup restored. Welcome back.');}
}
$('#overlay').addEventListener('submit',event=>{
  event.preventDefault();if(busy)return;const form=event.target,data=new FormData(form),type=form.id;
  if(type==='task-form'){
    const title=data.get('title').trim();if(!title)return;
    const r=commit(()=>{const t=state.tasks.find(t=>t.id===modal.id);if(t){t.title=title;if(!t.done)t.tier=data.get('tier');if(data.get('sort'))t.inbox=false;}else state.tasks.unshift({id:E.uid(),title,tier:data.get('tier'),done:false,earned:0});return true;});if(r)closeModal();
  }
  if(type==='habit-form'){
    const title=data.get('title').trim();if(!title)return;
    if(!validHabitIcon(data.get('icon'))){toast('Choose a habit icon.');return;}
    const r=commit(()=>{const h=state.habits.find(h=>h.id===modal.id);if(h){h.title=title;h.base=Number(data.get('base'));h.icon=data.get('icon');}else state.habits.push({id:E.uid(),title,category:data.get('category'),base:Number(data.get('base')),icon:data.get('icon'),logs:[],harmLogs:[],created:Date.now()});openCategories.add(h?.category||data.get('category'));return true;});if(r)closeModal();
  }
  if(type==='capture-form'){
    const text=data.get('text').trim();if(!text)return;const previous=modal;
    const r=commit(()=>{const result=E.saveNote(state,{id:previous.id,text,kind:previous.kind==='journal'?'journal':'note',recovery:previous.recovery},today());if(previous.kind==='task'&&!previous.id)E.convertNote(state,result.note.id);return result;});
    if(r){closeModal();sound();toast(previous.recovery?`Reflection saved. +${r.healed} HP${r.reward?` · +${r.reward} gold`:''}.`:previous.kind==='task'?`Sent to task inbox${r.reward?` · +${r.reward} gold`:''}.`:`${previous.kind==='journal'?'Journal':'Thought'} saved${r.reward?` · +${r.reward} gold`:''}.`);}
  }
  if(type==='settings-form'){
    const name=data.get('name').trim(),timezone=data.get('timezone').trim();if(!name)return;
    try{E.dateKey(new Date(),timezone);}catch{toast('Use a timezone such as Atlantic/Madeira or America/New_York.');return;}
    protectSave=false;startupWarning='';commit(()=>{state.name=name;state.settings.timezone=timezone;state.settings.muted=!!data.get('muted');state.settings.reducedMotion=!!data.get('reduced');});closeModal();toast('Made a little more yours.');
  }
});
$('#overlay').addEventListener('input',event=>{
  if(event.target.id==='vault-search'){vaultSearch=event.target.value;$('#vault-results').innerHTML=renderNotes();}
  if(event.target.id==='capture-text'){
    const count=E.words(event.target.value);$('#word-count').textContent=count+' words';
    if(modal.recovery){const healed=Math.min(E.maxHP(state)-state.hp,Math.floor(count/2*E.healingMultiplier(state)));$('#preview-hp').textContent=state.hp+healed;$('#preview-heal').textContent='+'+healed+' HP';$('#preview-bar').style.width=(state.hp+healed)/E.maxHP(state)*100+'%';}
  }
});
$('#overlay').addEventListener('change',async event=>{
  if(event.target.name==='icon')$('#habit-icon-label').textContent=HABIT_ICONS.find(i=>i.id===event.target.value).label;
  if(event.target.name==='category'){
    const cat=event.target.value;$('#habit-base').innerHTML=habitOptions(cat);$('#effort-label').firstChild.textContent=cat==='harm'?'HP cost':'Effort';$('#habit-suggestions').innerHTML=suggestionButtons(cat);$('#habit-form .form-help').textContent=cat==='harm'?'Log it whenever it happens. It costs HP, with no XP or level.':'Available every day, once a day. No schedule to keep.';
    const selected=$('#habit-form [name="icon"]:checked').value;$('#habit-icon-picker').className='habit-icon-picker '+cat;$('#habit-icon-options').innerHTML=habitIconOptions(cat,selected);
  }
  if(event.target.id==='monster-chapter'){monsterChapter=Number(event.target.value);selectedMonster=(monsterChapter-1)*8+1;renderModal();$('#monster-chapter')?.focus();}
  if(event.target.id==='import-file'){
    const file=event.target.files[0];if(!file)return;
    try{if(file.size>5e6)throw new Error('Choose a backup smaller than 5 MB.');pendingImport=E.validateState(JSON.parse(await file.text()));openModal({type:'confirm-import'});}catch(error){toast(error.message==='Unexpected end of JSON input'?'This backup could not be read.':error.message);}
  }
});
function exportBackup(){const blob=new Blob([protectSave&&rawSave?rawSave:JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`twesk-${protectSave?'original-save':'backup'}-${today()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Backup exported. Keep it somewhere safe.');}
document.addEventListener('keydown',event=>{
  if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();if(!busy)openModal({type:'capture',kind:'note'});}
  if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='j'){event.preventDefault();if(!busy)openModal({type:'vault'});}
  if(event.key==='Escape'){if(!statTooltip.hidden){hideStatTooltip();event.preventDefault();return;}closeModal();}
  if(event.key==='Tab'&&modal){const focusable=$$('#overlay button:not([disabled]),#overlay input:not([hidden]):not([disabled]),#overlay textarea,#overlay select:not([disabled])').filter(e=>e.offsetParent!==null);const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
});
window.addEventListener('storage',event=>{
  if(event.key!==KEY||!event.newValue)return;
  if(busy){toast('Progress changed in another tab. Finish this encounter, then reload to use that save.');return;}
  try{const incoming=E.validateState(JSON.parse(event.newValue));if(incoming.revision>state.revision){state=incoming;render();toast('Progress updated from another tab.');}}catch{}
});
setInterval(()=>{if(!busy&&!modal&&today()!==lastDay){E.rollover(state,today());persist();render();}},30000);
window.addEventListener('focus',()=>{if(!busy&&!modal&&today()!==lastDay){E.rollover(state,today());persist();render();}});
awardAchievements(state,today());render();if(!protectSave)persist();
