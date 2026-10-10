// Publish only the app and its offline assets, never local saves, previews, or development files.
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { ROOT, precacheList } from './sw-source.mjs';

const output = resolve(ROOT, '_site');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
const files = new Set(precacheList().filter(url => url !== './').map(url => url.slice(2).split('?')[0]));
files.add('sw.js');
files.add('Twesk.html');
for (const file of files) {
  mkdirSync(dirname(resolve(output, file)), { recursive: true });
  copyFileSync(resolve(ROOT, file), resolve(output, file));
}
writeFileSync(resolve(output, '.nojekyll'), '');
console.log(`Prepared ${files.size} app files for GitHub Pages in _site/.`);
