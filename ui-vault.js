// The Vault: notes, journal entries, quick capture, and recovery reflections.
import * as E from './engine.js?v=0.42.3';
import { $, app, coin, esc, icon, modalShell, tagStyle, toast, today, view } from './ui-core.js?v=0.42.3';
import { closeModal, commit, openModal } from './ui-modal.js?v=0.42.3';
import { isJournalExport, notesToText } from './notes-export.js?v=0.42.3';
import { rewardEffect, sound } from './ui-effects.js?v=0.42.3';
import { vaultArt } from './vault-art.js?v=0.42.3';
import { VAULT_SECTIONS, inVaultSection, needsReview, vaultTone } from './vault-model.js?v=0.42.3';
const noteDate = n =>
  new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    timeZone: app.state.settings.timezone,
  }).format(new Date(n.created));
// Note text with each #tag as a button that filters the Vault by that tag.
const noteText = text =>
  esc(text).replace(
    /(^|\s)(#[\p{L}\p{N}_-]+)/gu,
    (_, space, tag) =>
      `${space}<button class="hashtag tag-colored" ${tagStyle(tag)} data-action="vault-tag" data-tag="${tag.toLowerCase()}" title="Show notes tagged ${tag}">${tag}</button>`,
  );
const inTab = n => inVaultSection(n, app.vaultFilter);
const searchable = n => `${n.text} ${n.kind === 'journal' ? '#reflection' : ''}`.toLowerCase();
function renderTagChips() {
  const counts = new Map();
  for (const n of app.state.notes.filter(inTab))
    for (const tag of E.tags(n.text)) counts.set(tag, (counts.get(tag) || 0) + 1);
  if (app.vaultTag && !counts.has(app.vaultTag)) counts.set(app.vaultTag, 0);
  if (!counts.size) return '';
  return `<div class="project-chips vault-tag-chips" role="group" aria-label="Filter notes by hashtag">${[
    ...counts,
  ]
    .sort((a, b) => b[1] - a[1])
    .map(
      ([tag, n]) =>
        `<button class="project-chip tag-colored ${app.vaultTag === tag ? 'selected' : ''}" ${tagStyle(tag)} data-action="vault-tag" data-tag="${esc(tag)}" aria-pressed="${app.vaultTag === tag}">${esc(tag)}<span>${n}</span></button>`,
    )
    .join('')}</div>`;
}
const visibleNotes = () =>
  app.state.notes
    .filter(
      n =>
        inTab(n) &&
        (!app.vaultTag || E.tags(n.text).includes(app.vaultTag)) &&
        searchable(n).includes(app.vaultSearch.toLowerCase()),
    )
    .sort((a, b) => !!b.pinned - !!a.pinned);
// Reviewed notes can be selected and downloaded together as one text file.
const canSelect = () => ['kept', 'journal'].includes(app.vaultFilter);
const selectedVisible = () => (canSelect() ? visibleNotes().filter(n => app.vaultSelected.has(n.id)) : []);
// The download button sits at the end of the tab row and appears only while notes are selected.
// "Select all" picks only the notes currently shown (after search and hashtag filters).
function downloadButton() {
  if (!canSelect()) return '';
  const shown = visibleNotes().length,
    count = selectedVisible().length;
  if (!shown) return '';
  const all = count === shown,
    noun = n =>
      app.vaultFilter === 'journal' ? (n === 1 ? 'entry' : 'entries') : n === 1 ? 'note' : 'notes';
  const filtered = app.vaultSearch || app.vaultTag;
  const toggle = `<button class="text-button vault-select-all" data-action="vault-select-all" title="${all ? 'Deselect' : 'Select'} the ${shown} ${noun(shown)} shown${filtered ? ' with this filter' : ''}">${all ? 'Deselect all' : 'Select all'}</button>`;
  // Merge appears once two or more notes are selected, icon-only beside the download button.
  const merge =
    count >= 2
      ? `<button class="vault-merge" data-action="vault-merge" title="Merge ${count} selected ${noun(count)} into one" aria-label="Merge ${count} selected ${noun(count)} into one">${icon('merge')}</button>`
      : '';
  const download = count
    ? `<button class="vault-download" data-action="vault-export" title="Download ${count} selected ${noun(count)} as one text file" aria-label="Download ${count} selected ${noun(count)} as one text file">${icon('download')}<span>${count}</span></button>`
    : '';
  return toggle + merge + download;
}
const refreshDownload = () => {
  const slot = $('#vault-download');
  if (slot) slot.innerHTML = downloadButton();
};
const shelfArt = n => n.kind === 'journal' ? 'journal' : needsReview(n) ? 'review' : n.status === 'archived' ? 'archive' : 'note';
function noteHeading(n) {
  const label = n.kind === 'journal' ? 'Journal' : needsReview(n) ? 'To review' : 'Note';
  return `<div class="note-top"><span class="note-emblem">${vaultArt(shelfArt(n))}</span><span class="note-identity"><strong>${label}</strong><small>${esc(noteDate(n))}${n.pinned ? ` · ${icon('pin')} Pinned` : ''}${n.taskTitle ? ' · Was a task' : ''}${n.healed ? ` · ${icon('heart')} Reflection` : ''}</small></span><span class="note-capture-gold" title="${n.paid} gold earned for this capture">${coin(n.paid, true)}</span></div>`;
}
function vaultTitle(label, art = 'vault') {
  return `<span class="vault-title"><span class="vault-title-art">${vaultArt(art)}</span><span>${label}</span><span class="vault-wallet" data-vault-wallet title="Your gold">${coin(app.state.gold, true)}</span></span>`;
}
function reviewBonus() {
  const earned = app.state.reviewDates.includes(today());
  return `<span class="vault-review-bonus ${earned ? 'earned' : ''}">${earned ? icon('check') : ''}<span>${earned ? 'Today’s review bonus earned' : 'First review today'}</span>${coin(4, true)}</span>`;
}
function celebrateReview(reward, sourceRect) {
  if (!reward) return;
  rewardEffect(sourceRect || $('[data-vault-wallet]'), reward, 'gold', { wallet: $('[data-vault-wallet]') });
  toast(`Review complete. +${reward} gold.`);
}
function renderNotes() {
  const notes = visibleNotes();
  // An empty tab stays quiet; only a search or hashtag with no matches says so.
  if (!notes.length)
    return app.vaultSearch || app.vaultTag
      ? `<div class="empty-state"><span class="empty-symbol">${icon('vault')}</span><h3>Nothing found just yet</h3><p>Try another word, hashtag, or tab.</p></div>`
      : '';
  const selectable = canSelect();
  return notes
    .map(
      n =>
        `<article data-vault-tone="${vaultTone(n)}" data-note-kind="${n.kind}" class="note-card ${n.pinned ? 'pinned' : ''} ${selectable ? 'selectable' : ''} ${app.vaultSelected.has(n.id) ? 'selected' : ''}" ${selectable ? `data-action="toggle-note-select" data-id="${n.id}" tabindex="0" aria-label="${n.kind === 'journal' ? 'Journal entry' : 'Note'} from ${esc(noteDate(n))}${app.vaultSelected.has(n.id) ? ', selected' : ''}. Press Space to select it for download."` : ''}>${noteHeading(n)}<p class="note-text">${noteText(n.text)}</p><div class="note-actions"><button class="text-button" data-action="edit-note" data-id="${n.id}">${icon('pencil')}Edit</button>${n.status !== 'archived' ? `<button class="text-button" data-action="pin-note" data-id="${n.id}" aria-pressed="${!!n.pinned}">${icon('pin')}${n.pinned ? 'Unpin' : 'Pin'}</button>` : ''}${n.taskId ? '<span class="converted">' + icon('check') + 'Sent to tasks</span>' : `<button class="text-button" data-action="convert-note" data-id="${n.id}">${icon('arrow')}${n.taskTitle ? 'Back to tasks' : 'Make a task'}</button>`}${needsReview(n) ? `<button class="text-button" data-action="keep-note" data-id="${n.id}">${icon('check')}Keep</button>` : ''}<button class="text-button archive" data-action="${n.status === 'archived' ? 'restore-note' : 'archive-note'}" data-id="${n.id}">${n.status === 'archived' ? 'Restore' : 'Archive'}</button></div></article>`,
    )
    .join('');
}
const refreshVault = () => {
  // Notes hidden by a new search or filter drop out of the selection, so downloads match what is shown.
  const shown = new Set(visibleNotes().map(n => n.id));
  for (const id of app.vaultSelected) if (!shown.has(id)) app.vaultSelected.delete(id);
  $('#vault-tags').innerHTML = renderTagChips();
  $('#vault-results').innerHTML = renderNotes();
  refreshDownload();
};
// Inbox notes for one-by-one review, oldest first, minus any skipped this session.
const reviewQueue = () =>
  app.state.notes
    .filter(n => needsReview(n) && !app.modal.skipped.includes(n.id))
    .sort((a, b) => a.created.localeCompare(b.created));
function convert(id, sourceRect) {
  const note = app.state.notes.find(n => n.id === id);
  const wasInbox = needsReview(note || {}), creating = !note?.taskId;
  const r = commit(() => {
    const task = E.convertNote(app.state, id);
    const reward = wasInbox ? E.rewardReview(app.state, today()) : 0;
    return { task, reward };
  });
  if (r) {
    toast('Sent to your task inbox.');
    if (r.task && creating) sound('taskCreated');
    if (r.reward) celebrateReview(r.reward, sourceRect);
  }
}
function performReview(id, status, sourceRect) {
  const reward = commit(() => E.reviewNote(app.state, id, status, today()));
  celebrateReview(reward, sourceRect);
}
function captureGold(text) {
  const reward = E.captureReward(app.state, { id: app.modal.id, text }, today());
  const capped = (app.state.noteGold[today()] || 0) >= 6;
  return `<span class="capture-reward-label">${capped ? 'Daily limit reached' : 'On save'}</span>${coin('+' + reward, true)}`;
}
export const modals = {
  capture() {
    const note = app.state.notes.find(n => n.id === app.modal.id),
      recovery = app.modal.recovery;
    return modalShell(
      `<span class="capture-title">${vaultArt(recovery || note?.kind === 'journal' || app.modal.kind === 'journal' ? 'journal' : 'note')}<span>${recovery ? 'A moment to reflect' : note?.kind === 'journal' ? 'Your journal entry' : note ? 'Your captured thought' : 'Catch a thought'}</span></span>`,
      `<form id="capture-form" class="form-body">${!note && !recovery ? `<div class="segmented capture-kind"><button type="button" data-action="capture-kind" data-kind="note" class="${app.modal.kind === 'note' ? 'selected' : ''}">${vaultArt('note')}Note</button><button type="button" data-action="capture-kind" data-kind="journal" class="${app.modal.kind === 'journal' ? 'selected' : ''}">${vaultArt('journal')}Journal</button><button type="button" data-action="capture-kind" data-kind="task" class="${app.modal.kind === 'task' ? 'selected' : ''}">${icon('check')}Task</button></div>` : ''}${recovery ? `<p class="reflection-prompt">What needs more care right now? What’s one thing you could do next?</p><div class="recovery-preview"><span>${icon('heart')}<strong id="preview-hp">${app.state.hp}</strong> / ${E.maxHP(app.state)} HP</span><span id="preview-heal">+0 HP</span></div><div class="health-bar"><div id="preview-bar" style="width:${(app.state.hp / E.maxHP(app.state)) * 100}%"></div></div>` : ''}<label class="sr-only" for="capture-text">${recovery ? 'Reflection' : note?.kind === 'journal' || app.modal.kind === 'journal' ? 'Your journal entry' : 'Your note or task'}</label><textarea id="capture-text" name="text" data-tag-suggest aria-autocomplete="list" required maxlength="50000" rows="${recovery ? 8 : 7}" placeholder="${recovery ? 'Take a breath, and write whatever comes to mind…' : 'Drop an idea, a reminder, a little something…\nAdd #tags to find it later.'}" autofocus>${esc(note?.text || '')}</textarea><div class="capture-meta"><span id="word-count">${E.words(note?.text || '')} words</span><span id="capture-gold" class="capture-reward" aria-live="polite" aria-atomic="true" title="1 gold per capture, 2 at 50 words, 3 at 150 words. Up to 6 gold per day; edits earn only the difference.">${captureGold(note?.text || '')}</span></div>${recovery ? '<p class="capture-healing-hint">2 words ≈ 1 HP · Heart improves healing</p>' : ''}<div class="form-actions">${note ? `<button type="button" class="button subtle danger" data-action="delete-note" data-id="${note.id}">Archive</button>` : '<span></span>'}<button class="button primary" type="submit" aria-keyshortcuts="Meta+Enter Control+Enter" title="Confirm (⌘Enter / Ctrl+Enter)">${recovery ? 'Save & recover' : note ? note.kind === 'journal' ? 'Save journal' : 'Save note' : app.modal.kind === 'task' ? 'Send to task inbox' : app.modal.kind === 'journal' ? 'Save journal' : 'Save to Vault'}${icon('arrow')}</button></div></form>`,
      `vault-capture ${recovery ? 'reflection-modal' : ''} ${recovery || note?.kind === 'journal' || app.modal.kind === 'journal' ? 'capture-journal' : 'capture-note'}`,
      recovery ? 'Saved to your Journal. A little writing, a little healing.' : '',
    );
  },
  vault() {
    const inboxCount = app.state.notes.filter(needsReview).length;
    return modalShell(
      vaultTitle('The Vault'),
      `<div class="vault-toolbar"><label class="search-box">${icon('search')}<input id="vault-search" data-tag-suggest aria-autocomplete="list" autocomplete="off" aria-label="Search notes and hashtags" placeholder="Search thoughts or #tags" value="${esc(app.vaultSearch)}"></label>${inboxCount ? `<button class="button secondary" data-action="review-notes">${vaultArt('review')}Review <span>${inboxCount}</span></button>` : ''}<button class="button secondary" data-action="capture">${icon('bolt')}Capture</button></div><div class="vault-tab-row"><div class="vault-tabs segmented">${VAULT_SECTIONS.map(section => `<button data-action="vault-filter" data-filter="${section.id}" data-vault-tone="${section.id}" class="${app.vaultFilter === section.id ? 'selected' : ''}" aria-pressed="${app.vaultFilter === section.id}" title="${section.title}">${vaultArt(section.art)}<span>${section.label}</span><small>${app.state.notes.filter(n => inVaultSection(n, section.id)).length}</small></button>`).join('')}</div><span id="vault-download" aria-live="polite">${downloadButton()}</span></div><div id="vault-tags">${renderTagChips()}</div><div id="vault-results" class="vault-results">${renderNotes()}</div><footer class="vault-footer">${reviewBonus()}</footer>`,
      `vault-modal vault-shelf-${app.vaultFilter}`,
      '',
    );
  },
  review() {
    const queue = reviewQueue(),
      note = queue[0],
      sorted = app.modal.sorted;
    const body = note
      ? `<div class="review-progress"><span>${queue.length} to sort${app.modal.skipped.length ? ` · ${app.modal.skipped.length} skipped` : ''}</span><span>${sorted} sorted</span></div><article class="review-card" data-vault-tone="${vaultTone(note)}">${noteHeading(note)}<p class="review-text">${esc(note.text).replace(/(^|\s)(#[\p{L}\p{N}_-]+)/gu, (_, space, tag) => `${space}<span class="hashtag tag-colored" ${tagStyle(tag)}>${tag}</span>`)}</p></article><div class="review-actions"><button class="button secondary" data-action="review-keep" data-id="${note.id}">${icon('check')}Keep<kbd>K</kbd></button><button class="button secondary" data-action="review-task" data-id="${note.id}">${icon('arrow')}${note.taskTitle ? 'Back to tasks' : 'Make a task'}<kbd>T</kbd></button><button class="button secondary" data-action="review-archive" data-id="${note.id}">${icon('vault')}Archive<kbd>A</kbd></button><button class="text-button" data-action="review-skip" data-id="${note.id}">Skip for now<kbd>S</kbd></button></div><div class="review-help">${reviewBonus()}</div>`
      : `<div class="empty-state review-done"><span class="empty-symbol">${icon('check')}</span><h3>${sorted ? 'All sorted' : 'Nothing waiting'}</h3><p>${sorted ? `You sorted ${sorted} ${sorted === 1 ? 'note' : 'notes'}.` : 'Your inbox is clear.'}${app.modal.skipped.length ? ` ${app.modal.skipped.length} skipped ${app.modal.skipped.length === 1 ? 'note is' : 'notes are'} still in Needs review.` : ''}</p><button class="button primary" data-action="vault">Back to the Vault</button></div>`;
    return modalShell(
      vaultTitle('Review captures', 'review'),
      body,
      'review-modal',
      '',
    );
  },
};
// Toggle in place so the list keeps its scroll position and focus.
function toggleSelected(card) {
  const id = card.dataset.id,
    selected = !app.vaultSelected.has(id);
  selected ? app.vaultSelected.add(id) : app.vaultSelected.delete(id);
  card.classList.toggle('selected', selected);
  card.setAttribute(
    'aria-label',
    card
      .getAttribute('aria-label')
      .replace(/(, selected)?\. Press/, `${selected ? ', selected' : ''}. Press`),
  );
  refreshDownload();
}
export const actions = {
  capture(b, { a, id, sourceRect }) {
    openModal({ type: 'capture', kind: app.modal?.type === 'vault' && app.vaultFilter === 'journal' ? 'journal' : 'note' });
  },
  'capture-kind'(b, { a, id, sourceRect }) {
    const text = $('#capture-text').value;
    app.modal.kind = b.dataset.kind;
    view.renderModal();
    $('#capture-text').value = text;
    onInput({ target: $('#capture-text') });
    $('#capture-text').focus();
  },
  vault(b, { a, id, sourceRect }) {
    app.vaultSearch = '';
    app.vaultTag = null;
    app.vaultSelected = new Set();
    openModal({ type: 'vault' });
  },
  'vault-select-all'() {
    const shown = visibleNotes(),
      all = shown.every(n => app.vaultSelected.has(n.id));
    for (const n of shown) all ? app.vaultSelected.delete(n.id) : app.vaultSelected.add(n.id);
    for (const card of document.querySelectorAll('#vault-results .note-card.selectable'))
      card.classList.toggle('selected', app.vaultSelected.has(card.dataset.id));
    refreshDownload();
    $('#vault-download [data-action="vault-select-all"]')?.focus();
  },
  'toggle-note-select'(b) {
    // Dragging across text to copy it should not toggle the card.
    if (String(getSelection()).trim() && b.contains(getSelection().anchorNode)) return;
    toggleSelected(b);
  },
  'vault-merge'() {
    const ids = selectedVisible().map(n => n.id);
    const merged = commit(() => E.mergeNotes(app.state, ids));
    if (!merged) return;
    app.vaultSelected = new Set();
    view.renderModal();
    const card = $(`#vault-results article[data-id="${CSS.escape(merged.note.id)}"]`);
    card?.classList.add('just-merged');
    card?.scrollIntoView({ block: 'nearest' });
    sound('note');
    toast(`Merged ${ids.length} notes into one.`, () =>
      commit(() => E.undoMergeNotes(app.state, merged.undo)),
    );
  },
  'vault-export'() {
    const notes = selectedVisible();
    if (!notes.length) return;
    const text = notesToText(notes, { timeZone: app.state.settings.timezone }),
      url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })),
      link = document.createElement('a');
    link.href = url;
    const journal = isJournalExport(notes);
    link.download = `twesk-${journal ? 'journal' : 'notes'}-${today()}.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    sound('note');
    const noun = journal
      ? notes.length === 1
        ? 'journal entry'
        : 'journal entries'
      : notes.length === 1
        ? 'note'
        : 'notes';
    toast(`Downloaded ${notes.length} ${noun} as one text file.`);
  },
  'vault-filter'(b, { a, id, sourceRect }) {
    app.vaultFilter = b.dataset.filter;
    app.vaultSelected = new Set();
    view.renderModal();
    $(`[data-action="vault-filter"][data-filter="${app.vaultFilter}"]`)?.focus();
  },
  'edit-note'(b, { a, id, sourceRect }) {
    openModal({ type: 'capture', id });
  },
  'convert-note'(b, { id, sourceRect }) {
    convert(id, sourceRect);
  },
  'pin-note'(b, { id }) {
    const pinned = commit(() => E.togglePin(app.state, id));
    if (pinned !== undefined) toast(pinned ? 'Pinned to the top.' : 'Unpinned.');
  },
  'vault-tag'(b) {
    const tag = b.dataset.tag;
    app.vaultTag = app.vaultTag === tag ? null : tag;
    if (app.modal?.type !== 'vault') return;
    refreshVault();
    $(`#vault-tags [data-tag="${CSS.escape(tag)}"]`)?.focus();
  },
  'review-notes'() {
    openModal({ type: 'review', skipped: [], sorted: 0 });
  },
  'review-keep'(b, { id, sourceRect }) {
    app.modal.sorted++;
    performReview(id, 'kept', sourceRect);
  },
  'review-task'(b, { id, sourceRect }) {
    app.modal.sorted++;
    convert(id, sourceRect);
  },
  'review-archive'(b, { id, sourceRect }) {
    app.modal.sorted++;
    performReview(id, 'archived', sourceRect);
  },
  'review-skip'(b, { id }) {
    app.modal.skipped.push(id);
    view.renderModal();
  },
  'keep-note'(b, { a, id, sourceRect }) {
    performReview(id, 'kept', sourceRect);
  },
  'archive-note'(b, { a, id, sourceRect }) {
    performReview(id, 'archived', sourceRect);
  },
  'restore-note'(b, { a, id, sourceRect }) {
    commit(() => {
      const n = app.state.notes.find(n => n.id === id);
      if (n) n.status = 'kept';
    });
    toast('Entry restored.');
  },
  'delete-note'(b, { id, sourceRect }) {
    const reward = commit(() => E.reviewNote(app.state, id, 'archived', today()));
    openModal({ type: 'vault' });
    celebrateReview(reward, sourceRect);
    if (!reward) toast('Entry archived.');
  },
  recover(b, { a, id, sourceRect }) {
    openModal({ type: 'capture', recovery: true });
  },
};
export const forms = {
  'capture-form'(data) {
    const text = data.get('text').trim();
    if (!text) return;
    const previous = app.modal, creatingTask = previous.kind === 'task' && !previous.id;
    const sourceRect = $('#capture-gold').getBoundingClientRect();
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
      if (creatingTask) E.convertNote(app.state, result.note.id);
      return result;
    });
    if (r) {
      if (r.note.kind === 'journal') app.vaultFilter = 'journal';
      closeModal();
      if (creatingTask) sound('taskCreated');
      if (r.reward) rewardEffect(sourceRect, r.reward); else if (!creatingTask) sound('note');
      toast(
        previous.recovery
          ? `Reflection saved. +${r.healed} HP${r.reward ? ` · +${r.reward} gold` : ''}.`
          : previous.kind === 'task'
            ? `Sent to task inbox${r.reward ? ` · +${r.reward} gold` : ''}.`
            : `${r.note.kind === 'journal' ? 'Journal' : 'Thought'} saved${r.reward ? ` · +${r.reward} gold` : ''}.`,
      );
    }
  },
};
export function onInput(event) {
  if (event.target.id === 'vault-search') {
    app.vaultSearch = event.target.value;
    refreshVault();
  }
  if (event.target.id === 'capture-text') {
    const count = E.words(event.target.value);
    $('#word-count').textContent = count + ' words';
    $('#capture-gold').innerHTML = captureGold(event.target.value);
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
// Review shortcuts: K keep, T task, A archive, S skip. Space or Enter selects a focused note card.
export function onKeydown(event) {
  if (
    app.modal?.type === 'vault' &&
    event.target.matches?.('.note-card.selectable') &&
    [' ', 'Enter'].includes(event.key)
  ) {
    event.preventDefault();
    toggleSelected(event.target);
    return;
  }
  if (app.modal?.type !== 'review' || app.busy || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.target.matches?.('input, textarea, select')) return;
  const action = { k: 'review-keep', t: 'review-task', a: 'review-archive', s: 'review-skip' }[
    event.key.toLowerCase()
  ];
  const button = action && $(`#overlay [data-action="${action}"]`);
  if (!button) return;
  event.preventDefault();
  button.click();
  requestAnimationFrame(() => $('#overlay .review-actions button')?.focus());
}
