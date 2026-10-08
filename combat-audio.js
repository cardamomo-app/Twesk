// Short synthesized effects. All audio stays local and respects the mute setting.
export function createCombatAudio(isMuted) {
  let context;
  const nodes=new Set();
  function unlock(){try{context??=new(window.AudioContext||window.webkitAudioContext)();context.resume();}catch{}}
  function track(node){nodes.add(node);node.onended=()=>{nodes.delete(node);node.disconnect();};return node;}
  function tone(freq,end,duration,type='triangle',volume=.045,delay=0){
    const t=context.currentTime+delay,o=track(context.createOscillator()),g=context.createGain();
    o.type=type;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+duration);
    g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(volume,t+.018);g.gain.exponentialRampToValueAtTime(.0001,t+duration);
    o.connect(g);g.connect(context.destination);o.start(t);o.stop(t+duration+.02);
  }
  function noise(duration,frequency,volume=.06,type='bandpass'){
    const buffer=context.createBuffer(1,Math.ceil(context.sampleRate*duration),context.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);
    const source=track(context.createBufferSource()),filter=context.createBiquadFilter(),gain=context.createGain();
    source.buffer=buffer;filter.type=type;filter.frequency.value=frequency;filter.Q.value=.7;gain.gain.value=volume;
    source.connect(filter);filter.connect(gain);gain.connect(context.destination);source.start();
  }
  function play(kind){
    if(isMuted())return;unlock();if(!context)return;
    try {
      if(kind==='sword'){noise(.26,2600,.085,'highpass');tone(1100,380,.14,'sine',.018);}
      if(kind==='impact'){noise(.12,450,.10,'lowpass');tone(110,45,.16,'triangle',.065);}
      if(kind==='grunt'){tone(175,72,.24,'sawtooth',.022);tone(330,155,.19,'triangle',.012);noise(.16,700,.022);}
      if(kind==='block'){tone(1540,1450,.19,'sine',.045);tone(2230,2100,.12,'sine',.022);noise(.09,3000,.04);}
      if(kind==='deflect'){noise(.28,1500,.045);tone(420,1120,.24,'sine',.035);}
      if(kind==='heal'){[440,554,660].forEach((f,i)=>tone(f,f,.32,'sine',.035,i*.11));}
      if(kind==='victory'){[523,659,784,1047].forEach((f,i)=>tone(f,f,.4,'triangle',.035,i*.12));}
      if(kind==='defeat'){tone(165,65,.55,'triangle',.04);noise(.2,300,.025,'lowpass');}
    }catch{}
  }
  function stop(){for(const node of nodes){try{node.stop();}catch{}}nodes.clear();}
  return {unlock,play,stop};
}
