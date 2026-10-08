const symbols={
  journey:'<path d="m55 29 5 12 13 5-13 5-5 13-5-13-13-5 13-5Z"/>',
  tasks:'<path d="M40 32h30v32H40Z"/><path d="m46 47 6 6 13-15M47 59h16"/>',
  body:'<path d="M34 43v14m6-20v26m30-26v26m6-20v14M40 50h30"/>',
  mind:'<path d="M34 35h14l7 5 7-5h14v28H62l-7 5-7-5H34ZM55 40v28"/>',
  soul:'<path d="m55 28 6 16 16 6-16 6-6 16-6-16-16-6 16-6Z"/><path d="M39 30h1m32 36h1"/>',
  heart:'<path d="M55 66 37 49c-15-18 10-27 18-12 8-15 33-6 18 12Z"/>',
  monsters:'<path d="m38 33 4 10-3 10 5 11h22l5-11-3-10 4-10-13 7H51ZM46 48v6m18-6v6M50 59h10"/>',
  vault:'<path d="M35 36h40v29H35ZM33 31h44v7H33ZM50 47h10v10H50Z"/>',
  journal:'<path d="M36 31h34v36H36ZM42 31v36M48 40h14m-14 8h9m2 12 15-15 5 5-15 15-7 2Z"/>',
};
const metals=[null,['#d4b08a','#a77b53','#f4d6ad'],['#b8c8d4','#7d91a2','#e3edf1'],['#e1c373','#b28e41','#fff1b0'],['#bfa7e0','#8e6bb6','#e9d7ff']];
const inks={journey:'#8270ad',tasks:'#9a8564',body:'#789b86',mind:'#7398b4',soul:'#9c82b9',heart:'#bd8396',monsters:'#9a7967',vault:'#9d8b70',journal:'#8b89ad'};
export function badgeArt(badge,earned=false){
  const [metal,edge,shine]=metals[badge.tier],ink=inks[badge.group];
  return `<svg class="seal-art ${earned?'earned':'unearned'}" viewBox="0 0 110 116" aria-hidden="true"><ellipse cx="55" cy="105" rx="29" ry="5" fill="currentColor" opacity=".06"/><path d="m30 72-8 28 13-4 8 10 9-27m28-7 8 28-13-4-8 10-9-27" fill="${ink}"/><path d="m26 94 8-18m50 18-8-18" stroke="#fff" opacity=".25" stroke-width="2"/><path d="M55 5 66 11 79 11 85 22 96 29 95 43 101 54 95 65 95 78 83 84 76 95 63 94 55 100 44 94 31 95 24 84 13 78 14 65 8 54 14 43 14 29 25 22 31 11 44 11Z" fill="${edge}"/><path d="M55 8 66 14 77 14 83 25 92 31 91 44 97 54 91 64 91 76 80 81 74 91 62 90 55 96 45 90 33 91 27 81 17 76 18 64 12 54 18 44 18 31 28 25 34 14 45 14Z" fill="${metal}"/><path d="m25 28 12-10 10 0 8-5 10 5h9" fill="none" stroke="${shine}" stroke-width="3"/><path d="M55 23 79 35v31L55 81 31 66V35Z" fill="${ink}"/><path d="m55 27 20 10v26L55 76 35 63V37Z" fill="none" stroke="${shine}" stroke-width="1" opacity=".6"/><g fill="none" stroke="${shine}" stroke-width="3" stroke-linecap="square" stroke-linejoin="miter">${symbols[badge.group]}</g><g fill="${shine}">${Array.from({length:Math.min(3,badge.tier)},(_,i)=>{const x=55+(i-(Math.min(3,badge.tier)-1)/2)*10;return `<path d="m${x} 83 3 3-3 3-3-3Z"/>`;}).join('')}</g></svg>`;
}
