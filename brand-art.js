// The approved faceted flame: base width 30, depth 8. Shared by the header and icon builder.
export const FLAME_VIEWBOX = '0 0 100 111';
export const FLAME_FACES = [
  { points: [[35,88],[50,82],[65,88],[50,95]], color: '#a28d94' },
  { points: [[35,88],[50,95],[50,107],[39,101]], color: '#78616d' },
  { points: [[50,95],[65,88],[61,101],[50,107]], color: '#554353' },
  { points: [[50,6],[13,48],[50,58]], color: '#ee5947' },
  { points: [[50,6],[50,58],[87,48]], color: '#d74437' },
  { points: [[13,48],[50,58],[50,90]], color: '#d94335' },
  { points: [[50,58],[87,48],[50,90]], color: '#ac2f2c' },
  { points: [[51,37],[67,55],[50,75],[34,56]], color: '#ef7c42' },
  { points: [[51,37],[50,75],[67,55]], color: '#e76836' },
  { points: [[29,52.3],[37,44.3],[46,54.3],[65,34.3],[73,41.3],[46,70.3]], color: '#dd9f34' },
  { points: [[29,51],[37,43],[46,53],[65,33],[73,40],[46,69]], color: '#ffe28a' },
];
const faces = () => FLAME_FACES.map(({ points, color }) => `<polygon points="${points.map(p => p.join(',')).join(' ')}" fill="${color}" stroke="${color}" stroke-width=".3" stroke-linejoin="round"/>`).join('');
export function flameArt() {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="flame-logo" viewBox="${FLAME_VIEWBOX}" aria-hidden="true">${faces()}</svg>`;
}
export function appIconArt(maskable = false) {
  // The flame stays entirely inside the maskable safe circle (radius 40% of the tile).
  const size = 512 * .84, scale = (size - 2) / 111;
  const x = (512 - 100 * scale) / 2, y = (512 - size) / 2 + 1;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512"${maskable ? '' : ' rx="112"'} fill="#fffdfa"/><g transform="translate(${x.toFixed(5)} ${y.toFixed(5)}) scale(${scale.toFixed(5)})">${faces()}</g></svg>\n`;
}
export function pinnedIconArt() {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 111"><path fill="#000" fill-rule="evenodd" d="M50 6 87 48 50 90 13 48ZM29 51 37 43 46 53 65 33 73 40 46 69Z"/><path fill="#000" d="M35 88 50 82 65 88 61 101 50 107 39 101Z"/></svg>\n';
}
