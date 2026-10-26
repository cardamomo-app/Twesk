import { $, app, esc, icon, modalShell, view } from './ui-core.js?v=0.41.1';
import { createWeatherController, searchWeatherPlaces, weatherCondition, weatherTemperature } from './weather.js?v=0.41.1';
import { weatherArt } from './weather-art.js?v=0.41.1';
import { openModal } from './ui-modal.js?v=0.41.1';

const locateIcon = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>';
let storage; try { storage = localStorage; } catch {}
const controller = createWeatherController({ storage, geolocation: navigator.geolocation, permissions: navigator.permissions, onChange: updateWeather });
let query = '', results = [], searchBusy = false, searchError = '', searchVersion = 0;
const temperature = (n, suffix = false) => weatherTemperature(n, controller.snapshot().unit, suffix);
const probability = n => n === null ? '—' : `${Math.round(n)}%`;
const saved = s => !!s.data && (s.stale || navigator.onLine === false);
function updatedLabel(s) {
  if (!s.data) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - s.data.measuredAt) / 60000));
  return minutes < 1 ? 'Updated just now' : minutes < 60 ? `Updated ${minutes} min ago` : minutes < 1440 ? `Updated ${Math.floor(minutes / 60)}h ago` : `Updated ${Math.floor(minutes / 1440)}d ago`;
}
export function renderWeather() {
  const s = controller.snapshot(), d = s.data;
  if (!d) return `<button class="topbar-weather weather-empty" data-action="weather" aria-label="${s.place ? 'Open weather for ' + esc(s.place.name) : 'Set up local weather'}">${weatherArt('partly')}<span><strong>${s.busy ? 'Finding the weather…' : s.place ? esc(s.place.name) : 'Weather'}</strong><small>${s.busy ? 'One moment' : s.place ? 'Tap to retry' : 'Choose your location'}</small></span></button>`;
  const condition = weatherCondition(d.code, d.isDay);
  const label = `Weather in ${s.place.name}: ${condition.label}, ${temperature(d.temperature, true)}. Low ${temperature(d.low)}, high ${temperature(d.high)}. Rain chance this hour ${probability(d.rainChance)}. Dew point ${temperature(d.dewPoint, true)}. ${saved(s) ? 'Saved reading. ' : ''}${updatedLabel(s)}.`;
  return `<button class="topbar-weather" data-action="weather" aria-label="${esc(label)}" title="${esc(label)}">${weatherArt(condition.art)}<span class="weather-header-content"><strong class="weather-place">${esc(s.place.name)}</strong><span class="weather-range" title="Today’s low and high"><span class="weather-low">${temperature(d.low)}</span><span class="weather-range-separator">/</span><span>${temperature(d.high)}</span></span><span class="weather-current"><strong class="weather-temperature">${temperature(d.temperature)}<small>${s.unit.toUpperCase()}</small></strong>${saved(s) ? '<span class="weather-saved">Saved</span>' : ''}</span><span class="weather-condition">${esc(condition.label)}</span><span class="weather-header-metrics"><span title="Chance of rain this hour">${weatherArt('drizzle')}<span class="weather-rain-value">${probability(d.rainChance)}</span></span><span title="Dew point">${weatherArt('dew')}<span>${temperature(d.dewPoint)}</span></span></span></span></button>`;
}
function reading() {
  const s = controller.snapshot(), d = s.data;
  if (!d) return `<div class="weather-welcome">${weatherArt('partly')}<h3>${s.place ? esc(s.place.name) : 'Your weather, here'}</h3><p>${s.busy ? 'Getting the latest conditions…' : 'Use your current location, or search for a city.'}</p></div>`;
  const condition = weatherCondition(d.code, d.isDay);
  return `<div class="weather-overview">${weatherArt(condition.art)}<div><h3>${esc(s.place.name)}</h3><p>${esc([s.place.region, s.place.country].filter((v, i, a) => v && v !== s.place.name && a.indexOf(v) === i).join(', '))}</p><strong>${temperature(d.temperature)}<small>${s.unit.toUpperCase()}</small></strong><span>${esc(condition.label)}</span></div></div><div class="weather-detail-metrics"><div>${weatherArt('range')}<small>Today’s low / high</small><strong>${temperature(d.low)} <span>/</span> ${temperature(d.high)}</strong></div><div>${weatherArt('drizzle')}<small>Rain · this hour</small><strong>${probability(d.rainChance)}</strong></div><div>${weatherArt('dew')}<small>Dew point</small><strong>${temperature(d.dewPoint)}</strong></div></div><p class="weather-updated">${saved(s) ? 'Saved reading · ' : ''}${updatedLabel(s)}</p>`;
}
function message() {
  const s = controller.snapshot();
  return s.error || (navigator.onLine === false ? 'You’re offline. Weather will update when you reconnect.' : '');
}
function updateWeather() {
  const slot = $('#weather-header');
  if (slot) {
    const template = document.createElement('template');
    template.innerHTML = renderWeather();
    const next = template.content.firstElementChild, current = slot.firstElementChild;
    if (!current) slot.append(next);
    else {
      // Keep the button itself: dialog close must restore focus to the same control.
      for (const attribute of ['class', 'aria-label', 'title']) {
        if (next.hasAttribute(attribute)) current.setAttribute(attribute, next.getAttribute(attribute));
        else current.removeAttribute(attribute);
      }
      current.replaceChildren(...next.childNodes);
    }
  }
  // Polling never redraws a location search or steals its input focus.
  const details = $('#weather-reading');
  if (details) details.innerHTML = reading();
  const status = $('#weather-message');
  if (status) { status.textContent = message(); status.hidden = !message(); }
  for (const b of document.querySelectorAll('[data-action="weather-locate"], [data-action="weather-refresh"]')) b.disabled = controller.snapshot().busy;
  for (const b of document.querySelectorAll('[data-action="weather-refresh"], [data-action="weather-clear"]')) b.hidden = !controller.snapshot().place;
}
function searchResults() {
  return searchBusy ? '<p>Finding places…</p>' : searchError ? `<p>${esc(searchError)}</p>` : results.map((place, index) => `<button data-action="weather-choose" data-index="${index}"><span><strong>${esc(place.name)}</strong><small>${esc([place.region, place.country].filter(Boolean).join(', '))}</small></span>${icon('arrow')}</button>`).join('');
}
function updateSearch() {
  if (app.modal?.type !== 'weather') return;
  const area = $('.weather-search-results'), button = $('#weather-search-form button');
  if (area) area.innerHTML = searchResults();
  if (button) button.disabled = searchBusy;
}
export function onInput(event) {
  if (event.target.id !== 'weather-search') return;
  query = event.target.value;
  searchVersion++; searchBusy = false; searchError = ''; results = [];
  updateSearch();
}
export const modals = {
  weather() {
    const s = controller.snapshot();
    return modalShell('Weather', `<div class="form-body weather-body"><div class="weather-controls"><div class="weather-units" role="group" aria-label="Temperature unit">${['c', 'f'].map(unit => `<button data-action="weather-unit" data-unit="${unit}" aria-pressed="${s.unit === unit}" class="${s.unit === unit ? 'selected' : ''}">°${unit.toUpperCase()}</button>`).join('')}</div><button class="text-button weather-refresh" data-action="weather-refresh" ${s.place ? '' : 'hidden'} ${s.busy ? 'disabled' : ''}>${icon('repeat')}Refresh</button></div><div id="weather-reading">${reading()}</div><p class="weather-message" id="weather-message" role="status" ${message() ? '' : 'hidden'}>${esc(message())}</p><div class="weather-location"><button class="button secondary weather-locate" data-action="weather-locate" ${s.busy ? 'disabled' : ''}>${locateIcon}Use my location</button><form id="weather-search-form"><label for="weather-search">Or choose a city</label><div class="weather-search-row"><input id="weather-search" name="place" type="search" autocomplete="off" minlength="2" maxlength="120" required placeholder="City or postcode" value="${esc(query)}"><button class="button secondary" type="submit" aria-label="Search for a city" ${searchBusy ? 'disabled' : ''}>${icon('search')}</button></div></form><div class="weather-search-results" aria-live="polite">${searchResults()}</div></div><footer class="weather-credits"><span>Weather by <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> · Places by <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">GeoNames</a> / <a href="https://www.bigdatacloud.com/" target="_blank" rel="noopener noreferrer">BigDataCloud</a></span><button class="text-button" data-action="weather-clear" ${s.place ? '' : 'hidden'}>Clear location</button></footer></div>`, 'weather-modal');
  },
};
export const actions = {
  weather() { query = ''; results = []; searchError = ''; searchBusy = false; searchVersion++; openModal({ type: 'weather' }); controller.refresh(); },
  'weather-locate'() { controller.locate(); },
  'weather-refresh'() { controller.refresh({ force: true, locate: true }); },
  'weather-unit'(b) { controller.setUnit(b.dataset.unit); view.renderModal(); $(`[data-action="weather-unit"][data-unit="${b.dataset.unit}"]`)?.focus(); },
  'weather-choose'(b) { const place = results[Number(b.dataset.index)]; if (!place) return; query = ''; results = []; searchVersion++; controller.choose(place); view.renderModal(); },
  'weather-clear'() { controller.clear(); results = []; query = ''; searchVersion++; view.renderModal(); },
};
export const forms = {
  async 'weather-search-form'(data) {
    query = String(data.get('place') || '').trim();
    const version = ++searchVersion; searchBusy = true; searchError = ''; results = []; updateSearch();
    try { const places = await searchWeatherPlaces(query); if (version === searchVersion) { results = places; if (!places.length) searchError = 'No places found. Try a nearby city or a different spelling.'; } }
    catch { if (version === searchVersion) searchError = 'City search is unavailable. Try again when you’re online.'; }
    finally { if (version === searchVersion) { searchBusy = false; updateSearch(); } }
  },
};
export function installWeather() {
  controller.refresh();
  setInterval(() => { if (!document.hidden) { updateWeather(); controller.refresh(); } }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { updateWeather(); controller.refresh(); } });
  window.addEventListener('focus', () => { updateWeather(); controller.refresh(); });
  window.addEventListener('online', () => controller.refresh({ force: true }));
  window.addEventListener('offline', updateWeather);
}
