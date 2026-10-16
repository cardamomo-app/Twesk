import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FLAME_FACES, flameArt, appIconArt, pinnedIconArt } from '../brand-art.js';
import { ROOT, precacheList } from '../scripts/sw-source.mjs';
import { resolve } from 'node:path';
const read = path => readFileSync(resolve(ROOT, path));

test('the header, favicon, and install assets use the approved shared flame with a separated tick', () => {
  assert.equal(read('icons/favicon.svg').toString(), flameArt() + '\n');
  assert.equal(read('icons/icon.svg').toString(), appIconArt());
  assert.equal(read('icons/icon-maskable.svg').toString(), appIconArt(true));
  assert.equal(read('icons/safari-pinned-tab.svg').toString(), pinnedIconArt());
  assert.match(read('app.js').toString(), /\$\{flameArt\(\)\}/);
  const tick = FLAME_FACES.at(-1).points;
  for (const [x,y] of tick) assert.ok(Math.abs(x-50)/37 + Math.abs(y-48)/42 < .9, 'tick has space from the outside edge');
  assert.equal(FLAME_FACES[0].points[2][0] - FLAME_FACES[0].points[0][0], 30);
  const size = 512 * .84, scale = (size-2)/111, tx = (512-100*scale)/2, ty = (512-size)/2+1;
  for (const face of FLAME_FACES) for (const [x,y] of face.points)
    assert.ok(Math.hypot(tx+x*scale-256, ty+y*scale-256) + .15*scale < 512*.4, 'all artwork fits the maskable safe circle');
});

test('raster icons and the multi-size favicon contain the declared image sizes', () => {
  for (const [file,size] of [['icon-512.png',512],['icon-192.png',192],['icon-maskable-512.png',512],['apple-touch-icon.png',180],['favicon-16.png',16],['favicon-32.png',32]]) {
    const bytes = read('icons/' + file);
    assert.equal(bytes.subarray(0,8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16), size, file); assert.equal(bytes.readUInt32BE(20), size, file);
  }
  const ico = read('favicon.ico'); assert.equal(ico.readUInt16LE(2), 1); assert.equal(ico.readUInt16LE(4), 3);
  for (const [i,size] of [16,32,48].entries()) {
    const at = 6 + i*16, length = ico.readUInt32LE(at+8), offset = ico.readUInt32LE(at+12);
    assert.equal(ico[at], size); assert.equal(ico[at+1], size);
    assert.ok(offset + length <= ico.length);
    assert.equal(ico.readUInt32BE(offset+16), size);
  }
});

test('versioned install and browser icons are cached, published, and embedded in the standalone copy', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.start_url, './'); assert.equal(manifest.scope, './');
  const cache = precacheList();
  for (const {src} of manifest.icons) { assert.match(src, /\?brand=faceted-flame-1$/); assert.ok(cache.includes('./' + src)); }
  for (const name of ['icons/apple-touch-icon.png','icons/favicon.svg','icons/favicon-16.png','icons/favicon-32.png','icons/safari-pinned-tab.svg','favicon.ico'])
    assert.ok(cache.includes('./' + name + '?brand=faceted-flame-1'), name);
  const standalone = read('Twesk.html').toString();
  assert.doesNotMatch(standalone, /<link rel="(?:icon|shortcut icon|mask-icon)"[^>]*href="\.\//);
  assert.match(standalone, /<link rel="icon" type="image\/svg\+xml" sizes="any" href="data:image\/svg\+xml;base64,/);
});
