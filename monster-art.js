import {createCuboidScene,visibleCuboidFaces} from './cuboid-renderer.js';
export const MONSTERS=[
  {name:'Mossling',kind:'Grove sprite',region:'Whispering Grove',description:'Root feet, a mossy coat, and a crown of fresh leaves.',color:'#7c9b64',ground:'#a9b59a'},
  {name:'Emberback',kind:'Cinder salamander',region:'Cinder Hollow',description:'A low-slung salamander with glowing plates along its back.',color:'#c88358',ground:'#af9787'},
  {name:'Cloud wisp',kind:'Sky spirit',region:'Drifting Heights',description:'A floating spirit held together by mist and pale crystal.',color:'#9d9bc7',ground:'#b4b1ca'},
  {name:'Pebblejaw',kind:'Stone crab',region:'Pebble Shore',description:'A rock-armored crab with heavy pincers and a stubborn jaw.',color:'#929da4',ground:'#acaaa0'},
  {name:'Duskhorn',kind:'Twilight stag',region:'Violet Thicket',description:'A violet woodland beast beneath a branching ivory crown.',color:'#9e83b6',ground:'#afa1b8'},
  {name:'Frost sprout',kind:'Crystal bloom',region:'Frostglass Garden',description:'An icy bloom with glassy petals and curling leaf arms.',color:'#81b7c3',ground:'#b4c7ce'},
  {name:'Sunstone golem',kind:'Ancient guardian',region:'Sunken Observatory',description:'A towering guardian with a sunlit core and carved stone armor.',color:'#c8aa60',ground:'#c2b18c'},
  {name:'Moonmoth',kind:'Lunar moth',region:'Moonlit Canopy',description:'A moon-eyed moth with patterned wings and silver antennae.',color:'#ac89bc',ground:'#b7a5c0'},
];
export const monsterInfo=n=>MONSTERS[(n-1)%MONSTERS.length];
export function monsterName(n){return monsterInfo(n).name+(n>8?` ${Math.ceil(n/8)}`:'');}
const scenes=new Map(),artCache=new Map();
const tint=(hex,f)=>'#'+hex.slice(1).match(/../g).map(c=>Math.min(255,Math.round(parseInt(c,16)*f)).toString(16).padStart(2,'0')).join('');
function gray(hex){const rgb=hex.slice(1).match(/../g).map(c=>parseInt(c,16));const l=Math.round(rgb[0]*.3+rgb[1]*.59+rgb[2]*.11);return '#'+l.toString(16).padStart(2,'0').repeat(3);}
export function monsterGeometry(n,defeated=false){
  const boxes=[],add=(x,y,z,w,d,h,color,part='body')=>boxes.push({x,y,z,w,d,h,color,part});
  const eyes=(cx,y,z,separation=10,size=4)=>{
    for(const x of [cx-separation,cx+separation]){
      if(defeated){for(let i=0;i<3;i++){add(x-size/2+i*size/3,y,z+i*size/3,size/3,1,size/3,'#36353d','defeated-eyes');add(x+size/2-(i+1)*size/3,y,z+i*size/3,size/3,1,size/3,'#36353d','defeated-eyes');}}
      else{add(x-size/2,y,z,size,1.5,size+1,'#343b43','eye');add(x-size/2,y+1.5,z+size-1,1.4,.5,1.4,'#f3f0df','eye glint');}
    }
  };
  const species=(n-1)%8;
  if(species===0){
    for(const x of [-17,6]){add(x,-6,5,11,16,12,'#756a4d','root foot');add(x-2,4,5,15,10,5,'#8c7d58','root toe');}
    add(-24,-15,15,48,31,28,'#79945b');add(-20,-12,42,40,28,16,'#8ea967','moss head');
    add(-28,-10,24,9,19,16,'#617a49','root arm');add(20,-10,24,9,19,16,'#617a49','root arm');
    add(-15,16,19,30,2,17,'#adc084','belly');add(-23,10,38,10,9,7,'#9eb77a','cheek');add(13,10,38,10,9,7,'#9eb77a','cheek');
    add(-16,-10,56,12,16,8,'#6f8e4d','leaf crown');add(1,-7,56,13,15,10,'#7a9e55','leaf crown');add(-2,-5,65,5,7,9,'#657e41','stem');add(-8,-4,70,12,8,5,'#b1c684','new leaf');
    add(11,0,62,7,7,5,'#e8d6a0','flower');add(13,2,67,3,3,2,'#d0a969','flower center');
    eyes(0,17,44,10,4);add(-4,18,36,8,1,2,'#546449','mouth');add(-18,-15,29,8,3,9,'#a5b57d','moss patch');
  }else if(species===1){
    for(const x of [-20,11])for(const y of [-18,16]){add(x,y,5,9,13,12,'#895342','leg');add(x-2,y+6,5,13,11,5,'#d3a078','claw');}
    add(-24,-25,15,48,49,22,'#b96c4a');add(-20,-21,35,40,40,8,'#cf8657','back plate');
    add(-22,16,27,44,26,23,'#d99565','head');add(-17,37,23,34,11,14,'#bd7754','snout');add(-16,48,27,32,1,3,'#754c41','mouth');
    add(-9,-39,13,18,16,15,'#b66b4b','tail');add(-6,-52,18,12,14,13,'#d38a53','tail');add(-4,-58,27,8,10,12,'#e5b25e','tail flame');
    for(const y of [-20,-5,10]){add(-5,y,41,10,9,9,'#e7ac57','ember spine');add(-3,y+1,50,6,6,5,'#f2d07c','spine glow');}
    for(const x of [-24,18])add(x,-15,25,6,22,9,'#dc9c65','scale');eyes(0,42,40,12,4);add(-12,48,31,4,1,3,'#f0d5a5','tooth');add(8,48,31,4,1,3,'#f0d5a5','tooth');
  }else if(species===2){
    add(-22,-14,27,44,29,28,'#a5a7d0');add(-30,-7,32,16,22,15,'#b8badd','cloud lobe');add(17,-5,31,15,20,17,'#b1b3d9','cloud lobe');
    add(-18,-11,54,36,24,13,'#c9c9e5','mist crown');add(-11,-7,66,22,17,11,'#d8d7ec','mist crown');
    add(-9,-3,16,18,16,12,'#9298c3','wisp tail');add(-5,0,8,10,10,9,'#adb5d8','wisp tail');
    add(-37,1,47,7,7,11,'#bcb7dd','floating crystal');add(32,-8,58,6,6,10,'#dad3ee','floating crystal');add(28,13,20,7,7,7,'#c4c8e4','floating crystal');
    eyes(0,16,44,10,4);add(-5,17,35,10,1,3,'#8584ae','mouth');add(-17,15,35,6,1,4,'#d1c4dd','blush');add(11,15,35,6,1,4,'#d1c4dd','blush');
  }else if(species===3){
    for(const x of [-30,19])for(const y of [-14,5,20]){add(x,y,5,12,8,8,'#7e8990','crab leg');add(x+(x<0?-6:6),y+4,3,12,7,5,'#a2aaad','crab foot');}
    add(-25,-20,13,50,46,27,'#909ca4');add(-22,-17,39,44,36,14,'#b2babd','stone shell');add(-14,-9,52,28,23,8,'#c3c8c5','shell cap');
    add(-38,12,22,16,17,16,'#89969e','pincer');add(24,12,22,16,17,16,'#89969e','pincer');add(-41,23,32,12,14,9,'#b2babd','pincer tip');add(30,23,32,12,14,9,'#b2babd','pincer tip');
    add(-18,26,17,36,8,13,'#b5bcb8','jaw');add(-14,34,25,28,1,3,'#5e6b73','mouth');
    eyes(0,27,34,12,5);add(-8,34,23,4,2,5,'#e4e1ce','tooth');add(4,34,23,4,2,5,'#e4e1ce','tooth');add(-5,19,48,3,2,9,'#818c92','shell crack');
  }else if(species===4){
    for(const x of [-15,7])for(const y of [-17,12]){add(x,y,4,8,10,23,'#6f5b85','leg');add(x-1,y+3,4,10,10,6,'#ae98bd','hoof');}
    add(-19,-24,25,38,50,27,'#9173a7');add(-15,10,43,30,22,28,'#a38ab7','neck');add(-18,13,64,36,26,22,'#af98c2','head');
    add(-12,35,61,24,12,13,'#c3afce','muzzle');add(-4,47,68,8,1,4,'#665176','nose');
    for(const x of [-13,9]){add(x,15,85,4,6,22,'#d8c9b0','antler');add(x+(x<0?-10:0),15,97,14,5,4,'#e5d7bb','antler branch');add(x+(x<0?-10:10),15,99,4,5,10,'#d8c9b0','antler tip');}
    add(-27,16,74,9,10,7,'#8b709f','ear');add(18,16,74,9,10,7,'#8b709f','ear');add(-5,-32,34,10,10,9,'#b29ac1','tail');
    eyes(0,39,76,11,4);add(-5,26,86,10,9,5,'#c1add1','forehead crest');
  }else if(species===5){
    add(-13,-10,5,26,23,9,'#7097a7','ice roots');add(-19,-12,13,38,28,31,'#77afbd');add(-15,-9,42,30,23,19,'#a4d4db','head');
    add(-10,16,19,20,2,19,'#c3e5e4','ice core');add(-6,18,25,12,2,7,'#92c2ce','core facet');
    for(const x of [-30,19]){add(x,-3,27,11,13,10,'#73a5b5','leaf arm');add(x+(x<0?-4:5),-2,36,10,12,15,'#a4cfd6','leaf tip');}
    add(-4,-4,60,8,8,11,'#5c9eae','stem');add(-16,-9,70,16,15,7,'#a7dbe0','ice petal');add(0,-6,70,16,14,9,'#bde4e7','ice petal');add(-6,3,72,12,13,8,'#80bacb','ice petal');add(-4,-1,78,8,8,11,'#d2eeee','crystal bud');
    eyes(0,14,49,8,4);add(-3,15,43,6,1,2,'#598c9e','mouth');add(-21,-15,2,8,8,12,'#a1cbd5','ice shard');add(16,10,2,7,7,10,'#bfdee1','ice shard');
  }else if(species===6){
    for(const x of [-21,8]){add(x,-11,4,13,23,19,'#aa8c4e','leg');add(x-2,1,4,17,17,7,'#ceb16b','foot');}
    add(-25,-16,23,50,35,40,'#b99b55');add(-20,-13,61,40,29,12,'#d9c181','shoulder block');
    add(-16,-9,72,32,26,24,'#c6ac68','head');add(-12,-6,94,24,21,7,'#e4d39a','crown');
    for(const x of [-41,25]){add(x,-14,48,16,31,19,'#d5bd7b','shoulder');add(x+2,-10,23,13,24,25,'#ac8d48','arm');add(x,-7,17,17,27,13,'#c7aa64','fist');}
    add(-12,19,35,24,3,22,'#8c753f','core frame');add(-8,22,39,16,2,14,'#efd17a','sun core');add(-4,24,43,8,1,6,'#fff1b2','core glow');
    eyes(0,18,82,9,4);add(-7,19,75,14,1,3,'#8e773e','mouth');add(-16,20,28,7,1,3,'#e6cb85','carving');add(10,20,55,5,1,4,'#e6cb85','carving');
  }else{
    for(const side of [-1,1]){
      const x=side<0?-51:11;
      add(x,-8,30,40,9,39,'#8e6b9f','upper wing');add(x+5,-7,67,30,8,10,'#b091c0','wing tip');
      add(x+5,0,39,30,2,25,'#c3a8ce','wing pattern');add(x+11,2,44,18,2,14,'#80628e','wing eye');add(x+15,4,48,10,1,7,'#e4d5d6','wing moon');
      add(side<0?-39:12,-7,8,27,9,24,'#a887b8','lower wing');add(side<0?-34:16,2,13,17,2,13,'#d1bad7','lower pattern');
    }
    add(-10,-8,15,20,19,44,'#8d7a9f','body');add(-8,11,22,16,2,24,'#c6b9d3','belly');add(-14,-7,58,28,21,21,'#b49cc5','head');
    add(-11,-3,78,3,5,14,'#8a759d','antenna');add(8,-3,78,3,5,14,'#8a759d','antenna');add(-14,-4,91,7,7,5,'#e2d6d8','antenna tip');add(7,-4,91,7,7,5,'#e2d6d8','antenna tip');
    eyes(0,15,65,8,4);add(-3,16,59,6,1,2,'#7c658e','mouth');
  }
  const min=[Math.min(...boxes.map(b=>b.x)),Math.min(...boxes.map(b=>b.y)),Math.min(...boxes.map(b=>b.z))];
  const max=[Math.max(...boxes.map(b=>b.x+b.w)),Math.max(...boxes.map(b=>b.y+b.d)),Math.max(...boxes.map(b=>b.z+b.h))];
  const scale=Math.min(95/(max[2]-min[2]),88/(max[0]-min[0]),85/(max[1]-min[1]));
  const normalized=boxes.map(b=>({...b,x:(b.x-(min[0]+max[0])/2)*scale,y:(b.y-(min[1]+max[1])/2)*scale,z:(b.z-min[2])*scale+7,w:b.w*scale,d:b.d*scale,h:b.h*scale,color:defeated?gray(b.color):b.color}));
  const ground=monsterInfo(n).ground;
  normalized.unshift({x:-28,y:-22,z:0,w:56,d:44,h:3,color:defeated?gray(ground):ground,part:'terrain'},{x:-26,y:-20,z:3,w:52,d:40,h:4,color:defeated?gray(tint(ground,1.12)):tint(ground,1.12),part:'terrain top'});
  return normalized;
}
export function monsterArt(n,defeated=false){
  const key=`${n}:${defeated}`;
  if(artCache.has(key))return artCache.get(key);
  const sceneKey=`${(n-1)%8}:${defeated}`;
  if(!scenes.has(sceneKey))scenes.set(sceneKey,createCuboidScene(monsterGeometry(n,defeated)));
  const faces=visibleCuboidFaces(scenes.get(sceneKey),-.48);
  const svg=`<svg class="voxel-art monster-art ${defeated?'defeated':''}" viewBox="0 0 240 260" role="img" aria-label="${monsterName(n)}, ${defeated?'defeated, with X eyes':monsterInfo(n).kind.toLowerCase()}"><ellipse cx="120" cy="224" rx="65" ry="12" fill="currentColor" opacity=".07"/>${faces.map(f=>`<polygon ${f.part==='defeated-eyes'?'class="defeated-eyes" ':''}data-part="${f.part}" points="${f.projected.map(p=>p.map(v=>v.toFixed(2)).join(',')).join(' ')}" fill="${tint(f.color,f.light)}"/>`).join('')}</svg>`;
  artCache.set(key,svg);return svg;
}
