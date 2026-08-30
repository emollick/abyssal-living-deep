import * as THREE from 'three';
import { U } from '../core/SharedUniforms.js';
import { OCEAN_COUPLING_GLSL } from '../ocean/OceanCouplingGLSL.js';
import { OCEAN_SAMPLE_GLSL } from '../ocean/OceanSampleGLSL.js';

export const WATER_GLSL = /* glsl */ `
${OCEAN_COUPLING_GLSL}
uniform float uTime;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uStormFactor;
uniform float uAmbientFlash;
uniform vec3 uWaterTint;
uniform vec3 uExtinction;
uniform float uDiveLight;
uniform float uDiveNight;
uniform float uDiveDeep;
uniform float uCurrent;
uniform float uLamp;
uniform vec3 uDiveForward;
uniform float uClarity;
uniform float uBioStrength;
uniform sampler2D uReefShadow;
uniform mat4 uReefShadowMatrix;
uniform float uSediment;
uniform sampler2D uCausticSlope;
uniform float uCausticSpan;

float reefShadow(vec3 world,vec3 n) {
  vec4 p=uReefShadowMatrix*vec4(world+n*0.045,1.0);
  vec3 q=p.xyz/p.w*0.5+0.5;
  if(q.x<0.0||q.x>1.0||q.y<0.0||q.y>1.0||q.z>1.0)return 1.0;
  float light=0.0;
  for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++) {
    float d=textureLod(uReefShadow,q.xy+vec2(float(x),float(y))/1536.0,0.0).r;
    light+=step(q.z-0.0013,d);
  }
  return light/9.0;
}

float hash31(vec3 p) {
  p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),
                 mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),
                 mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm3(vec3 p) { return noise3(p)*0.57 + noise3(p*2.03+4.7)*0.28 + noise3(p*4.07+9.2)*0.15; }

// Interfering refracted wavefronts produce moving cellular caustics, not a sliding image.
float caustic(vec3 p) {
  vec2 q = p.xz * 0.56 + p.y * vec2(0.13,0.08);
  vec2 slope=textureLod(uCausticSlope,p.xz/uCausticSpan,0.0).xy;
  q+=slope*2.7;
  float t = uTime * 0.32;
  q += vec2(sin(q.y*1.14+t),sin(q.x*0.83-t*0.8))*0.8;
  float a = abs(sin(q.x*1.7 + sin(q.y*1.5+t)*1.7) + sin(q.y*1.8 - sin(q.x+t*0.63)*1.4));
  float b = abs(sin(q.x*2.3 - t*0.7) + sin(q.y*2.5 + t*0.5));
  return pow(1.0-clamp(a*0.62,0.0,1.0),12.0)*0.8 + pow(1.0-clamp(b*0.56,0.0,1.0),17.0)*0.35;
}
vec3 waterHaze(vec3 direction) {
  float up = smoothstep(-0.7,0.85,direction.y);
  vec3 col = uWaterTint * mix(0.22,1.65,up);
  float sun = pow(max(dot(direction,normalize(vec3(uSunDir.x*0.6,max(0.4,uSunDir.y),uSunDir.z*0.6))),0.0),24.0);
  col += vec3(0.18,0.33,0.30)*sun*uDiveLight*(1.0-uDiveDeep);
  col *= mix(1.0,0.22,uDiveNight);
  return col * (0.64 + 0.36*uDiveLight) + vec3(0.05,0.11,0.16)*uAmbientFlash*(1.0-uDiveDeep);
}
vec3 underwaterFog(vec3 color, vec3 p, float dist) {
  vec3 direction = normalize(p-uCamPos);
  float waterDistance=dist;
  if(uCamPos.y>0.0)waterDistance*=clamp(-p.y/max(0.01,uCamPos.y-p.y),0.0,1.0);
  float depth=max(0.0,-(p.y+min(uCamPos.y,0.0))*0.5);
  float sediment=uSediment*exp(-abs(p.y+1420.0)*0.014);
  vec3 extinction = uExtinction * (1.0 + uSurfaceMixing*exp(-depth/100.0)*1.2 + sediment*1.8) / max(uClarity,0.3);
  vec3 transmission = exp(-extinction*waterDistance);
  return color*transmission + waterHaze(direction)*(1.0-transmission);
}
`;

