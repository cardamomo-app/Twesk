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

// A small original display alphabet: chamfered faces with shallow, directional extrusion.
// Numerals stay upright and crisp; the degree mark and unit share the same cut and depth.
const temperatureGlyphs = {
  '0': '3,0 13,0 16,3 16,23 13,26 3,26 0,23 0,3|5,6 5,20 6,21 10,21 11,20 11,6 10,5 6,5',
  '1': '3,5 9,0 13,0 13,21 16,21 16,26 3,26 3,21 8,21 8,7 3,10',
  '2': '0,3 3,0 13,0 16,3 16,11 5,21 16,21 16,26 0,26 0,20 11,10 11,6 10,5 6,5 5,6 5,9 0,9',
  '3': '0,0 13,0 16,3 16,10 13,13 16,16 16,23 13,26 0,26 0,21 10,21 11,20 11,16 10,15 4,15 4,10 10,10 11,9 11,6 10,5 0,5',
  '4': '0,0 5,0 5,10 11,10 11,0 16,0 16,26 11,26 11,15 0,15',
  '5': '0,0 16,0 16,5 5,5 5,10 13,10 16,13 16,23 13,26 0,26 0,21 10,21 11,20 11,16 10,15 0,15',
  '6': '3,0 15,0 15,5 6,5 5,6 5,10 13,10 16,13 16,23 13,26 3,26 0,23 0,3|5,15 5,21 11,21 11,15',
  '7': '0,0 16,0 16,5 9,26 3,26 10,5 0,5',
  '8': '3,0 13,0 16,3 16,10 13,13 16,16 16,23 13,26 3,26 0,23 0,16 3,13 0,10 0,3|5,5 5,10 11,10 11,5|5,16 5,21 11,21 11,16',
  '9': '3,0 13,0 16,3 16,23 13,26 1,26 1,21 10,21 11,20 11,16 3,16 0,13 0,3|5,5 5,11 11,11 11,5',
  '-': '0,11 10,11 10,16 0,16',
  '—': '0,11 14,11 14,16 0,16',
  '°': '2,0 6,0 8,2 8,6 6,8 2,8 0,6 0,2|2.5,2.5 2.5,5.5 5.5,5.5 5.5,2.5',
  C: '3,0 16,0 16,5 6,5 5,6 5,20 6,21 16,21 16,26 3,26 0,23 0,3',
  F: '0,0 16,0 16,5 5,5 5,10 13,10 13,15 5,15 5,26 0,26',
};
function temperatureGlyph(character, x, y = 0, scale = 1) {
  const rings = temperatureGlyphs[character].split('|').map(ring => ring.split(' ').map(point => point.split(',').map(Number)));
  const path = rings.map(points => `M${points.map(p => p.join(',')).join('L')}Z`).join('');
  const sides = [], light = [];
  for (const points of rings) for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const facing = (b[1] - a[1]) * 1.6 - (b[0] - a[0]) * 2;
    if (facing > 0) sides.push(`<polygon points="${[a, b, [b[0] + 1.6, b[1] + 2], [a[0] + 1.6, a[1] + 2]].map(p => p.join(',')).join(' ')}" class="${b[1] > a[1] ? 'temperature-side' : 'temperature-depth'}"/>`);
    else if (facing < 0) light.push(`M${a.join(',')}L${b.join(',')}`);
  }
  return `<g transform="translate(${x} ${y}) scale(${scale})">${sides.join('')}<path d="${path}" fill-rule="evenodd" class="temperature-face"/><path d="${light.join('')}" class="temperature-bevel"/></g>`;
}
export function temperatureArt(value, unit = 'C') {
  const number = /^-?\d{1,3}°$/.test(value) ? value.slice(0, -1) : '—';
  let x = 1, art = '';
  for (const character of number) {
    art += temperatureGlyph(character, x, 1);
    x += character === '-' ? 14 : character === '—' ? 18 : 20;
  }
  x -= 3;
  if (number !== '—') { art += temperatureGlyph('°', x, 1, .8); x += 10; }
  art += temperatureGlyph(unit === 'F' ? 'F' : 'C', x, 11.92, .58);
  const width = x + 12;
  return `<svg class="weather-temperature-art" viewBox="0 0 ${width} 31" width="${width}" height="31" aria-hidden="true">${art}</svg>`;
}
