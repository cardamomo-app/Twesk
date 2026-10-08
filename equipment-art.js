import {avatarGeometry} from './avatar-model.js?v=0.9.0';
import {createCuboidScene,visibleCuboidFaces} from './cuboid-renderer.js';

const weaponParts=new Set(['sword grip','pommel','crossguard','blade','blade ridge','sword point','sword tip','blade shoulders','blade rune']);
const armorParts=new Set(['leather vest','vest back','shoulder strap','vest clasp','stitched hem','breastplate','chest plate','chest crest','pauldron','pauldron rim','hip plate','cape','cape fold','cape hem','cape crest','shoulder ornament','back plate','back trim']);
const illustrations=new Map();
function tint(hex,factor){return '#'+hex.slice(1).match(/../g).map(c=>Math.min(255,Math.round(parseInt(c,16)*factor)).toString(16).padStart(2,'0')).join('');}
function potion(item){
  const boxes=[],add=(x,y,z,w,d,h,color,part='potion')=>boxes.push({x,y,z,w,d,h,color,part});
  add(-13,-10,8,26,20,31,'#b388bf');
  add(-11,-8,5,22,16,4,'#ccdbe1');
  add(-13,-10,8,3,20,31,'#c7dce3');add(10,-10,8,3,20,31,'#b5cbd9');
  add(-13,-10,38,26,20,4,'#cbdfe4');
  add(-10,-8,42,20,16,5,'#dbe7e8');add(-7,-6,47,14,12,13,'#b8d2dc');
  add(-8,-7,57,16,14,4,'#dce8e8');add(-6,-5,60,12,10,8,'#b7976d');
  add(-5,-4,67,10,8,2,'#d4b68a');
  add(-9,10,19,18,2,16,'#f4e9d7','label');
  add(-6,12,28,4,1,4,'#c37f93','heart');add(2,12,28,4,1,4,'#c37f93','heart');
  add(-6,12,25,12,1,3,'#c37f93','heart');add(-3,12,22,6,1,3,'#c37f93','heart');
  add(-10,10,12,2,1,7,'#f1f7f3','glass glint');add(-10,10,35,2,1,5,'#f1f7f3','glass glint');
  add(-5,6,49,2,1,7,'#edf6f6','glass glint');
  const liquid=item.id==='full-potion'?'#dba854':item.id==='greater-potion'?'#c27188':'#b388bf';
  return boxes.map(b=>({...b,color:b.color==='#b388bf'?liquid:b.color}));
}
function spell(item){
  const boxes=[],add=(x,y,z,w,d,h,color)=>boxes.push({x,y,z,w,d,h,color,part:'spell'});
  const ember=item.id==='ember',ink=ember?'#c96a46':'#709c91';
  add(-18,-5,12,36,10,42,'#ead5aa');add(-20,-6,9,40,12,7,'#bca174');add(-20,-6,52,40,12,7,'#bca174');
  add(-18,-7,10,36,2,4,'#f7e7c5');add(-18,-7,53,36,2,4,'#f7e7c5');
  add(-12,5,19,24,1,2,'#b7a17f');add(-12,5,46,24,1,2,'#b7a17f');
  if(ember){add(-6,6,25,12,3,12,ink);add(-2,6,37,5,3,7,'#e9ad59');add(-9,6,27,3,3,7,'#e9ad59');add(-2,9,27,5,1,7,'#f3c76b');}
  else{add(-10,6,30,20,3,12,ink);add(-7,6,25,14,3,5,ink);add(-3,6,22,6,3,3,ink);add(-2,9,28,4,1,11,'#b8d8c4');}
  return boxes;
}
function pet(item){
  const boxes=[],add=(x,y,z,w,d,h,color,part='pet')=>boxes.push({x,y,z,w,d,h,color,part});
  if(item.id==='owl'){
    add(-14,-10,8,28,20,30,'#827197');add(-17,-9,12,5,18,23,'#655777');add(12,-9,12,5,18,23,'#655777');
    add(-17,-11,36,34,23,24,'#9985aa');add(-16,-10,58,7,12,8,'#766387');add(9,-10,58,7,12,8,'#766387');
    add(-13,12,41,11,2,13,'#ecdfc5');add(2,12,41,11,2,13,'#ecdfc5');
    add(-9,14,44,4,2,6,'#3e394c');add(5,14,44,4,2,6,'#3e394c');add(-3,14,38,6,4,7,'#d3a452');
    add(-9,2,4,6,12,5,'#d3a452');add(3,2,4,6,12,5,'#d3a452');add(-9,10,18,18,2,17,'#c8b5c9');
  }else{
    const fox=item.id==='fox',fur=fox?'#c98c50':'#a2b2ca',dark=fox?'#755642':'#73839d',light=fox?'#f0ddbd':'#dbe4e8';
    add(-12,-14,9,24,29,23,fur);add(-15,3,29,30,23,23,fur);
    add(-14,4,50,8,10,12,dark);add(6,4,50,8,10,12,dark);add(-12,7,52,4,6,6,fox?'#e4b78d':'#c3b4c9');add(8,7,52,4,6,6,fox?'#e4b78d':'#c3b4c9');
    add(-10,26,32,20,5,9,light);add(-3,31,37,6,2,4,'#544b52');
    add(-10,26,44,4,2,5,'#3e3947');add(6,26,44,4,2,5,'#3e3947');
    for(const x of [-11,5]){add(x,5,3,6,10,10,dark,'pet paws');add(x,-12,3,6,9,10,dark,'pet paws');}
    add(-8,15,16,16,2,13,light);
    if(fox){add(12,-17,12,18,11,12,fur);add(23,-18,18,10,12,10,light);}
    else{add(12,-17,9,7,8,25,fur);add(13,-17,30,6,8,10,dark);add(-4,27,24,8,2,5,'#b49bce');add(-2,29,25,4,2,3,'#e5ca70');}
  }
  return boxes;
}
export function itemArt(item) {
  const key=item.id;
  if(illustrations.has(key))return illustrations.get(key);
  const parts=item.type==='weapon'?weaponParts:armorParts;
  let boxes=item.type==='potion'?potion(item):item.type==='spell'?spell(item):item.type==='pet'?pet(item):avatarGeometry(item.type==='weapon'?item:null,item.type==='armor'?item:null).filter(b=>parts.has(b.part));
  // Showcase the actual equipped geometry, recentered on a small display stand.
  const minX=Math.min(...boxes.map(b=>b.x)),maxX=Math.max(...boxes.map(b=>b.x+b.w));
  const floor=Math.min(...boxes.map(b=>b.z)),ceiling=Math.max(...boxes.map(b=>b.z+b.h));
  const scale=Math.min(78/(ceiling-floor),68/(maxX-minX));
  // The fox's offset tail should not pull its paws away from the ground's center.
  const anchors=item.id==='fox'?boxes.filter(b=>b.part==='pet paws'):boxes;
  const centerX=(Math.min(...anchors.map(b=>b.x))+Math.max(...anchors.map(b=>b.x+b.w)))/2;
  const centerY=(Math.min(...anchors.map(b=>b.y))+Math.max(...anchors.map(b=>b.y+b.d)))/2;
  boxes=boxes.map(b=>({...b,x:(b.x-centerX)*scale,y:(b.y-centerY)*scale,z:(b.z-floor)*scale+8,w:b.w*scale,d:b.d*scale,h:b.h*scale}));
  const accent=item.type==='potion'?'#b6a4c5':item.tier==='special'?'#b5a7d7':item.tier==='large'?'#93aaa0':'#b8a789';
  boxes.unshift({x:-25,y:-19,z:0,w:50,d:38,h:4,color:'#b8b6ad',part:'display stand'},{x:-26,y:-20,z:4,w:52,d:40,h:3,color:'#ddd9cc',part:'stand rim'},{x:-23,y:-17,z:7,w:46,d:34,h:1,color:accent,part:'stand inset'});
  const faces=visibleCuboidFaces(createCuboidScene(boxes),-.55);
  const illustration=`<svg class="equipment-art voxel-art ${item.type}" viewBox="20 40 200 200" aria-hidden="true"><ellipse cx="120" cy="226" rx="50" ry="9" fill="currentColor" opacity=".07"/>${faces.map(f=>`<polygon points="${f.projected.map(p=>p.map(n=>n.toFixed(2)).join(',')).join(' ')}" fill="${tint(f.color,f.light)}"/>`).join('')}</svg>`;
  illustrations.set(key,illustration);return illustration;
}