const VERT = /* glsl */ `
${OCEAN_COUPLING_GLSL}
attribute vec3 color;
attribute float aFlex;
#ifdef FAUNA
attribute float aGlow;
attribute float aPart;
attribute float aPhase;
varying float vGlow;
uniform float uAnchored;
#endif
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
varying vec3 vLocal;
varying vec2 vUv;
uniform float uTime;
uniform float uCurrent;
uniform float uMotion;
uniform float uKind;
uniform mat4 uViewProjNJ;
uniform mat4 uPrevViewProjNJ;
varying vec4 vClip;
varying vec4 vPrev;
void main() {
  vec3 p = position;
  vec3 n = normal;
  if (uMotion > 0.5 && uMotion < 1.5) {
    float tail = 1.0-smoothstep(-0.65,0.2,p.x);
    p.z += sin(uTime*6.0+p.x*5.4)*0.12*tail;
  }
  if (uMotion > 1.5 && uMotion < 2.5) {
    float wing = abs(p.x);
    p.y += sin(uTime*1.6-wing*0.6)*wing*0.23;
  }
  if (uMotion > 2.5 && uMotion < 3.5) {
    float pulse = sin(uTime*1.8);
    p.xz *= 1.0 + pulse*0.075*smoothstep(-1.0,1.0,p.y);
    p.y += pulse*0.05;
  }
  if (uMotion > 3.5 && uMotion < 4.5) {
    p.y += sin(uTime*1.1+p.x*0.35)*(1.0-smoothstep(-7.0,0.0,p.x))*0.45;
  }
  #ifdef FAUNA
    float animalPhase=aPhase;
    #ifdef USE_INSTANCING
      animalPhase+=instanceMatrix[3].x*.31+instanceMatrix[3].z*.27;
    #endif
    float clock=uTime+animalPhase;
    if(uMotion>4.5&&uMotion<5.5){
      float tail=1.0-smoothstep(-1.15,.3,p.x);
      p.z+=sin(clock*4.3+p.x*3.8)*tail*.14;
      if(aPart>1.5&&aPart<2.5)p.y+=sin(clock*3.1)*abs(p.z)*.09;
    }
    if(uMotion>5.5&&uMotion<6.5){
      float pulse=sin(clock*3.2);
      p.yz*=1.0+pulse*.055*(1.0-smoothstep(.2,1.1,p.x));
      if(aPart>2.5&&aPart<3.5){p.y+=sin(clock*3.0-p.x*3.2)*.11;p.z+=cos(clock*2.6-p.x*2.3)*.10;}
      if(aPart>1.5&&aPart<2.5)p.y+=sin(clock*4.1+abs(p.z)*3.0)*abs(p.z)*.13;
    }
    if(uMotion>6.5&&uMotion<7.5){
      if(aPart>1.5&&aPart<2.5)p.y+=sin(clock*2.8)*abs(p.z)*.28;
      if(aPart>2.5&&aPart<3.5){p.y+=sin(clock*1.5+length(p.xz)*3.0)*.07;p.xz*=1.0+sin(clock*1.6)*.045;}
    }
    if(uMotion>7.5&&uMotion<8.5){
      float tail=max(0.0,-p.x);
      p.z+=sin(clock*2.0+p.x*2.2)*min(tail*.22,.65);
      p.y+=cos(clock*1.3+p.x*1.6)*min(tail*.055,.12);
    }
    if(uMotion>8.5&&uMotion<9.5&&aPart>3.5&&aPart<4.5){
      p.x+=sin(clock*3.2)*.07;
      p.y+=max(0.0,cos(clock*3.2))*.065;
    }
    if(uMotion>9.5&&uMotion<10.5){
      p.y+=sin(clock*2.4+p.x*2.2)*(1.0-smoothstep(-1.2,.25,p.x))*.16;
      if(aPart>1.5&&aPart<2.5)p.y+=sin(clock*2.3)*abs(p.z)*.13;
    }
    if(uMotion>10.5&&uMotion<11.5){
      p.x+=sin(clock*.6+p.y*1.8)*max(p.y-.3,0.0)*.05;
    }
    if(uMotion>11.5){
      if(aPart>.5&&aPart<1.5)p.y+=sin(clock*4.0+p.x*3.0)*max(-p.x,0.0)*.10;
      if(aPart>3.5&&aPart<4.5){p.x+=sin(clock*5.1)*.04;p.y+=max(0.0,cos(clock*5.1))*.025;}
    }
    if(aPart>4.5&&aPart<5.5)p.z+=sin(clock*.9+p.y)*.035;
    vGlow=aGlow;
  #endif
  vLocal = p; vUv = uv; vColor = color;
  #ifdef USE_INSTANCING_COLOR
    vColor *= instanceColor;
  #endif
  vec4 wp = vec4(p,1.0);
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
    n = mat3(instanceMatrix) * n;
  #endif
  wp = modelMatrix * wp;
  n = normalize(mat3(modelMatrix) * n);
  float phase = wp.x*0.19+wp.z*0.14;
  vec3 flow=oceanFlow(wp.xyz,uTime);
  float current=length(flow)*1.3;
  float advection=1.0;
  #ifdef FAUNA
    advection=1.0-uAnchored;
  #endif
  if(uMotion>.5){wp.xz+=flow.xz*sin(uTime*.21+phase*.2)*2.2*advection;wp.y+=flow.y*cos(uTime*.32+phase)*.7*advection;}
  wp.x += aFlex * (sin(uTime*(0.64+current*0.25)+phase) + sin(uTime*0.31+phase*0.7)*0.5) * current*1.45;
  wp.z += aFlex * sin(uTime*0.49+phase*1.13)*current*0.85;
  if(uKind>2.5&&uKind<3.5) {
    wp.y+=sin(uv.y*11.0+uTime*1.8+phase)*uv.y*uv.y*aFlex*0.10*min(current*2.0,1.5);
    wp.x+=sin(uv.y*7.0-uTime*1.4+phase)*uv.y*aFlex*0.15*min(current*2.0,1.5);
  }
  float quake=uDeepPulse.w*exp(-uDeepPulse.z*0.55)*exp(-length(wp.xz-uDeepOrigin)/180.0);
  wp.y+=sin(uTime*24.0+wp.x*.1)*quake*.32*clamp((-wp.y-1100.0)/200.0,0.0,1.0);
  vWorld = wp.xyz; vNormal = n;
  vClip = uViewProjNJ*wp;
  vPrev = uPrevViewProjNJ*wp;
  gl_Position = projectionMatrix*viewMatrix*wp;
}
`;

