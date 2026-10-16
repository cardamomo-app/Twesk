import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {ROOT,precacheList,swSource} from '../scripts/sw-source.mjs';

test('sw.js is up to date with the code (run npm run build after changes)',()=>{
  assert.equal(readFileSync(resolve(ROOT,'sw.js'),'utf8'),swSource());
});
test('the offline cache covers every module the app loads, and every listed file exists',()=>{
  const list=precacheList(),files=list.filter(u=>u!=='./').map(u=>u.replace(/^\.\//,'').split('?')[0]);
  for(const file of files)assert.ok(existsSync(resolve(ROOT,file)),file);
  for(const entry of ['index.html','app.js','engine.js','styles.css','combat-worker.js','sfx.js','manifest.json','icons/apple-touch-icon.png'])
    assert.ok(files.includes(entry),entry);
  const versions=new Set(list.filter(u=>u.includes('?v=')).map(u=>u.split('?v=')[1]));
  assert.equal(versions.size,1,'one version tag across the app');
});
test('the manifest describes an installable standalone app',()=>{
  const manifest=JSON.parse(readFileSync(resolve(ROOT,'manifest.json'),'utf8'));
  assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'./');
  for(const icon of manifest.icons)assert.ok(existsSync(resolve(ROOT,icon.src.split('?')[0])),icon.src);
  assert.ok(manifest.icons.some(i=>i.sizes==='512x512'));
});

test('home and combat worker stay within a GitHub Pages project path',()=>{
  const base=new URL('https://example.github.io/Twesk/');
  const app=readFileSync(resolve(ROOT,'app.js'),'utf8');
  const odds=readFileSync(resolve(ROOT,'ui-odds.js'),'utf8');
  const home=app.match(/href="([^"]+)" aria-label="Twesk home"/)[1];
  const worker=odds.match(/new Worker\('([^']+)'/)[1];
  assert.equal(new URL(home,base).pathname,'/Twesk/');
  assert.equal(new URL(worker,base).pathname,'/Twesk/combat-worker.js');
  for(const url of precacheList())assert.ok(new URL(url,base).pathname.startsWith('/Twesk/'),url);
});
