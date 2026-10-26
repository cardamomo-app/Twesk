// Original small faceted weather objects. No fonts, external images, or SVG IDs.
const cache = new Map();
const sun = '<path d="M36 7v5m0 26v5M18 25h5m26 0h5M23 12l4 4m18 18 4 4M23 38l4-4m18-18 4-4" fill="none" stroke="#dfac51" stroke-width="3"/><path d="m36 13 10 6v13l-10 6-10-6V19Z" fill="#efb94f"/><path d="m36 13 10 6-10 6-10-6Z" fill="#ffe18a"/><path d="m36 25 10-6v13l-10 6Z" fill="#dba047"/>';
const moon = '<path d="m34 7 8 5-7 6v12l11 7-8 6-15-9V16Z" fill="#bac5e2"/><path d="m34 7 8 5-7 6-8-4Z" fill="#e7eafa"/><path d="m35 30 11 7-8 6-15-9 7-4Z" fill="#95a4c8"/><path d="M48 12h4v4h-4Zm-4 37h3v3h-3Z" fill="#d5bd7e"/>';
const cloud = '<path d="M10 34h7V25h10v-8h14v8h10v9h6v15H10Z" fill="#dce6ed"/><path d="m10 34 5-4h7v-9h10v-8h14l-5 4H27v8H17v9Z" fill="#f7fafb"/><path d="m41 17 5-4v8h10l-5 4H41Zm10 17 5-4h6v15l-5 4V34Z" fill="#a8becf"/><path d="M17 41h34v8H17Z" fill="#c5d6e2"/>';
const drop = (x, y, color = '#78b5d9') => `<path d="m${x} ${y} 4 7-4 4-4-4Z" fill="${color}"/><path d="m${x} ${y} 4 7-4 4Z" fill="#4a92be"/>`;
const flakes = '<path d="M20 52v9m-4-6 8 4m-8 0 8-4m18-3v9m-4-6 8 4m-8 0 8-4" fill="none" stroke="#8eb8d5" stroke-width="2"/>';
export function weatherArt(kind = 'cloud') {
  if (cache.has(kind)) return cache.get(kind);
  let art;
  if (kind === 'sun') art = sun;
  else if (kind === 'moon') art = moon;
  else if (kind === 'partly' || kind === 'partly-night') art = `<g transform="translate(6 -3) scale(.82)">${kind === 'partly' ? sun : moon}</g><g transform="translate(-1 9) scale(.9)">${cloud}</g>`;
  else if (kind === 'dew') art = '<path d="m8 43 19-14 27 4-20 18Z" fill="#9abb97"/><path d="m8 43 26 8 20-18-23 9Z" fill="#6f9b7e"/><path d="m31 8 14 23-4 11-10 6-11-6-4-11Z" fill="#92cbd9"/><path d="m31 8 14 23-4 11-10 6V26Z" fill="#5da6bd"/><path d="m24 27-3 7 3 5" fill="none" stroke="#d6f0ef" stroke-width="3"/>';
  else if (kind === 'range') art = '<path d="m27 7 10 5v28l7 5v10l-12 7-13-7V45l8-5Z" fill="#b8ccd7"/><path d="m27 7 10 5-7 4-3-2Z" fill="#edf4f5"/><path d="m37 12-7 4v29l-6 4v7l8 5 12-6V45l-7-5Z" fill="#8faeba"/><path d="M27 28h5v20h-5Zm-2 18h12v8H25Z" fill="#da9980"/>';
  else {
    art = cloud;
    if (kind === 'rain' || kind === 'drizzle') art = `<g transform="translate(1 -5)">${cloud}</g>` + [18, 32, 46].map((x, i) => drop(x, 46 + i % 2 * 3, kind === 'drizzle' ? '#a4c8da' : '#78b5d9')).join('');
    if (kind === 'snow') art = `<g transform="translate(1 -5)">${cloud}</g>` + flakes;
    if (kind === 'storm') art = `<g transform="translate(1 -6)">${cloud}</g><path d="m34 34-12 16h10l-5 14 19-22H35l5-8Z" fill="#e6b653"/><path d="m34 34-12 16h10l-5 14 12-18H29Z" fill="#ffe092"/>`;
    if (kind === 'fog') art = `<g transform="translate(0 -5)">${cloud}</g><path d="M10 51h35m-26 7h36" fill="none" stroke="#a5b7c4" stroke-width="3"/>`;
  }
  const svg = `<svg class="weather-art weather-art-${kind}" viewBox="0 0 64 68" fill="none" aria-hidden="true">${art}</svg>`;
  cache.set(kind, svg);
  return svg;
}
