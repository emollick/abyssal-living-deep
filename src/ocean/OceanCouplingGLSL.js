// Kept alongside OceanDynamics.js: these are the same flow and disturbance
// fields, evaluated on meshes, the surface, the lens, and the swimmer.
export const OCEAN_COUPLING_GLSL = /* glsl */ `
#ifndef OCEAN_COUPLING_GLSL
#define OCEAN_COUPLING_GLSL
uniform vec4 uDeepPulse;
uniform vec2 uDeepOrigin;
uniform float uUpwelling;
uniform float uNutrientBloom;
uniform float uSurfaceMixing;
uniform float uCurrentScale;
uniform vec4 uFlowForcing;
uniform vec4 uVortex0,uVortex1,uVortex2,uVortex3;
uniform vec4 uSoliton0,uSoliton0b,uSoliton1,uSoliton1b;

vec3 vortexCurrent(vec3 p,vec4 v){
  if(v.w<.001)return vec3(0.0);
  vec2 d=p.xz-v.xy;float r=max(1.0,length(d)),R=max(1.0,v.z);
  float envelope=exp(-r*r/(R*R*3.0))*exp(min(0.0,p.y)/(R*1.8));
  return vec3(-d.y/r*v.w*.08,-v.w*.028,d.x/r*v.w*.08)*envelope;
}
vec3 solitonCurrent(vec3 p,vec4 s,vec4 sb){
  if(s.w<.001)return vec3(0.0);
  vec2 direction=normalize(s.xy);float width=max(1.0,sb.x);
  float x=(dot(p.xz,direction)-s.z)/width;
  float envelope=exp(-x*x)*exp(min(0.0,p.y)/(width*2.0));
  return vec3(direction.x*s.w*.055,-x*s.w*.012,direction.y*s.w*.055)*envelope;
}

float deepSurfaceWave(vec2 p) {
  if(uDeepPulse.z<1.4||uDeepPulse.z>135.4||uDeepPulse.w<=0.0)return 0.0;
  float r=length(p-uDeepPulse.xy);
  float height=0.0;
  for(int packet=0;packet<3;packet++){
    float age=uDeepPulse.z-1.4-float(packet)*12.0;
    if(age<0.0||age>110.0)continue;
    float front=r-age*22.0;
    height+=cos(front*.105)*exp(-front*front/2100.0)*7.5*uDeepPulse.w
      *exp(-age*.018)*smoothstep(0.0,2.0,age)*(1.0-float(packet)*.22);
  }
  return height;
}
float plumeDensity(vec3 p) {
  vec2 d=p.xz-uDeepOrigin;
  return exp(-dot(d,d)/(10000.0+max(0.0,-p.y)*42.0))*uUpwelling;
}
vec3 oceanFlow(vec3 p,float time) {
  float depth=max(0.0,-p.y),shelter=exp(-depth/65.0);
  float surf=uFlowForcing.z*shelter;
  float swell=uFlowForcing.w*0.022;
  float orbit=sin(time*0.7+p.x*0.04+p.z*0.027)*swell*shelter;
  vec2 d=p.xz-uDeepOrigin;
  float r=max(25.0,length(d)),plume=plumeDensity(p);
  vec3 flow=vec3(uFlowForcing.x*surf+sin(time*0.05+p.z*0.012)*0.055+orbit-d.y/r*plume*0.12,
    cos(time*0.72+p.x*0.06)*swell*shelter+plume*0.22*(0.4+depth/1420.0),
    uFlowForcing.y*surf+cos(time*0.04+p.x*0.01)*0.055+d.x/r*plume*0.12);
  flow+=vortexCurrent(p,uVortex0)+vortexCurrent(p,uVortex1)+vortexCurrent(p,uVortex2)+vortexCurrent(p,uVortex3);
  flow+=solitonCurrent(p,uSoliton0,uSoliton0b)+solitonCurrent(p,uSoliton1,uSoliton1b);
  return flow*uCurrentScale;
}
#endif
`;