const FRAG = /* glsl */ `
${WATER_GLSL}
uniform float uKind;
uniform float uGlow;
uniform float uOpacity;
uniform float uPattern;
uniform float uMotion;
#ifdef FAUNA
varying float vGlow;
#endif
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
varying vec3 vLocal;
varying vec2 vUv;
varying vec4 vClip;
varying vec4 vPrev;
layout(location=0) out vec4 outColor;
layout(location=1) out vec4 outVelocity;

void main() {
  vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 viewDir = normalize(uCamPos-vWorld);
  float dist = length(vWorld-uCamPos);
  float grain = fbm3(vWorld*2.1);
  float rough = noise3(vWorld*21.0);
  vec3 base = vColor;
  if (uKind < 0.5) {
    float ripple = sin(vWorld.x*4.0+sin(vWorld.z*0.45)*2.1 + sin(vWorld.z*0.12)*3.0);
    base *= 0.76+grain*0.25+ripple*0.08+rough*0.075;
    n = normalize(n + vec3(cos(vWorld.x*4.0+sin(vWorld.z*0.45)*2.1)*0.13,0.0,0.025));
    float cliff=smoothstep(.30,.75,1.0-abs(n.y));
    float layers=sin(vWorld.y*.36+fbm3(vWorld*.09)*3.4);
    float seams=pow(abs(sin(vWorld.y*.15+noise3(vWorld*.12)*1.2)),24.0);
    vec3 rock=vec3(.12,.175,.18)*(.68+grain*.55+layers*.13-seams*.34);
    base=mix(base,rock,cliff);
  } else if (uKind < 1.5) {
    float strata = sin(vWorld.y*5.0+grain*5.0)*0.04;
    float pores=pow(noise3(vWorld*14.0),4.0);
    base *= 0.57+grain*0.55+strata+rough*0.18-pores*0.35;
    float encrust = smoothstep(0.58,0.76,fbm3(vWorld*0.45));
    base = mix(base,base*vec3(0.46,0.72,0.57),encrust*0.45);
  } else if (uKind < 2.5) {
    float polyp = pow(noise3(vWorld*27.0),4.0);
    base *= 0.76+grain*0.35+polyp*0.5;
    base = mix(base,vec3(0.90,0.82,0.59),polyp*0.3);
    if(uPattern>0.5){
      vec3 q=vWorld*7.4;
      float ridge=abs(sin(q.x+sin(q.z+q.y)*1.7)+sin(q.z+sin(q.y+q.x)*1.6));
      base*=0.32+smoothstep(0.05,0.38,ridge)*0.85;
    }
  } else if (uKind < 3.5) {
    float vein = pow(abs(sin(vUv.x*3.14159)),0.35);
    base *= 0.7+vein*0.4+sin(vUv.y*89.0+vUv.x*14.0)*0.045;
  } else if (uKind < 4.5) {
    float scales = sin(vLocal.x*93.0)*sin(vLocal.y*121.0)*0.035;
    base *= 1.0+scales;
    if(uMotion>3.5&&uMotion<4.5)base*=0.78+fbm3(vLocal*1.4)*0.40;
  }
  // Small normal variation catches the light without a texture download.
  if (uKind < 2.5) n = normalize(n + (vec3(noise3(vWorld*8.0),noise3(vWorld*8.0+4.1),noise3(vWorld*8.0+9.7))-0.5)*0.16);
  vec3 sun = normalize(vec3(uSunDir.x*0.6,max(0.45,uSunDir.y),uSunDir.z*0.6));
  float lambert = max(dot(n,sun),0.0);
  float hemi = n.y*0.5+0.5;
  float depth = max(0.0,-vWorld.y);
  float localDeep=smoothstep(100.0,700.0,depth);
  float sunlight = uDiveLight*exp(-depth*0.011)*(1.0-localDeep);
  float shadow = depth>220.0 ? 1.0 : reefShadow(vWorld,n);
  vec3 spectrum=mix(vec3(1.0),uSunColor/max(max(uSunColor.r,uSunColor.g),max(uSunColor.b,0.001)),0.65);
  float ambient = mix(0.42,0.040,localDeep) * mix(1.0,0.18,uDiveNight*(1.0-localDeep));
  vec3 irradiance = vec3(0.66,0.80,0.77)*ambient*(0.65+hemi*0.6);
  irradiance += vec3(1.0,0.97,0.78)*spectrum*lambert*sunlight*1.1*shadow;
  irradiance += vec3(0.12,0.33,0.36)*sunlight*0.22;
  irradiance += vec3(0.33,0.30,0.20)*sunlight*(1.0-hemi)*0.3;
  if(uKind>1.5&&uKind<2.5)irradiance+=vec3(0.31,0.25,0.20)*spectrum*sunlight;
  float ca = caustic(vWorld)*sunlight*max(0.0,n.y*0.75+0.25)*shadow;
  irradiance += vec3(0.60,0.96,0.86)*ca*0.55;
  float fresnel = pow(1.0-max(dot(n,viewDir),0.0),3.0);
  if (uKind > 2.5 && uKind < 3.5) irradiance += vec3(0.49,0.47,0.16)*sunlight*max(0.0,dot(-n,sun))*0.7;
  float lampCone = pow(max(dot(-viewDir,uDiveForward),0.0),12.0);
  float lamp = uLamp * lampCone * 13.0/(1.0+dist*dist*0.015);
  irradiance += vec3(0.64,0.83,1.0)*lamp*max(0.1,dot(n,viewDir));
  irradiance += vec3(0.4,0.6,0.8)*uAmbientFlash*exp(-depth*0.028)*(1.0-uDiveDeep);
  vec3 col = base*irradiance;
  // A modest photographic white balance recovers near-field coral color;
  // the distance-dependent water transmission still removes red in the blue.
  col.r*=1.0+0.48*(1.0-uDiveDeep)*(1.0-exp(-dist*0.08));
  if (uKind > 3.5 && uKind < 4.5) {
    float spec = pow(max(dot(n,normalize(sun+viewDir)),0.0),44.0);
    col += vec3(0.65,0.90,0.93)*(spec*0.6+fresnel*0.14)*sunlight;
  }
  float bio = uGlow*uBioStrength*(0.24+uDiveNight*(1.0-localDeep)*1.6+localDeep*1.4);
  if (uKind > 4.5) {
    float ribs = pow(abs(sin(atan(vLocal.z,vLocal.x)*10.0)),10.0);
    bio *= 0.25 + fresnel*1.8+ribs*0.33;
    col += base*bio;
  } else col += base*bio*(0.7+sin(uTime*1.3+vWorld.y*3.0)*0.3);
  #ifdef FAUNA
    col+=vColor*vGlow*uBioStrength*(.42+localDeep*1.6+uDiveNight*.8)*(.94+sin(uTime*1.5+vWorld.x)*.06);
  #endif
  col = underwaterFog(col,vWorld,dist);
  float alpha = uOpacity;
  if (uKind > 4.5) alpha *= 0.22+fresnel*0.64;
  // Opaque colour alpha carries range for the surface refraction pass. The
  // main post stack uses RGB; translucent animals keep ordinary opacity.
  float packedAlpha=uOpacity>.999?min(dist/400.0,.999):alpha;
  outColor = vec4(max(col,vec3(0.0)),packedAlpha);
  vec2 velocity = (vClip.xy/vClip.w - vPrev.xy/vPrev.w)*0.5;
  outVelocity = vec4(velocity,dist,1.0);
}
`;

