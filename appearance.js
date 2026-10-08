export const APPEARANCE = {
  skin: [{id:'warm',name:'Warm',color:'#dcaa83'},{id:'light',name:'Light',color:'#f2cdb0'},{id:'olive',name:'Olive',color:'#bd906c'},{id:'brown',name:'Brown',color:'#916246'},{id:'deep',name:'Deep',color:'#634333'}],
  hair: [{id:'umber',name:'Umber',color:'#493a37'},{id:'ink',name:'Ink',color:'#292d3c'},{id:'copper',name:'Copper',color:'#a65636'},{id:'gold',name:'Gold',color:'#d5ad62'},{id:'silver',name:'Silver',color:'#c1c9d5'}],
  outfit: [{id:'sage',name:'Sage',color:'#60877c'},{id:'iris',name:'Iris',color:'#8976be'},{id:'rust',name:'Rust',color:'#b96950'},{id:'ocean',name:'Ocean',color:'#527c9b'},{id:'rose',name:'Rose',color:'#ac718b'}],
  style: [{id:'swept',name:'Swept'},{id:'crop',name:'Cropped'},{id:'braids',name:'Braids'}],
};
export const DEFAULT_APPEARANCE = {skin:'warm',hair:'umber',outfit:'sage',style:'swept'};
export const validAppearance = value => !!value && Object.entries(APPEARANCE).every(([key,options])=>options.some(o=>o.id===value[key]));
