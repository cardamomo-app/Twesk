// Full screen: hides the browser's own bars (Safari keeps its toolbar even for an installed web app).
// A topbar button and the F key go in and back; Escape also leaves, as browsers provide.
import { $, icon } from './ui-core.js?v=0.22.4';

const doc = document, root = doc.documentElement;
export const fullscreenSupported = () => !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
const current = () => doc.fullscreenElement || doc.webkitFullscreenElement || null;

export function fullscreenButton() {
  if (!fullscreenSupported()) return '';
  const on = !!current(), label = on ? 'Exit full screen (F)' : 'Full screen (F)';
  return `<button class="icon-button fullscreen-button" data-action="fullscreen" aria-label="${label}" title="${label}" aria-pressed="${on}">${icon(on ? 'collapse' : 'expand')}</button>`;
}
export function toggleFullscreen() {
  if (!fullscreenSupported()) return;
  if (current()) (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc)?.catch?.(() => {});
  else (root.requestFullscreen || root.webkitRequestFullscreen).call(root)?.catch?.(() => {});
}
export const actions = { fullscreen: toggleFullscreen };

const typing = el => el?.closest?.('input,textarea,select,[contenteditable=""],[contenteditable="true"]');
export function installFullscreen() {
  doc.addEventListener('keydown', event => {
    if (event.key.toLowerCase() !== 'f' || event.repeat || event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return;
    if (!fullscreenSupported()) return;
    event.preventDefault();
    toggleFullscreen();
  });
  // Swap the button in place, so entering or leaving never redraws the dashboard.
  const sync = () => { const button = $('[data-action="fullscreen"]'); if (button) button.outerHTML = fullscreenButton(); };
  doc.addEventListener('fullscreenchange', sync);
  doc.addEventListener('webkitfullscreenchange', sync);
}
