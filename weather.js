// Weather is a device preference, separate from progress, backups, and cloud sync.
export const WEATHER_KEY = 'twesk.weather.v1';
export const WEATHER_INTERVAL = 15 * 60 * 1000;
const clean = value => typeof value === 'string' ? value.trim().slice(0, 120) : '';
const number = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
export function weatherPlace(value) {
  if (!value || !number(value.latitude, -90, 90) || !number(value.longitude, -180, 180) || !clean(value.name)) return null;
  return { latitude: Math.round(value.latitude * 100) / 100, longitude: Math.round(value.longitude * 100) / 100,
    name: clean(value.name), region: clean(value.region), country: clean(value.country), mode: value.mode === 'device' ? 'device' : 'city' };
}
export function weatherCondition(code, isDay = true) {
  if (code === 0) return { art: isDay ? 'sun' : 'moon', label: isDay ? 'Clear sky' : 'Clear night' };
  if (code === 1 || code === 2) return { art: isDay ? 'partly' : 'partly-night', label: code === 1 ? 'Mostly clear' : 'Partly cloudy' };
  if (code === 3) return { art: 'cloud', label: 'Overcast' };
  if ([45, 48].includes(code)) return { art: 'fog', label: 'Fog' };
  if ([51, 53, 55, 56, 57].includes(code)) return { art: 'drizzle', label: code >= 56 ? 'Freezing drizzle' : 'Drizzle' };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { art: 'rain', label: [66, 67].includes(code) ? 'Freezing rain' : code >= 80 ? 'Rain showers' : 'Rain' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { art: 'snow', label: code >= 85 ? 'Snow showers' : 'Snow' };
  if ([95, 96, 99].includes(code)) return { art: 'storm', label: code === 95 ? 'Thunderstorm' : 'Thunder & hail' };
  return { art: 'cloud', label: 'Weather' };
}
export function weatherTemperature(value, unit = 'c', suffix = false) {
  return number(value, -150, 100) ? `${Math.round(unit === 'f' ? value * 9 / 5 + 32 : value)}°${suffix ? unit.toUpperCase() : ''}` : '—';
}
export function forecastUrl(place) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({ latitude: place.latitude, longitude: place.longitude,
    current: 'temperature_2m,weather_code,is_day,dew_point_2m,precipitation_probability',
    hourly: 'temperature_2m,precipitation_probability,rain,showers,weather_code,is_day',
    daily: 'temperature_2m_min,temperature_2m_max', timezone: 'auto', forecast_days: '2', timeformat: 'unixtime' });
  return url.href;
}
function weatherTimezone(value) {
  if (typeof value === 'string' && value.length <= 80) {
    try { new Intl.DateTimeFormat('en', { timeZone: value }).format(0); return value; } catch {}
  }
  return 'UTC';
}
function validatedHours(rows, now) {
  const result = [], seen = new Set();
  for (const row of (Array.isArray(rows) ? rows : []).slice(0, 72)) {
    if (!number(row?.time, now - 7 * 86400000, now + 3 * 86400000) || seen.has(row.time)) continue;
    seen.add(row.time);
    const optional = (n, min, max) => number(n, min, max) ? n : null;
    result.push({ time: row.time, temperature: optional(row.temperature, -100, 80),
      rainChance: optional(row.rainChance, 0, 100), rain: optional(row.rain, 0, 1000),
      code: optional(row.code, 0, 99), isDay: row.isDay === 1 || row.isDay === true ? true : row.isDay === 0 || row.isDay === false ? false : null });
  }
  return result.sort((a, b) => a.time - b.time);
}
function forecastHours(hourly, now) {
  if (!Array.isArray(hourly?.time)) return [];
  return validatedHours(hourly.time.slice(0, 72).map((time, i) => {
    // Open-Meteo rain and probability describe the PRECEDING hour. Shift them to
    // the matching start-of-hour column; tomorrow's midnight completes 23–24h.
    const next = hourly.time[i + 1] === time + 3600 ? i + 1 : -1;
    const rain = hourly.rain?.[next], showers = hourly.showers?.[next];
    return { time: typeof time === 'number' ? time * 1000 : null, temperature: hourly.temperature_2m?.[i],
      rainChance: hourly.precipitation_probability?.[next],
      rain: number(rain, 0, 1000) && number(showers, 0, 1000) ? rain + showers : null,
      code: hourly.weather_code?.[i], isDay: hourly.is_day?.[i] };
  }), now);
}
export function weatherDayHours(data, now = Date.now()) {
  const timezone = weatherTimezone(data?.timezone);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const today = date.format(now);
  return (data?.hourly || []).filter(row => date.format(row.time) === today);
}
export function parseForecast(data, now = Date.now()) {
  const c = data?.current, d = data?.daily;
  if (!number(c?.temperature_2m, -100, 80) || !number(c?.time, (now - 6 * 60 * 60 * 1000) / 1000, (now + 60 * 60 * 1000) / 1000)) throw new Error('Weather readings are unavailable. Try again in a little while.');
  const optional = (value, min, max) => number(value, min, max) ? value : null;
  return { temperature: c.temperature_2m, code: optional(c.weather_code, 0, 99), isDay: c.is_day !== 0,
    dewPoint: optional(c.dew_point_2m, -130, 80), rainChance: optional(c.precipitation_probability, 0, 100),
    low: optional(d?.temperature_2m_min?.[0], -100, 80), high: optional(d?.temperature_2m_max?.[0], -100, 80),
    measuredAt: c.time * 1000, fetchedAt: now, timezone: weatherTimezone(data.timezone), hourly: forecastHours(data.hourly, now) };
}
function cachedReading(value, now) {
  if (!value || !number(value.temperature, -100, 80) || !number(value.fetchedAt, now - 7 * 86400000, now + 60000) || !number(value.measuredAt, now - 7 * 86400000, now + 3600000)) return null;
  const optional = (n, min, max) => number(n, min, max) ? n : null;
  return { temperature: value.temperature, code: optional(value.code, 0, 99), isDay: value.isDay !== false,
    dewPoint: optional(value.dewPoint, -130, 80), rainChance: optional(value.rainChance, 0, 100),
    low: optional(value.low, -100, 80), high: optional(value.high, -100, 80), measuredAt: value.measuredAt, fetchedAt: value.fetchedAt,
    timezone: weatherTimezone(value.timezone), hourly: validatedHours(value.hourly, now) };
}
async function jsonRequest(fetcher, url) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetcher(url, { signal: controller.signal, credentials: 'omit', cache: 'no-store' });
    if (!response.ok) throw new Error('Weather is unavailable. Try again in a little while.');
    return await response.json();
  } finally { clearTimeout(timer); }
}
export async function searchWeatherPlaces(query, fetcher = globalThis.fetch) {
  const term = clean(query);
  if (term.length < 2) return [];
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.search = new URLSearchParams({ name: term, count: '5', language: 'en', format: 'json' });
  const data = await jsonRequest(fetcher, url.href);
  return (Array.isArray(data.results) ? data.results : []).map(p => weatherPlace({ ...p, region: p.admin1, mode: 'city' })).filter(Boolean).slice(0, 5);
}
export function createWeatherController({ storage, fetcher = globalThis.fetch, geolocation, permissions, now = Date.now, onChange = () => {} } = {}) {
  let stored;
  try { stored = JSON.parse(storage?.getItem(WEATHER_KEY) || 'null'); } catch {}
  const place = weatherPlace(stored?.place);
  const state = { place, unit: stored?.unit === 'f' ? 'f' : 'c', data: place ? cachedReading(stored?.data, now()) : null, busy: false, error: '' };
  let generation = 0, refreshing = null, lastAttempt = state.data && Array.isArray(stored?.data?.hourly) ? state.data.fetchedAt : -Infinity;
  const snapshot = () => ({ ...state, stale: !!state.data && (now() - Math.min(state.data.fetchedAt, state.data.measuredAt) >= WEATHER_INTERVAL * 2 || !!state.error) });
  const emit = () => onChange(snapshot());
  function save() { try { storage?.setItem(WEATHER_KEY, JSON.stringify({ place: state.place, unit: state.unit, data: state.data })); } catch {} }
  function position() {
    return new Promise((resolve, reject) => {
      if (!geolocation) return reject(new Error('Location is unavailable here. You can search for your city instead.'));
      geolocation.getCurrentPosition(resolve, error => reject(new Error(error.code === 1 ? 'Location access is off. Allow it in your browser, or search for a city below.' : 'Couldn’t find your location. Try again, or search for a city below.')),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 });
    });
  }
  async function load({ device = false, selected = state.place } = {}) {
    const id = ++generation;
    state.busy = true; state.error = ''; lastAttempt = now(); emit();
    try {
      let coords;
      if (device) {
        const result = await position();
        if (id !== generation) return;
        coords = result.coords;
        const same = state.place?.mode === 'device' && Math.abs(state.place.latitude - coords.latitude) < .02 && Math.abs(state.place.longitude - coords.longitude) < .02;
        selected = weatherPlace({ latitude: coords.latitude, longitude: coords.longitude, name: same ? state.place.name : 'Your location',
          region: same ? state.place.region : '', country: same ? state.place.country : '', mode: 'device' });
      }
      if (!selected) throw new Error('Choose a location to see the weather.');
      if (state.place?.latitude !== selected.latitude || state.place?.longitude !== selected.longitude) state.data = null;
      state.place = selected; save(); emit();
      // Reverse geocoding is only called with a fresh browser location, never stored or searched coordinates.
      const reverseUrl = coords ? `https://api.bigdatacloud.net/data/reverse-geocode-client?${new URLSearchParams({ latitude: coords.latitude, longitude: coords.longitude, localityLanguage: 'en' })}` : null;
      const [data, label] = await Promise.all([
        jsonRequest(fetcher, forecastUrl(selected)).then(data => parseForecast(data, now())),
        reverseUrl ? jsonRequest(fetcher, reverseUrl).catch(() => null) : null,
      ]);
      if (id !== generation) return;
      if (label && clean(label.city || label.locality)) state.place = weatherPlace({ ...selected, name: label.city || label.locality, region: label.principalSubdivision, country: label.countryName });
      state.data = data; save();
    } catch (error) {
      if (id === generation) {
        const locationError = device && (error.message?.includes('location') || error.message?.startsWith('Location'));
        state.error = locationError ? error.message : state.data ? 'Weather is unavailable. Showing your last reading; try again shortly.' : 'Couldn’t load weather. Check your connection and try again.';
      }
    } finally { if (id === generation) { state.busy = false; emit(); } }
  }
  function refresh({ force = false, locate = false } = {}) {
    if (!state.place || state.busy || refreshing || (!force && now() - lastAttempt < WEATHER_INTERVAL)) return refreshing || Promise.resolve();
    const id = generation;
    refreshing = (async () => {
      let device = state.place.mode === 'device' && locate;
      if (state.place.mode === 'device' && !locate) {
        try { device = (await permissions?.query({ name: 'geolocation' }))?.state === 'granted'; } catch {}
      }
      if (id === generation) await load({ device });
    })().finally(() => { refreshing = null; });
    return refreshing;
  }
  return { snapshot, refresh,
    locate: () => load({ device: true }),
    choose: value => { const selected = weatherPlace(value); return selected ? load({ selected: { ...selected, mode: 'city' } }) : Promise.resolve(); },
    setUnit(unit) { if (unit === 'c' || unit === 'f') { state.unit = unit; save(); emit(); } },
    clear() { generation++; lastAttempt = -Infinity; state.place = null; state.data = null; state.busy = false; state.error = ''; save(); emit(); },
  };
}
