import test from 'node:test';
import assert from 'node:assert/strict';
import { WEATHER_KEY, WEATHER_INTERVAL, createWeatherController, forecastUrl, parseForecast, searchWeatherPlaces, weatherCondition, weatherPlace, weatherTemperature } from '../weather.js';
import { weatherArt } from '../weather-art.js';

const time = Date.UTC(2026, 9, 26, 12);
const city = { latitude: 41.1579, longitude: -8.6291, name: 'Porto', region: 'Porto', country: 'Portugal', mode: 'city' };
const forecast = (now = time, temperature = 21.4) => ({ current: { time: now / 1000, temperature_2m: temperature, weather_code: 2, is_day: 1, dew_point_2m: 15.7, precipitation_probability: 35 }, daily: { temperature_2m_min: [17.8], temperature_2m_max: [24.6] } });
const response = data => ({ ok: true, json: async () => structuredClone(data) });
function harness(options = {}) {
  let clock = time, offline = false;
  const values = new Map(), requests = [], events = [];
  if (options.saved) values.set(WEATHER_KEY, JSON.stringify(options.saved));
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const fetcher = async url => {
    requests.push(url);
    if (offline) throw new TypeError('Network unavailable');
    return response(url.includes('reverse-geocode') ? { city: 'Braga', principalSubdivision: 'Braga', countryName: 'Portugal' } : forecast(clock));
  };
  const controller = createWeatherController({ storage, fetcher, now: () => clock, onChange: event => events.push(event), ...options });
  return { controller, values, requests, events, offline: value => { offline = value; }, advance: amount => { clock += amount; } };
}
test('forecast parsing preserves real zero readings and keeps missing measurements unknown', () => {
  const data = forecast(); data.current.temperature_2m = 0; data.current.precipitation_probability = 0; data.current.dew_point_2m = null; data.daily.temperature_2m_min = [null];
  const reading = parseForecast(data, time);
  assert.equal(reading.temperature, 0); assert.equal(reading.rainChance, 0); assert.equal(reading.dewPoint, null); assert.equal(reading.low, null);
  assert.equal(weatherTemperature(reading.dewPoint), '—'); assert.equal(weatherTemperature(0, 'f', true), '32°F');
  for (const invalid of [null, { current: { temperature_2m: null } }, forecast(time - 7 * 3600000), forecast(time, Infinity)]) assert.throws(() => parseForecast(invalid, time));
  const url = new URL(forecastUrl(city));
  assert.equal(url.searchParams.get('timezone'), 'auto'); assert.equal(url.searchParams.get('forecast_days'), '1');
  assert.ok(url.searchParams.get('current').includes('dew_point_2m')); assert.ok(url.searchParams.get('current').includes('precipitation_probability'));
});
test('WMO weather codes have distinct day, night, rain, snow, fog, and storm art', () => {
  assert.equal(weatherCondition(0, true).art, 'sun'); assert.equal(weatherCondition(0, false).art, 'moon');
  assert.equal(weatherCondition(2, false).art, 'partly-night'); assert.equal(weatherCondition(48).art, 'fog');
  assert.equal(weatherCondition(57).label, 'Freezing drizzle'); assert.equal(weatherCondition(67).label, 'Freezing rain');
  assert.equal(weatherCondition(82).art, 'rain'); assert.equal(weatherCondition(86).art, 'snow'); assert.equal(weatherCondition(99).art, 'storm');
  assert.equal(weatherCondition(null).label, 'Weather');
  const kinds = ['sun', 'moon', 'partly', 'partly-night', 'cloud', 'fog', 'drizzle', 'rain', 'snow', 'storm', 'dew', 'range'];
  assert.equal(new Set(kinds.map(weatherArt)).size, kinds.length);
  for (const kind of kinds) { const svg = weatherArt(kind); assert.ok(svg.includes('viewBox="0 0 64 68"')); assert.ok(!/NaN|undefined|<image|\bid=/.test(svg)); }
});
test('weather stays opt-in and location preferences never write the adventure save', async () => {
  let gps = 0;
  const h = harness({ geolocation: { getCurrentPosition() { gps++; } } });
  await h.controller.refresh(); await h.controller.refresh({ force: true });
  assert.equal(gps, 0); assert.equal(h.requests.length, 0);
  await h.controller.choose(city);
  assert.equal(gps, 0); assert.equal(h.requests.length, 1); assert.deepEqual([...h.values.keys()], [WEATHER_KEY]);
  assert.equal(h.controller.snapshot().place.latitude, 41.16);
});
test('Celsius/Fahrenheit and a validated weather reading survive reload without another request', async () => {
  const h = harness(); await h.controller.choose(city); h.controller.setUnit('f');
  const saved = JSON.parse(h.values.get(WEATHER_KEY));
  const next = harness({ saved }); await next.controller.refresh();
  assert.equal(next.requests.length, 0); assert.equal(next.controller.snapshot().unit, 'f'); assert.equal(next.controller.snapshot().data.temperature, 21.4);
  next.advance(WEATHER_INTERVAL); await Promise.all([next.controller.refresh(), next.controller.refresh(), next.controller.refresh()]);
  assert.equal(next.requests.length, 1, 'one refresh after the fifteen-minute interval');
});
test('provider failure preserves the last reading and makes it explicitly stale', async () => {
  const h = harness(); await h.controller.choose(city); const original = h.controller.snapshot().data;
  h.offline(true); await h.controller.refresh({ force: true });
  assert.deepEqual(h.controller.snapshot().data, original); assert.equal(h.controller.snapshot().stale, true); assert.match(h.controller.snapshot().error, /last reading/);
  h.offline(false); h.advance(WEATHER_INTERVAL); await h.controller.refresh(); assert.equal(h.controller.snapshot().error, ''); assert.equal(h.controller.snapshot().stale, false);
});
test('an old observation remains visibly stale even if it was fetched just now', () => {
  const data = parseForecast(forecast(time - 2 * 3600000), time);
  const h = harness({ saved: { place: city, unit: 'c', data } });
  assert.equal(h.controller.snapshot().stale, true);
});
test('denied device location leaves a manual place intact and supports city fallback', async () => {
  const h = harness({ geolocation: { getCurrentPosition(_, reject) { reject({ code: 1 }); } } });
  await h.controller.choose(city); const original = h.controller.snapshot().data;
  await h.controller.locate(); assert.match(h.controller.snapshot().error, /Location access is off/);
  assert.equal(h.controller.snapshot().place.name, 'Porto'); assert.deepEqual(h.controller.snapshot().data, original);
  await h.controller.choose({ ...city, name: 'Lisbon', latitude: 38.72, longitude: -9.14 });
  assert.equal(h.controller.snapshot().error, ''); assert.equal(h.controller.snapshot().place.name, 'Lisbon');
});
test('automatic following only requests GPS with permission and reverse-geocodes fresh device coordinates', async () => {
  let gps = 0, granted = true;
  const h = harness({ geolocation: { getCurrentPosition(resolve) { gps++; resolve({ coords: { latitude: 41.5518, longitude: -8.4229 } }); } }, permissions: { query: async () => ({ state: granted ? 'granted' : 'prompt' }) } });
  await h.controller.locate(); assert.equal(gps, 1); assert.equal(h.controller.snapshot().place.name, 'Braga');
  assert.ok(h.requests.find(url => url.includes('reverse-geocode-client') && url.includes('41.5518')), 'only the fresh GPS result goes to reverse geocoding');
  granted = false; h.advance(WEATHER_INTERVAL); const before = h.requests.length;
  await h.controller.refresh(); assert.equal(gps, 1, 'foregrounding never prompts for a new location grant'); assert.equal(h.requests.length, before + 1);
  granted = true; h.advance(WEATHER_INTERVAL); await h.controller.refresh(); assert.equal(gps, 2);
});
test('changing cities or clearing location rejects old responses and does not mix readings', async () => {
  const pending = [];
  const h = harness({ fetcher: url => new Promise(resolve => pending.push({ url, resolve })) });
  const first = h.controller.choose(city);
  const second = h.controller.choose({ ...city, name: 'Oslo', latitude: 59.91, longitude: 10.75 });
  pending[1].resolve(response(forecast(time, -2))); await second;
  pending[0].resolve(response(forecast(time, 22))); await first;
  assert.equal(h.controller.snapshot().place.name, 'Oslo'); assert.equal(h.controller.snapshot().data.temperature, -2);
  const late = h.controller.refresh({ force: true }); await Promise.resolve(); h.controller.clear();
  pending[2].resolve(response(forecast())); await late;
  assert.equal(h.controller.snapshot().place, null); assert.equal(h.controller.snapshot().data, null);
  assert.equal(JSON.parse(h.values.get(WEATHER_KEY)).place, null);
});
test('clearing while GPS is pending prevents late coordinates from being sent to providers', async () => {
  let locate;
  const h = harness({ geolocation: { getCurrentPosition(resolve) { locate = resolve; } } });
  const pending = h.controller.locate(); h.controller.clear(); locate({ coords: { latitude: 41, longitude: -8 } }); await pending;
  assert.equal(h.requests.length, 0); assert.equal(h.controller.snapshot().place, null);
});
test('broken caches, unavailable browser storage, and missing location support are harmless', async () => {
  for (const saved of [{ place: { latitude: 999, longitude: 0, name: 'Bad' } }, { place: city, data: { temperature: null, fetchedAt: time } }]) {
    const h = harness({ saved }); assert.equal(h.controller.snapshot().data, null);
  }
  const h = harness({ storage: { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Quota'); } } });
  await h.controller.locate(); assert.match(h.controller.snapshot().error, /search for your city/);
  await h.controller.choose(city); assert.equal(h.controller.snapshot().data.temperature, 21.4);
  assert.equal(weatherPlace({ ...city, latitude: 0, longitude: 0 }).latitude, 0);
  assert.equal(weatherPlace({ ...city, latitude: '41' }), null);
});
test('city search encodes input, validates coordinates, and limits returned results', async () => {
  let requested;
  const found = await searchWeatherPlaces('São Paulo & coast', async url => { requested = new URL(url); return response({ results: [{ name: 'São Paulo', latitude: -23.55, longitude: -46.63, admin1: 'São Paulo', country: 'Brazil' }, { name: 'Bad', latitude: null, longitude: 0 }] }); });
  assert.equal(requested.searchParams.get('name'), 'São Paulo & coast'); assert.equal(found.length, 1); assert.equal(found[0].mode, 'city');
  assert.deepEqual(await searchWeatherPlaces('a', () => { throw new Error('Must not fetch'); }), []);
});
