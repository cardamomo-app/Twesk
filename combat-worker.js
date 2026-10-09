import { estimateOdds } from './engine.js?v=0.12.1';
self.onmessage = ({data:{state,key}}) => {
  try { self.postMessage({key,chance:estimateOdds(state)}); }
  catch(error) { self.postMessage({key,error:error.message}); }
};
