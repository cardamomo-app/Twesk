import test from 'node:test';
import assert from 'node:assert/strict';
import {avatarGeometry} from '../avatar-model.js';
import {DEFAULT_APPEARANCE} from '../appearance.js';
import {SHOP} from '../engine.js';
import {createCuboidScene,visibleCuboidFaces,CAMERA_RISE} from '../cuboid-renderer.js';

function contains(polygon,x,y){
  let sign=0;
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length];
    const cross=(b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]);
    if(Math.abs(cross)<1e-7)return false;
    if(sign&&Math.sign(cross)!==sign)return false;
    sign=Math.sign(cross);
  }
  return true;
}
// Independent ray/solid intersections are the reference, rather than another
// sorting algorithm. They catch a platform or torso painting over nearer gear.
function nearestBox(boxes,origin,direction){
  let winner=null;
  boxes.forEach((box,order)=>{
    const low=[box.x,box.y,box.z],high=[box.x+box.w,box.y+box.d,box.z+box.h];
    let entry=-Infinity,exit=Infinity;
    for(let axis=0;axis<3;axis++){
      if(Math.abs(direction[axis])<1e-9){if(origin[axis]<=low[axis]||origin[axis]>=high[axis])return;continue;}
      const a=(low[axis]-origin[axis])/direction[axis],b=(high[axis]-origin[axis])/direction[axis];
      entry=Math.max(entry,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));
    }
    if(exit-entry<1e-8)return;
    if(!winner||exit>winner.depth-1e-8)winner={order,part:box.part,depth:exit};
  });
  return winner;
}
function verify(boxes,angles,{left=62,right=182,top=35,bottom=238,step=6}={}){
  const scene=createCuboidScene(boxes),seen=new Set();
  for(const angle of angles){
    const faces=visibleCuboidFaces(scene,angle),c=Math.cos(angle),s=Math.sin(angle),direction=[s,c,CAMERA_RISE];
    for(let y=top+.37;y<bottom;y+=step)for(let x=left+.23;x<right;x+=step){
      const u=(x-120)/1.65,origin=[u*c,-u*s,(215-y)/1.65],expected=nearestBox(boxes,origin,direction);
      let actual=null;
      for(const face of faces)if(contains(face.projected,x,y))actual=face;
      if(!expected){assert.equal(actual,null);continue;}
      assert.ok(actual,`Missing ${expected.part} at ${angle}, ${x}, ${y}`);
      const depth=(actual.value-origin[actual.axis])/direction[actual.axis];
      assert.ok(Math.abs(depth-expected.depth)<1e-6,`${actual.part} hides ${expected.part} at angle ${angle.toFixed(3)} (${x},${y})`);
      assert.equal(actual.order,expected.order,`Wrong coplanar layer at ${angle}: ${actual.part} / ${expected.part}`);
      seen.add(actual.part);
    }
  }
  return seen;
}
test('overlapping surfaces render correctly even when their centers imply the wrong order',()=>{
  verify([
    {x:-30,y:-20,z:0,w:60,d:40,h:4,color:'#888888',part:'platform'},
    {x:-12,y:-6,z:4,w:9,d:16,h:12,color:'#333333',part:'left foot'},
    {x:3,y:-6,z:4,w:9,d:16,h:12,color:'#444444',part:'right foot'},
    {x:-13,y:-7,z:37,w:26,d:15,h:29,color:'#557766',part:'torso'},
    {x:-13,y:8,z:41,w:10,d:3,h:22,color:'#996633',part:'left vest'},
    {x:3,y:8,z:41,w:10,d:3,h:22,color:'#996633',part:'right vest'},
  ],Array.from({length:72},(_,i)=>i*Math.PI/36));
});
test('every character armor set matches independent visibility checks through a full rotation',()=>{
  for(const armor of [null,...SHOP.filter(i=>i.type==='armor')]){
    const boxes=avatarGeometry(SHOP.find(i=>i.id==='star'),armor,{...DEFAULT_APPEARANCE,style:'braids'});
    const seen=verify(boxes,Array.from({length:48},(_,i)=>i*Math.PI/24));
    assert.ok(seen.has('boot'));assert.ok(seen.has('boot cuff'));
    if(armor?.tier==='basic')assert.ok(seen.has('leather vest'));
  }
});
