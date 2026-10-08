// Axis-aligned binary space partitioning. Splitting faces at world-space planes
// gives a correct painter order even when solids overlap or span one another.
const EPS=1e-8;
export const CAMERA_RISE=.70/1.65;
export function projectPoint([x,y,z],angle){
  return [120+(x*Math.cos(angle)-y*Math.sin(angle))*1.65,215+(x*Math.sin(angle)+y*Math.cos(angle))*.70-z*1.65];
}
function bounds(points){return [0,1,2].map(axis=>[Math.min(...points.map(p=>p[axis])),Math.max(...points.map(p=>p[axis]))]);}
function fragment(face,points){return {...face,points,bounds:bounds(points)};}
function split(face,axis,value){
  const negative=[],positive=[],points=face.points;
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],da=a[axis]-value,db=b[axis]-value;
    if(da<=EPS)negative.push(a);if(da>=-EPS)positive.push(a);
    if((da<-EPS&&db>EPS)||(da>EPS&&db<-EPS)){
      const t=da/(da-db),p=a.map((v,j)=>v+(b[j]-v)*t);p[axis]=value;
      negative.push(p);positive.push(p);
    }
  }
  return [fragment(face,negative),fragment(face,positive)];
}
function build(faces){
  if(!faces.length)return null;
  const planes=[...new Map(faces.map(f=>[`${f.axis}:${f.value}`,[f.axis,f.value]])).values()];
  let best=null,score=Infinity;
  // A bounded set of candidates keeps scene construction cheap. The resulting
  // tree is cached; rotating only traverses it and projects the visible faces.
  const stride=Math.max(1,Math.floor(planes.length/40));
  for(let i=0;i<planes.length;i+=stride){
    const [axis,value]=planes[i];let negative=0,positive=0,cuts=0;
    for(const face of faces){const [lo,hi]=face.bounds[axis];if(lo<value-EPS)negative++;if(hi>value+EPS)positive++;if(lo<value-EPS&&hi>value+EPS)cuts++;}
    const cost=Math.max(negative,positive)+cuts*1.5;
    if(cost<score){best=[axis,value];score=cost;}
  }
  const [axis,value]=best,negative=[],positive=[],coplanar=[];
  for(const face of faces){
    const [lo,hi]=face.bounds[axis];
    if(lo>=value-EPS&&hi<=value+EPS)coplanar.push(face);
    else if(hi<=value+EPS)negative.push(face);
    else if(lo>=value-EPS)positive.push(face);
    else {const [a,b]=split(face,axis,value);negative.push(a);positive.push(b);}
  }
  // Model declaration order resolves coplanar details, such as boot soles.
  coplanar.sort((a,b)=>a.order-b.order);
  return {axis,value,faces:coplanar,negative:build(negative),positive:build(positive)};
}
export function createCuboidScene(boxes){
  const faces=[];
  boxes.forEach((box,order)=>{
    const {x,y,z,w,d,h,color,part}=box,X=x+w,Y=y+d,Z=z+h;
    const add=(axis,value,sign,points,light)=>faces.push({axis,value,normal:[0,1,2].map(a=>a===axis?sign:0),points,bounds:bounds(points),color,light,part,order});
    add(2,Z,1,[[x,y,Z],[X,y,Z],[X,Y,Z],[x,Y,Z]],1.14);
    add(2,z,-1,[[x,y,z],[x,Y,z],[X,Y,z],[X,y,z]],.65);
    add(0,x,-1,[[x,y,z],[x,Y,z],[x,Y,Z],[x,y,Z]],.78);
    add(0,X,1,[[X,y,z],[X,y,Z],[X,Y,Z],[X,Y,z]],.93);
    add(1,y,-1,[[x,y,z],[x,y,Z],[X,y,Z],[X,y,z]],.84);
    add(1,Y,1,[[x,Y,z],[X,Y,z],[X,Y,Z],[x,Y,Z]],1);
  });
  return build(faces);
}
export function visibleCuboidFaces(scene,angle){
  const direction=[Math.sin(angle),Math.cos(angle),CAMERA_RISE],result=[];
  const walk=node=>{
    if(!node)return;
    const positive=direction[node.axis]>=0;
    walk(positive?node.negative:node.positive);
    for(const face of node.faces)if(face.normal.reduce((sum,n,i)=>sum+n*direction[i],0)>EPS)result.push({...face,projected:face.points.map(p=>projectPoint(p,angle))});
    walk(positive?node.positive:node.negative);
  };
  walk(scene);return result;
}
