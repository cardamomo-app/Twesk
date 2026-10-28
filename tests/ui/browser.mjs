// Minimal, dependency-free browser driver for interface tests.
// Launches a local Chromium-based browser (Chrome, Edge, Chromium, or Brave) headless and talks to it
// over the Chrome DevTools Protocol with Node's built-in WebSocket. Each page gets an isolated
// browser context, so tests never share storage with each other or with real saves.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MAC_APPS = [
  'Google Chrome.app/Contents/MacOS/Google Chrome',
  'Chromium.app/Contents/MacOS/Chromium',
  'Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  'Brave Browser.app/Contents/MacOS/Brave Browser',
];
// Applications folders on this Mac, then on any attached drive (e.g. a browser kept on an external disk).
const appFolders = () => {
  let volumes = [];
  try { volumes = readdirSync('/Volumes').map(name => `/Volumes/${name}/Applications`); } catch {}
  return ['/Applications', `${process.env.HOME}/Applications`, ...volumes];
};
const CANDIDATES = [
  process.env.CHROME_PATH,
  ...appFolders().flatMap(folder => MAC_APPS.map(app => `${folder}/${app}`)),
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
].filter(Boolean);
export const browserPath = CANDIDATES.find(path => existsSync(path)) || null;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
// Serves the project folder; /__blank is an empty same-origin page for seeding storage before the app loads.
export function startServer() {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/__blank') return res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>blank</title>');
    const file = resolve(ROOT, '.' + (path === '/' ? '/index.html' : path));
    if (!file.startsWith(ROOT)) return res.writeHead(403).end();
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise(done => server.listen(0, '127.0.0.1', () => done({ server, origin: `http://127.0.0.1:${server.address().port}` })));
}

