// Writes sw.js from scripts/sw-source.mjs. Run after changing any app file (npm run build does this).
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, precacheList, swSource } from './sw-source.mjs';
writeFileSync(resolve(ROOT, 'sw.js'), swSource());
console.log(`Wrote sw.js (${precacheList().length} files cached for offline use).`);
