// Opening and closing dialogs, saving changes as transactions, and seal notifications.
import { awardAchievements } from './achievements.js?v=0.42.5';
import { badgeArt } from './badge-art.js?v=0.42.5';
import { $, app, esc, persist, toast, today, view } from './ui-core.js?v=0.42.5';
import { burst, motionOK, sound } from './ui-effects.js?v=0.42.5';
import { hideStatTooltip } from './ui-stat-tooltip.js?v=0.42.5';
import * as E from './engine.js?v=0.42.5';
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
  app.avatarPreview = null;
  if (today() !== app.lastDay) {
    E.rollover(app.state, today());
    view.render();
    persist();
  } else view.renderModal();
  lastFocused?.focus?.();
  view.modalClosed();
}
export function announceBadges(badges) {
  if (!badges.length) return;
  const badge = badges[0],
    el = document.createElement('button');
  el.className = 'badge-unlock';
  el.innerHTML = `<span class="seal-wrap"><span class="seal-rays" aria-hidden="true"></span>${badgeArt(badge, true)}</span><span><small>SEAL EARNED${badges.length > 1 ? ' · +' + (badges.length - 1) + ' more' : ''}</small><strong>${esc(badge.title)}</strong><span>View achievements ↗</span></span>`;
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
  // Let the reward that earned the seal land first, then make an entrance.
  const delay = motionOK() ? 650 : 0;
  setTimeout(() => {
    $('#toasts').append(el);
    sound('badge');
    burst(el.querySelector('.seal-wrap'), { palette: 'gold', count: 20, distance: 90, size: 6 });
    setTimeout(() => el.remove(), 9000);
  }, delay);
}
