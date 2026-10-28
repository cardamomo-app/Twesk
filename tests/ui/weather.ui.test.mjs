import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshState } from '../../engine.js';
import { browserPath, launchBrowser, startServer } from './browser.mjs';

const skip = browserPath || process.env.CI ? false : 'no Chromium-based browser found';
let browser, server, origin;
before(async () => { if (!skip) { ({ server, origin } = await startServer()); browser = await launchBrowser(); } });
after(async () => { await browser?.close(); server?.closeAllConnections(); server?.close(); });
// No real location permission or third-party requests: these are deterministic provider boundaries.
const fixtures = `(() => {
  window.weatherProbe = { gps: 0, forecasts: 0 };
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, options) => {
    const url = String(input), mode = new URLSearchParams(location.search).get('weatherTest');
    if (url.includes('api.open-meteo.com/v1/forecast')) {
      window.weatherProbe.forecasts++;
      if (mode === 'offline') throw new TypeError('Offline test');
      const start = Math.floor(Date.now() / 86400000) * 86400;
      const indices = Array.from({ length: 48 }, (_, i) => i);
      const hourly = { time: indices.map(i => start + i * 3600), temperature_2m: indices.map(i => 20 + Math.sin((i % 24 - 8) / 24 * Math.PI * 2) * 5), precipitation_probability: indices.map(i => i % 24 >= 10 && i % 24 <= 17 ? 60 : 0), rain: indices.map(i => i % 24 >= 10 && i % 24 <= 17 ? .6 : 0), showers: indices.map(i => i % 24 === 14 ? .4 : 0), weather_code: indices.map(i => i % 24 >= 10 && i % 24 <= 17 ? 61 : 2), is_day: indices.map(i => i % 24 >= 7 && i % 24 < 19 ? 1 : 0) };
      return new Response(JSON.stringify({ timezone: 'UTC', hourly, current: { time: Math.floor(Date.now() / 1000), temperature_2m: 21.4, weather_code: 2, is_day: 1, dew_point_2m: 15.7, precipitation_probability: 35 }, daily: { temperature_2m_min: [17.8], temperature_2m_max: [24.6] } }));
    }
    if (url.includes('api.bigdatacloud.net')) return new Response(JSON.stringify({ city: 'Porto', principalSubdivision: 'Porto', countryName: 'Portugal' }));
    if (url.includes('geocoding-api.open-meteo.com')) return new Response(JSON.stringify({ results: [{ name: 'Lisbon', latitude: 38.72, longitude: -9.14, admin1: 'Lisbon', country: 'Portugal' }] }));
    return nativeFetch(input, options);
  };
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(success, failure) {
    window.weatherProbe.gps++;
    queueMicrotask(() => new URLSearchParams(location.search).get('weatherTest') === 'denied' ? failure({ code: 1 }) : success({ coords: { latitude: 41.1579, longitude: -8.6291 } }));
  } } });
})();`;
async function open(options = {}) {
  const page = await browser.newPage({ origin, width: options.width || 1280, height: 900 });
  await page.cmd('Page.addScriptToEvaluateOnNewDocument', { source: fixtures });
  const save = freshState(); save.settings.muted = true; save.settings.theme = options.theme || 'light';
  await page.open({ save, path: options.path || '/' });
  return page;
}
test('weather is opt-in, renders all measurements, and persists units and location across reload', { skip }, async () => {
  const page = await open();
  try {
    assert.deepEqual(await page.evaluate(() => window.weatherProbe), { gps: 0, forecasts: 0 });
    await page.click('[data-action="weather"]'); await page.click('[data-action="weather-locate"]');
    await page.waitFor(() => document.querySelector('.weather-place')?.textContent === 'Porto');
    assert.match(await page.text('#weather-reading'), /18°.*25°/s); assert.match(await page.text('#weather-reading'), /35%/); assert.match(await page.text('#weather-reading'), /16°/);
    assert.equal(await page.exists('[data-action="weather-refresh"]:not([hidden])'), true);
    await page.click('[data-action="weather-unit"][data-unit="f"]');
    assert.match(await page.text('#weather-reading'), /71°/);
    await page.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.action), 'weather', 'weather updates preserve the dialog return target');
    await page.goto('/');
    await page.waitFor(() => document.querySelector('.weather-place')?.textContent === 'Porto');
    assert.match(await page.text('.weather-temperature'), /71°/);
    assert.deepEqual(await page.evaluate(() => window.weatherProbe), { gps: 0, forecasts: 0 }, 'fresh cached weather needs no permission or network');
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});
test('denied GPS supports city search, failed refresh shows a saved reading, and clearing stops weather', { skip }, async () => {
  const page = await open({ path: '/?weatherTest=denied' });
  try {
    await page.click('[data-action="weather"]'); await page.click('[data-action="weather-locate"]');
    await page.waitFor(() => document.querySelector('#weather-message')?.textContent.includes('Location access is off'));
    await page.fill('#weather-search', 'Lisbon'); await page.press('Enter');
    await page.waitFor(() => document.querySelector('[data-action="weather-choose"]')?.textContent.includes('Lisbon'));
    await page.click('[data-action="weather-choose"]');
    await page.waitFor(() => document.querySelector('.weather-place')?.textContent === 'Lisbon');
    await page.goto('/?weatherTest=offline'); await page.click('[data-action="weather"]'); await page.click('[data-action="weather-refresh"]');
    await page.waitFor(() => document.querySelector('#weather-message')?.textContent.includes('last reading'));
    assert.equal(await page.text('.weather-saved'), 'Saved'); assert.match(await page.text('#weather-reading'), /21°/);
    await page.click('[data-action="weather-clear"]'); await page.press('Escape');
    assert.equal(await page.exists('.weather-place'), false);
    assert.match(await page.text('.weather-empty'), /Choose your location/); assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});
test('weather and header controls fit phones, tablets, desktop, and the single-file app', { skip }, async () => {
  for (const [width, path] of [[320, '/'], [390, '/'], [900, '/'], [1200, '/'], [1440, '/'], [390, '/Twesk.html']]) {
    const page = await open({ width, path, theme: width === 320 ? 'dark' : 'light' });
    try {
      await page.click('[data-action="weather"]'); await page.click('[data-action="weather-locate"]');
      await page.waitFor(() => document.querySelector('.weather-place')?.textContent === 'Porto');
      assert.equal(await page.evaluate(() => document.querySelector('.weather-modal').scrollWidth <= document.querySelector('.weather-modal').clientWidth), true, `${width}: weather dialog fits`);
      assert.equal(await page.evaluate(() => document.querySelectorAll('.weather-hour-temperature').length), 24);
      await page.press('Escape');
      const layout = await page.evaluate(() => {
        const weather = document.querySelector('.topbar-weather').getBoundingClientRect(), actions = document.querySelector('.topbar-actions').getBoundingClientRect(), logo = document.querySelector('.wordmark').getBoundingClientRect();
        return { overflow: document.documentElement.scrollWidth > innerWidth, weatherInside: weather.right <= innerWidth && weather.left >= 0, actionsInside: actions.right <= innerWidth, logoOverlap: actions.left < logo.right && actions.bottom > logo.top && actions.top < logo.bottom };
      });
      assert.equal(layout.overflow, false, `${width}: horizontal overflow`); assert.equal(layout.weatherInside, true); assert.equal(layout.actionsInside, true); assert.equal(layout.logoOverlap, false);
      assert.deepEqual(page.errors, []);
    } finally { await page.close(); }
  }
});

test('hourly temperature and rain share a scroll position across refreshes and unit changes', { skip }, async () => {
  const page = await open();
  try {
    await page.click('[data-action="weather"]'); await page.click('[data-action="weather-locate"]');
    await page.waitFor(() => document.querySelectorAll('.weather-hour-rain').length === 24);
    assert.equal(await page.exists('.weather-now .weather-temperature-art'), true);
    assert.equal(await page.text('.weather-now .weather-temperature'), '21°C');
    assert.match(await page.text('.weather-hourly'), /60%/); assert.match(await page.text('.weather-hourly'), /0.6/);
    for (let i = 0; i < 8 && await page.evaluate(() => document.querySelector('.weather-hourly-scroll').scrollLeft) > 0; i++) await page.click('[data-action="weather-hours"][data-direction="-1"]');
    assert.equal(await page.evaluate(() => document.querySelector('.weather-hourly-scroll').scrollLeft), 0);
    await page.click('[data-action="weather-hours"][data-direction="1"]');
    await page.waitFor(() => document.querySelector('.weather-hourly-scroll').scrollLeft > 300);
    // Reduced motion makes paging immediate, so capture the chosen position, not an animation frame.
    const left = await page.evaluate(() => document.querySelector('.weather-hourly-scroll').scrollLeft);
    await page.click('[data-action="weather-unit"][data-unit="f"]');
    assert.equal(await page.text('.weather-now .weather-temperature'), '71°F');
    assert.match(await page.text('.weather-hourly-row-title'), /°F/);
    assert.equal(await page.evaluate(() => document.querySelector('.weather-hourly-scroll').scrollLeft), left);
    await page.click('[data-action="weather-refresh"]');
    await page.waitFor(() => window.weatherProbe.forecasts === 2);
    assert.equal(await page.evaluate(() => document.querySelector('.weather-hourly-scroll').scrollLeft), left);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});
