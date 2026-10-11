// Shop and inventory: buying, equipping, potions, spells, and pets.
import * as E from './engine.js?v=0.21.1';
import { avatarFaceArt, itemArt, monsterName, petArt } from './art.js?v=0.21.1';
import { APPEARANCE, APPEARANCE_LABELS } from './appearance.js';
import { $, app, coin, esc, icon, modalShell, toast, today, view } from './ui-core.js?v=0.21.1';
import { closeModal, commit, openModal } from './ui-modal.js?v=0.21.1';
import { burst, countUp, sound } from './ui-effects.js?v=0.21.1';
import { potionCount } from './ui-character.js?v=0.21.1';
import { playDelight } from './ui-delights.js?v=0.21.1';
import { percent, requestOdds } from './ui-odds.js?v=0.21.1';
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
  item.type === 'spell'
    ? app.state.preparedSpell === item.id
    : item.tonic
      ? app.state.tonic === item.id
      : item.type === 'pet'
        ? app.state.activePet === item.id
        : item.type === 'pethat'
          ? app.state.petHat === item.id
          : app.state.equipped[item.type] === item.id;
const STAT_LABELS = [
  ['attack', 'attack', n => n],
  ['armor', 'blocked per hit', n => n],
  ['dodge', 'deflect', n => Math.round(n * 100) + '%'],
  ['rally', 'rally HP', n => n],
  ['max', 'max HP', n => n],
];
// What the slot holds now, for the "vs" label.
function currentFor(item) {
  if (item.type === 'spell') return E.preparedSpell(app.state)?.name || 'no spell';
  if (item.tonic) return E.activeTonic(app.state)?.name || 'no tonic';
  if (item.type === 'pet') return E.activePetItem(app.state)?.name || 'no companion';
  return (
    E.SHOP.find(x => x.id === app.state.equipped[item.type])?.name ||
    { weapon: 'unarmed', armor: 'no armor', helmet: 'no helmet' }[item.type]
  );
}
// What changes if this item replaces the current one in its slot: every stat it touches, plus win odds.
function comparison(item) {
  if (!['weapon', 'armor', 'helmet', 'spell', 'pet'].includes(item.type) && !item.tonic) return '';
  const now = E.combatStats(app.state),
    then = E.combatStats(E.withItem(app.state, item)),
    selected = inUse(item);
  const changes = STAT_LABELS.filter(([key]) => Math.abs(then[key] - now[key]) > 1e-9).map(
    ([key, unit, format]) => {
      const delta = then[key] - now[key];
      return `<strong class="${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '+' : '−'}${format(Math.abs(delta))} ${unit}</strong>`;
    },
  );
  const detail = selected
    ? `<strong>${item.tonic ? 'Active for your next fight' : item.type === 'spell' ? 'Prepared' : item.type === 'pet' ? 'Your companion' : 'Equipped'}</strong>`
    : `${changes.join(' · ') || '<strong>No change</strong>'} <small>vs ${esc(currentFor(item))}</small>`;
  const base = comparisonBase(),
    foe = monsterName(base.monster.number);
  return `<div class="item-compare" data-compare="${item.id}"><span>${detail}</span><span class="item-odds">Win vs ${esc(foe)}${app.state.hp ? '' : ' at full HP'}: ${selected ? '<strong data-odds="now">…</strong>' : '<span data-odds="now">…</span> → <strong data-odds="with">…</strong>'}</span></div>`;
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
  ['helmet', 'Helmets', 'helmet'],
  ['potion', 'Potions', 'heart'],
  ['spell', 'Spells', 'soul'],
  ['pet', 'Pets', 'pet'],
  ['delight', 'Delights', 'balloon'],
  ['style', 'Style', 'sparkle'],
];
// Cosmetics for the Style tab: priced appearance options, previewed on the character's face.
function renderStyle(inventory) {
  const looks = Object.entries(APPEARANCE)
    .flatMap(([key, options]) =>
      options
        .filter(o => o.price)
        .map(o => ({ key, option: o, owned: E.cosmeticOwned(app.state, key, o.id) })),
    )
    .filter(look => !inventory || look.owned);
  if (!looks.length)
    return `<div class="empty-state"><span class="empty-symbol">${icon('sparkle')}</span><h3>No styles yet</h3><button class="button primary" data-action="shop">Browse shop</button></div>`;
  return looks
    .map(({ key, option, owned }) => {
      const wearing = app.state.appearance[key] === option.id;
      const preview =
        key === 'outfit'
          ? `<span class="style-swatch" style="--swatch:${option.color}"></span>`
          : avatarFaceArt({ ...app.state.appearance, [key]: option.id });
      return `<article class="shop-item style-item ${owned ? 'owned' : ''} ${wearing ? 'item-selected' : ''}">${owned ? `<span class="item-count">${wearing ? icon('check') + 'Wearing' : 'Owned'}</span>` : ''}<div class="item-art style-art">${preview}</div><div class="item-copy"><span class="item-tier">${APPEARANCE_LABELS[key].toUpperCase()}</span><h3>${esc(option.name)}</h3></div>${owned ? `<button class="button ${wearing ? 'secondary' : 'primary'}" data-action="wear-style" data-key="${key}" data-value="${option.id}" ${wearing ? 'disabled' : ''}>${wearing ? 'Wearing' : 'Wear'}</button>` : `<button class="button secondary" data-action="buy-style" data-key="${key}" data-value="${option.id}" aria-label="Buy ${esc(option.name)} for ${option.price} gold" ${app.state.gold < option.price ? 'disabled' : ''}>Buy ${coin(option.price, true)}</button><button class="text-button" data-action="try-style" data-key="${key}" data-value="${option.id}">Try it on</button>`}</article>`;
    })
    .join('');
}
function renderShop(inventory) {
  queueMicrotask(fillComparisons);
  const items = E.SHOP.filter(
    i =>
      (i.type === app.shopCategory || (app.shopCategory === 'pet' && i.type === 'pethat')) &&
      (!inventory || E.itemCount(app.state, i.id) > 0),
  ).sort((a, b) => (a.type === 'pethat') - (b.type === 'pethat') || a.price - b.price);
  const labels = {
    weapon: 'One weapon at a time. New weapons fill an empty slot automatically.',
    armor: 'One armor at a time. New armor fills an empty slot automatically.',
    helmet:
      'One helmet at a time. Helmets raise maximum HP; putting one on or taking it off shifts your current HP too.',
    potion:
      'Healing potions are used right away, capped at your maximum HP. Tonics last for your next fight, one at a time, alongside a spell.',
    spell:
      'Prepare one spell at a time. It is consumed when a fight starts, even on defeat. Switching or putting it away costs nothing.',
    pet: 'Choose one companion. Pets are permanent, and each lends a small bonus in every fight.',
    delight:
      'Single-use moments of fun. Buy a few and set one off whenever you like. They never change stats or rewards; Escape ends one early.',
    style: 'Styles are yours to keep once bought. Try one on in the character studio before buying.',
  };
  return modalShell(
    inventory ? 'Your inventory' : 'Shop',
    `<div class="shop-top"><div class="segmented"><button data-action="shop" class="${!inventory ? 'selected' : ''}">Shop</button><button data-action="inventory" class="${inventory ? 'selected' : ''}">Inventory</button></div><div class="shop-wallet"><span>Your gold</span><span class="wallet" aria-label="${app.state.gold} gold">${coin(app.state.gold, true)}</span></div></div>
    <div class="shop-tabs" role="tablist" aria-label="Item categories">${shopTabs.map(([key, label, symbol]) => `<button role="tab" id="shop-tab-${key}" aria-controls="shop-items" aria-selected="${app.shopCategory === key}" tabindex="${app.shopCategory === key ? '0' : '-1'}" data-action="shop-tab" data-category="${key}">${icon(symbol)}${label}</button>`).join('')}</div>
    <div id="shop-items" role="tabpanel" aria-labelledby="shop-tab-${app.shopCategory}" tabindex="0"><div class="shop-grid">${
      app.shopCategory === 'style'
        ? renderStyle(inventory)
        : items.length
          ? items
              .map(i => {
                const count = E.itemCount(app.state, i.id),
                  consumable = E.isConsumable(i),
                  owned = !consumable && count > 0;
                const selected = inUse(i);
                const action =
                  i.type === 'delight'
                    ? 'use-delight'
                    : i.type === 'potion'
                      ? 'use-potion'
                      : i.type === 'spell'
                        ? 'prepare-spell'
                        : 'equip';
                // Delights need what they act on: a companion for a treat, and one drift per day.
                const delightBlocked =
                  i.id === 'treat' && !app.state.activePet
                    ? 'Needs a companion'
                    : i.id === 'drift' && app.state.ambience?.day === today()
                      ? 'Drifting today'
                      : '';
                const tonicBlocked = i.tonic && !!app.state.tonic && !selected;
                const useLabel =
                  i.type === 'delight'
                    ? delightBlocked || 'Set it off'
                    : i.tonic
                      ? selected
                        ? 'Active · next fight'
                        : tonicBlocked
                          ? 'Another tonic is active'
                          : 'Drink for next fight'
                      : i.type === 'potion'
                        ? 'Use potion'
                        : i.type === 'spell'
                          ? selected
                            ? 'Prepared · put away'
                            : 'Prepare for fight'
                          : i.type === 'pethat'
                            ? selected
                              ? 'Wearing · take off'
                              : 'Put on companion'
                            : i.type === 'pet'
                              ? selected
                                ? 'Companion · remove'
                                : 'Choose companion'
                              : selected
                                ? 'Equipped · remove'
                                : 'Equip';
                return `<article class="shop-item ${i.tier} ${i.type} ${owned ? 'owned' : ''} ${selected ? 'item-selected' : ''}">${count ? `<span class="item-count">${consumable ? count + ' owned' : selected ? icon('check') + 'Selected' : 'Owned'}</span>` : ''}<div class="item-art">${
                  i.type === 'pet' && app.state.petHat
                    ? petArt(
                        i,
                        E.SHOP.find(h => h.id === app.state.petHat),
                      )
                    : itemArt(i)
                }</div><div class="item-copy"><span class="item-tier">${i.type === 'pethat' ? 'PET HAT' : i.type === 'pet' ? `COMPANION · ${i.tier.toUpperCase()}` : i.type === 'spell' || i.tonic ? 'ONE FIGHT' : i.tier.toUpperCase()}</span><h3>${esc(i.name)}</h3><p>${esc(i.description)}</p></div>${comparison(i)}${!inventory ? `<button class="button secondary" data-action="buy" data-id="${i.id}" aria-label="${owned ? esc(i.name) + ' owned' : 'Buy ' + esc(i.name) + ' for ' + i.price + ' gold'}" ${owned || app.state.gold < i.price ? 'disabled' : ''}>${owned ? icon('check') + 'Owned' : `Buy ${coin(i.price, true)}`}</button>` : ''}${count ? `<button class="button ${inventory ? 'primary' : 'item-use'}" data-action="${action}" data-id="${i.id}" aria-label="${i.type === 'delight' ? 'Set off' : i.type === 'potion' ? 'Use' : i.type === 'spell' ? (selected ? 'Put away' : 'Prepare') : selected ? 'Remove' : 'Equip'} ${esc(i.name)}" ${(i.type === 'delight' ? !!delightBlocked : i.tonic ? !!app.state.tonic : i.type === 'potion' && app.state.hp === E.maxHP(app.state)) ? 'disabled' : ''}>${!i.tonic && i.type === 'potion' && app.state.hp === E.maxHP(app.state) ? 'Full health' : useLabel}</button>` : ''}</article>`;
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
function flourishStyle(key, value) {
  const card = document
    .querySelector(`#overlay [data-key="${CSS.escape(key)}"][data-value="${CSS.escape(value)}"]`)
    ?.closest('.shop-item');
  if (!card) return;
  card.classList.add('just-changed');
  burst(card.querySelector('.item-art') || card, { palette: 'xp', count: 16, distance: 70 });
}
// Highlight the card that just changed after the dialog re-renders.
function flourish(id, palette = 'gold') {
  const card = document.querySelector(`#overlay [data-id="${CSS.escape(id)}"]`)?.closest('.shop-item');
  if (!card) return;
  card.classList.add('just-changed');
  burst(card.querySelector('.item-art') || card, { palette, count: 16, distance: 70 });
}
export const actions = {
  'buy-style'(b) {
    const { key, value } = b.dataset;
    const option = commit(() => E.buyCosmetic(app.state, key, value));
    if (option) {
      sound('purchase');
      flourishStyle(key, value);
      toast(`${option.name} is yours, and you’re wearing it.`);
    }
  },
  'wear-style'(b) {
    const { key, value } = b.dataset;
    if (commit(() => (E.setAppearance(app.state, key, value), true))) {
      sound('equip');
      flourishStyle(key, value);
    }
  },
  'try-style'(b) {
    app.avatarPreview = { key: b.dataset.key, value: b.dataset.value };
    openModal({ type: 'avatar' });
  },
  shop(b, { a, id, sourceRect }) {
    openModal({ type: a });
  },
  inventory(b, { a, id, sourceRect }) {
    openModal({ type: a });
  },
  buy(b, { a, id, sourceRect }) {
    const item = commit(() => E.buy(app.state, id));
    if (item) {
      sound('purchase');
      flourish(id);
      countUp(
        document.querySelector('#overlay .shop-wallet .gold-value > span'),
        app.state.gold + item.price,
        app.state.gold,
        {
          duration: 450,
        },
      );
      toast(`${item.name} is yours.`);
    }
  },
  equip(b, { a, id, sourceRect }) {
    const result = commit(() => {
      E.equip(app.state, id);
      return true;
    });
    if (result) {
      const kind = E.SHOP.find(i => i.id === id)?.type,
        pet = kind === 'pet' || kind === 'pethat';
      sound(pet ? 'reward' : 'equip');
      if (
        kind === 'pethat'
          ? app.state.petHat === id
          : pet
            ? app.state.activePet === id
            : Object.values(app.state.equipped).includes(id)
      )
        flourish(id, 'xp');
      toast(
        kind === 'pethat'
          ? app.state.petHat === id
            ? 'Hat on. Very dapper.'
            : 'Hat off.'
          : pet
            ? 'Companion updated.'
            : 'Equipment updated.',
      );
    }
  },
  potion(b, { a, id, sourceRect }) {
    app.shopCategory = 'potion';
    openModal({ type: potionCount() ? 'inventory' : 'shop' });
  },
  'use-potion'(b, { a, id, sourceRect }) {
    const item = E.SHOP.find(i => i.id === id);
    const healed = commit(() => E.usePotion(app.state, id));
    if (item?.tonic && healed !== undefined) {
      sound('spell');
      flourish(id, 'soul');
      toast(`${item.name} is ready for your next fight.`);
    } else if (healed) {
      sound('potion');
      flourish(id, 'heart');
      toast(`+${healed} HP restored.`);
    }
  },
  'prepare-spell'(b, { a, id, sourceRect }) {
    const result = commit(() => {
      E.prepareSpell(app.state, id);
      return true;
    });
    if (result && app.state.preparedSpell) {
      sound('spell');
      flourish(id, 'soul');
    }
    if (result)
      toast(
        app.state.preparedSpell
          ? 'Spell prepared for your next fight.'
          : 'Spell put away. It stays in your inventory.',
      );
  },
  'use-delight'(b, { id }) {
    const item = commit(() => E.useDelight(app.state, id, today()));
    if (!item) return;
    // Close the shop first so the moment plays over the dashboard.
    closeModal();
    setTimeout(() => playDelight(id), 120);
  },
  'open-tonics'() {
    app.shopCategory = 'potion';
    openModal({ type: 'inventory' });
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