export function waterMaterial(kind = 1, options = {}) {
  const mat = new THREE.ShaderMaterial({
    name: `underwater-${options.name || kind}`,
    glslVersion: THREE.GLSL3,
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: { ...U, uKind: { value: kind }, uPattern: { value: options.pattern || 0 }, uMotion: { value: options.motion || 0 }, uGlow: { value: options.glow || 0 }, uOpacity: { value: options.opacity ?? 1 }, uAnchored:{value:options.anchored?1:0} },
    defines: options.fauna?{FAUNA:1}:{},
    side: options.side ?? THREE.DoubleSide,
    transparent: options.transparent || false,
    depthWrite: options.depthWrite ?? !options.transparent,
  });
  return mat;
}

export const BACKGROUND_FRAG = /* glsl */ `
${WATER_GLSL}
${OCEAN_SAMPLE_GLSL}
uniform sampler2D uEnvMap;
uniform mat4 uInvViewProj;
uniform mat4 uPrevViewProjNJ;
uniform mat4 uViewProjNJ;
in vec2 vUv;
layout(location=0) out vec4 outColor;
layout(location=1) out vec4 outVelocity;
void main() {
  vec4 w = uInvViewProj * vec4(vUv*2.0-1.0,1.0,1.0);
  vec3 rd = normalize(w.xyz/w.w-uCamPos);
  vec3 col = waterHaze(rd);
  // Long shafts converge on the actual sun; the ceiling is an undulating Snell window.
  if (rd.y > 0.015 && uCamPos.y < 0.5 && uDiveDeep < 0.95) {
    float t = max(0.1,uSeaLevel-uCamPos.y)/rd.y;
    vec3 p = uCamPos+rd*t;
    float wave=surfaceHeightAt(p.xz,uTime);
    t=max(0.1,wave-uCamPos.y)/rd.y;
    p=uCamPos+rd*t;
    vec2 waveSlope=textureLod(uOceanDeriv1,p.xz/uOceanScales.y,0.0).xy+textureLod(uOceanDeriv2,p.xz/uOceanScales.z,0.0).xy*0.4;
    float ripple = fbm3(vec3(p.xz*0.16,uTime*0.14));
    float ca = caustic(vec3(p.x,0.0,p.z));
    float ceilingFade=exp(-t*0.012);
    vec3 normal=normalize(vec3(waveSlope.x,-1.0,waveSlope.y));
    vec3 skyRay=refract(rd,normal,1.333);
    float window=smoothstep(0.0,0.18,length(skyRay));
    vec2 envUV=vec2(atan(skyRay.z,skyRay.x)/6.2831853+0.5,acos(clamp(skyRay.y,-1.0,1.0))/3.14159265);
    vec3 sky=textureLod(uEnvMap,envUV,1.0).rgb;
    float transmission=ceilingFade*window*(1.0-uDiveDeep);
    col=mix(col,sky*vec3(0.44,0.69,0.73),transmission*0.64);
    col += vec3(0.11,0.23,0.23)*window*uDiveLight*ceilingFade;
    col += vec3(0.065,0.15,0.14)*ca*pow(rd.y,0.7)*uDiveLight*ceilingFade;
    col += vec3(0.05,0.10,0.09)*ripple*rd.y*uDiveLight*ceilingFade;
    col *= 1.0 + (noise3(vec3(p.xz*0.4,uTime*0.24))-0.5)*0.035*ceilingFade;
    col+=vec3(0.06,0.10,0.08)*max(0.0,waveSlope.x+waveSlope.y)*ceilingFade*uDiveLight;
  }
  vec3 farPoint = uCamPos+rd*300.0;
  vec4 cur = uViewProjNJ*vec4(farPoint,1.0);
  vec4 prv = uPrevViewProjNJ*vec4(farPoint,1.0);
  outColor = vec4(col,1.0);
  outVelocity = vec4((cur.xy/cur.w-prv.xy/prv.w)*0.5,400.0,1.0);
}
`;
