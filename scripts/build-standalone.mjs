// Small, dependency-free packager for this app's named ESM exports/imports.
// Unsupported module syntax fails the build instead of producing a broken file.
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {Script} from 'node:vm';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
// Source edits for running from a single file; each must apply exactly once across the app bundle.
const WORKER=/^const worker = new Worker\('\.\/combat-worker\.js(?:\?[^']*)?', \{ type: 'module' \}\);$/m;
const HOME_LINK='href="./" aria-label="Twesk home"';
const applied=new Set();
async function bundle(entry,{workerSource}={}){
  const modules=new Map();
  const dependency=specifier=>{
    if(!/^\.\/[\w.-]+\.js(?:\?[^'"\s]+)?$/.test(specifier))throw new Error(`Unsupported dependency: ${specifier}`);
    return specifier.slice(2).split('?')[0];
  };
  async function visit(file){
    if(modules.has(file))return;
    modules.set(file,'');
    let source=await readFile(resolve(root,file),'utf8');
    const exported=[],deps=[];
    source=source.replace(/^import (\* as \w+|\{[\w$\s,]+\}) from ['"](.+?)['"];?$/gm,(_,bindings,specifier)=>{
      const dep=dependency(specifier);deps.push(dep);
      if(/^\* as \w+$/.test(bindings))return `const ${bindings.slice(5)}=require(${JSON.stringify(dep)});`;
      if(/^\{[\w$\s,]+\}$/.test(bindings))return `const ${bindings}=require(${JSON.stringify(dep)});`;
      throw new Error(`Unsupported import in ${file}: ${bindings}`);
    });
    const leftover=source.match(/^import\b.*$/m);
    if(leftover)throw new Error(`Unsupported import in ${file}: ${leftover[0]}`);
    source=source.replace(/^export \{([\w\s,]+)\} from ['"](.+?)['"];?$/gm,(_,names,specifier)=>{
      const dep=dependency(specifier);deps.push(dep);
      return `Object.assign(exports,(({${names}})=>({${names}}))(require(${JSON.stringify(dep)})));`;
    });
    source=source.replace(/\bexport (async function|function|const) ([\w$]+)/g,(_,kind,name)=>{exported.push(name);return `${kind} ${name}`;});
    if(WORKER.test(source)){
      if(!workerSource||applied.has('worker'))throw new Error('Update standalone worker packaging for the current app.');
      source=source.replace(WORKER,()=>`const workerUrl=URL.createObjectURL(new Blob([${JSON.stringify(workerSource)}],{type:'text/javascript'}));\nconst worker=new Worker(workerUrl);\nworker.addEventListener('message',()=>URL.revokeObjectURL(workerUrl),{once:true});`);
      applied.add('worker');
    }
    if(workerSource&&source.includes(HOME_LINK)){source=source.replace(HOME_LINK,'href="" aria-label="Twesk home"');applied.add('home');}
    const unsupported=source.match(/^export\b.*$/m);
    if(unsupported)throw new Error(`Unsupported export in ${file}: ${unsupported[0]}`);
    source+=`\nObject.assign(exports,{${exported.join(',')}});`;
    new Script(`(function(require,exports){${source}\n})`,{filename:file});
    modules.set(file,source);
    for(const dep of deps)await visit(dep);
  }
  await visit(entry);
  const factories=[...modules].map(([name,source])=>`${JSON.stringify(name)}:function(require,exports){\n${source}\n}`).join(',\n');
  return `(()=>{'use strict';\nconst modules={${factories}};\nconst cache=Object.create(null);function require(id){if(cache[id])return cache[id];const exports=cache[id]={};modules[id](require,exports);return exports;}require(${JSON.stringify(entry)});\n})();`;
}
const workerSource=await bundle('combat-worker.js');
const appSource=await bundle('app.js',{workerSource});
if(!applied.has('worker')||!applied.has('home'))throw new Error('Standalone source edits did not apply; update the packager.');
const template=await readFile(resolve(root,'index.html'),'utf8');
const vendor=await readFile(resolve(root,'vendor/supabase.js'),'utf8');
const css=await readFile(resolve(root,'styles.css'),'utf8');
// Inline every favicon as well: the HTML copy must not depend on sibling icon files.
const iconData = new Map();
for (const [, href] of template.matchAll(/<link rel="(?:icon|shortcut icon|mask-icon)"[^>]*href="(\.\/[^"]+)"/g)) {
  const file = href.slice(2).split('?')[0];
  const type = file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.ico') ? 'image/x-icon' : 'image/png';
  iconData.set(href, `data:${type};base64,${(await readFile(resolve(root, file))).toString('base64')}`);
}
// The single file has no service worker or install manifest; it runs from wherever it is opened.
const output=template.replace(/  <link rel="(?:manifest|apple-touch-icon)"[^>]*>\n/g,'').replace(/  <meta name="(?:apple-mobile-web-app-capable|mobile-web-app-capable|apple-mobile-web-app-title)"[^>]*>\n/g,'')
  .replace(/(<link rel="(?:icon|shortcut icon|mask-icon)"[^>]*href=")([^"]+)(")/g, (_, before, href, after) => before + iconData.get(href) + after)
  .replace(/  <link rel="stylesheet"[^>]+>/,()=>`  <style>\n${css}\n  </style>`)
  .replace(/  <script src="\.\/vendor\/supabase\.js[^"]*"><\/script>/,()=>`  <script>\n${vendor.replace(/<\/script/gi,'<\\/script')}\n  </script>`)
  .replace(/  <script type="module"[^>]+><\/script>/,'')
  .replace('</body>',()=>`  <script>window.__TWESK_STANDALONE__=true;</script>\n  <script>\n${appSource.replace(/<\/script/gi,'<\\/script')}\n  </script>\n</body>`);
await writeFile(resolve(root,'Twesk.html'),output);
console.log(`Created Twesk.html (${Math.round(Buffer.byteLength(output)/1024)} KB). Open it directly in your browser.`);
