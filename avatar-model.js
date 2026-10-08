import {APPEARANCE,DEFAULT_APPEARANCE} from './appearance.js';
import {createCuboidScene,visibleCuboidFaces} from './cuboid-renderer.js';

// Cuboid geometry with split surfaces for correct visibility at every angle.
// The same model serves the dashboard, inspection view, and combat.
function shade(hex,amount) {
  const n=parseInt(hex.slice(1),16);
  return '#'+[n>>16,(n>>8)&255,n&255].map(c=>Math.max(0,Math.min(255,Math.round(c*amount))).toString(16).padStart(2,'0')).join('');
}
export function avatarGeometry(weapon=null,armor=null,appearance=DEFAULT_APPEARANCE) {
  const boxes=[];
  const add=(x,y,z,w,d,h,color,part)=>boxes.push({x,y,z,w,d,h,color,part});
  const pick=key=>APPEARANCE[key].find(o=>o.id===appearance[key])?.color||APPEARANCE[key][0].color;
  const skin=pick('skin'),hair=pick('hair'),cloth=pick('outfit');
  const leather='#685246',trim='#c9a66b',pants='#424f61',boot='#37373e';
  // Small floating plinth, with a beveled stone rim and inset moss tiles.
  add(-30,-23,-8,60,46,5,'#aaa69e','plinth');
  add(-32,-25,-3,64,50,3,'#c7c5b8','plinth');
  add(-29,-22,0,58,44,2,'#899b84','plinth');
  for(const [x,y,w,d] of [[-26,-19,13,12],[11,-18,14,10],[-27,9,12,10],[16,9,10,9]])add(x,y,2,w,d,1,'#a4b69b','moss');
  // Separate legs, boot soles, cuffs, and front seams.
  for(const x of [-12,3]) {
    add(x,-5,11,9,10,26,pants,'trousers');
    add(x,4,17,9,1,17,shade(pants,1.14),'seam');
    add(x-1,-6,3,11,15,9,boot,'boot');
    add(x-1,-6,3,11,16,2,'#262c33','sole');
    add(x-1,-6,11,11,12,3,leather,'boot cuff');
    add(x+2,8,7,4,1,3,trim,'boot buckle');
  }
  add(-13,-7,37,26,15,29,cloth,'tunic');
  add(-14,-8,35,28,17,5,leather,'belt');
  add(-3,9,35,6,2,5,trim,'belt buckle');
  add(-11,9,31,7,5,9,leather,'belt pouch');
  add(-11,10,38,7,5,2,shade(leather,1.2),'pouch flap');
  add(-8,15,35,2,1,2,trim,'pouch clasp');
  // Sleeves, exposed forearms, wrapped wrists, individual hands.
  for(const side of [-1,1]) {
    const x=side<0?-22:15;
    add(x,-5,48,7,11,15,cloth,'sleeve');
    add(x,-4,39,7,10,10,skin,'forearm');
    add(x,-5,38,7,11,4,leather,'bracer');
    add(x,-3,33,7,10,6,skin,'hand');
    add(x+(side<0?6:-2),3,34,2,4,4,skin,'thumb');
  }
  add(-5,-3,65,10,8,7,skin,'neck');
  // Collar/scarf is visible even beneath armor, with a short tail at the back.
  add(-10,-6,64,20,14,4,'#d8bd7c','scarf');
  add(8,-7,58,5,5,10,'#c9a66b','scarf tail');
  add(-12,-9,71,24,20,22,skin,'head');
  add(-14,-2,77,3,7,7,skin,'ear');add(12,-2,77,3,7,7,skin,'ear');
  // Eyes, brow line, nose, mouth, and cheek planes sit on the actual front face.
  for(const x of [-7,5]) {
    add(x,11,82,3,1,4,'#30313b','eye');
    add(x,12,84,1,1,1,'#f4ebdb','eye glint');
    add(x-1,11,88,5,1,2,shade(hair,.9),'brow');
  }
  add(-2,11,78,4,3,4,shade(skin,1.08),'nose');
  add(-3,11,75,6,1,1,shade(skin,.69),'mouth');
  add(-10,11,78,4,1,2,shade(skin,.91),'cheek');add(7,11,78,3,1,2,shade(skin,.91),'cheek');
  add(-13,-10,92,26,22,6,hair,'hair crown');
  add(-13,-11,77,26,3,18,hair,'hair back');
  add(-14,-7,86,3,15,9,hair,'hair side');add(11,-7,87,3,13,8,hair,'hair side');
  if(appearance.style==='crop') {
    for(let x=-12;x<12;x+=6)add(x,10,90,6,3,4,shade(hair,1+(x+12)*.004),'fringe');
  } else if(appearance.style==='braids') {
    add(-13,9,89,26,4,5,hair,'fringe');
    for(const x of [-15,12])for(let z=60;z<90;z+=5)add(x+(z%10?1:0),-2,z,5,7,5,shade(hair,z%10?1.1:.9),'braid');
    add(-15,-2,58,5,7,3,trim,'hair tie');add(12,-2,58,5,7,3,trim,'hair tie');
  } else {
    add(-14,-8,97,21,20,4,shade(hair,1.08),'swept hair');
    add(-13,9,88,8,5,7,hair,'fringe');add(-5,10,91,10,4,5,hair,'fringe');
    add(-14,7,85,5,6,8,hair,'side fringe');
  }
  if(armor) {
    if(armor.tier==='basic') {
      const c='#96754f';
      add(-13,8,41,10,3,22,c,'leather vest');add(3,8,41,10,3,22,c,'leather vest');
      add(-13,-10,41,26,3,23,c,'vest back');
      for(const x of [-12,8])add(x,-9,63,4,20,3,shade(c,.8),'shoulder strap');
      for(const z of [46,54,61])add(-1,9,z,2,3,2,trim,'vest clasp');
      add(-13,11,42,26,1,3,shade(c,.75),'stitched hem');
    } else {
      const special=armor.tier==='special',metal=special?'#a8a6db':'#80998e',edge=special?'#dbca91':'#bdcbb4';
      add(-14,-9,40,28,20,24,metal,'breastplate');
      add(-8,11,45,16,3,14,shade(metal,1.13),'chest plate');
      add(-2,14,48,4,2,8,special?'#e4ce80':'#d4c9a1','chest crest');
      for(const x of [-24,14]) {
        add(x,-8,58,10,18,8,metal,'pauldron');
        add(x-1,-9,63,12,20,3,edge,'pauldron rim');
        add(x,-6,39,8,13,9,metal,'gauntlet');
        add(x,7,42,8,1,4,edge,'gauntlet trim');
      }
      for(const x of [-14,2])add(x,-8,32,12,18,8,metal,'hip plate');
      for(const x of [-12,3])add(x,5,17,9,3,11,metal,'greave');
      if(special) {
        add(-16,-13,35,32,3,31,'#6d639e','cape');add(-13,-14,20,26,3,16,'#6d639e','cape');
        for(const [x,color] of [[-12,'#8074b2'],[-3,'#61588f'],[7,'#8074b2']])add(x,-16,24,5,2,37,color,'cape fold');
        add(-13,-16,20,26,2,3,'#c8b481','cape hem');
        add(-3,-18,45,6,2,13,'#d6c48f','cape crest');add(-7,-18,49,14,2,5,'#d6c48f','cape crest');
        add(-14,-12,89,28,26,4,metal,'circlet');add(-3,14,89,6,3,7,'#e4ce80','moon crest');
        add(-25,-8,66,5,18,5,edge,'shoulder ornament');add(20,-8,66,5,18,5,edge,'shoulder ornament');
      } else {
        add(-13,-12,47,26,3,12,shade(metal,.83),'back plate');
        add(-11,-13,50,22,1,4,edge,'back trim');
      }
    }
  } else {
    // Cross-body strap and a little satchel, rather than a flat colored torso.
    for(let i=0;i<6;i++)add(-11+i*4,9,59-i*3,4,2,5,leather,'satchel strap');
    add(12,0,39,6,10,13,leather,'satchel');add(13,1,50,6,10,3,trim,'satchel flap');
  }
  if(weapon) {
    const special=weapon.tier==='special',large=weapon.tier==='large',blade=special?'#c9c2f3':large?'#a7bab9':'#c0c8c9';
    const length=special?48:large?43:36,x=22,y=5;
    add(x,-1,28,4,5,14,'#5b4540','sword grip');
    add(x-1,-2,27,6,7,4,special?'#b59de3':trim,'pommel');
    add(x-6,-3,41,16,9,4,special?'#d5b66f':trim,'crossguard');
    add(x-1,0,45,6,4,length,blade,'blade');
    add(x+1,4,46,2,1,length-2,shade(blade,1.18),'blade ridge');
    add(x,0,45+length,4,4,5,blade,'sword point');
    add(x+1,1,50+length,2,2,3,blade,'sword tip');
    if(large||special){add(x-4,-2,45,12,8,5,special?'#a899d9':'#7d9990','blade shoulders');}
    if(special)for(const z of [56,67,78])add(x,5,z,4,1,3,'#e8d69b','blade rune');
  }
  return boxes;
}

