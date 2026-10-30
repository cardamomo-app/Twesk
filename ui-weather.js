import { $, app, esc, icon, modalShell, view } from './ui-core.js?v=0.42.6';
import { createWeatherController, searchWeatherPlaces, weatherCondition, weatherTemperature, weatherDayHours } from './weather.js?v=0.42.6';
import { weatherArt, headerWeatherArt, temperatureArt } from './weather-art.js?v=0.42.6';
import { openModal } from './ui-modal.js?v=0.42.6';

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
// The date stays separate; one weather control aligns the sky, city/range, and temperature.
export function renderWeather() {
  const s = controller.snapshot(), d = s.data;
  if (!d) return `<button class="topbar-weather weather-empty" data-action="weather" aria-label="${s.place ? 'Open weather for ' + esc(s.place.name) : 'Set up local weather'}">${headerWeatherArt('partly')}<span class="weather-location-summary"><strong>${s.busy ? 'Finding weather…' : s.place ? esc(s.place.name) : 'Weather'}</strong><small>${s.busy ? '' : s.place ? 'Tap to retry' : 'Choose your location'}</small></span></button>`;
  const condition = weatherCondition(d.code, d.isDay);
  const label = `Weather in ${s.place.name}: ${condition.label}, ${temperature(d.temperature, true)}. Low ${temperature(d.low)}, high ${temperature(d.high)}. Rain chance this hour ${probability(d.rainChance)}. Dew point ${temperature(d.dewPoint, true)}. ${saved(s) ? 'Saved reading. ' : ''}${updatedLabel(s)}.`;
  return `<button class="topbar-weather" data-action="weather" aria-label="${esc(label)}" title="${esc(label)}">${headerWeatherArt(condition.art)}<span class="weather-location-summary"><strong class="weather-place">${esc(s.place.name)}</strong><span class="weather-range" aria-label="Low ${temperature(d.low)}, high ${temperature(d.high)}"><span title="Today’s low">${temperature(d.low)}</span><span class="weather-range-separator" aria-hidden="true">/</span><span title="Today’s high">${temperature(d.high)}</span>${saved(s) ? '<span class="weather-saved">Saved</span>' : ''}</span></span><strong class="weather-temperature"><span class="sr-only">${temperature(d.temperature, true)}</span>${temperatureArt(temperature(d.temperature), s.unit.toUpperCase())}</strong></button>`;
}
function rainAmount(value) {
  return value === null ? '—' : value > 0 && value < .1 ? '<0.1' : String(Math.round(value * 10) / 10);
}
function hourlyRainBar(value, maximum) {
  if (value === null) return '<span class="weather-rain-unknown" aria-hidden="true">—</span>';
  if (value === 0) return '<svg viewBox="0 0 24 32" aria-hidden="true"><path d="M5 30h14" class="weather-rain-zero"/></svg>';
  const y = 29 - Math.max(3, value / maximum * 25);
  return `<svg viewBox="0 0 24 32" aria-hidden="true"><path d="M5 ${y}h11V29H5Z" fill="#a8cadd"/><path d="m5 ${y} 4-3h11l-4 3Z" fill="#d7e9f2"/><path d="m16 ${y} 4-3V26l-4 3Z" fill="#76a3be"/></svg>`;
}
function hourlyForecast(s) {
  const hours = weatherDayHours(s.data), timezone = s.data.timezone;
  if (!hours.length) return `<p class="weather-hourly-unavailable">${s.busy ? 'Updating hourly forecast…' : 'Hourly forecast is unavailable. Try Refresh.'}</p>`;
  const clock = new Intl.DateTimeFormat('en', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const fullClock = new Intl.DateTimeFormat('en', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short' });
  const now = Date.now(), current = hours.findIndex(h => h.time <= now && h.time + 3600000 > now);
  const key = `${s.place.latitude},${s.place.longitude}:${hours[0].time}`;
  const labels = hours.map(h => clock.format(h.time));
  const timeLabel = (h, i) => `${labels[i]}${labels.indexOf(labels[i]) !== labels.lastIndexOf(labels[i]) ? `<small>${esc(fullClock.format(h.time).replace(labels[i], '').trim())}</small>` : ''}`;
  const title = h => `${fullClock.format(h.time)}–${fullClock.format(h.time + 3600000)}`;
  const temps = hours.map(h => h.temperature).filter(n => n !== null), low = Math.min(...temps), high = Math.max(...temps);
  let connect = false;
  const plot = hours.map((h, i) => {
    if (h.temperature === null) { connect = false; return ''; }
    const y = high === low ? 12 : 21 - (h.temperature - low) / (high - low) * 18;
    const command = `${connect ? 'L' : 'M'}${i * 52 + 26},${y.toFixed(2)}`; connect = true; return command;
  }).join('');
  const maxRain = Math.max(.1, ...hours.map(h => h.rain ?? 0));
  return `<section class="weather-hourly" aria-labelledby="weather-hourly-title"><div class="weather-hourly-heading"><h3 id="weather-hourly-title">Today by the hour</h3><div><button class="icon-button" data-action="weather-hours" data-direction="-1" aria-label="Earlier hours">${icon('chevron', 'weather-hours-back')}</button><button class="icon-button" data-action="weather-hours" data-direction="1" aria-label="Later hours">${icon('chevron', 'weather-hours-next')}</button></div></div><div class="weather-hourly-scroll" tabindex="0" role="region" aria-label="Hourly weather for ${esc(s.place.name)}. Scroll for all hours; times are local to the city." data-key="${key}"><div class="weather-hourly-grid" style="--hours:${hours.length}"><div class="weather-hourly-row-title">Temperature <small>°${s.unit.toUpperCase()}</small></div>${hours.map((h, i) => {
    const condition = weatherCondition(h.code, h.isDay !== false);
    return `<div class="weather-hour weather-hour-temperature ${i === current ? 'is-current' : ''}" title="${esc(title(h))}: ${esc(temperature(h.temperature, true))}, ${esc(condition.label)}"><time datetime="${new Date(h.time).toISOString()}">${i === current ? 'Now' : timeLabel(h, i)}</time>${h.code === null ? '<span class="weather-hour-icon-missing" aria-hidden="true">—</span>' : headerWeatherArt(condition.art)}<strong>${temperature(h.temperature)}</strong></div>`;
  }).join('')}<svg class="weather-hourly-curve" viewBox="0 0 ${hours.length * 52} 26" aria-hidden="true"><path d="${plot}"/></svg><div class="weather-hourly-row-title weather-rain-row-title">Rain <small title="Precipitation probability and rainfall total for each hour">Chance · mm/h</small></div>${hours.map((h, i) => `<div class="weather-hour weather-hour-rain ${i === current ? 'is-current' : ''}" title="${esc(title(h))}: ${probability(h.rainChance)} chance of precipitation; ${esc(rainAmount(h.rain))} mm of rain"><span class="sr-only">${esc(title(h))}, </span><strong>${probability(h.rainChance)}</strong><span class="weather-hour-rain-bar">${hourlyRainBar(h.rain, maxRain)}</span><span class="weather-hour-rain-amount">${esc(rainAmount(h.rain))}<small> mm</small></span></div>`).join('')}</div></div><p class="weather-hourly-note">Local time in ${esc(s.place.name)} · Rainfall includes showers.</p></section>`;
}
let hourlyScroll = null;
function rememberHourlyScroll() {
  const scroller = $('.weather-hourly-scroll');
  if (scroller) hourlyScroll = { key: scroller.dataset.key, left: scroller.scrollLeft };
}
function positionHourlyScroll() {
  const scroller = $('.weather-hourly-scroll');
  if (!scroller) return;
  scroller.scrollLeft = hourlyScroll?.key === scroller.dataset.key ? hourlyScroll.left : Math.max(0, (scroller.querySelector('.weather-hour-temperature.is-current')?.offsetLeft || 0) - 52);
}
function reading() {
  const s = controller.snapshot(), d = s.data;
  if (!d) return `<div class="weather-welcome">${weatherArt('partly')}<h3>${s.place ? esc(s.place.name) : 'Your weather, here'}</h3><p>${s.busy ? 'Getting the latest conditions…' : 'Use your current location, or search for a city.'}</p></div>`;
  const condition = weatherCondition(d.code, d.isDay), region = [s.place.region, s.place.country].filter((v, i, a) => v && v !== s.place.name && a.indexOf(v) === i).join(', ');
  const metric = (art, name, value) => `<div>${weatherArt(art)}<span><small>${name}</small><strong>${value}</strong></span></div>`;
  return `<div class="weather-overview">${weatherArt(condition.art)}<div class="weather-overview-text"><h3>${esc(s.place.name)}</h3>${region ? `<p>${esc(region)}</p>` : ''}<div class="weather-now"><strong class="weather-temperature"><span class="sr-only">${temperature(d.temperature, true)}</span>${temperatureArt(temperature(d.temperature), s.unit.toUpperCase())}</strong><span>${esc(condition.label)}</span></div></div></div>
    <div class="weather-detail-metrics">${metric('range', 'Low / high', `${temperature(d.low)}<span>/</span>${temperature(d.high)}`)}${metric('drizzle', 'Rain this hour', probability(d.rainChance))}${metric('dew', 'Dew point', temperature(d.dewPoint))}</div>${hourlyForecast(s)}`;
}
const updatedNote = () => { const s = controller.snapshot(); return s.data ? `${saved(s) ? '<span class="weather-saved-note">Saved reading</span> · ' : ''}${updatedLabel(s)}` : ''; };
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
  if (details) { const keepFocus = details.querySelector('.weather-hourly-scroll') === document.activeElement; rememberHourlyScroll(); details.innerHTML = reading(); positionHourlyScroll(); if (keepFocus) details.querySelector('.weather-hourly-scroll')?.focus({ preventScroll: true }); }
  const updated = $('#weather-updated');
  if (updated) updated.innerHTML = updatedNote();
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
    rememberHourlyScroll(); queueMicrotask(positionHourlyScroll);
    const s = controller.snapshot();
    // With a place set, finding another one folds away; without one, it is the whole point of the dialog.
    const open = !s.place || !!query || results.length || searchBusy || !!searchError;
    return modalShell('Weather', `<div class="form-body weather-body"><div class="weather-units" role="group" aria-label="Temperature unit">${['c', 'f'].map(unit => `<button data-action="weather-unit" data-unit="${unit}" aria-pressed="${s.unit === unit}" class="${s.unit === unit ? 'selected' : ''}">°${unit.toUpperCase()}</button>`).join('')}</div><div id="weather-reading">${reading()}</div><div class="weather-status"><span class="weather-updated" id="weather-updated">${updatedNote()}</span><button class="text-button weather-refresh" data-action="weather-refresh" ${s.place ? '' : 'hidden'} ${s.busy ? 'disabled' : ''}>${icon('repeat')}Refresh</button></div><p class="weather-message" id="weather-message" role="status" ${message() ? '' : 'hidden'}>${esc(message())}</p><details class="weather-location" ${open ? 'open' : ''}><summary>${locateIcon}<span>${s.place ? 'Change location' : 'Choose a location'}</span>${icon('chevron', 'weather-location-chevron')}</summary><div class="weather-location-body"><button class="button secondary weather-locate" data-action="weather-locate" ${s.busy ? 'disabled' : ''}>${locateIcon}Use my location</button><form id="weather-search-form"><label for="weather-search">Or choose a city</label><div class="weather-search-row"><input id="weather-search" name="place" type="search" autocomplete="off" minlength="2" maxlength="120" required placeholder="City or postcode" value="${esc(query)}"><button class="button secondary" type="submit" aria-label="Search for a city" ${searchBusy ? 'disabled' : ''}>${icon('search')}</button></div></form><div class="weather-search-results" aria-live="polite">${searchResults()}</div></div></details><footer class="weather-credits"><span>Weather by <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> · Places by <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">GeoNames</a> / <a href="https://www.bigdatacloud.com/" target="_blank" rel="noopener noreferrer">BigDataCloud</a></span><button class="text-button" data-action="weather-clear" ${s.place ? '' : 'hidden'}>Clear location</button></footer></div>`, 'weather-modal');
  },
};
export const actions = {
  weather() { hourlyScroll = null; query = ''; results = []; searchError = ''; searchBusy = false; searchVersion++; openModal({ type: 'weather' }); controller.refresh(); },
  'weather-hours'(b) { const scroller = $('.weather-hourly-scroll'); scroller?.scrollBy({ left: Number(b.dataset.direction) * scroller.clientWidth * .75, behavior: app.state.settings.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); },
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
