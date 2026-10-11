// The adventurer: dashboard card, rotatable model, appearance studio.
import * as E from './engine.js?v=0.21.1';
import { APPEARANCE, APPEARANCE_LABELS, appearanceOption } from './appearance.js';
import { avatarArt, itemArt, petArt } from './art.js?v=0.21.1';
import { $, $$, app, coin, esc, icon, modalShell, view } from './ui-core.js?v=0.21.1';
import { commit, openModal } from './ui-modal.js?v=0.21.1';
import { burst, sound } from './ui-effects.js?v=0.21.1';
export function petCompanion() {
  const pet = E.SHOP.find(i => i.id === app.state.activePet);
  const hat = E.SHOP.find(i => i.id === app.state.petHat);
  const label = `${pet?.name} companion${hat ? ` wearing a ${hat.name.toLowerCase()}` : ''}`;
  return pet
    ? `<span class="pet-companion" role="img" aria-label="${esc(label)}" title="${esc(label)}">${petArt(pet, hat)}</span>`
    : '';
}
export function potionCount() {
  return E.SHOP.filter(i => i.type === 'potion' && !i.tonic).reduce(
    (n, i) => n + E.itemCount(app.state, i.id),
    0,
  );
}
// Equipped gear by slot, and the appearance shown (including a style being tried on in the studio).
export const gear = () =>
  Object.fromEntries(
    E.GEAR_SLOTS.map(slot => [slot, E.SHOP.find(i => i.id === app.state.equipped[slot]) || null]),
  );
const shownLook = () =>
  app.avatarPreview
    ? { ...app.state.appearance, [app.avatarPreview.key]: app.avatarPreview.value }
    : app.state.appearance;
export function renderCharacter() {
  const { weapon, armor, helmet } = gear(),
    hpMax = E.maxHP(app.state);
  return `<section class="panel character-panel"><div class="character-heading"><span class="section-kicker">YOUR ADVENTURER</span><button class="wallet" data-action="shop" id="gold-target" title="Open the shop" aria-label="${app.state.gold} gold · Open shop">${coin(app.state.gold, true)}</button></div><button class="avatar-scene avatar-interactive" data-avatar-view="dashboard" data-action="avatar-open" aria-label="Inspect and personalize your character. Drag to rotate; click to enlarge. Arrow keys rotate." title="Drag to rotate · Click to enlarge">${avatarArt(weapon, armor, false, { angle: app.avatarAngle, appearance: app.state.appearance, helmet })}${petCompanion()}</button><h2 class="character-name">${esc(app.state.name)}</h2><div class="health-label"><span>${icon('heart')}Health</span><strong>${app.state.hp}<span> / ${hpMax} HP</span></strong></div><div class="health-bar"><div style="width:${(app.state.hp / hpMax) * 100}%"></div></div><div class="stat-chips">${E.CATEGORIES.map(c => `<button class="stat-chip ${c}" data-action="stat-info" data-stat="${c}" aria-label="${E.CATEGORY_META[c].label}, level ${E.level(app.state, c)}. Combat benefits" aria-expanded="false">${icon(c)}<strong>${E.level(app.state, c)}</strong></button>`).join('')}</div><div class="character-actions"><button class="button secondary" data-action="shop">${icon('coin')}Shop</button><button class="button secondary" data-action="inventory">${icon('shield')}Inventory</button><button class="potion-button" data-action="potion" title="${potionCount() ? 'Open your potions' : 'Visit the shop for potions'}" aria-label="Open potions · ${potionCount()} owned">${itemArt(E.SHOP[0])}<span>${potionCount()}</span></button></div>${app.state.pendingRecovery && app.state.hp < hpMax ? '<button class="recovery-link" data-action="recover">' + icon('pencil') + 'Write a reflection to recover</button>' : ''}</section>`;
}
// Update only the model during a drag, preserving focus and pointer capture.
let avatarDrag = null,
  avatarFrame = 0,
  suppressAvatarClick = null;
