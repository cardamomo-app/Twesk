import test from 'node:test';
import assert from 'node:assert/strict';
import {serve} from '../scripts/serve.mjs';

test('the local server asks browsers to recheck every file and hides private folders',async()=>{
  const server=await serve({port:0,quiet:true}),base=`http://127.0.0.1:${server.address().port}`;
  try{
    const page=await fetch(base+'/');
    assert.equal(page.status,200);assert.equal(page.headers.get('cache-control'),'no-cache');
    assert.match(page.headers.get('content-type'),/text\/html/);assert.match(await page.text(),/app\.js\?v=/);
    const again=await fetch(base+'/',{headers:{'if-modified-since':page.headers.get('last-modified')}});
    assert.equal(again.status,304,'unchanged files are a cheap 304');
    assert.match((await fetch(base+'/sw.js')).headers.get('content-type'),/javascript/);
    assert.match((await fetch(base+'/manifest.json')).headers.get('content-type'),/json/);
    assert.equal((await fetch(base+'/.git/config')).status,403);
    const escape=await fetch(base+'/%2e%2e/%2e%2e/etc/hosts');
    assert.ok([403,404].includes(escape.status),'no escaping the project folder');assert.doesNotMatch(await escape.text(),/localhost/);
    assert.equal((await fetch(base+'/nope.js')).status,404);
  }finally{server.close();}
});
