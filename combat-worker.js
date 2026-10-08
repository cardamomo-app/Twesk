import { victoryOdds, combatStats, monsterStats } from './engine.js?v=0.8.1';
self.onmessage = ({data:{state,key}}) => {
  try {
    const p=combatStats(state), m=monsterStats(state.monster.number);
    let chance;
    if(p.max<200 && m.hp<200) chance=victoryOdds(state);
    else {
      // Same battle rules; bounded sampling keeps high-level previews responsive.
      let wins=0, seed=123456789;
      const rng=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
      for(let i=0;i<15000;i++) {
        let hp=p.hp, enemy=m.hp, ready=true;
        while(hp>0&&enemy>0) {
          enemy-=10+2*Math.floor(rng()*13)+p.attack;
          if(enemy<=0) {wins++;break;}
          if(rng()<p.dodge) continue;
          hp-=Math.max(1,m.attack-10+2*Math.floor(rng()*11)-p.armor);
          if(hp>0&&ready&&p.rally&&hp<=p.max/2) {hp=Math.min(p.max,hp+p.rally);ready=false;}
        }
      }
      chance=wins/15000;
    }
    self.postMessage({key,chance});
  } catch(error) { self.postMessage({key,error:error.message}); }
};