function refreshAvatarViews() {
  const { weapon, armor, helmet } = gear();
  for (const view of $$('[data-avatar-view]')) {
    const studio = view.dataset.avatarView === 'studio';
    const art = avatarArt(weapon, armor, studio, {
      angle: app.avatarAngle,
      appearance: studio ? shownLook() : app.state.appearance,
      helmet,
    });
    const old = view.querySelector('svg.avatar-art');
    if (old) old.outerHTML = art;
  }
}
document.addEventListener('pointerdown', event => {
  suppressAvatarClick = null;
  const view = event.target.closest('[data-avatar-view]');
  if (!view || event.button !== 0 || !event.isPrimary) return;
  avatarDrag = { view, id: event.pointerId, start: event.clientX, angle: app.avatarAngle, moved: false };
  view.setPointerCapture(event.pointerId);
});
document.addEventListener('pointermove', event => {
  if (!avatarDrag || event.pointerId !== avatarDrag.id) return;
  const dx = event.clientX - avatarDrag.start;
  if (Math.abs(dx) > 5) avatarDrag.moved = true;
  if (!avatarDrag.moved) return;
  avatarDrag.view.classList.add('dragging');
  app.avatarAngle = avatarDrag.angle + dx * 0.012;
  if (!avatarFrame)
    avatarFrame = requestAnimationFrame(() => {
      avatarFrame = 0;
      refreshAvatarViews();
    });
});
function endAvatarDrag(event) {
  if (!avatarDrag || event.pointerId !== avatarDrag.id) return;
  const { view, moved, id } = avatarDrag;
  view.classList.remove('dragging');
  if (moved) suppressAvatarClick = view;
  if (view.hasPointerCapture(id)) view.releasePointerCapture(id);
  avatarDrag = null;
  if (avatarFrame) {
    cancelAnimationFrame(avatarFrame);
    avatarFrame = 0;
    refreshAvatarViews();
  }
}
document.addEventListener('pointerup', endAvatarDrag);
document.addEventListener('pointercancel', endAvatarDrag);
document.addEventListener(
  'click',
  event => {
    if (suppressAvatarClick) {
      const view = suppressAvatarClick;
      suppressAvatarClick = null;
      if (event.detail > 0 && event.target.closest('[data-avatar-view]') === view) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }
  },
  true,
);
export function onKeydown(event) {
  if (!event.target.matches('[data-avatar-view]') || !['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key))
    return;
  event.preventDefault();
  app.avatarAngle =
    event.key === 'Home' ? -0.45 : app.avatarAngle + ((event.key === 'ArrowLeft' ? -1 : 1) * Math.PI) / 8;
  refreshAvatarViews();
}
export const modals = {
  avatar() {
    return renderAvatarModal();
  },
};
function appearanceButton(key, o, look) {
  const text = ['style', 'beard', 'accessory'].includes(key),
    owned = E.cosmeticOwned(app.state, key, o.id),
    selected = look[key] === o.id;
  const label = `${APPEARANCE_LABELS[key]}: ${o.name}${owned ? '' : `, locked, ${o.price} gold. Select to try it on`}`;
  return `<button class="${text ? 'style-option' : 'appearance-swatch'} ${selected ? 'selected' : ''} ${owned ? '' : 'locked'}" data-action="appearance" data-field="${key}" data-value="${o.id}" ${o.color ? `style="--swatch:${o.color}"` : ''} aria-label="${esc(label)}" aria-pressed="${selected}" title="${esc(o.name)}${owned ? '' : ` · ${o.price} gold`}">${text ? esc(o.name) + (owned ? '' : `<small>${icon('lock')}${o.price}</small>`) : selected ? icon('check') : owned ? '' : icon('lock')}</button>`;
}
function previewBar() {
  const preview = app.avatarPreview;
  if (!preview) return '';
  const option = appearanceOption(preview.key, preview.value);
  return `<div class="style-preview-bar" role="status"><span>Trying on <strong>${esc(option.name)}</strong> · ${APPEARANCE_LABELS[preview.key].toLowerCase()}</span><div><button class="button primary" data-action="buy-preview" ${app.state.gold < option.price ? 'disabled' : ''}>Buy &amp; wear ${coin(option.price, true)}</button><button class="text-button" data-action="cancel-preview">Cancel</button></div></div>`;
}
function renderAvatarModal() {
  const { weapon, armor, helmet } = gear(),
    pet = E.activePetItem(app.state),
    look = shownLook();
  const wearing = [
    [weapon, 'sword', 'Unarmed', 'No weapon equipped', i => `+${i.bonus} attack`],
    [armor, 'shield', 'No armor', 'Clothing only', i => `${i.bonus} damage blocked`],
    [helmet, 'helmet', 'No helmet', 'Bare-headed', i => `+${i.bonus} max HP`],
    [pet, 'pet', 'No companion', 'Pets lend a small bonus', i => i.description.split('·')[1]?.trim() || ''],
  ];
  return modalShell(
    esc(app.state.name),
    `<div class="character-studio"><div class="character-preview"><div class="avatar-turntable avatar-interactive" data-avatar-view="studio" tabindex="0" role="group" aria-label="Character model. Drag or use arrow keys to rotate."><div class="avatar-model-scale" style="--avatar-zoom:${app.avatarZoom}">${avatarArt(weapon, armor, true, { angle: app.avatarAngle, appearance: look, helmet })}</div>${petCompanion()}</div><div class="avatar-view-controls"><button class="icon-button" data-action="avatar-turn" data-direction="-1" aria-label="Rotate left">↶</button><button class="text-button" data-action="avatar-reset">Reset view</button><button class="icon-button" data-action="avatar-turn" data-direction="1" aria-label="Rotate right">↷</button><span></span><button class="icon-button" data-action="avatar-zoom" data-direction="-1" aria-label="Zoom out" ${app.avatarZoom <= 0.8 ? 'disabled' : ''}>−</button><output aria-label="Character zoom">${Math.round(app.avatarZoom * 100)}%</output><button class="icon-button" data-action="avatar-zoom" data-direction="1" aria-label="Zoom in" ${app.avatarZoom >= 1.4 ? 'disabled' : ''}>+</button></div>${previewBar()}</div><div class="appearance-panel"><h3>Appearance</h3>${Object.entries(
      APPEARANCE,
    )
      .map(
        ([key, options]) =>
          `<fieldset class="appearance-field"><legend>${APPEARANCE_LABELS[key]}</legend><div class="${['style', 'beard', 'accessory'].includes(key) ? 'hair-style-options' : 'appearance-swatches'}">${options.map(o => appearanceButton(key, o, look)).join('')}</div></fieldset>`,
      )
      .join('')}<div class="avatar-equipped"><h3>Wearing</h3>${wearing
      .map(
        ([item, symbol, none, noneDetail, detail]) =>
          `<div><span class="avatar-gear-icon">${item ? itemArt(item) : icon(symbol)}</span><span><strong>${item ? esc(item.name) : none}</strong><small>${item ? esc(detail(item)) : noneDetail}</small></span></div>`,
      )
      .join(
        '',
      )}</div><p class="appearance-save-note">Free looks save automatically. ${icon('lock')} styles can be tried on here, then bought with gold. Armor covers your clothing; helmets cover some hairstyles.</p></div></div>`,
    'avatar-modal',
  );
}
export const actions = {
  'avatar-open'(b, { a, id, sourceRect }) {
    openModal({ type: 'avatar' });
  },
  'avatar-turn'(b, { a, id, sourceRect }) {
    const direction = Number(b.dataset.direction);
    app.avatarAngle += (direction * Math.PI) / 4;
    view.renderModal();
    $(`[data-action="avatar-turn"][data-direction="${direction}"]`)?.focus();
  },
  'avatar-reset'(b, { a, id, sourceRect }) {
    app.avatarAngle = -0.45;
    app.avatarZoom = 1;
    view.renderModal();
    refreshAvatarViews();
    $('[data-action="avatar-reset"]')?.focus();
  },
  'avatar-zoom'(b, { a, id, sourceRect }) {
    const direction = Number(b.dataset.direction);
    app.avatarZoom = Math.round(Math.min(1.4, Math.max(0.8, app.avatarZoom + direction * 0.2)) * 10) / 10;
    view.renderModal();
    (
      $(`[data-action="avatar-zoom"][data-direction="${direction}"]:not(:disabled)`) ||
      $('[data-action="avatar-zoom"]:not(:disabled)')
    )?.focus();
  },
  appearance(b) {
    const key = b.dataset.field,
      value = b.dataset.value;
    if (!appearanceOption(key, value)) return;
    if (E.cosmeticOwned(app.state, key, value)) {
      app.avatarPreview = null;
      commit(() => E.setAppearance(app.state, key, value));
    } else {
      // Locked styles are previewed on the model first; nothing is saved until bought.
      app.avatarPreview = { key, value };
      view.renderModal();
    }
    $(`[data-action="appearance"][data-field="${key}"][data-value="${value}"]`)?.focus();
  },
  'buy-preview'() {
    const { key, value } = app.avatarPreview || {};
    const option = commit(() => E.buyCosmetic(app.state, key, value));
    if (!option) return;
    app.avatarPreview = null;
    view.renderModal();
    sound('purchase');
    burst($('#overlay .avatar-turntable'), { palette: 'xp', count: 20, distance: 110 });
    $(`[data-action="appearance"][data-field="${key}"][data-value="${value}"]`)?.focus();
  },
  'cancel-preview'() {
    const key = app.avatarPreview?.key;
    app.avatarPreview = null;
    view.renderModal();
    $(`[data-action="appearance"][data-field="${key}"].selected`)?.focus();
  },
};
