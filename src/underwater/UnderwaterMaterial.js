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
uniform float uUnderwaterShadowMode;
uniform float uSediment;
uniform sampler2D uCausticSlope;
uniform float uCausticSpan;

float reefShadow(vec3 world,vec3 n) {
  vec4 p=uReefShadowMatrix*vec4(world+n*(uUnderwaterShadowMode>.5?.004:.045),1.0);
  vec3 q=p.xyz/p.w*0.5+0.5;
  if(q.x<0.0||q.x>1.0||q.y<0.0||q.y>1.0||q.z>1.0)return 1.0;
  float light=0.0;
  for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++) {
    float d=textureLod(uReefShadow,q.xy+vec2(float(x),float(y))/1536.0,0.0).r;
    light+=step(q.z-(uUnderwaterShadowMode>.5?.000025:.0013),d);
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
#ifdef ANIMAL_MOTION
  #ifdef USE_INSTANCING
    attribute vec4 aAnimalMotion;
  #else
    uniform vec4 uAnimalMotion;
  #endif
#endif
#ifdef FAUNA
attribute float aGlow;
attribute float aPart;
attribute float aPhase;
attribute float aTissue;
varying float vGlow;
varying float vTissue;
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
float smoothSlope(float low,float high,float value){float t=clamp((value-low)/(high-low),0.0,1.0);return 6.0*t*(1.0-t)/(high-low);}
void main() {
  vec3 p = position;
  vec3 n = normal;
  float clock=uTime,effort=1.0,turn=0.0,feeding=0.0;
  #ifdef ANIMAL_MOTION
    #ifdef USE_INSTANCING
      vec4 motion=aAnimalMotion;
    #else
      vec4 motion=uAnimalMotion;
    #endif
    clock=motion.x;effort=motion.y;turn=motion.z;feeding=motion.w;
  #endif
  if (uMotion > 0.5 && uMotion < 1.5) {
    float tail = 1.0-smoothstep(-0.65,0.2,p.x);
    float amplitude=.025+effort*.095,bend=sin(clock+p.x*5.4)*amplitude+turn*.045;
    n.x-=n.z*(cos(clock+p.x*5.4)*5.4*amplitude*tail-bend*smoothSlope(-.65,.2,p.x));
    p.z += bend*tail;
    float fin=smoothstep(.16,.34,abs(p.z));
    p.y+=sin(clock*.7+sign(p.z)*.6)*fin*.04*(.35+effort);
  }
  if (uMotion > 1.5 && uMotion < 2.5) {
    float wing = abs(p.x);
    float amplitude=.045+effort*.18,phase=clock-wing*.6;
    n.x-=n.y*sign(p.x)*amplitude*(sin(phase)-wing*.6*cos(phase));
    p.y += sin(phase)*wing*amplitude;
  }
  if (uMotion > 2.5 && uMotion < 3.5) {
    float pulse = sin(uTime*1.8);
    p.xz *= 1.0 + pulse*0.075*smoothstep(-1.0,1.0,p.y);
    p.y += pulse*0.05;
  }
  if (uMotion > 3.5 && uMotion < 4.5) {
    float tail=1.0-smoothstep(-7.0,0.0,p.x),amplitude=.08+effort*.42,phase=clock+p.x*.35;
    n.x-=n.y*amplitude*(cos(phase)*.35*tail-sin(phase)*smoothSlope(-7.0,0.0,p.x));
    p.y += sin(phase)*tail*amplitude;
  }
  if (uMotion > 13.5 && uMotion < 14.5) {
    // Paddle the turtle's flippers about their roots; the shell stays rigid.
    float flipper=smoothstep(.90,2.1,abs(p.z));
    float front=smoothstep(-1.1,-.3,p.x);
    float bendSlope=sign(p.z)*smoothSlope(.90,2.1,abs(p.z));
    n.z-=bendSlope*(n.y*sin(clock+front*.6)*(.06+effort*.40)+n.x*cos(clock+front*.6)*(.04+effort*.15));
    p.y+=sin(clock+front*.6)*flipper*(.06+effort*.40);
    p.x+=cos(clock+front*.6)*flipper*(.04+effort*.15);
  }
  #ifdef FAUNA
    clock+=aPhase;
    if(uMotion>4.5&&uMotion<5.5){
      float tail=1.0-smoothstep(-1.15,.3,p.x);
      float amplitude=.018+effort*.12,bend=sin(clock+p.x*3.8)*amplitude+turn*.055;
      n.x-=n.z*(cos(clock+p.x*3.8)*3.8*amplitude*tail-bend*smoothSlope(-1.15,.3,p.x))*(1.0-feeding*.6);
      p.z+=bend*tail*(1.0-feeding*.6);
      if(aPart>1.5&&aPart<2.5)p.y+=sin(clock*.7)*abs(p.z)*(.025+effort*.075);
    }
    if(uMotion>5.5&&uMotion<6.5){
      float pulse=(1.0-cos(clock))*.5;
      p.yz*=1.0-pulse*.10*(1.0-smoothstep(.2,1.1,p.x));
      if(aPart>2.5&&aPart<3.5){
        float arm=smoothstep(1.15,2.4,p.x);
        p.y+=sin(clock-p.x*2.2)*.07*arm;p.z+=cos(clock-p.x*1.7)*.06*arm;
      }
      if(aPart>1.5&&aPart<2.5)p.y+=sin(clock*1.4-abs(p.z)*3.0)*abs(p.z)*.12;
    }
    if(uMotion>6.5&&uMotion<7.5){
      if(aPart>1.5&&aPart<2.5)p.y+=sin(clock)*smoothstep(.40,.85,abs(p.z))*(.05+effort*.13);
      if(aPart>2.5&&aPart<3.5){
        float arm=length(p.xz),root=smoothstep(.29,.8,arm);
        float softClock=clock-aPhase+sin(atan(p.z,p.x)*3.0)*.18;
        float armStrength=mix(.4+effort*.6,effort,uAnchored);
        p.y+=sin(softClock+arm*3.0)*.045*root*armStrength;
        p.xz*=1.0+sin(softClock)*.025*root*armStrength;
      }
    }
    if(uMotion>7.5&&uMotion<8.5){
      float tail=max(0.0,-p.x);
      p.z+=(sin(clock+p.x*2.2)*(.25+effort*.75)+turn*.10)*min(tail*.22,.65);
      p.y+=cos(clock*.65+p.x*1.6)*min(tail*.055,.12)*effort;
    }
    if(uMotion>8.5&&uMotion<9.5&&aPart>3.5&&aPart<4.5){
      float tip=smoothstep(.50,1.1,abs(p.z))*(1.0-smoothstep(.38,.70,p.y));
      p.x+=sin(clock)*.075*tip*effort;
      p.y+=max(0.0,cos(clock))*.065*tip*effort;
    }
    if(uMotion>9.5&&uMotion<10.5){
      float tail=1.0-smoothstep(-1.2,.25,p.x),phase=clock+p.x*2.2,amplitude=.02+effort*.14;
      n.x-=n.y*amplitude*(cos(phase)*2.2*tail-sin(phase)*smoothSlope(-1.2,.25,p.x));
      p.y+=sin(phase)*tail*amplitude;
      if(aPart>1.5&&aPart<2.5)p.y+=sin(clock)*abs(p.z)*.06*effort;
    }
    if(uMotion>10.5&&uMotion<11.5){
      p.x+=sin(uTime*.6+p.y*1.8)*max(p.y-.3,0.0)*.05;
    }
    if(uMotion>11.5&&uMotion<12.5){
      if(aPart>.5&&aPart<1.5)p.y+=(1.0-cos(clock))*.5*max(-p.x,0.0)*.14*effort;
      if(aPart>3.5&&aPart<4.5){float root=smoothstep(.14,.4,abs(p.z));p.x+=sin(clock)*.04*root*effort;p.y+=max(0.0,cos(clock))*.025*root*effort;}
    }
    if(uMotion>12.5&&uMotion<13.5){
      // Sunfish propel themselves with the tall dorsal and anal fins.
      if(aPart>1.5&&aPart<2.5){float tip=smoothstep(.72,2.1,abs(p.y)),amplitude=.12+effort*.32;n.y-=n.z*sin(clock)*amplitude*sign(p.y)*smoothSlope(.72,2.1,abs(p.y));p.z+=sin(clock)*tip*amplitude;}
    }
    if(uMotion>14.5&&uMotion<15.5){
      // True seals sweep their hindquarters laterally; dolphins flex vertically.
      float rear=1.0-smoothstep(-1.2,.25,p.x);
      float phase=clock+p.x*1.8,amplitude=.025+effort*.18;
      n.x-=n.z*amplitude*(cos(phase)*1.8*rear-sin(phase)*smoothSlope(-1.2,.25,p.x));
      p.z+=sin(phase)*rear*amplitude;
      if(aPart>1.5&&aPart<2.5)p.y+=sin(clock*.5)*abs(p.z)*.025;
    }
    if(aPart>4.5&&aPart<5.5)p.z+=sin(uTime*.6+p.y)*.018*smoothstep(.5,1.2,p.y);
    vGlow=aGlow;
    vTissue=aTissue;
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
  #ifndef ANIMAL_MOTION
    if(uMotion>.5){wp.xz+=flow.xz*sin(uTime*.21+phase*.2)*2.2*advection;wp.y+=flow.y*cos(uTime*.32+phase)*.7*advection;}
  #endif
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
varying float vTissue;
uniform float uSkinKind;
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

vec3 surfaceNormal(vec3 n,float height,float strength) {
  vec3 dx=dFdx(vWorld),dy=dFdy(vWorld),r1=cross(dy,n),r2=cross(n,dx);
  float determinant=dot(dx,r1);
  vec3 gradient=sign(determinant)*(dFdx(height)*r1+dFdy(height)*r2);
  return normalize(max(abs(determinant),.0000001)*n-gradient*strength);
}
float waterSpecular(vec3 n,vec3 v,vec3 l,float roughness,float f0) {
  vec3 h=normalize(v+l);float nv=max(dot(n,v),.001),nl=max(dot(n,l),.001),nh=max(dot(n,h),.0);
  float a=roughness*roughness,a2=a*a,d=nh*nh*(a2-1.0)+1.0;
  float distribution=a2/(3.141593*d*d),k=(roughness+1.0)*(roughness+1.0)*.125;
  float visibility=nv/(nv*(1.0-k)+k)*nl/(nl*(1.0-k)+k);
  float fresnel=f0+(1.0-f0)*pow(1.0-max(dot(v,h),.0),5.0);
  return min(5.0,distribution*visibility*fresnel/max(.004,4.0*nv*nl))*nl;
}
void main() {
  vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 viewDir = normalize(uCamPos-vWorld);
  float dist = length(vWorld-uCamPos);
  float grain = fbm3(vWorld*2.1);
  float rough = noise3(vWorld*21.0);
  vec3 base = vColor;
  float relief=0.0,roughness=.78,f0=.018;
  if (uKind < 0.5) {
    float resolved=1.0-smoothstep(.6,3.0,length(fwidth(vWorld))*130.0);
    float mineral=noise3(vWorld*130.0),shallow=1.0-smoothstep(80.0,250.0,-vWorld.y);
    float ripplePhase=vWorld.x*24.0+sin(vWorld.z*.32)*4.8+sin(vWorld.z*1.5+vWorld.x*.13)*.9+noise3(vWorld*.38)*3.0;
    float ripple=sin(ripplePhase)*(1.0-smoothstep(.75,3.0,fwidth(ripplePhase)));
    float ripplePatch=smoothstep(.24,.68,noise3(vWorld*.19));
    base*=.68+grain*.38+mineral*resolved*.12+ripple*shallow*ripplePatch*.034;
    relief=ripple*shallow*ripplePatch*.007+grain*.032+mineral*resolved*.001;
    float cliff=smoothstep(.30,.75,1.0-abs(n.y));
    float layers=sin(vWorld.y*1.65+fbm3(vWorld*.12)*5.4);
    float seams=pow(abs(sin(vWorld.y*.51+noise3(vWorld*.22)*2.2)),28.0);
    vec3 rock=vec3(.18,.175,.155)*(.60+grain*.70+layers*.12-seams*.36);
    base=mix(base,rock,cliff);
    relief+=cliff*(layers*.022+rough*.045-seams*.07);
  } else if (uKind < 1.5) {
    float strata=sin(vWorld.y*3.4+grain*6.0),pores=pow(noise3(vWorld*19.0),3.0);
    float fracture=pow(abs(sin(vWorld.y*1.8+fbm3(vWorld*.6)*5.0)),22.0);
    base*=.43+grain*.82+strata*.065+rough*.16-pores*.25-fracture*.14;
    float encrust=smoothstep(.47,.75,fbm3(vWorld*.8));
    base=mix(base,base*vec3(.64,.77,.49),encrust*.30*(1.0-smoothstep(80.0,180.0,-vWorld.y)));
    if(uPattern>1.5){
      float mineral=smoothstep(.44,.68,fbm3(vWorld*2.6));
      base=mix(base,vec3(.39,.32,.18),mineral*.65);
    }
    relief=strata*.014+grain*.095+pores*.025-fracture*.055;
  } else if (uKind < 2.5) {
    float polyp=pow(noise3(vWorld*47.0),3.0);
    base*=.58+grain*.44+polyp*.31;
    relief=polyp*.012+rough*.006;
    if(uPattern>0.5){
      vec3 q=vWorld*26.0;
      float ridge=abs(sin(q.x+sin(q.z*.71+q.y*.52)*2.4+sin(q.z*1.72-q.x*.24)*.65));
      float crest=smoothstep(.16,.72,ridge);
      base*=.74+crest*.27;relief+=crest*.016;
    }
  } else if (uKind < 3.5) {
    float vein = pow(abs(sin(vUv.x*3.14159)),0.35);
    base*=.65+vein*.35+sin(vUv.y*89.0+vUv.x*14.0)*.045;
    relief=sin(vUv.y*100.0+vUv.x*7.0)*.0015;roughness=.48;
  } else if (uKind < 4.5) {
    roughness=.38;f0=.035;
    float mottling=fbm3(vLocal*5.7);
    base*=.77+mottling*.36;relief=noise3(vLocal*90.0)*.0008;
    if(uMotion>3.5&&uMotion<4.5)base*=0.78+fbm3(vLocal*1.4)*0.40;
    #ifdef FAUNA
      if(uSkinKind<.5){
        vec2 q=vec2(vLocal.x*48.0,vLocal.y*63.0);q.x+=mod(floor(q.y),2.0)*.5;
        vec2 cell=fract(q)-.5;float scaleRim=smoothstep(.37,.47,length(cell*vec2(.78,1.0)));
        float resolved=1.0-smoothstep(.6,2.0,max(fwidth(q.x),fwidth(q.y)));
        base*=1.0-scaleRim*resolved*.12;relief+=scaleRim*resolved*.0013;
        roughness=.29+mottling*.12;
      }else if(uSkinKind<1.5){
        float dots=smoothstep(.55,.73,noise3(vLocal*105.0));
        base*=.74+fbm3(vLocal*17.0)*.42-dots*.24;
        relief+=noise3(vLocal*38.0)*.0016;roughness=.40;
      }else if(uSkinKind<2.5){
        base*=.76+noise3(vLocal*26.0)*.33;relief+=noise3(vLocal*47.0)*.002;roughness=.42;
      }else if(uSkinKind<3.5){
        relief+=noise3(vLocal*56.0)*.007;roughness=.75;
      }else if(uSkinKind<4.5){
        base*=.84+fbm3(vLocal*12.0)*.25;roughness=.42;f0=.018;
      }else{
        base*=.61+fbm3(vLocal*23.0)*.41;roughness=.61;f0=.01;
        relief+=noise3(vLocal*35.0)*.002;
      }
      if(vTissue>.5&&vTissue<1.5){
        float rays=pow(abs(sin(vUv.x*150.0)),9.0);
        base*=.75+rays*.20;relief=rays*.0006;roughness=.47;
      }
      if(vTissue>1.5&&vTissue<2.5){relief=0.0;roughness=.13;f0=.045;}
      if(vTissue>2.5){relief=0.0;roughness=.82;f0=.007;}
    #endif
  }
  n=surfaceNormal(n,relief,1.0);
  vec3 sun = normalize(vec3(uSunDir.x*0.6,max(0.45,uSunDir.y),uSunDir.z*0.6));
  float lambert = max(dot(n,sun),0.0);
  float hemi = n.y*0.5+0.5;
  float depth = max(0.0,-vWorld.y);
  float localDeep=smoothstep(100.0,700.0,depth);
  float sunlight = uDiveLight*exp(-depth*0.011)*(1.0-localDeep);
  float shadow = depth>220.0||uUnderwaterShadowMode>.5 ? 1.0 : reefShadow(vWorld,n);
  vec3 spectrum=mix(vec3(1.0),uSunColor/max(max(uSunColor.r,uSunColor.g),max(uSunColor.b,0.001)),0.65);
  float ambient=mix(.20,.001,localDeep)*exp(-depth*.004)*mix(1.0,.10,uDiveNight*(1.0-localDeep));
  vec3 irradiance=vec3(.48,.68,.75)*ambient*(.35+hemi*.9);
  vec3 sunEnergy=spectrum*uDiveLight*exp(-vec3(.032,.014,.010)*depth/max(.35,sun.y))*(1.0-localDeep);
  irradiance+=sunEnergy*lambert*1.65*shadow;
  irradiance+=vec3(.09,.14,.10)*sunlight*(1.0-hemi)*.30;
  if(uKind>1.5&&uKind<2.5)irradiance+=sunEnergy*(.24+max(.0,dot(-n,sun))*.15)+vec3(.38,.39,.34)*sunlight*.45;
  float ca = caustic(vWorld)*sunlight*max(0.0,n.y*0.75+0.25)*shadow;
  irradiance+=sunEnergy*ca*.80;
  float fresnel = pow(1.0-max(dot(n,viewDir),0.0),3.0);
  if(uKind>2.5&&uKind<3.5)irradiance+=vec3(.43,.43,.17)*sunlight*max(0.0,dot(-n,sun))*.85;
  vec3 right=normalize(cross(uDiveForward,vec3(.0001,1.0,0.0)));
  vec3 lampDirection=normalize(uCamPos+right*.75+vec3(0,.18,0)-vWorld);
  vec3 fillDirection=normalize(uCamPos-right*.70+vec3(0,.12,0)-vWorld);
  float lampCone=pow(max(dot(-viewDir,uDiveForward),0.0),5.0);
  float lamp=uLamp*lampCone*7.5/(1.0+dist*dist*.045);
  float lampShadow=uUnderwaterShadowMode>.5?reefShadow(vWorld,n):1.0;
  irradiance+=vec3(.94,.96,1.0)*lamp*(max(.0,dot(n,lampDirection))*(.16+.84*lampShadow)+max(.0,dot(n,fillDirection))*.38);
  irradiance += vec3(0.4,0.6,0.8)*uAmbientFlash*exp(-depth*0.028)*(1.0-uDiveDeep);
  vec3 col = base*irradiance;
  // A modest photographic white balance recovers near-field coral color;
  // the distance-dependent water transmission still removes red in the blue.
  col.r*=1.0+.12*(1.0-uDiveDeep)*(1.0-exp(-dist*.08));
  if (uKind > 3.5 && uKind < 4.5) {
    col+=sunEnergy*waterSpecular(n,viewDir,sun,roughness,f0)*shadow;
    col+=vec3(.93,.96,1.0)*waterSpecular(n,viewDir,lampDirection,roughness,f0)*lamp*lampShadow;
    #ifdef FAUNA
      if(vTissue>.5&&vTissue<1.5)col+=base*(sunEnergy*max(.0,dot(-n,sun))*.32+lamp*max(.0,dot(-n,viewDir))*.08);
    #endif
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
    uniforms: { ...U, uKind: { value: kind }, uPattern: { value: options.pattern || 0 }, uMotion: { value: options.motion || 0 }, uGlow: { value: options.glow || 0 }, uOpacity: { value: options.opacity ?? 1 }, uAnchored:{value:options.anchored?1:0},uSkinKind:{value:options.skin??0},uAnimalMotion:{value:new THREE.Vector4(0,1,0,0)} },
    defines: { ...(options.fauna?{FAUNA:1}:{}), ...(options.animalMotion?{ANIMAL_MOTION:1}:{}) },
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
