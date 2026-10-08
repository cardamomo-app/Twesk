// Achievements and the bestiary.
import { collectionBody } from './collection-view.js?v=0.9.0';
import { $, app, modalShell, view } from './ui-core.js?v=0.9.0';
import { closeModal, openModal } from './ui-modal.js?v=0.9.0';
export function onKeydown(event) {
  if (
    event.target.matches('[data-action="collection-tab"]') &&
    ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
  ) {
    event.preventDefault();
    app.collectionTab =
      event.key === 'Home'
        ? 'seals'
        : event.key === 'End'
          ? 'monsters'
          : app.collectionTab === 'seals'
            ? 'monsters'
            : 'seals';
    view.renderModal();
    $(`#collection-tab-${app.collectionTab}`)?.focus();
    return;
  }
}
export const modals = {
  achievements() {
    return modalShell(
      'Achievements',
      collectionBody(app.state, {
        tab: app.collectionTab,
        filter: app.sealFilter,
        earnedOnly: app.earnedOnly,
        chapter: app.monsterChapter,
        selectedMonster: app.selectedMonster,
      }),
      'collection-modal',
    );
  },
};
const openCollection = (b, { a }) => {
  app.collectionTab = a === 'bestiary' ? 'monsters' : 'seals';
  app.monsterChapter = Math.ceil(app.state.monster.number / 8);
  app.selectedMonster = app.state.monster.number;
  openModal({ type: 'achievements' });
};
export const actions = {
  achievements: openCollection,
  bestiary: openCollection,
  'collection-tab'(b, { a, id, sourceRect }) {
    app.collectionTab = b.dataset.tab;
    view.renderModal();
    $(`#collection-tab-${app.collectionTab}`)?.focus();
  },
  'seal-filter'(b, { a, id, sourceRect }) {
    app.sealFilter = b.dataset.filter;
    view.renderModal();
    $(`[data-action="seal-filter"][data-filter="${app.sealFilter}"]`)?.focus();
  },
  'earned-filter'(b, { a, id, sourceRect }) {
    app.earnedOnly = !app.earnedOnly;
    view.renderModal();
    $('[data-action="earned-filter"]')?.focus();
  },
  'current-monster'(b, { a, id, sourceRect }) {
    app.monsterChapter = Math.ceil(app.state.monster.number / 8);
    app.selectedMonster = app.state.monster.number;
    view.renderModal();
    $('[data-action="current-monster"]')?.focus();
  },
  'monster-page'(b, { a, id, sourceRect }) {
    app.monsterChapter = Math.min(
      Math.max(2, Math.ceil(app.state.monster.number / 8) + 1),
      Math.max(1, app.monsterChapter + Number(b.dataset.direction)),
    );
    app.selectedMonster = (app.monsterChapter - 1) * 8 + 1;
    view.renderModal();
    $('#monster-chapter')?.focus();
  },
  'select-monster'(b, { a, id, sourceRect }) {
    app.selectedMonster = Number(b.dataset.number);
    view.renderModal();
    $('#monster-details')?.focus();
  },
  'view-challenge'(b, { a, id, sourceRect }) {
    closeModal();
    ($('#app [data-action="fight"]:not(:disabled)') || $('#app [data-action="recover"]'))?.focus();
  },
};
export function onChange(event) {
  if (event.target.id === 'monster-chapter') {
    app.monsterChapter = Number(event.target.value);
    app.selectedMonster = (app.monsterChapter - 1) * 8 + 1;
    view.renderModal();
    $('#monster-chapter')?.focus();
  }
}
