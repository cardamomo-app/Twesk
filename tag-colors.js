// Saved hues keep project identities stable; new tags draw from unused colors first.
export const TAG_HUES = [8, 32, 55, 88, 123, 155, 181, 209, 238, 269, 301, 332];
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
