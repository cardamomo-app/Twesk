// Named, local line icons shared by the habit picker and saved habit rows.
export const HABIT_ICONS=[
  {id:'category',label:'Category default',path:''},
  {id:'water',label:'Water',path:'<path d="M12 3C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-12Z"/><path d="M8 15a4 4 0 0 0 4 4"/>'},
  {id:'leaf',label:'Nature',path:'<path d="M20 3c0 13-4 17-11 14C3 14 6 5 20 3ZM4 21 17 8"/>'},
  {id:'moon',label:'Sleep',path:'<path d="M20 14a8 8 0 0 1-10-10 8 8 0 1 0 10 10Z"/>'},
  {id:'food',label:'Food',path:'<path d="M4 3v6a3 3 0 0 0 6 0V3M7 3v18M18 3c-3 3-3 7 0 9h2V3ZM20 12v9"/>'},
  {id:'body',label:'Exercise',path:'<path d="M4 8v8m3-10v12m10-12v12m3-10v8M7 12h10"/>'},
  {id:'walk',label:'Walking',path:'<circle cx="13" cy="4" r="2"/><path d="m7 12 3-4 4 1 3 4h3M12 9l-2 6-5 5m5-5 5 2 2 4"/>'},
  {id:'sun',label:'Sunlight',path:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>'},
  {id:'mind',label:'Reading',path:'<path d="M4 5h6l2 2 2-2h6v14h-6l-2 2-2-2H4ZM12 7v14"/>'},
  {id:'pencil',label:'Writing',path:'<path d="m16 3 5 5L8 21H3v-5ZM13 6l5 5"/>'},
  {id:'brush',label:'Art',path:'<path d="m14 11 6-8 1 1-5 9ZM14 11l2 2M13 13c-5-2-3 6-9 6 5 4 12 0 11-4Z"/>'},
  {id:'music',label:'Music',path:'<path d="M9 17V5l11-2v12M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>'},
  {id:'language',label:'Languages',path:'<path d="M3 5h11M8 3v2M5 5c0 6 5 9 8 10M12 5c0 6-5 9-9 10M14 21l4-11 4 11M16 17h4"/>'},
  {id:'code',label:'Coding',path:'<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/>'},
  {id:'soul',label:'Mindfulness',path:'<path d="M12 3c1 5 4 8 9 9-5 1-8 4-9 9-1-5-4-8-9-9 5-1 8-4 9-9Z"/>'},
  {id:'heart',label:'Care',path:'<path d="M20 5c-3-3-7-1-8 1-1-2-5-4-8-1-5 5 3 11 8 15 5-4 13-10 8-15Z"/>'},
  {id:'people',label:'Connection',path:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 4a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 5v2"/>'},
  {id:'smile',label:'Joy',path:'<circle cx="12" cy="12" r="9"/><path d="M8 9v1m8-1v1m-9 4c2 5 8 5 10 0"/>'},
  {id:'plant',label:'Growth',path:'<path d="M12 21V10M12 14C5 14 3 11 3 6c6 0 9 2 9 8ZM12 10c0-5 3-7 9-7 0 5-3 7-9 7ZM6 21h12"/>'},
  {id:'coffee',label:'Coffee',path:'<path d="M4 8h13v8a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5ZM17 9h2a3 3 0 0 1 0 6h-2M7 3v2m4-3v3m4-2v2"/>'},
  {id:'phone',label:'Phone',path:'<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 5h4m-3 14h2"/>'},
  {id:'bed',label:'Rest',path:'<path d="M3 19V6m18 13V9M3 15h18M3 10h5V6H3m5 4h13v5M3 19v2m18-2v2"/>'},
  {id:'star',label:'Star',path:'<path d="m12 2 3 7 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1Z"/>'},
  {id:'harm',label:'Harm',path:'<path d="m13 2-8 12h6l-1 8 9-13h-7Z"/>'},
];
export const validHabitIcon=value=>HABIT_ICONS.some(i=>i.id===value);
export function habitIconChoice(habit){
  if(validHabitIcon(habit.icon))return habit.icon;
  // Keep existing saves' water/nature icon and category defaults until edited.
  return habit.category!=='harm'&&habit.title.toLowerCase().includes('water')?'leaf':'category';
}
export function resolvedHabitIcon(habit){
  const choice=habitIconChoice(habit);return choice==='category'?habit.category:choice;
}
