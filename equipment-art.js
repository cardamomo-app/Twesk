import {avatarGeometry} from './avatar-model.js?v=0.14.0';
import {createCuboidScene,visibleCuboidFaces} from './cuboid-renderer.js';

const weaponParts=new Set(['sword grip','pommel','crossguard','blade','blade ridge','sword point','sword tip','blade shoulders','blade rune','guard wing']);
const armorParts=new Set(['leather vest','vest back','shoulder strap','vest clasp','stitched hem','breastplate','chest plate','chest crest','pauldron','pauldron rim','hip plate','cape','cape fold','cape hem','cape crest','shoulder ornament','back plate','back trim','sun crest']);
const helmetParts=new Set(['helmet','helmet brim','helmet seam','helmet flap','helmet trim','helmet nasal','cheek guard','helmet crest','helmet wing','crown spike','crown gem']);
const illustrations=new Map();
function tint(hex,factor){return '#'+hex.slice(1).match(/../g).map(c=>Math.min(255,Math.round(parseInt(c,16)*factor)).toString(16).padStart(2,'0')).join('');}
function shade2(hex,f){return tint(hex,f);}
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
  const liquid={'full-potion':'#dba854','greater-potion':'#c27188','swift-tonic':'#5fb7b2','fort-tonic':'#d9844f'}[item.id]||'#b388bf';
  // Tonics carry a different label symbol: a feather for swiftness, a shield for fortitude.
  const symbol=item.id==='swift-tonic'?'#4e8f8b':item.id==='fort-tonic'?'#a5603a':'#c37f93';
  return boxes.map(b=>({...b,color:b.color==='#b388bf'?liquid:b.part==='heart'?symbol:b.color}));
}
function spell(item){
  const boxes=[],add=(x,y,z,w,d,h,color)=>boxes.push({x,y,z,w,d,h,color,part:'spell'});
  const ember=item.id==='ember',ink={ember:'#c96a46',ward:'#709c91',storm:'#5b7fc7',starfall:'#8f78d0'}[item.id];
  if(item.id==='storm'||item.id==='starfall'){
    add(-18,-5,12,36,10,42,'#ead5aa');add(-20,-6,9,40,12,7,item.id==='storm'?'#8fa2c4':'#b2a0d6');add(-20,-6,52,40,12,7,item.id==='storm'?'#8fa2c4':'#b2a0d6');
    add(-18,-7,10,36,2,4,'#f7e7c5');add(-18,-7,53,36,2,4,'#f7e7c5');
    if(item.id==='storm'){add(0,6,38,6,3,10,ink);add(-4,6,32,8,3,6,ink);add(-6,6,22,6,3,10,ink);add(-1,9,33,4,1,4,'#cfe0f7');}
    else{add(-3,6,24,6,3,22,ink);add(-11,6,32,22,3,6,ink);add(-7,6,28,14,3,14,ink);add(-1,9,34,2,1,2,'#f4e3a1');add(-14,6,44,4,3,4,'#f4e3a1');add(10,6,20,4,3,4,'#f4e3a1');}
    return boxes;
  }
  add(-18,-5,12,36,10,42,'#ead5aa');add(-20,-6,9,40,12,7,'#bca174');add(-20,-6,52,40,12,7,'#bca174');
  add(-18,-7,10,36,2,4,'#f7e7c5');add(-18,-7,53,36,2,4,'#f7e7c5');
  add(-12,5,19,24,1,2,'#b7a17f');add(-12,5,46,24,1,2,'#b7a17f');
  if(ember){add(-6,6,25,12,3,12,ink);add(-2,6,37,5,3,7,'#e9ad59');add(-9,6,27,3,3,7,'#e9ad59');add(-2,9,27,5,1,7,'#f3c76b');}
  else{add(-10,6,30,20,3,12,ink);add(-7,6,25,14,3,5,ink);add(-3,6,22,6,3,3,ink);add(-2,9,28,4,1,11,'#b8d8c4');}
  return boxes;
}
function pet(item){
  const boxes=[],add=(x,y,z,w,d,h,color,part='pet')=>boxes.push({x,y,z,w,d,h,color,part});
  if(item.id==='tortoise'){
    const shell='#7c8c5c',dark='#5b6a43',skin='#a9b48a';
    add(-18,-16,8,36,32,14,shell);add(-14,-12,22,28,24,7,shade2(shell,1.1));add(-8,-6,29,16,12,4,shade2(shell,1.2));
    for(const [x,y] of [[-14,-10],[4,-10],[-14,4],[4,4]])add(x,y,22,8,8,1,dark);
    add(-6,16,10,12,12,10,skin);add(-4,26,13,8,3,6,skin);add(-3,28,17,2,1,2,'#2f3a2a');add(2,28,17,2,1,2,'#2f3a2a');
    for(const [x,y] of [[-18,-14],[12,-14],[-18,8],[12,8]])add(x,y,2,7,7,8,skin,'pet paws');
    add(-2,-22,8,5,6,5,skin);
  }else if(item.id==='drake'){
    const scale='#c4533d',dark='#8e3527',belly='#f0b064';
    add(-12,-12,10,24,26,22,scale);add(-9,12,14,18,4,14,belly);
    add(-10,6,30,20,18,16,scale);add(-8,22,32,16,6,9,shade2(scale,1.1));add(-6,27,34,3,1,3,'#2c2228');add(3,27,34,3,1,3,'#2c2228');
    add(-6,6,46,3,5,8,'#f0d39a');add(3,6,46,3,5,8,'#f0d39a');
    add(-22,-6,24,10,16,4,dark);add(12,-6,24,10,16,4,dark);add(-28,-4,28,8,12,3,shade2(dark,1.15));add(20,-4,28,8,12,3,shade2(dark,1.15));
    add(-3,-22,12,6,12,6,scale);add(-2,-30,14,4,9,5,dark);add(-1,-34,17,3,5,4,'#f0b064');
    for(const x of [-11,5]){add(x,6,2,6,8,9,dark,'pet paws');add(x,-10,2,6,8,9,dark,'pet paws');}
  }else if(item.id==='owl'){
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
  const parts=item.type==='weapon'?weaponParts:item.type==='helmet'?helmetParts:armorParts;
  let boxes=item.type==='potion'?potion(item):item.type==='spell'?spell(item):item.type==='pet'?pet(item):avatarGeometry(item.type==='weapon'?item:null,item.type==='armor'?item:null,undefined,item.type==='helmet'?item:null).filter(b=>parts.has(b.part));
  // Showcase the actual equipped geometry, recentered on a small display stand.
  const minX=Math.min(...boxes.map(b=>b.x)),maxX=Math.max(...boxes.map(b=>b.x+b.w));
  const floor=Math.min(...boxes.map(b=>b.z)),ceiling=Math.max(...boxes.map(b=>b.z+b.h));
  const scale=Math.min(78/(ceiling-floor),68/(maxX-minX));
  // The fox's offset tail should not pull its paws away from the ground's center.
  const anchors=['fox','drake','tortoise'].includes(item.id)?boxes.filter(b=>b.part==='pet paws'):boxes;
  const centerX=(Math.min(...anchors.map(b=>b.x))+Math.max(...anchors.map(b=>b.x+b.w)))/2;
  const centerY=(Math.min(...anchors.map(b=>b.y))+Math.max(...anchors.map(b=>b.y+b.d)))/2;
  boxes=boxes.map(b=>({...b,x:(b.x-centerX)*scale,y:(b.y-centerY)*scale,z:(b.z-floor)*scale+8,w:b.w*scale,d:b.d*scale,h:b.h*scale}));
  const accent=item.type==='potion'?'#b6a4c5':item.tier==='legendary'?'#e2b84f':item.tier==='special'?'#b5a7d7':item.tier==='large'?'#93aaa0':'#b8a789';
  boxes.unshift({x:-25,y:-19,z:0,w:50,d:38,h:4,color:'#b8b6ad',part:'display stand'},{x:-26,y:-20,z:4,w:52,d:40,h:3,color:'#ddd9cc',part:'stand rim'},{x:-23,y:-17,z:7,w:46,d:34,h:1,color:accent,part:'stand inset'});
  const faces=visibleCuboidFaces(createCuboidScene(boxes),-.55);
  const illustration=`<svg class="equipment-art voxel-art ${item.type}" viewBox="20 40 200 200" aria-hidden="true"><ellipse cx="120" cy="226" rx="50" ry="9" fill="currentColor" opacity=".07"/>${faces.map(f=>`<polygon points="${f.projected.map(p=>p.map(n=>n.toFixed(2)).join(',')).join(' ')}" fill="${tint(f.color,f.light)}"/>`).join('')}</svg>`;
  illustrations.set(key,illustration);return illustration;
}
