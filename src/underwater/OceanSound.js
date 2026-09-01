import { soundscapeMix } from './OceanEcology.js';
import { seeded } from './WorldMath.js';

// Synthesized water, surf, reef transients and distant calls. No recordings,
// autoplay, microphones, network requests, or additional runtime dependencies.
export class OceanSound {
  constructor(app){
    this.app=app;this.enabled=false;this.volume=.35;this.random=seeded(8173);
    this.lastSnap=0;this.nextCall=0;this.voices=new Set();this.mix=soundscapeMix();
    this.onVisibility=()=>{if(document.hidden&&this.context)this.master.gain.setTargetAtTime(0,this.context.currentTime,.06);};
    document.addEventListener('visibilitychange',this.onVisibility);
    window.addEventListener('pagehide',()=>this.dispose(),{once:true});
  }
  create(){
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio)throw new Error('Audio is not available in this browser.');
    const context=this.context=new Audio();
    this.master=context.createGain();this.master.gain.value=0;
    const limiter=context.createDynamicsCompressor();limiter.threshold.value=-20;limiter.knee.value=16;limiter.ratio.value=8;
    this.master.connect(limiter);limiter.connect(context.destination);
    const buffer=context.createBuffer(2,context.sampleRate*7,context.sampleRate);
    for(let channel=0;channel<2;channel++){
      const data=buffer.getChannelData(channel);let brown=0;
      for(let i=0;i<data.length;i++){
        const white=this.random()*2-1;brown=(brown+.024*white)/1.024;
        // Fade the loop seam without a click; independent channels keep the
        // water broad without placing a source inside the listener's head.
        const edge=Math.min(1,i/2500,(data.length-1-i)/2500);
        data[i]=(white*.32+brown*1.8)*edge;
      }
    }
    this.noise=context.createBufferSource();this.noise.buffer=buffer;this.noise.loop=true;
    this.surfFilter=context.createBiquadFilter();this.surfFilter.type='lowpass';this.surfFilter.frequency.value=2200;
    this.waterFilter=context.createBiquadFilter();this.waterFilter.type='lowpass';this.waterFilter.frequency.value=440;
    this.surf=context.createGain();this.water=context.createGain();this.surf.gain.value=0;this.water.gain.value=0;
    this.noise.connect(this.surfFilter);this.surfFilter.connect(this.surf);this.surf.connect(this.master);
    this.noise.connect(this.waterFilter);this.waterFilter.connect(this.water);this.water.connect(this.master);this.noise.start();
    this.snapBuffer=context.createBuffer(1,Math.round(context.sampleRate*.05),context.sampleRate);
    const snap=this.snapBuffer.getChannelData(0);
    for(let i=0;i<snap.length;i++)snap[i]=(this.random()*2-1)*Math.exp(-i/(context.sampleRate*.0035));
  }
  async setEnabled(on){
    if(on){
      try{if(!this.context)this.create();await this.context.resume();}
      catch(error){this.enabled=false;this.context?.close().catch(()=>{});this.context=null;throw error;}
    }
    this.enabled=on;
    if(this.context&&!on)this.master.gain.setTargetAtTime(0,this.context.currentTime,.08);
    return on;
  }
  update(){
    if(!this.context||!this.enabled)return;
    const a=this.app,w=a.underwater,p=a.camera.position,depth=a.waterInterface.height-p.y;
    const origin=w.sites.get('reef').habitat.origin;
    const reef=Math.exp(-((p.x-origin[0])**2+(p.z-origin[1])**2)/6500)*w.settings.life;
    const whale=w.sites.get('blue').life.animals.find(animal=>animal.type==='whale');
    let proximity=0;
    if(whale){const pos=whale.mesh.position,site=w.sites.get('blue').habitat.origin;proximity=Math.max(0,1-Math.hypot(p.x-pos.x-site[0],p.y-pos.y,p.z-pos.z-site[1])/220);}
    const mix=this.mix=soundscapeMix({depth,wind:a.weather.state.windSpeed,storm:a.weather.state.storm,reef,whale:proximity,volume:this.volume,paused:a.paused,hidden:document.hidden});
    const t=this.context.currentTime,surge=.72+.28*Math.sin(a.time*.57+Math.sin(a.time*.17));
    this.master.gain.setTargetAtTime(mix.master,t,.18);
    this.surf.gain.setTargetAtTime(mix.surf*surge,t,.3);this.water.gain.setTargetAtTime(mix.water,t,.4);
    this.surfFilter.frequency.setTargetAtTime(mix.cutoff,t,.3);
    if(mix.master>0&&a.time-this.lastSnap>.14){
      this.lastSnap=a.time;
      if(this.random()<mix.reef*.35)this.snap(mix.reef,t);
    }
    if(mix.master>0&&mix.whale>.1&&a.time>this.nextCall){this.nextCall=a.time+18+this.random()*24;this.call(mix.whale,t);}
  }
  snap(strength,time){
    const c=this.context,source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain(),pan=c.createStereoPanner();
    source.buffer=this.snapBuffer;filter.type='highpass';filter.frequency.value=1300;
    gain.gain.value=.015*strength;pan.pan.value=this.random()*2-1;
    source.connect(filter);filter.connect(gain);gain.connect(pan);pan.connect(this.master);source.start(time);
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();pan.disconnect();};
  }
  call(strength,time){
    const c=this.context,osc=c.createOscillator(),overtone=c.createOscillator(),gain=c.createGain(),filter=c.createBiquadFilter();
    const length=3+this.random()*2,start=85+this.random()*60;
    osc.type='sine';overtone.type='sine';filter.type='lowpass';filter.frequency.value=620;
    osc.frequency.setValueAtTime(start,time);osc.frequency.exponentialRampToValueAtTime(start*1.7,time+length*.42);osc.frequency.exponentialRampToValueAtTime(start*.72,time+length);
    overtone.frequency.setValueAtTime(start*2.01,time);overtone.frequency.exponentialRampToValueAtTime(start*1.45,time+length);
    gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(.014*strength,time+.8);gain.gain.linearRampToValueAtTime(0,time+length);
    osc.connect(filter);overtone.connect(filter);filter.connect(gain);gain.connect(this.master);
    this.voices.add(osc);this.voices.add(overtone);osc.start(time);overtone.start(time);osc.stop(time+length+.05);overtone.stop(time+length+.05);
    osc.onended=()=>{this.voices.delete(osc);this.voices.delete(overtone);osc.disconnect();overtone.disconnect();filter.disconnect();gain.disconnect();};
  }
  dispose(){
    document.removeEventListener('visibilitychange',this.onVisibility);
    if(!this.context)return;
    this.enabled=false;this.noise.stop();for(const voice of this.voices)try{voice.stop();}catch{}
    this.context.close().catch(()=>{});this.context=null;
  }
}