export async function launchBrowser() {
  if (!browserPath) throw new Error('No Chromium-based browser found. Set CHROME_PATH to Chrome, Edge, Chromium, or Brave.');
  const profile = mkdtempSync(join(tmpdir(), 'twesk-ui-'));
  const child = spawn(browserPath, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--window-size=1280,900',
    // Hosted CI machines can't give Chrome its sandbox; the tests only load this project's own pages.
    ...(process.env.CI ? ['--no-sandbox'] : []), 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((done, fail) => {
    let text = '';
    const timer = setTimeout(() => fail(new Error('Browser did not start: ' + text.slice(-400))), 20000);
    child.stderr.on('data', chunk => {
      text += chunk;
      const match = text.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) { clearTimeout(timer); done(match[1]); }
    });
    child.on('exit', code => fail(new Error(`Browser exited (${code}): ${text.slice(-400)}`)));
  });
  const socket = new WebSocket(wsUrl);
  await new Promise((done, fail) => { socket.onopen = done; socket.onerror = fail; });
  let nextId = 1;
  const pending = new Map(), listeners = new Set();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
    } else for (const listener of listeners) listener(message);
  };
  // A command the browser never answers (a page stuck in a loop, say) fails after 30 s, naming itself,
  // instead of hanging the whole run.
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser did not answer ${method} within 30 s`)); }, 30000);
      pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  return {
    send, listeners,
    newPage: options => openPage({ send, listeners }, options),
    async close() {
      const exited = new Promise(done => (child.exitCode !== null ? done() : child.once('exit', done)));
      try { await send('Browser.close'); } catch {}
      socket.close();
      await Promise.race([exited, new Promise(done => setTimeout(done, 3000))]);
      child.kill();
      // Helper processes can hold the output pipe open; release it so Node can exit promptly.
      child.stderr.destroy();
      child.unref();
      rmSync(profile, { recursive: true, force: true });
    },
  };
}

const KEYS = {
  Escape: { code: 'Escape', keyCode: 27 }, Enter: { code: 'Enter', keyCode: 13 }, Tab: { code: 'Tab', keyCode: 9 },
  ArrowLeft: { code: 'ArrowLeft', keyCode: 37 }, ArrowUp: { code: 'ArrowUp', keyCode: 38 },
  ArrowRight: { code: 'ArrowRight', keyCode: 39 }, ArrowDown: { code: 'ArrowDown', keyCode: 40 },
};
const MODIFIERS = { Alt: 1, Control: 2, Meta: 4, Shift: 8 };

async function openPage({ send, listeners }, { origin, width = 1280, height = 900, reducedMotion = true, seed = 1 } = {}) {
  const { browserContextId } = await send('Target.createBrowserContext');
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  // Backup exports would otherwise try to save files during tests.
  await send('Browser.setDownloadBehavior', { behavior: 'deny', browserContextId }).catch(() => {});
  const cmd = (method, params) => send(method, params, sessionId);
  const errors = [], events = [];
  const listener = message => {
    if (message.sessionId !== sessionId) return;
    events.push(message);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(a => a.value ?? a.description).join(' '));
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error' && !/favicon/.test(message.params.entry.url || '')) errors.push(message.params.entry.text);
  };
  listeners.add(listener);
  await Promise.all([cmd('Page.enable'), cmd('Runtime.enable'), cmd('Log.enable')]);
  await cmd('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  await cmd('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' }] });
  // Deterministic randomness for combat and effects; ids still use crypto.randomUUID.
  await cmd('Page.addScriptToEvaluateOnNewDocument', {
    source: `(()=>{let s=${seed >>> 0 || 1};Math.random=()=>{s=(Math.imul(1664525,s)+1013904223)>>>0;return s/4294967296;};})();`,
  });

  const waitForEvent = (method, timeout = 15000) =>
    new Promise((resolve, reject) => {
      const start = events.length;
      const timer = setInterval(() => {
        const found = events.slice(start).find(e => e.method === method);
        if (found) { clearInterval(timer); clearTimeout(limit); resolve(found); }
      }, 20);
      const limit = setTimeout(() => { clearInterval(timer); reject(new Error(`Timed out waiting for ${method}`)); }, timeout);
    });
  async function evaluate(fn, ...args) {
    const expression = typeof fn === 'function' ? `(${fn})(...${JSON.stringify(args)})` : fn;
    const result = await cmd('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (result.exceptionDetails) throw new Error('In page: ' + (result.exceptionDetails.exception?.description || result.exceptionDetails.text));
    return result.result.value;
  }
  async function waitFor(fn, { timeout = 8000, message, args = [], accept = value => value && !(value instanceof Error) } = {}) {
    const start = Date.now();
    let last;
    while (Date.now() - start < timeout) {
      last = await evaluate(fn, ...args).catch(error => error);
      if (accept(last)) return last;
      await new Promise(done => setTimeout(done, 40));
    }
    const detail = last instanceof Error ? ` (${last.message})` : last?.covered ? ` (covered by ${last.covered})` : '';
    throw new Error(`Timed out: ${message || fn.toString().slice(0, 140)}${detail}`);
  }
  const page = {
    errors, evaluate, waitFor, cmd,
    async goto(path = '/') {
      const loaded = waitForEvent('Page.loadEventFired');
      await cmd('Page.navigate', { url: origin + path });
      await loaded;
    },
    // Open the app with a prepared save (or none), as a returning player would.
    async open({ save = null, path = '/' } = {}) {
      await page.goto('/__blank');
      await evaluate(json => { localStorage.clear(); if (json) localStorage.setItem('twesk.v1', json); }, save ? JSON.stringify(save) : null);
      await page.goto(path);
      await waitFor(() => !!document.querySelector('#app .topbar'), { message: 'dashboard rendered' });
    },
    save: () => evaluate(() => JSON.parse(localStorage.getItem('twesk.v1'))),
    exists: selector => evaluate(s => !!document.querySelector(s), selector),
    text: selector => evaluate(s => document.querySelector(s)?.textContent.trim() ?? null, selector),
    count: selector => evaluate(s => document.querySelectorAll(s).length, selector),
    // A real mouse click at the element's center, so overlays and hit-testing count.
    // moving: true clicks a target that never holds still (like a rising balloon) once it is under the pointer.
    async click(selector, { moving = false } = {}) {
      // Click only once the element is really what sits under the pointer (not covered, not mid-animation),
      // as a person would. Two matching measurements in a row mean it has stopped moving.
      let last = null;
      const point = await waitFor(s => {
        const el = document.querySelector(s);
        if (!el || el.disabled) return null;
        el.scrollIntoView({ block: 'center', inline: 'center' });
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        const x = r.left + r.width / 2, y = r.top + r.height / 2, hit = document.elementFromPoint(x, y);
        return el === hit || el.contains(hit) ? { x: Math.round(x), y: Math.round(y) } : { covered: hit?.outerHTML.slice(0, 80) || 'nothing' };
      }, { message: `clickable ${selector}`, args: [selector], accept: value => {
        const stable = value && !value.covered && (moving || (last && last.x === value.x && last.y === value.y));
        last = value;
        return stable;
      } });
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
        await cmd('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', clickCount: 1 });
    },
    async press(key, modifiers = []) {
      const mods = modifiers.reduce((n, m) => n | MODIFIERS[m], 0);
      const info = KEYS[key] || { code: `Key${key.toUpperCase()}`, keyCode: key.toUpperCase().charCodeAt(0) };
      // Plain Enter needs its character event for native form submission; shortcuts stay key-only.
      const text = !mods ? (key === 'Enter' ? '\r' : !KEYS[key] ? key : undefined) : undefined;
      await cmd('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key, code: info.code, windowsVirtualKeyCode: info.keyCode, modifiers: mods, text });
      await cmd('Input.dispatchKeyEvent', { type: 'keyUp', key, code: info.code, windowsVirtualKeyCode: info.keyCode, modifiers: mods });
    },
    type: text => cmd('Input.insertText', { text }),
    select: (selector, value) =>
      evaluate((s, v) => { const el = document.querySelector(s); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }, selector, value),
    async fill(selector, text) {
      await page.click(selector);
      await evaluate(s => { const el = document.querySelector(s); el.select?.(); }, selector);
      await page.type(text);
    },
    async screenshot(name) {
      const { data } = await cmd('Page.captureScreenshot', { format: 'png' });
      const dir = join(ROOT, 'tests/ui/artifacts');
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `${name.replace(/[^\w-]+/g, '-')}.png`);
      writeFileSync(file, Buffer.from(data, 'base64'));
      return file;
    },
    async close() {
      listeners.delete(listener);
      await send('Target.closeTarget', { targetId }).catch(() => {});
      await send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});
    },
  };
  return page;
}
