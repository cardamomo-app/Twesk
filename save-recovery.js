import {freshState,validateState} from './engine.js?v=0.22.0';

export const SAVE_KEY='twesk.v1';
export const PREVIOUS_SAVE_KEY='twesk.v1.previous';
export function replaceSave(storage,currentRaw,next){
  const previous=storage.getItem(PREVIOUS_SAVE_KEY);
  storage.setItem(PREVIOUS_SAVE_KEY,currentRaw);
  try{storage.setItem(SAVE_KEY,JSON.stringify(next));}
  catch(error){
    try{if(previous===null)storage.removeItem(PREVIOUS_SAVE_KEY);else storage.setItem(PREVIOUS_SAVE_KEY,previous);}catch{}
    throw error;
  }
  return next;
}
export function resetProgress(storage,current,originalRaw=null){
  const next=freshState();next.revision=(current.revision||0)+1;
  return replaceSave(storage,originalRaw??JSON.stringify(current),next);
}
export function restorePreviousProgress(storage,current){
  const raw=storage.getItem(PREVIOUS_SAVE_KEY);
  if(!raw)throw new Error('There is no previous save to restore.');
  const next=validateState(JSON.parse(raw));
  next.revision=Math.max(current.revision||0,next.revision||0)+1;
  return replaceSave(storage,JSON.stringify(current),next);
}
