// Victory-chance estimates, computed off the main thread and cached by the combat-relevant state.
import * as E from './engine.js?v=0.41.2';
const worker = new Worker('./combat-worker.js?v=0.41.2', { type: 'module' });
const cache = new Map(),
  waiting = new Map();
worker.onmessage = ({ data }) => {
  const chance = data.error ? null : data.chance;
  if (cache.size > 300) cache.clear();
  cache.set(data.key, chance);
  for (const resolve of waiting.get(data.key) || []) resolve(chance);
  waiting.delete(data.key);
};
export const oddsKey = s => JSON.stringify(E.oddsInput(s));
// Resolves to a 0–1 chance, or null if it could not be computed.
export function requestOdds(s) {
  const input = E.oddsInput(s),
    key = JSON.stringify(input);
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  return new Promise(resolve => {
    if (!waiting.has(key)) {
      waiting.set(key, []);
      worker.postMessage({ state: input, key });
    }
    waiting.get(key).push(resolve);
  });
}
export const percent = chance => (chance === null ? '—' : Math.round(chance * 100) + '%');
