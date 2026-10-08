// Opening and closing dialogs, saving changes as transactions, and seal notifications.
import { awardAchievements } from './achievements.js?v=0.7.0';
import { badgeArt } from './badge-art.js?v=0.7.0';
import { $, app, esc, persist, toast, today, view } from './ui-core.js?v=0.8.0';
import { hideStatTooltip } from './ui-stat-tooltip.js?v=0.8.0';
import * as E from './engine.js?v=0.7.5';
export function commit(fn, { deferBadges = false } = {}) {
  if (app.busy) return;
  // Only commit a complete successful transaction.
  const previous = structuredClone(app.state);
  try {
    const result = fn(),
      newBadges = awardAchievements(app.state, today());
    view.render();
    persist();
    if (deferBadges) app.pendingBadges.push(...newBadges);
    else announceBadges(newBadges);
    return result;
  } catch (error) {
    app.state = previous;
    toast(error.message);
    return undefined;
  }
}
let lastFocused = null;
export function openModal(value) {
  hideStatTooltip();
  lastFocused = document.activeElement;
  app.modal = value;
  view.renderModal();
  requestAnimationFrame(() => {
    const target = $('#overlay [autofocus]') || $('#overlay button');
    target?.focus();
  });
}
export function closeModal() {
  if (app.busy) {
    view.finishBattlePlayback();
    return;
  }
  app.modal = null;
  if (today() !== app.lastDay) {
    E.rollover(app.state, today());
    view.render();
    persist();
  } else view.renderModal();
  lastFocused?.focus?.();
}
export function announceBadges(badges) {
  if (!badges.length) return;
  const badge = badges[0],
    el = document.createElement('button');
  el.className = 'badge-unlock';
  el.innerHTML = `${badgeArt(badge, true)}<span><small>SEAL EARNED${badges.length > 1 ? ' · +' + (badges.length - 1) + ' more' : ''}</small><strong>${esc(badge.title)}</strong><span>View achievements ↗</span></span>`;
  el.setAttribute('aria-label', `Seal earned: ${badge.title}. Open achievements`);
  el.onclick = () => {
    if (app.busy) return;
    app.collectionTab = 'seals';
    app.sealFilter = badges.length > 1 ? 'all' : badge.group;
    app.earnedOnly = true;
    openModal({ type: 'achievements' });
    lastFocused = $('[data-action="achievements"]');
    el.remove();
  };
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 8000);
}
