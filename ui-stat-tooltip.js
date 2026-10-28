// Floating explanations for the character's stat chips.
import * as E from './engine.js?v=0.41.4';
import { app, icon } from './ui-core.js?v=0.41.4';
const statTooltip = document.createElement('div');
statTooltip.id = 'stat-tooltip';
statTooltip.className = 'stat-tooltip';
statTooltip.setAttribute('role', 'tooltip');
statTooltip.hidden = true;
document.body.append(statTooltip);
let statTipButton = null,
  statTipPinned = false,
  statTipHideTimer = 0;
function statExplanation(category) {
  const current = E.level(app.state, category),
    next = current + 1;
  // Read benefits from the combat rules, excluding equipment and spell bonuses.
  const intrinsic = {
    ...app.state,
    equipped: { weapon: null, armor: null, helmet: null },
    preparedSpell: null,
    tonic: null,
    activePet: null,
  };
  const stronger = { ...intrinsic, xp: { ...app.state.xp, [category]: app.state.xp[category] + 300 } };
  const now = E.combatStats(intrinsic),
    then = E.combatStats(stronger);
  const percent = n => (n * 100).toLocaleString('en', { maximumFractionDigits: 1 }) + '%';
  const details = {
    body: {
      description: 'Raises your maximum health so you can survive more damage.',
      now: `${now.max} maximum HP`,
      next: `${then.max} maximum HP`,
    },
    mind: {
      description:
        'Exploit monster weaknesses. Extra damage applies to every attack and adds to your weapon and spell.',
      now: `+${now.attack} damage per attack`,
      next: `+${then.attack} damage per attack`,
    },
    soul: {
      description: 'A chance to deflect each incoming monster attack completely and take no damage.',
      now: `${percent(now.dodge)} deflect chance`,
      next: `${percent(then.dodge)} deflect chance`,
    },
    heart: {
      description:
        'Rally once per fight when you survive a hit at half health or below. Recovery is capped by missing HP.',
      now: now.rally ? `Recover up to ${now.rally} HP` : 'No combat rally yet',
      next: `Recover up to ${then.rally} HP`,
      healing: `Also improves potions and recovery journaling: +${percent(E.healingMultiplier(intrinsic) - 1)} now → +${percent(E.healingMultiplier(stronger) - 1)} next level.`,
    },
  };
  const d = details[category];
  return `<div class="stat-tip-heading">${icon(category)}<strong>${E.CATEGORY_META[category].label}</strong></div><p>${d.description}</p><div class="stat-tip-benefit"><span>Level ${current}<small>Current</small></span><strong>${d.now}</strong></div><div class="stat-tip-benefit next"><span>Level ${next}<small>Next</small></span><strong>${d.next}</strong></div>${d.healing ? `<p class="stat-tip-healing">${d.healing}</p>` : ''}<small class="stat-tip-xp">${app.state.xp[category] % 300} / 300 XP toward level ${next}</small>`;
}
export function hideStatTooltip() {
  clearTimeout(statTipHideTimer);
  if (statTipButton) {
    statTipButton.removeAttribute('aria-describedby');
    statTipButton.setAttribute('aria-expanded', 'false');
  }
  statTipButton = null;
  statTipPinned = false;
  statTooltip.hidden = true;
}
function showStatTooltip(button, pinned = false) {
  if (app.modal || app.busy) return;
  if (statTipButton !== button) hideStatTooltip();
  statTipButton = button;
  statTipPinned = pinned || statTipPinned;
  statTooltip.className = 'stat-tooltip ' + button.dataset.stat;
  statTooltip.innerHTML = statExplanation(button.dataset.stat);
  const viewWidth = document.documentElement.clientWidth,
    viewHeight = document.documentElement.clientHeight;
  statTooltip.style.width = Math.min(300, viewWidth - 24) + 'px';
  statTooltip.hidden = false;
  button.setAttribute('aria-describedby', 'stat-tooltip');
  button.setAttribute('aria-expanded', 'true');
  const rect = button.getBoundingClientRect(),
    width = statTooltip.offsetWidth,
    height = statTooltip.offsetHeight;
  statTooltip.style.left =
    Math.max(12, Math.min(viewWidth - width - 12, rect.left + rect.width / 2 - width / 2)) + 'px';
  const top = rect.top - height - 10 >= 12 ? rect.top - height - 10 : rect.bottom + 10;
  statTooltip.style.top = Math.max(12, Math.min(viewHeight - height - 12, top)) + 'px';
}
export function toggleStatTooltip(button) {
  if (statTipButton === button && statTipPinned) hideStatTooltip();
  else showStatTooltip(button, true);
}
// Escape closes an open explanation before anything else.
export function dismissStatTooltip() {
  if (statTooltip.hidden) return false;
  hideStatTooltip();
  return true;
}
document.addEventListener('pointerover', event => {
  if (event.target.closest('.stat-chip,#stat-tooltip')) clearTimeout(statTipHideTimer);
  const button = event.target.closest('.stat-chip');
  if (button && event.pointerType !== 'touch' && !button.contains(event.relatedTarget) && !statTipPinned)
    showStatTooltip(button);
});
document.addEventListener('pointerout', event => {
  if (statTipPinned || !statTipButton) return;
  const from = event.target.closest('.stat-chip,#stat-tooltip');
  const to = event.relatedTarget;
  if (
    from &&
    !statTipButton.contains(to) &&
    !statTooltip.contains(to) &&
    document.activeElement !== statTipButton
  )
    statTipHideTimer = setTimeout(() => {
      if (!statTipPinned) hideStatTooltip();
    }, 120);
});
document.addEventListener('focusin', event => {
  if (event.target.matches('.stat-chip')) showStatTooltip(event.target);
});
document.addEventListener('focusout', event => {
  if (event.target.matches('.stat-chip') && !statTipPinned) hideStatTooltip();
});
document.addEventListener('pointerdown', event => {
  if (!event.target.closest('.stat-chip,#stat-tooltip')) hideStatTooltip();
});
window.addEventListener('resize', hideStatTooltip);
window.addEventListener(
  'scroll',
  event => {
    if (!statTooltip.contains(event.target)) hideStatTooltip();
  },
  true,
);
