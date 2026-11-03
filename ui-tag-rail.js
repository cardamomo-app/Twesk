// Shared horizontal tag filters for Tasks and the Vault.
import { $, esc, icon } from './ui-core.js?v=0.42.9';
import { motionOK } from './ui-effects.js?v=0.42.9';

export function renderTagRail({ id, label, item, chips, className = '' }) {
  const arrows = [['left', 'previous'], ['right', 'more']].map(([direction, word]) =>
    `<button class="project-scroll project-scroll-${direction}" data-action="scroll-tags" data-direction="${direction}" aria-label="Show ${word} ${esc(item)} tags" aria-controls="${id}" hidden>${icon('chevron')}</button>`,
  ).join('');
  return `<div class="project-rail ${className}"><div class="project-chips" id="${id}" role="group" aria-label="${esc(label)}">${chips}</div>${arrows}</div>`;
}

const observers = new Map();
export function syncTagRail(id, left) {
  observers.get(id)?.disconnect();
  observers.delete(id);
  const rail = $(`#${id}`);
  if (!rail) return;
  const wrapper = rail.parentElement;
  const previous = wrapper.querySelector('.project-scroll-left');
  const next = wrapper.querySelector('.project-scroll-right');
  const update = () => {
    const end = rail.scrollWidth - rail.clientWidth;
    previous.hidden = rail.scrollLeft <= 2;
    next.hidden = rail.scrollLeft >= end - 2;
  };
  if (left !== undefined) rail.scrollLeft = left;
  rail.addEventListener('scroll', update, { passive: true });
  const observer = new ResizeObserver(update);
  observer.observe(rail);
  observers.set(id, observer);
  update();
}

export function scrollTagRail(button) {
  const rail = button.closest('.project-rail').querySelector('.project-chips');
  const distance = Math.max(100, rail.clientWidth * .7);
  rail.scrollBy({
    left: button.dataset.direction === 'left' ? -distance : distance,
    behavior: motionOK() ? 'smooth' : 'instant',
  });
}
