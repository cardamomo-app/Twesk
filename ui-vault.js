// The Vault: notes, journal entries, quick capture, and recovery reflections.
import * as E from './engine.js?v=0.8.1';
import { $, app, coin, esc, icon, modalShell, toast, today, view } from './ui-core.js?v=0.8.1';
import { closeModal, commit, openModal } from './ui-modal.js?v=0.8.0';
import { sound } from './ui-effects.js?v=0.8.0';
function renderNotes() {
  const notes = app.state.notes.filter(
    n =>
      (app.vaultFilter === 'archived'
        ? n.status === 'archived'
        : n.status !== 'archived' &&
          (app.vaultFilter === 'all' ||
            (app.vaultFilter === 'journal' ? n.kind === 'journal' : n.status === app.vaultFilter))) &&
      `${n.text} ${n.kind === 'journal' ? '#reflection' : ''}`
        .toLowerCase()
        .includes(app.vaultSearch.toLowerCase()),
  );
  if (!notes.length)
    return `<div class="empty-state"><span class="empty-symbol">${icon('vault')}</span><h3>${app.vaultSearch ? 'Nothing found just yet' : app.vaultFilter === 'inbox' ? 'Room for a new thought' : 'A little space for your ideas'}</h3><p>${app.vaultSearch ? 'Try another word or hashtag.' : 'Capture something now. You can make sense of it later.'}</p><button class="button secondary" data-action="capture">${icon('plus')}Quick capture</button></div>`;
  return notes
    .map(
      n =>
        `<article class="note-card"><div class="note-top"><span>${n.kind === 'journal' ? icon('pencil') + ' REFLECTION' : 'NOTE'} · ${esc(new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: app.state.settings.timezone }).format(new Date(n.created)))}</span>${coin(n.paid)}</div><p class="note-text">${esc(n.text).replace(/(^|\s)(#[\p{L}\p{N}_-]+)/gu, '$1<span class="hashtag">$2</span>')}</p><div class="note-actions"><button class="text-button" data-action="edit-note" data-id="${n.id}">${icon('pencil')}Edit</button>${n.taskId ? '<span class="converted">' + icon('check') + 'Sent to tasks</span>' : `<button class="text-button" data-action="convert-note" data-id="${n.id}">${icon('arrow')}Make a task</button>`}${n.status === 'inbox' ? `<button class="text-button" data-action="keep-note" data-id="${n.id}">Keep note</button>` : ''}<button class="text-button archive" data-action="${n.status === 'archived' ? 'restore-note' : 'archive-note'}" data-id="${n.id}">${n.status === 'archived' ? 'Restore' : 'Archive'}</button></div></article>`,
    )
    .join('');
}
function performReview(id, status) {
  const reward = commit(() => E.reviewNote(app.state, id, status, today()));
  if (reward) toast('A little clarity. +4 gold for your review.');
}
export const modals = {
  capture() {
    const note = app.state.notes.find(n => n.id === app.modal.id),
      recovery = app.modal.recovery;
    return modalShell(
      recovery ? 'A moment to reflect' : note ? 'Your captured thought' : 'Catch a thought',
      `<form id="capture-form" class="form-body">${!note && !recovery ? `<div class="segmented capture-kind"><button type="button" data-action="capture-kind" data-kind="note" class="${app.modal.kind === 'note' ? 'selected' : ''}">${icon('pencil')}Note</button><button type="button" data-action="capture-kind" data-kind="journal" class="${app.modal.kind === 'journal' ? 'selected' : ''}">${icon('mind')}Journal</button><button type="button" data-action="capture-kind" data-kind="task" class="${app.modal.kind === 'task' ? 'selected' : ''}">${icon('check')}Task</button></div>` : ''}${recovery ? `<p class="reflection-prompt">What needs more care right now? What’s one thing you could do next?</p><div class="recovery-preview"><span>${icon('heart')}<strong id="preview-hp">${app.state.hp}</strong> / ${E.maxHP(app.state)} HP</span><span id="preview-heal">+0 HP</span></div><div class="health-bar"><div id="preview-bar" style="width:${(app.state.hp / E.maxHP(app.state)) * 100}%"></div></div>` : ''}<label class="sr-only" for="capture-text">${recovery ? 'Reflection' : 'Your note or task'}</label><textarea id="capture-text" name="text" required maxlength="50000" rows="${recovery ? 8 : 7}" placeholder="${recovery ? 'Take a breath, and write whatever comes to mind…' : 'Drop an idea, a reminder, a little something…\nAdd #tags to find it later.'}" autofocus>${esc(note?.text || '')}</textarea><div class="capture-meta"><span id="word-count">${E.words(note?.text || '')} words</span><span>${recovery ? '2 words ≈ 1 HP · Heart improves healing' : 'Notes earn 1–3 gold · up to 6 per day'}</span></div><div class="form-actions">${note ? `<button type="button" class="button subtle danger" data-action="delete-note" data-id="${note.id}">Archive</button>` : '<span></span>'}<button class="button primary" type="submit">${recovery ? 'Save & recover' : note ? 'Save note' : app.modal.kind === 'task' ? 'Send to task inbox' : app.modal.kind === 'journal' ? 'Save journal' : 'Save to Vault'}${icon('arrow')}</button></div></form>`,
      recovery ? 'reflection-modal' : '',
      recovery ? 'A little writing, a little healing. Saved privately in your Vault.' : '',
    );
  },
  vault() {
    return modalShell(
      'The Vault',
      `<div class="vault-toolbar"><label class="search-box">${icon('search')}<input id="vault-search" aria-label="Search notes and hashtags" placeholder="Search thoughts or #tags" value="${esc(app.vaultSearch)}"></label><button class="button secondary" data-action="capture">${icon('plus')}Capture</button></div><div class="vault-tabs segmented">${[
        ['inbox', 'Needs review'],
        ['kept', 'Notes'],
        ['journal', 'Journal'],
        ['all', 'All'],
        ['archived', 'Archive'],
      ]
        .map(
          ([k, l]) =>
            `<button data-action="vault-filter" data-filter="${k}" class="${app.vaultFilter === k ? 'selected' : ''}">${l}${k === 'inbox' ? ` <span>${app.state.notes.filter(n => n.status === 'inbox').length}</span>` : ''}</button>`,
        )
        .join(
          '',
        )}</div><div id="vault-results" class="vault-results">${renderNotes()}</div><footer class="vault-footer"><span>${app.state.reviewDates.includes(today()) ? 'Review reward earned today · +4 gold' : 'Keep, convert, or archive an inbox note to earn +4 gold.'}</span></footer>`,
      'vault-modal',
      'Thoughts first. Plans when you’re ready.',
    );
  },
};
export const actions = {
  capture(b, { a, id, sourceRect }) {
    openModal({ type: 'capture', kind: 'note' });
  },
  'capture-kind'(b, { a, id, sourceRect }) {
    const text = $('#capture-text').value;
    app.modal.kind = b.dataset.kind;
    view.renderModal();
    $('#capture-text').value = text;
    $('#word-count').textContent = E.words(text) + ' words';
    $('#capture-text').focus();
  },
  vault(b, { a, id, sourceRect }) {
    app.vaultSearch = '';
    openModal({ type: 'vault' });
  },
  'vault-filter'(b, { a, id, sourceRect }) {
    app.vaultFilter = b.dataset.filter;
    view.renderModal();
  },
  'edit-note'(b, { a, id, sourceRect }) {
    openModal({ type: 'capture', id });
  },
  'convert-note'(b, { a, id, sourceRect }) {
    const wasInbox = app.state.notes.find(n => n.id === id)?.status === 'inbox';
    const r = commit(() => {
      const t = E.convertNote(app.state, id);
      if (wasInbox) E.rewardReview(app.state, today());
      return t;
    });
    if (r) {
      toast('Sent to your task inbox' + (wasInbox ? ' · review saved.' : '.'));
      sound();
    }
  },
  'keep-note'(b, { a, id, sourceRect }) {
    performReview(id, 'kept');
  },
  'archive-note'(b, { a, id, sourceRect }) {
    performReview(id, 'archived');
  },
  'restore-note'(b, { a, id, sourceRect }) {
    commit(() => {
      const n = app.state.notes.find(n => n.id === id);
      if (n) n.status = 'kept';
    });
    toast('Note restored.');
  },
  'delete-note'(b, { a, id, sourceRect }) {
    const n = app.state.notes.find(n => n.id === id);
    commit(() => {
      if (n.status === 'inbox') E.reviewNote(app.state, id, 'archived', today());
      else n.status = 'archived';
    });
    openModal({ type: 'vault' });
    toast('Note archived.');
  },
  recover(b, { a, id, sourceRect }) {
    openModal({ type: 'capture', recovery: true });
  },
};
export const forms = {
  'capture-form'(data) {
    const text = data.get('text').trim();
    if (!text) return;
    const previous = app.modal;
    const r = commit(() => {
      const result = E.saveNote(
        app.state,
        {
          id: previous.id,
          text,
          kind: previous.kind === 'journal' ? 'journal' : 'note',
          recovery: previous.recovery,
        },
        today(),
      );
      if (previous.kind === 'task' && !previous.id) E.convertNote(app.state, result.note.id);
      return result;
    });
    if (r) {
      closeModal();
      sound();
      toast(
        previous.recovery
          ? `Reflection saved. +${r.healed} HP${r.reward ? ` · +${r.reward} gold` : ''}.`
          : previous.kind === 'task'
            ? `Sent to task inbox${r.reward ? ` · +${r.reward} gold` : ''}.`
            : `${previous.kind === 'journal' ? 'Journal' : 'Thought'} saved${r.reward ? ` · +${r.reward} gold` : ''}.`,
      );
    }
  },
};
export function onInput(event) {
  if (event.target.id === 'vault-search') {
    app.vaultSearch = event.target.value;
    $('#vault-results').innerHTML = renderNotes();
  }
  if (event.target.id === 'capture-text') {
    const count = E.words(event.target.value);
    $('#word-count').textContent = count + ' words';
    if (app.modal.recovery) {
      const healed = Math.min(
        E.maxHP(app.state) - app.state.hp,
        Math.floor((count / 2) * E.healingMultiplier(app.state)),
      );
      $('#preview-hp').textContent = app.state.hp + healed;
      $('#preview-heal').textContent = '+' + healed + ' HP';
      $('#preview-bar').style.width = ((app.state.hp + healed) / E.maxHP(app.state)) * 100 + '%';
    }
  }
}
