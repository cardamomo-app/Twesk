// The Vault: notes, journal entries, quick capture, and recovery reflections.
import * as E from './engine.js?v=0.13.2';
import { $, app, coin, esc, icon, modalShell, toast, today, view } from './ui-core.js?v=0.13.2';
import { closeModal, commit, openModal } from './ui-modal.js?v=0.13.2';
import { isJournalExport, notesToText } from './notes-export.js?v=0.13.2';
import { sound } from './ui-effects.js?v=0.13.2';
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
      `${space}<button class="hashtag" data-action="vault-tag" data-tag="${tag.toLowerCase()}" title="Show notes tagged ${tag}">${tag}</button>`,
  );
const inTab = n =>
  app.vaultFilter === 'archived'
    ? n.status === 'archived'
    : n.status !== 'archived' &&
      (app.vaultFilter === 'all' ||
        (app.vaultFilter === 'journal' ? n.kind === 'journal' : n.status === app.vaultFilter));
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
        `<button class="project-chip ${app.vaultTag === tag ? 'selected' : ''}" data-action="vault-tag" data-tag="${esc(tag)}" aria-pressed="${app.vaultTag === tag}">${esc(tag)}<span>${n}</span></button>`,
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
function renderNotes() {
  const notes = visibleNotes();
  if (!notes.length)
    return `<div class="empty-state"><span class="empty-symbol">${icon('vault')}</span><h3>${app.vaultSearch || app.vaultTag ? 'Nothing found just yet' : app.vaultFilter === 'inbox' ? 'Room for a new thought' : 'A little space for your ideas'}</h3><p>${app.vaultSearch || app.vaultTag ? 'Try another word, hashtag, or tab.' : 'Capture something now. You can make sense of it later.'}</p><button class="button secondary" data-action="capture">${icon('plus')}Quick capture</button></div>`;
  const selectable = canSelect();
  return notes
    .map(
      n =>
        `<article class="note-card ${n.pinned ? 'pinned' : ''} ${selectable ? 'selectable' : ''} ${app.vaultSelected.has(n.id) ? 'selected' : ''}" ${selectable ? `data-action="toggle-note-select" data-id="${n.id}" tabindex="0" aria-label="${n.kind === 'journal' ? 'Journal entry' : 'Note'} from ${esc(noteDate(n))}${app.vaultSelected.has(n.id) ? ', selected' : ''}. Press Space to select it for download."` : ''}><div class="note-top"><span>${n.pinned ? icon('pin') + ' PINNED · ' : ''}${n.taskTitle ? icon('undo') + ' WAS A TASK · ' : ''}${n.kind === 'journal' ? icon('pencil') + ' REFLECTION' : 'NOTE'} · ${esc(noteDate(n))}</span>${coin(n.paid)}</div><p class="note-text">${noteText(n.text)}</p><div class="note-actions"><button class="text-button" data-action="edit-note" data-id="${n.id}">${icon('pencil')}Edit</button>${n.status !== 'archived' ? `<button class="text-button" data-action="pin-note" data-id="${n.id}" aria-pressed="${!!n.pinned}">${icon('pin')}${n.pinned ? 'Unpin' : 'Pin'}</button>` : ''}${n.taskId ? '<span class="converted">' + icon('check') + 'Sent to tasks</span>' : `<button class="text-button" data-action="convert-note" data-id="${n.id}">${icon('arrow')}${n.taskTitle ? 'Back to tasks' : 'Make a task'}</button>`}${n.status === 'inbox' ? `<button class="text-button" data-action="keep-note" data-id="${n.id}">Keep note</button>` : ''}<button class="text-button archive" data-action="${n.status === 'archived' ? 'restore-note' : 'archive-note'}" data-id="${n.id}">${n.status === 'archived' ? 'Restore' : 'Archive'}</button></div></article>`,
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
    .filter(n => n.status === 'inbox' && !app.modal.skipped.includes(n.id))
    .sort((a, b) => a.created.localeCompare(b.created));
function convert(id) {
  const wasInbox = app.state.notes.find(n => n.id === id)?.status === 'inbox';
  const r = commit(() => {
    const t = E.convertNote(app.state, id);
    if (wasInbox) E.rewardReview(app.state, today());
    return t;
  });
  if (r) {
    toast('Sent to your task inbox' + (wasInbox ? ' · review saved.' : '.'));
    sound('note');
  }
}
function performReview(id, status) {
  const reward = commit(() => E.reviewNote(app.state, id, status, today()));
  if (reward) {
    sound('reward');
    toast('A little clarity. +4 gold for your review.');
  }
}
export const modals = {
  capture() {
    const note = app.state.notes.find(n => n.id === app.modal.id),
      recovery = app.modal.recovery;
    return modalShell(
      recovery ? 'A moment to reflect' : note ? 'Your captured thought' : 'Catch a thought',
      `<form id="capture-form" class="form-body">${!note && !recovery ? `<div class="segmented capture-kind"><button type="button" data-action="capture-kind" data-kind="note" class="${app.modal.kind === 'note' ? 'selected' : ''}">${icon('pencil')}Note</button><button type="button" data-action="capture-kind" data-kind="journal" class="${app.modal.kind === 'journal' ? 'selected' : ''}">${icon('mind')}Journal</button><button type="button" data-action="capture-kind" data-kind="task" class="${app.modal.kind === 'task' ? 'selected' : ''}">${icon('check')}Task</button></div>` : ''}${recovery ? `<p class="reflection-prompt">What needs more care right now? What’s one thing you could do next?</p><div class="recovery-preview"><span>${icon('heart')}<strong id="preview-hp">${app.state.hp}</strong> / ${E.maxHP(app.state)} HP</span><span id="preview-heal">+0 HP</span></div><div class="health-bar"><div id="preview-bar" style="width:${(app.state.hp / E.maxHP(app.state)) * 100}%"></div></div>` : ''}<label class="sr-only" for="capture-text">${recovery ? 'Reflection' : 'Your note or task'}</label><textarea id="capture-text" name="text" data-tag-suggest aria-autocomplete="list" required maxlength="50000" rows="${recovery ? 8 : 7}" placeholder="${recovery ? 'Take a breath, and write whatever comes to mind…' : 'Drop an idea, a reminder, a little something…\nAdd #tags to find it later.'}" autofocus>${esc(note?.text || '')}</textarea><div class="capture-meta"><span id="word-count">${E.words(note?.text || '')} words</span><span>${recovery ? '2 words ≈ 1 HP · Heart improves healing' : 'Notes earn 1–3 gold · up to 6 per day'}</span></div><div class="form-actions">${note ? `<button type="button" class="button subtle danger" data-action="delete-note" data-id="${note.id}">Archive</button>` : '<span></span>'}<button class="button primary" type="submit">${recovery ? 'Save & recover' : note ? 'Save note' : app.modal.kind === 'task' ? 'Send to task inbox' : app.modal.kind === 'journal' ? 'Save journal' : 'Save to Vault'}${icon('arrow')}</button></div></form>`,
      recovery ? 'reflection-modal' : '',
      recovery ? 'A little writing, a little healing. Saved privately in your Vault.' : '',
    );
  },
  vault() {
    const inboxCount = app.state.notes.filter(n => n.status === 'inbox').length;
    return modalShell(
      'The Vault',
      `<div class="vault-toolbar"><label class="search-box">${icon('search')}<input id="vault-search" data-tag-suggest aria-autocomplete="list" autocomplete="off" aria-label="Search notes and hashtags" placeholder="Search thoughts or #tags" value="${esc(app.vaultSearch)}"></label>${inboxCount ? `<button class="button secondary" data-action="review-notes">${icon('check')}Review ${inboxCount} one by one</button>` : ''}<button class="button secondary" data-action="capture">${icon('plus')}Capture</button></div><div class="vault-tab-row"><div class="vault-tabs segmented">${[
        ['inbox', 'Needs review'],
        ['kept', 'Notes'],
        ['journal', 'Journal'],
        ['all', 'All'],
        ['archived', 'Archive'],
      ]
        .map(
          ([k, l]) =>
            `<button data-action="vault-filter" data-filter="${k}" class="${app.vaultFilter === k ? 'selected' : ''}">${l}${k === 'inbox' ? ` <span>${inboxCount}</span>` : ''}</button>`,
        )
        .join(
          '',
        )}</div><span id="vault-download" aria-live="polite">${downloadButton()}</span></div><div id="vault-tags">${renderTagChips()}</div><div id="vault-results" class="vault-results">${renderNotes()}</div><footer class="vault-footer"><span>${app.state.reviewDates.includes(today()) ? 'Review reward earned today · +4 gold' : 'Keep, convert, or archive an inbox note to earn +4 gold.'}</span></footer>`,
      'vault-modal',
      'Thoughts first. Plans when you’re ready.',
    );
  },
  review() {
    const queue = reviewQueue(),
      note = queue[0],
      sorted = app.modal.sorted;
    const body = note
      ? `<div class="review-progress"><span>${queue.length} to sort${app.modal.skipped.length ? ` · ${app.modal.skipped.length} skipped` : ''}</span><span>${sorted} sorted</span></div><article class="review-card"><div class="note-top"><span>${note.taskTitle ? 'WAS A TASK' : note.kind === 'journal' ? 'REFLECTION' : 'NOTE'} · ${esc(noteDate(note))}</span>${coin(note.paid)}</div><p class="review-text">${esc(note.text).replace(/(^|\s)(#[\p{L}\p{N}_-]+)/gu, '$1<span class="hashtag">$2</span>')}</p></article><div class="review-actions"><button class="button secondary" data-action="review-keep" data-id="${note.id}">${icon('check')}Keep<kbd>K</kbd></button><button class="button secondary" data-action="review-task" data-id="${note.id}">${icon('arrow')}${note.taskTitle ? 'Back to tasks' : 'Make a task'}<kbd>T</kbd></button><button class="button secondary" data-action="review-archive" data-id="${note.id}">${icon('vault')}Archive<kbd>A</kbd></button><button class="text-button" data-action="review-skip" data-id="${note.id}">Skip for now<kbd>S</kbd></button></div><p class="form-help review-help">${app.state.reviewDates.includes(today()) ? 'Review reward earned today · +4 gold.' : 'Your first review today earns +4 gold.'} Tasks keep the note’s hashtags.</p>`
      : `<div class="empty-state review-done"><span class="empty-symbol">${icon('check')}</span><h3>${sorted ? 'All sorted' : 'Nothing waiting'}</h3><p>${sorted ? `You sorted ${sorted} ${sorted === 1 ? 'note' : 'notes'}.` : 'Your inbox is clear.'}${app.modal.skipped.length ? ` ${app.modal.skipped.length} skipped ${app.modal.skipped.length === 1 ? 'note is' : 'notes are'} still in Needs review.` : ''}</p><button class="button primary" data-action="vault">Back to the Vault</button></div>`;
    return modalShell(
      'Review captures',
      body,
      'review-modal',
      'One at a time: keep it, make it a task, or let it go.',
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
  'convert-note'(b, { id }) {
    convert(id);
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
  'review-keep'(b, { id }) {
    app.modal.sorted++;
    performReview(id, 'kept');
  },
  'review-task'(b, { id }) {
    app.modal.sorted++;
    convert(id);
  },
  'review-archive'(b, { id }) {
    app.modal.sorted++;
    performReview(id, 'archived');
  },
  'review-skip'(b, { id }) {
    app.modal.skipped.push(id);
    view.renderModal();
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
      sound('note');
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
    refreshVault();
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
