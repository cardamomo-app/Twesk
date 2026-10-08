// A handful of coins landing: short, irregular metallic impacts and ringing
// overtones. Shares the reward audio context and its existing mute handling.
export function playCoinSound(context) {
  const start=context.currentTime;
  const landings=[0,.068,.143,.231,.348,.472];
  const pitches=[1,1.13,.92,1.06,.98,1.19];
  landings.forEach((delay,index)=>{
    const t=start+delay,volume=.024*(1-index*.105),base=2380*pitches[index];
    [1,1.47,2.09,2.73].forEach((ratio,partial)=>{
      const oscillator=context.createOscillator(),gain=context.createGain(),duration=.12+partial*.025;
      oscillator.type='sine';oscillator.frequency.setValueAtTime(base*ratio,t);
      oscillator.frequency.exponentialRampToValueAtTime(base*ratio*.985,t+.035);
      gain.gain.setValueAtTime(.0001,t);gain.gain.linearRampToValueAtTime(volume/(1+partial),t+.002);
      gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
      oscillator.connect(gain);gain.connect(context.destination);
      oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
      oscillator.start(t);oscillator.stop(t+duration+.01);
    });
    const buffer=context.createBuffer(1,Math.ceil(context.sampleRate*.025),context.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length)**3;
    const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();
    source.buffer=buffer;filter.type='highpass';filter.frequency.value=1800;gain.gain.value=volume*.7;
    source.connect(filter);filter.connect(gain);gain.connect(context.destination);
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};source.start(t);
  });
}
