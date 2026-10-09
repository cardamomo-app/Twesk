// Renders icons/icon.svg to the PNG sizes browsers and Safari's "Add to Dock" use.
// Needs a Chromium-based browser (see tests/ui/browser.mjs). Run: node scripts/make-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, launchBrowser, startServer } from '../tests/ui/browser.mjs';

const svg = readFileSync(join(ROOT, 'icons/icon.svg'), 'utf8');
const sizes = { 'icon-512.png': 512, 'icon-192.png': 192, 'apple-touch-icon.png': 180 };
const { server, origin } = await startServer();
const browser = await launchBrowser();
const page = await browser.newPage({ origin, width: 512, height: 512 });
await page.goto('/__blank');
await page.cmd('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
for (const [file, size] of Object.entries(sizes)) {
  await page.evaluate(
    (markup, px) => {
      document.body.style.margin = '0';
      document.body.innerHTML = markup;
      Object.assign(document.querySelector('svg').style, { width: px + 'px', height: px + 'px', display: 'block' });
    },
    svg,
    size,
  );
  const { data } = await page.cmd('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: size, height: size, scale: 1 } });
  writeFileSync(join(ROOT, 'icons', file), Buffer.from(data, 'base64'));
  console.log(`icons/${file} (${size}×${size})`);
}
await page.close();
await browser.close();
server.closeAllConnections();
server.close();
