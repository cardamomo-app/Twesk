// Hashtag autocomplete for task titles, captured notes, and Vault search.
// Typing "#" plus a letter or two suggests hashtags already used in tasks and notes, most used first.
// ↑/↓ choose, Enter or Tab accept, Escape closes the list (without closing the dialog); clicks work too.
import * as E from './engine.js?v=0.24.0';
import { app, esc } from './ui-core.js?v=0.24.0';

const FIELDS = '[data-tag-suggest]';
let field = null,
  items = [],
  active = 0,
  box = null;

function close() {
  box?.remove();
  box = null;
  items = [];
  if (field?.isConnected) {
    field.setAttribute('aria-expanded', 'false');
    field.removeAttribute('aria-activedescendant');
  }
}
// Pixel position of the caret inside a textarea, using an invisible mirror with the same text styles.
function caretOffset(textarea, position) {
  const mirror = document.createElement('div'),
    style = getComputedStyle(textarea);
  for (const prop of [
    'boxSizing',
    'width',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderTopWidth',
    'borderLeftWidth',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'lineHeight',
    'letterSpacing',
    'wordSpacing',
    'tabSize',
  ])
    mirror.style[prop] = style[prop];
  Object.assign(mirror.style, {
    position: 'absolute',
    visibility: 'hidden',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    top: '0',
    left: '-9999px',
  });
  mirror.textContent = textarea.value.slice(0, position);
  const marker = document.createElement('span');
  marker.textContent = '​';
  mirror.append(marker);
  document.body.append(mirror);
  const result = {
    top: marker.offsetTop + marker.offsetHeight - textarea.scrollTop,
    left: marker.offsetLeft,
  };
  mirror.remove();
  return result;
}
function render(token) {
  const host = field.parentElement;
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  if (!box) {
    box = document.createElement('div');
    box.className = 'tag-suggest';
    box.id = 'tag-suggest';
    box.setAttribute('role', 'listbox');
    box.setAttribute('aria-label', 'Hashtag suggestions');
    field.after(box);
  }
  box.innerHTML = items
    .map(
      ({ tag, count }, i) =>
        `<div class="tag-option ${i === active ? 'active' : ''}" role="option" id="tag-option-${i}" aria-selected="${i === active}" data-index="${i}"><span>${esc(tag)}</span><small>${count}</small></div>`,
    )
    .join('');
  let top = field.offsetTop + field.offsetHeight + 4,
    left = field.offsetLeft;
  if (field.tagName === 'TEXTAREA') {
    const caret = caretOffset(field, token.start);
    top = field.offsetTop + Math.min(caret.top + 6, field.offsetHeight);
    left = field.offsetLeft + Math.min(caret.left, field.offsetWidth - 180);
  }
  Object.assign(box.style, { top: top + 'px', left: Math.max(field.offsetLeft, left) + 'px' });
  field.setAttribute('aria-expanded', 'true');
  field.setAttribute('aria-controls', 'tag-suggest');
  field.setAttribute('aria-activedescendant', `tag-option-${active}`);
}
function update(target) {
  if (!target.matches?.(FIELDS)) return close();
  field = target;
  const token = E.tagAtCaret(field.value, field.selectionStart ?? field.value.length);
  // Suggest once at least one letter follows "#", so a lone "#" does not open a long list.
  items = token && token.text.length > 1 ? E.suggestionsFor(token.text, E.knownTags(app.state)) : [];
  if (!items.length) return close();
  active = Math.min(active, items.length - 1);
  render(token);
}
function accept(index) {
  const choice = items[index],
    token = field && E.tagAtCaret(field.value, field.selectionStart ?? field.value.length);
  if (!choice || !token) return close();
  const after = field.value.slice(field.selectionStart);
  const insert = choice.tag + (after.startsWith(' ') ? '' : ' ');
  field.value = field.value.slice(0, token.start) + insert + after;
  const caret = token.start + insert.length;
  field.setSelectionRange(caret, caret);
  close();
  field.focus();
  // Let listeners (word count, Vault search) see the change.
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

export function installTagSuggest() {
  document.addEventListener('input', event => {
    active = 0;
    update(event.target);
  });
  // Accept on mousedown so the field keeps focus (a click would blur it first).
  document.addEventListener(
    'mousedown',
    event => {
      const option = event.target.closest?.('.tag-option');
      if (option) {
        event.preventDefault();
        event.stopPropagation();
        accept(Number(option.dataset.index));
      } else if (box && event.target !== field) close();
    },
    true,
  );
  // Keys are handled in the capture phase so Enter does not submit the form and Escape does not close the dialog.
  document.addEventListener(
    'keydown',
    event => {
      if (!box || event.target !== field) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        active = (active + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        render(E.tagAtCaret(field.value, field.selectionStart));
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        accept(active);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    },
    true,
  );
  document.addEventListener('focusout', event => {
    if (event.target === field) setTimeout(() => field && document.activeElement !== field && close(), 120);
  });
}