const scenes=new Map();
const portraits=new Map();
const faceParts=new Set(['head','ear','eye','eye glint','brow','nose','mouth','cheek','hair crown','hair back','hair side','fringe','braid','hair tie','swept hair','side fringe']);
export function avatarFaceArt(appearance=DEFAULT_APPEARANCE){
  const look={...DEFAULT_APPEARANCE,...appearance},key=JSON.stringify(look);
  if(portraits.has(key))return portraits.get(key);
  const head=avatarGeometry(null,null,look).filter(b=>faceParts.has(b.part)&&b.z+b.h>71)
    .map(b=>b.z<71?{...b,z:71,h:b.z+b.h-71}:b);
  const faces=visibleCuboidFaces(createCuboidScene(head),-.45),points=faces.flatMap(f=>f.projected);
  const minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0]));
  const minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]));
  const size=Math.max(maxX-minX,maxY-minY)+6,x=(minX+maxX-size)/2,y=(minY+maxY-size)/2;
  const art=`<svg xmlns="http://www.w3.org/2000/svg" class="avatar-face" viewBox="${x.toFixed(2)} ${y.toFixed(2)} ${size.toFixed(2)} ${size.toFixed(2)}" aria-hidden="true" focusable="false">${faces.map(f=>`<polygon points="${f.projected.map(p=>p.map(n=>n.toFixed(2)).join(',')).join(' ')}" fill="${shade(f.color,f.light)}" data-part="${f.part}"/>`).join('')}</svg>`;
  if(portraits.size>=16)portraits.delete(portraits.keys().next().value);
  portraits.set(key,art);return art;
}
export function avatarArt(weapon=null,armor=null,large=false,{angle=-.45,appearance=DEFAULT_APPEARANCE}={}) {
  const look={...DEFAULT_APPEARANCE,...appearance},key=JSON.stringify([weapon?.tier,armor?.tier,look]);
  let scene=scenes.get(key);
  if(!scene){scene=createCuboidScene(avatarGeometry(weapon,armor,look));if(scenes.size>=16)scenes.delete(scenes.keys().next().value);scenes.set(key,scene);}
  const faces=visibleCuboidFaces(scene,angle);
  const label=`Your voxel adventurer${armor?' wearing armor':''}${weapon?' holding a sword':''}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="voxel-art avatar-art ${large?'large':''}" viewBox="0 0 240 260" role="img" aria-label="${label}" data-angle="${angle.toFixed(3)}"><ellipse cx="120" cy="229" rx="64" ry="13" fill="currentColor" opacity=".07"/>${faces.map(f=>`<polygon points="${f.projected.map(p=>p.map(n=>n.toFixed(2)).join(',')).join(' ')}" fill="${shade(f.color,f.light)}" data-part="${f.part}"/>`).join('')}</svg>`;
}
