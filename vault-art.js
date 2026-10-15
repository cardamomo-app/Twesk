// Original little voxel writing objects, rendered with the same solid-face renderer as the avatar.
import { createCuboidScene, visibleCuboidFaces } from './cuboid-renderer.js';
const cache = new Map();
const shade = (hex, factor) => '#' + hex.slice(1).match(/../g).map(c => Math.max(0, Math.min(255, Math.round(parseInt(c, 16) * factor))).toString(16).padStart(2, '0')).join('');
export function vaultArt(kind = 'vault') {
  if (cache.has(kind)) return cache.get(kind);
  const boxes = [], add = (x, y, z, w, d, h, color) => boxes.push({ x, y, z, w, d, h, color, part: kind });
  const paper = '#f3e4c2', edge = '#d6c39e', brass = '#c8a25b';
  if (kind === 'journal') {
    add(-17,-12,3,34,24,4,'#754c3c'); add(-15,-10,7,30,20,8,paper);
    for (const z of [8,11,13]) add(-15,10,z,30,1,1,edge);
    add(-17,-12,15,34,24,4,'#ad6b4d'); add(-17,-12,6,4,24,10,'#86513e');
    for (const y of [-9,7]) add(-18,y,6,5,2,10,brass);
    add(-3,-12,19,6,24,1,'#cda47a'); add(-3,8,20,6,5,3,brass); add(-1,9,23,2,2,1,'#f7de95');
    add(9,12,7,4,5,9,'#806a91');
  } else if (kind === 'note') {
    add(-17,-11,2,31,23,2,edge); add(-16,-10,4,30,23,2,paper);
    for (const y of [-5,0,5]) add(-10,y,6,16,1,1,'#b3aaa0');
    add(7,-10,7,12,11,3,'#3b6467'); add(9,-8,10,8,7,7,'#345154'); add(10,-7,17,6,5,2,brass); add(11,-6,19,4,3,1,'#213f48');
    // Stepped ivory feather and fine brass nib.
    for (let i=0;i<7;i++) { add(-4+i*2,-4+i*2,9+i*3,3,3,4,'#ddd4b5'); if(i>1&&i<6)add(-7+i*2,-4+i*2,11+i*3,6,4,3,'#f3ead5'); }
    add(-5,-5,7,3,3,5,brass);
  } else if (kind === 'review') {
    add(-20,-13,1,40,26,3,'#ae8856'); add(-20,-13,4,3,26,7,'#c4a575'); add(17,-13,4,3,26,7,'#c4a575'); add(-20,-13,4,40,3,7,'#b79a6b');
    add(-16,-8,5,31,17,3,edge); add(-15,-6,8,30,17,3,paper);
    for (let i=0;i<5;i++)add(-13+i*3,-5+i*2,11,26-i*6,2,1,'#d9c299');
    add(-4,2,12,9,7,2,'#c18d36'); add(-2,3,14,5,5,1,'#e4b459'); add(0,4,15,1,3,1,'#fff0bc');
  } else {
    const archive = kind === 'archive', wood = archive ? '#9a866c' : '#526478';
    add(-19,-13,2,38,26,22,wood); add(-20,-14,24,40,28,5,archive?'#b59c7b':'#70849b');
    for (const x of [-16,12]) { add(x,-13,3,4,27,21,brass); add(x,-14,29,4,28,1,'#e0c384'); }
    add(-5,14,12,10,2,8,archive?'#eee0c4':brass); add(-2,16,14,4,1,4,archive?'#9a866c':'#465567');
    if (!archive) { add(-12,-7,30,21,15,3,paper); add(-13,-8,33,24,17,3,'#a86a4d'); add(-10,-6,36,20,14,2,'#d2b882'); }
  }
  const faces = visibleCuboidFaces(createCuboidScene(boxes), -.48), points = faces.flatMap(f => f.projected);
  const x = Math.min(...points.map(p=>p[0]))-5, y = Math.min(...points.map(p=>p[1]))-5;
  const w = Math.max(...points.map(p=>p[0]))-x+5, h = Math.max(...points.map(p=>p[1]))-y+5;
  const result = `<svg class="vault-object" viewBox="${[x,y,w,h].map(n=>n.toFixed(2)).join(' ')}" aria-hidden="true" focusable="false">${faces.map(f=>`<polygon points="${f.projected.map(p=>p.map(n=>n.toFixed(2)).join(',')).join(' ')}" fill="${shade(f.color,f.light)}"/>`).join('')}</svg>`;
  cache.set(kind,result); return result;
}
