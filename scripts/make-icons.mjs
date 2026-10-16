// Generate every brand asset from brand-art.js. Uses Chromium, or isolated native WebKit on macOS.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { flameArt, appIconArt, pinnedIconArt } from '../brand-art.js';
import { ROOT, browserPath, launchBrowser, startServer } from '../tests/ui/browser.mjs';

const icon = name => join(ROOT, 'icons', name);
writeFileSync(icon('icon.svg'), appIconArt());
writeFileSync(icon('icon-maskable.svg'), appIconArt(true));
writeFileSync(icon('favicon.svg'), flameArt() + '\n');
writeFileSync(icon('safari-pinned-tab.svg'), pinnedIconArt());
const temporary = mkdtempSync(join(tmpdir(), 'twesk-icons-'));
const jobs = [
  { source: icon('icon.svg'), output: icon('icon-512.png'), size: 512 },
  { source: icon('icon.svg'), output: icon('icon-192.png'), size: 192 },
  { source: icon('icon-maskable.svg'), output: icon('icon-maskable-512.png'), size: 512 },
  { source: icon('icon-maskable.svg'), output: icon('apple-touch-icon.png'), size: 180 },
  { source: icon('favicon.svg'), output: icon('favicon-16.png'), size: 16 },
  { source: icon('favicon.svg'), output: icon('favicon-32.png'), size: 32 },
  { source: icon('favicon.svg'), output: join(temporary, 'favicon-48.png'), size: 48 },
];
try {
  if (browserPath) {
    const { server, origin } = await startServer();
    let browser;
    try {
      browser = await launchBrowser();
      const page = await browser.newPage({ origin, width: 512, height: 512 });
      await page.goto('/__blank');
      await page.cmd('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
      for (const job of jobs) {
        await page.evaluate((markup, size) => {
          document.body.style.margin = '0';
          document.body.innerHTML = markup;
          Object.assign(document.querySelector('svg').style, { width: size + 'px', height: size + 'px', display: 'block' });
        }, readFileSync(job.source, 'utf8'), job.size);
        const { data } = await page.cmd('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: job.size, height: job.size, scale: 1 } });
        writeFileSync(job.output, Buffer.from(data, 'base64'));
      }
    } finally {
      await browser?.close();
      server.closeAllConnections(); server.close();
    }
  } else if (process.platform === 'darwin') {
    const renderer = join(temporary, 'render-icons'), input = join(temporary, 'jobs.json');
    writeFileSync(input, JSON.stringify(jobs));
    execFileSync('swiftc', ['-module-cache-path', join(temporary, 'modules'), join(ROOT, 'scripts/render-icons.swift'), '-o', renderer], { stdio: 'inherit' });
    execFileSync(renderer, [input], { stdio: 'inherit', timeout: 95000 });
  } else throw new Error('Icon generation needs a Chromium-based browser, or macOS with Swift installed.');

  // A multi-size ICO fallback for browsers and bookmarks that do not select the SVG favicon.
  const images = jobs.filter(job => [16, 32, 48].includes(job.size)).map(job => ({ size: job.size, bytes: readFileSync(job.output) }));
  const directory = Buffer.alloc(6 + images.length * 16);
  directory.writeUInt16LE(1, 2); directory.writeUInt16LE(images.length, 4);
  let offset = directory.length;
  for (const [i, image] of images.entries()) {
    const at = 6 + i * 16;
    directory[at] = directory[at + 1] = image.size;
    directory.writeUInt16LE(1, at + 4); directory.writeUInt16LE(32, at + 6);
    directory.writeUInt32LE(image.bytes.length, at + 8); directory.writeUInt32LE(offset, at + 12);
    offset += image.bytes.length;
  }
  writeFileSync(join(ROOT, 'favicon.ico'), Buffer.concat([directory, ...images.map(i => i.bytes)]));
  console.log('Updated header geometry, install icons, touch icon, SVG/PNG/ICO favicons, and pinned-tab artwork.');
} finally { rmSync(temporary, { recursive: true, force: true }); }
