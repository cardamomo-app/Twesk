// Shop and inventory: buying, equipping, potions, spells, and pets.
import * as E from './engine.js?v=0.8.2';
import { itemArt, monsterName } from './art.js?v=0.7.4';
import { $, app, coin, esc, icon, modalShell, toast, view } from './ui-core.js?v=0.8.2';
import { commit, openModal } from './ui-modal.js?v=0.8.0';
import { sound } from './ui-effects.js?v=0.8.0';
import { potionCount } from './ui-character.js?v=0.8.0';
import { percent, requestOdds } from './ui-odds.js?v=0.8.2';
// Odds are compared against the next opponent, at full health when currently at 0 HP.
function comparisonBase() {
  const s = app.state;
  return {
    ...s,
    hp: s.hp || E.maxHP(s),
    monster: { number: s.monster.number + (s.monster.defeatedOn ? 1 : 0) },
  };
}
const inUse = item =>
  item.type === 'spell' ? app.state.preparedSpell === item.id : app.state.equipped[item.type] === item.id;
// What changes if this weapon, armor, or spell replaces the current one.
function comparison(item) {
  if (!['weapon', 'armor', 'spell'].includes(item.type)) return '';
  const stat = item.type === 'armor' || item.effect === 'armor' ? 'armor' : 'attack',
    unit = stat === 'armor' ? 'blocked per hit' : 'attack';
  const now = E.combatStats(app.state)[stat],
    then = E.combatStats(E.withItem(app.state, item))[stat],
    delta = then - now;
  const current =
    item.type === 'spell'
      ? E.preparedSpell(app.state)
      : E.SHOP.find(x => x.id === app.state.equipped[item.type]);
  const selected = inUse(item);
  const change = selected
    ? `<strong>${now} ${unit}</strong> <small>${item.type === 'spell' ? 'prepared' : 'equipped'}</small>`
    : `<strong class="${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${Math.abs(delta)} ${unit}</strong> <small>vs ${current ? esc(current.name) : item.type === 'weapon' ? 'unarmed' : item.type === 'armor' ? 'no armor' : 'no spell'}</small>`;
  const base = comparisonBase(),
    foe = monsterName(base.monster.number);
  return `<div class="item-compare" data-compare="${item.id}"><span>${change}</span><span class="item-odds">Win vs ${esc(foe)}${app.state.hp ? '' : ' at full HP'}: ${selected ? '<strong data-odds="now">…</strong>' : '<span data-odds="now">…</span> → <strong data-odds="with">…</strong>'}</span></div>`;
}
// Fill in odds after the dialog renders; results arrive from the worker.
function fillComparisons() {
  const base = comparisonBase();
  for (const el of document.querySelectorAll('[data-compare]')) {
    const item = E.SHOP.find(i => i.id === el.dataset.compare);
    const show = (slot, chance) => {
      const target = el.querySelector(`[data-odds="${slot}"]`);
      if (target) target.textContent = percent(chance);
    };
    Promise.all([requestOdds(base), requestOdds(E.withItem(base, item))]).then(([before, after]) => {
      show('now', before);
      show('with', after);
      const strong = el.querySelector('[data-odds="with"]');
      if (strong && before !== null && after !== null)
        strong.className =
          Math.round(after * 100) > Math.round(before * 100)
            ? 'up'
            : Math.round(after * 100) < Math.round(before * 100)
              ? 'down'
              : '';
    });
  }
}
const shopTabs = [
  ['weapon', 'Weapons', 'sword'],
  ['armor', 'Armor', 'shield'],
  ['potion', 'Potions', 'heart'],
  ['spell', 'Spells', 'soul'],
  ['pet', 'Pets', 'pet'],
];
function renderShop(inventory) {
  queueMicrotask(fillComparisons);
  const items = E.SHOP.filter(
    i => i.type === app.shopCategory && (!inventory || E.itemCount(app.state, i.id) > 0),
  ).sort((a, b) => a.price - b.price);
  const labels = {
    weapon: 'One weapon at a time. New weapons fill an empty slot automatically.',
    armor: 'One armor at a time. New armor fills an empty slot automatically.',
    potion: 'Potions are used once. Healing is capped at your maximum HP.',
    spell:
      'Prepare one spell at a time. It is consumed when a fight starts, even on defeat. Switching or putting it away costs nothing.',
    pet: 'Choose one companion. Pets are permanent and cosmetic.',
  };
  return modalShell(
    inventory ? 'Your inventory' : 'Shop',
    `<div class="shop-top"><div class="segmented"><button data-action="shop" class="${!inventory ? 'selected' : ''}">Shop</button><button data-action="inventory" class="${inventory ? 'selected' : ''}">Inventory</button></div><div class="shop-wallet"><span>Your gold</span><span class="wallet" aria-label="${app.state.gold} gold">${coin(app.state.gold, true)}</span></div></div>
    <div class="shop-tabs" role="tablist" aria-label="Item categories">${shopTabs.map(([key, label, symbol]) => `<button role="tab" id="shop-tab-${key}" aria-controls="shop-items" aria-selected="${app.shopCategory === key}" tabindex="${app.shopCategory === key ? '0' : '-1'}" data-action="shop-tab" data-category="${key}">${icon(symbol)}${label}</button>`).join('')}</div>
    <div id="shop-items" role="tabpanel" aria-labelledby="shop-tab-${app.shopCategory}" tabindex="0"><div class="shop-grid">${
      items.length
        ? items
            .map(i => {
              const count = E.itemCount(app.state, i.id),
                consumable = E.isConsumable(i),
                owned = !consumable && count > 0;
              const selected =
                i.type === 'pet'
                  ? app.state.activePet === i.id
                  : i.type === 'spell'
                    ? app.state.preparedSpell === i.id
                    : app.state.equipped[i.type] === i.id;
              const action =
                i.type === 'potion' ? 'use-potion' : i.type === 'spell' ? 'prepare-spell' : 'equip';
              const useLabel =
                i.type === 'potion'
                  ? 'Use potion'
                  : i.type === 'spell'
                    ? selected
                      ? 'Prepared · put away'
                      : 'Prepare for fight'
                    : i.type === 'pet'
                      ? selected
                        ? 'Companion · remove'
                        : 'Choose companion'
                      : selected
                        ? 'Equipped · remove'
                        : 'Equip';
              return `<article class="shop-item ${i.tier} ${i.type} ${owned ? 'owned' : ''} ${selected ? 'item-selected' : ''}">${count ? `<span class="item-count">${consumable ? count + ' owned' : selected ? icon('check') + 'Selected' : 'Owned'}</span>` : ''}<div class="item-art">${itemArt(i)}</div><div class="item-copy"><span class="item-tier">${i.type === 'pet' ? 'COMPANION' : i.type === 'spell' ? 'ONE FIGHT' : i.tier.toUpperCase()}</span><h3>${esc(i.name)}</h3><p>${esc(i.description)}</p></div>${comparison(i)}${!inventory ? `<button class="button secondary" data-action="buy" data-id="${i.id}" aria-label="${owned ? esc(i.name) + ' owned' : 'Buy ' + esc(i.name) + ' for ' + i.price + ' gold'}" ${owned || app.state.gold < i.price ? 'disabled' : ''}>${owned ? icon('check') + 'Owned' : `Buy ${coin(i.price, true)}`}</button>` : ''}${count ? `<button class="button ${inventory ? 'primary' : 'item-use'}" data-action="${action}" data-id="${i.id}" aria-label="${i.type === 'potion' ? 'Use' : i.type === 'spell' ? (selected ? 'Put away' : 'Prepare') : selected ? 'Remove' : 'Equip'} ${esc(i.name)}" ${i.type === 'potion' && app.state.hp === E.maxHP(app.state) ? 'disabled' : ''}>${i.type === 'potion' && app.state.hp === E.maxHP(app.state) ? 'Full health' : useLabel}</button>` : ''}</article>`;
            })
            .join('')
        : `<div class="empty-state"><span class="empty-symbol">${icon(shopTabs.find(t => t[0] === app.shopCategory)[2])}</span><h3>No ${shopTabs.find(t => t[0] === app.shopCategory)[1].toLowerCase()} in inventory</h3><button class="button primary" data-action="shop">Browse shop</button></div>`
    }</div></div><p class="shop-note">${labels[app.shopCategory]}</p>`,
    'shop-modal',
  );
}
export function onKeydown(event) {
  if (
    event.target.matches('[data-action="shop-tab"]') &&
    ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
  ) {
    event.preventDefault();
    const index = shopTabs.findIndex(([key]) => key === app.shopCategory);
    app.shopCategory =
      shopTabs[
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? shopTabs.length - 1
            : (index + (event.key === 'ArrowLeft' ? -1 : 1) + shopTabs.length) % shopTabs.length
      ][0];
    view.renderModal();
    $(`#shop-tab-${app.shopCategory}`)?.focus();
    return;
  }
}
export const modals = {
  shop() {
    return renderShop(false);
  },
  inventory() {
    return renderShop(true);
  },
};
export const actions = {
  shop(b, { a, id, sourceRect }) {
    openModal({ type: a });
  },
  inventory(b, { a, id, sourceRect }) {
    openModal({ type: a });
  },
  buy(b, { a, id, sourceRect }) {
    const item = commit(() => E.buy(app.state, id));
    if (item) {
      sound();
      toast(`${item.name} is yours.`);
    }
  },
  equip(b, { a, id, sourceRect }) {
    const result = commit(() => {
      E.equip(app.state, id);
      return true;
    });
    if (result)
      toast(E.SHOP.find(i => i.id === id)?.type === 'pet' ? 'Companion updated.' : 'Equipment updated.');
  },
  potion(b, { a, id, sourceRect }) {
    app.shopCategory = 'potion';
    openModal({ type: potionCount() ? 'inventory' : 'shop' });
  },
  'use-potion'(b, { a, id, sourceRect }) {
    const healed = commit(() => E.usePotion(app.state, id));
    if (healed) {
      sound();
      toast(`+${healed} HP restored.`);
    }
  },
  'prepare-spell'(b, { a, id, sourceRect }) {
    const result = commit(() => {
      E.prepareSpell(app.state, id);
      return true;
    });
    if (result)
      toast(
        app.state.preparedSpell
          ? 'Spell prepared for your next fight.'
          : 'Spell put away. It stays in your inventory.',
      );
  },
  'open-spells'(b, { a, id, sourceRect }) {
    app.shopCategory = 'spell';
    openModal({ type: 'inventory' });
  },
  'shop-tab'(b, { a, id, sourceRect }) {
    app.shopCategory = b.dataset.category;
    view.renderModal();
    $(`[data-action="shop-tab"][data-category="${app.shopCategory}"]`)?.focus();
  },
};
