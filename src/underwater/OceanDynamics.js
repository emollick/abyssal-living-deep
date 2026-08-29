import { clamp, smooth, SITE_ORIGINS } from './OceanDomain.js';

export const DEEP_SOURCE = { x: SITE_ORIGINS.deep[0], z: SITE_ORIGINS.deep[1] - 22, depth: 1420 };

export function pulseHeight(x, z, age, strength = 1) {
  if (age < 1.4 || age > 135.4 || strength <= 0) return 0;
  const r = Math.hypot(x-DEEP_SOURCE.x,z-DEEP_SOURCE.z);
  let height=0;
  for(let packet=0;packet<3;packet++){
    const t=age-1.4-packet*12;if(t<0||t>110)continue;
    const front=r-t*22;
    height+=Math.cos(front*.105)*Math.exp(-front*front/2100)*7.5*strength
      *Math.exp(-t*.018)*smooth(0,2,t)*(1-packet*.22);
  }
  return height;
}

export function flowAt(position, time, weather = {}, settings = {}, state = {}) {
  const depth=Math.max(0,-position.y),scale=settings.current??1;
  const wind=weather.windSpeed??5,storm=weather.storm??0,angle=weather.windAngle??0;
  const shelter=Math.exp(-depth/65),swell=(weather.swellHs??1)*0.022;
  const surface=(0.16+wind*0.018+storm*0.75)*shelter;
  const orbit=Math.sin(time*0.7+position.x*0.04+position.z*0.027)*swell*shelter;
  const x=position.x-DEEP_SOURCE.x,z=position.z-DEEP_SOURCE.z,r=Math.hypot(x,z);
  const plume=Math.exp(-r*r/(10000+depth*42))*(settings.upwelling??0.65);
  const flow={
    x: (Math.cos(angle)*surface+Math.sin(time*0.05+position.z*0.012)*0.055+orbit-z/Math.max(25,r)*plume*0.12)*scale,
    y: (Math.cos(time*0.72+position.x*0.06)*swell*shelter+plume*0.22*(0.4+depth/1420))*scale,
    z: (Math.sin(angle)*surface+Math.cos(time*0.04+position.x*0.01)*0.055+x/Math.max(25,r)*plume*0.12)*scale,
    mixing: (state.mixing??storm)*shelter,
  };
  for(const v of state.vortices||[]){
    if(v.w<.001)continue;
    const dx=position.x-v.x,dz=position.z-v.y,r=Math.max(1,Math.hypot(dx,dz)),R=Math.max(1,v.z);
    const envelope=Math.exp(-r*r/(R*R*3))*Math.exp(-depth/(R*1.8))*scale;
    flow.x-=dz/r*v.w*.08*envelope;flow.y-=v.w*.028*envelope;flow.z+=dx/r*v.w*.08*envelope;
  }
  for(const [s,sb] of state.solitons||[]){
    if(s.w<.001)continue;
    const length=Math.hypot(s.x,s.y)||1,dx=s.x/length,dz=s.y/length,width=Math.max(1,sb.x);
    const along=(position.x*dx+position.z*dz-s.z)/width;
    const envelope=Math.exp(-along*along)*Math.exp(-depth/(width*2))*scale;
    flow.x+=dx*s.w*.055*envelope;flow.y-=along*s.w*.012*envelope;flow.z+=dz*s.w*.055*envelope;
  }
  return flow;
}

export class OceanDynamics {
  constructor() { this.time=0;this.mixing=0;this.nutrients=0.2;this.pulseAge=1000;this.pulseStrength=0;this.tremors=0; }
  tremor(strength=1) { this.pulseAge=0;this.pulseStrength=clamp(strength,0,2);this.tremors++; }
  update(dt,weather={},settings={}) {
    if(dt<=0)return;
    this.time+=dt;this.pulseAge+=dt;
    const mixTarget=clamp((weather.storm??0)*0.8+(weather.windSpeed??5)/90+(weather.swellHs??1)/60,0,1.5);
    this.mixing+=(mixTarget-this.mixing)*(1-Math.exp(-dt/4));
    const source=(settings.upwelling??0.65)*0.48+(this.pulseAge<18?this.pulseStrength*0.5:0);
    this.nutrients+=(clamp(source*(0.8+this.mixing*0.35),0,1.4)-this.nutrients)*(1-Math.exp(-dt/14));
  }
  get sediment() { return this.pulseStrength*Math.exp(-this.pulseAge/14); }
  get waveActive() { return this.pulseAge>=1.4&&this.pulseAge<135.4&&this.pulseStrength>0; }
  surfaceHeight(x,z) { return pulseHeight(x,z,this.pulseAge,this.pulseStrength); }
}
