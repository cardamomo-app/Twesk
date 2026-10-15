import { estimateOdds } from './engine.js?v=0.22.9';
self.onmessage = ({data:{state,key}}) => {
  try { self.postMessage({key,chance:estimateOdds(state)}); }
  catch(error) { self.postMessage({key,error:error.message}); }
};
