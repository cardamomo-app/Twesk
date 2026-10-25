// Saved hues keep project identities stable; new tags draw from unused colors first.
export const TAG_COLORS = [
  { hue: 8, name: 'Coral', swatch: '#ee7967' },
  { hue: 32, name: 'Orange', swatch: '#f2a344' },
  { hue: 55, name: 'Gold', swatch: '#e6cf47' },
  { hue: 123, name: 'Leaf', swatch: '#66b96f' },
  { hue: 181, name: 'Teal', swatch: '#42b6b8' },
  { hue: 209, name: 'Blue', swatch: '#559cde' },
  { hue: 269, name: 'Violet', swatch: '#a87bdf' },
  { hue: 332, name: 'Rose', swatch: '#e275aa' },
];
export const TAG_HUES = TAG_COLORS.map(color => color.hue);
const hueDistance = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
const canonicalTag = tag => typeof tag === 'string' && /^#[\p{L}\p{N}\p{M}_-]+$/u.test(tag) && tag === tag.toLowerCase();
function hashTag(tag) {
  let hash = 2166136261;
  for (const letter of tag) hash = Math.imul(hash ^ letter.codePointAt(0), 16777619) >>> 0;
  return hash;
}
export function validTagColors(colors) {
  return colors !== null && typeof colors === 'object' && !Array.isArray(colors) && Object.keys(colors).length <= 50000 &&
    Object.entries(colors).every(([tag, hue]) => canonicalTag(tag) && Number.isInteger(hue) && hue >= 0 && hue < 360);
}
export function rememberTagColors(state, tagList, { legacy = false, random = Math.random } = {}) {
  state.tagColors ??= {};
  const ordered = [...new Set(tagList.map(tag => tag.toLowerCase()))];
  if (legacy) ordered.sort(); // Identical older saves migrate identically on every device.
  const used = new Set(Object.values(state.tagColors));
  for (const tag of ordered) {
    if (!canonicalTag(tag) || Object.hasOwn(state.tagColors, tag)) continue;
    let available = TAG_HUES.filter(hue => !used.has(hue));
    if (!available.length) {
      const unused = Array.from({ length: 360 }, (_, hue) => hue).filter(hue => !used.has(hue));
      // Beyond the curated palette, prefer hues farthest from their nearest neighbor.
      const gap = hue => Math.min(...[...used].map(other => Math.min(Math.abs(hue - other), 360 - Math.abs(hue - other))));
      const largest = unused.length ? Math.max(...unused.map(gap)) : 0;
      available = unused.filter(hue => gap(hue) === largest);
      if (!available.length) available = TAG_HUES;
    }
    if (!legacy && used.size) {
      const recent = Object.values(state.tagColors).slice(-2), last = recent.at(-1), previous = recent.length > 1 ? recent[0] : null;
      const distinct = hue => hueDistance(hue, last) >= 90 && (previous === null || hueDistance(hue, previous) >= 45);
      let choices = available.filter(distinct);
      if (!choices.length) {
        // Expand rather than finish a palette with two neighboring shades in a row.
        const unused = Array.from({ length: 360 }, (_, hue) => hue).filter(hue => !used.has(hue));
        const pool = unused.length ? unused : TAG_HUES;
        choices = pool.filter(distinct);
        if (!choices.length) choices = pool.filter(hue => hueDistance(hue, last) >= 90);
        if (!choices.length) {
          const farthest = Math.max(...pool.map(hue => hueDistance(hue, last)));
          choices = pool.filter(hue => hueDistance(hue, last) === farthest);
        }
      }
      const separation = hue => Math.min(...[...used].map(other => hueDistance(hue, other)));
      const best = Math.max(...choices.map(separation));
      available = choices.filter(hue => separation(hue) >= best - 8);
    }
    const index = legacy ? hashTag(tag) % available.length : Math.floor(random() * available.length);
    state.tagColors[tag] = available[index];
    used.add(available[index]);
  }
  return state.tagColors;
}
export function tagHue(state, tag) {
  const key = tag.toLowerCase();
  return state.tagColors?.[key] ?? TAG_HUES[hashTag(key) % TAG_HUES.length];
}
export function setTagColor(state, tag, hue) {
  const key = String(tag || '').toLowerCase();
  if (!canonicalTag(key) || !Number.isInteger(hue) || hue < 0 || hue >= 360) throw new Error('Choose a valid tag color.');
  state.tagColors ??= {};
  state.tagColors[key] = hue;
  return hue;
}
