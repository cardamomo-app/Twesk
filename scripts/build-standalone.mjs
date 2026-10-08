// Small, dependency-free packager for this app's named ESM exports/imports.
// Unsupported module syntax fails the build instead of producing a broken file.
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {Script} from 'node:vm';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
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
    source=source.replace(/^import (.+?) from ['"](.+?)['"];?$/gm,(_,bindings,specifier)=>{
      const dep=dependency(specifier);deps.push(dep);
      if(/^\* as \w+$/.test(bindings))return `const ${bindings.slice(5)}=require(${JSON.stringify(dep)});`;
      if(/^\{[\w\s,]+\}$/.test(bindings))return `const ${bindings}=require(${JSON.stringify(dep)});`;
      throw new Error(`Unsupported import in ${file}: ${bindings}`);
    });
    source=source.replace(/^export \{([\w\s,]+)\} from ['"](.+?)['"];?$/gm,(_,names,specifier)=>{
      const dep=dependency(specifier);deps.push(dep);
      return `Object.assign(exports,(({${names}})=>({${names}}))(require(${JSON.stringify(dep)})));`;
    });
    source=source.replace(/\bexport (function|const) (\w+)/g,(_,kind,name)=>{exported.push(name);return `${kind} ${name}`;});
    if(file==='app.js'){
      const workerLine="const worker=new Worker('/combat-worker.js?v=0.7.4',{type:'module'});";
      if(!source.includes(workerLine)||!workerSource)throw new Error('Update standalone worker packaging for the current app.');
      source=source.replace(workerLine,`const workerUrl=URL.createObjectURL(new Blob([${JSON.stringify(workerSource)}],{type:'text/javascript'}));\nconst worker=new Worker(workerUrl);\nworker.addEventListener('message',()=>URL.revokeObjectURL(workerUrl),{once:true});`);
      source=source.replace('href="/" aria-label="Twesk home"','href="" aria-label="Twesk home"');
    }
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
const template=await readFile(resolve(root,'index.html'),'utf8');
const css=await readFile(resolve(root,'styles.css'),'utf8');
const output=template.replace(/  <link rel="stylesheet"[^>]+>/,()=>`  <style>\n${css}\n  </style>`)
  .replace(/  <script type="module"[^>]+><\/script>/,'')
  .replace('</body>',()=>`  <script>\n${appSource.replace(/<\/script/gi,'<\\/script')}\n  </script>\n</body>`);
await writeFile(resolve(root,'Twesk.html'),output);
console.log(`Created Twesk.html (${Math.round(Buffer.byteLength(output)/1024)} KB). Open it directly in your browser.`);
