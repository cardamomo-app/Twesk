export {avatarArt,avatarFaceArt} from './avatar-model.js?v=0.42.1';
export {itemArt,petArt,petMouth} from './equipment-art.js?v=0.42.1';
export {monsterArt,monsterName,monsterInfo,MONSTERS} from './monster-art.js?v=0.42.1';
// Beveled, square coins: shallow voxel discs with lit tops and shaded edges.
export function goldArt(amount=4,single=false) {
  const coin=(x,y)=>`<g transform="translate(${x} ${y})"><path d="M-10-2-5-5H5l5 3v4L5 5H-5l-5-3Z" fill="#a76c21"/><path d="M0 0 10-2v4L5 5H0Z" fill="#bc822c"/><path d="M-10-2-5-6H5l5 4L5 2H-5Z" fill="#f5cf65"/><path d="m-6-2 3-2h6l3 2-3 2h-6Z" fill="#e6b644"/><path d="m-5-5 2-1h6" fill="none" stroke="#fff0b0" stroke-width="1.5"/><path d="M0-3v3" stroke="#ffe394" stroke-width="1.5"/></g>`;
  if(single)return `<svg class="voxel-gold voxel-coin" viewBox="-12 -8 24 16" aria-hidden="true">${coin(0,0)}</svg>`;
  const size=amount>=40?3:amount>=18?2:amount>=10?1:0;
  const stacks=[{x:25,y:25,n:size+2},{x:13,y:32,n:size?2:1},{x:39,y:33,n:size+1}];
  const pieces=stacks.map(({x,y,n})=>Array.from({length:n},(_,i)=>coin(x,y-i*4)).join('')).join('');
  return `<svg class="voxel-gold gold-pile" viewBox="0 0 54 44" aria-hidden="true"><ellipse cx="27" cy="37" rx="23" ry="4" fill="#8f641c" opacity=".12"/>${pieces}</svg>`;
}
