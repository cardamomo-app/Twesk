// Character appearance options. Options with a price are unlocked with gold (see wardrobe in engine.js).
export const APPEARANCE = {
  skin: [{id:'warm',name:'Warm',color:'#dcaa83'},{id:'light',name:'Light',color:'#f2cdb0'},{id:'olive',name:'Olive',color:'#bd906c'},{id:'brown',name:'Brown',color:'#916246'},{id:'deep',name:'Deep',color:'#634333'}],
  hair: [{id:'umber',name:'Umber',color:'#493a37'},{id:'ink',name:'Ink',color:'#292d3c'},{id:'copper',name:'Copper',color:'#a65636'},{id:'gold',name:'Gold',color:'#d5ad62'},{id:'silver',name:'Silver',color:'#c1c9d5'},
    {id:'rose',name:'Rose',color:'#c97a95',price:40},{id:'teal',name:'Teal',color:'#4f9c98',price:40},{id:'violet',name:'Violet',color:'#7b62b5',price:60}],
  outfit: [{id:'sage',name:'Sage',color:'#60877c'},{id:'iris',name:'Iris',color:'#8976be'},{id:'rust',name:'Rust',color:'#b96950'},{id:'ocean',name:'Ocean',color:'#527c9b'},{id:'rose',name:'Rose',color:'#ac718b'},
    {id:'midnight',name:'Midnight',color:'#2f3550',price:40},{id:'crimson',name:'Crimson',color:'#9c3a3f',price:40},{id:'gilded',name:'Gilded',color:'#c4a046',price:80}],
  style: [{id:'swept',name:'Swept'},{id:'crop',name:'Cropped'},{id:'braids',name:'Braids'},
    {id:'bun',name:'Top bun',price:60},{id:'long',name:'Long',price:80},{id:'mohawk',name:'Mohawk',price:100}],
  beard: [{id:'none',name:'None'},{id:'stubble',name:'Stubble',price:30},{id:'mustache',name:'Mustache',price:45},{id:'full',name:'Full beard',price:70}],
  accessory: [{id:'none',name:'None'},{id:'earring',name:'Gold earring',price:40},{id:'flower',name:'Hair flower',price:45},{id:'glasses',name:'Round glasses',price:60},{id:'eyepatch',name:'Eyepatch',price:75}],
};
export const DEFAULT_APPEARANCE = {skin:'warm',hair:'umber',outfit:'sage',style:'swept',beard:'none',accessory:'none'};
export const APPEARANCE_LABELS = {skin:'Skin tone',hair:'Hair color',outfit:'Clothing',style:'Hair style',beard:'Facial hair',accessory:'Accessory'};
export const appearanceOption = (key,id) => APPEARANCE[key]?.find(o=>o.id===id);
// Saves from before beards and accessories simply use the defaults for those fields.
export const validAppearance = value => !!value && typeof value==='object' && Object.entries(APPEARANCE).every(([key,options])=>options.some(o=>o.id===({...DEFAULT_APPEARANCE,...value})[key]));
