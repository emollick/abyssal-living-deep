import * as THREE from 'three';
import { U } from '../core/SharedUniforms.js';
import { FullScreenPass, makeRT } from '../gfx/FullScreenPass.js';
import { createHabitatGeometry } from './ReefGeometry.js';
import { MarineLife } from './MarineLife.js';
import { BACKGROUND_FRAG, WATER_GLSL } from './UnderwaterMaterial.js';
import { habitatFor, seeded, currentAt, normalizeGenerator, parseSeed } from './WorldMath.js';

const VOLUME_FRAG = /* glsl */ `
${WATER_GLSL}
uniform sampler2D uScene;
uniform sampler2D uDepth;
uniform mat4 uInvViewProj;
uniform int uShaftSteps;
in vec2 vUv;
layout(location=0) out vec4 outColor;
layout(location=1) out vec4 outVelocity;
void main() {
  vec4 data = texture(uDepth,vUv);
  vec3 col = texture(uScene,vUv).rgb;
  vec4 w = uInvViewProj*vec4(vUv*2.0-1.0,1.0,1.0);
  vec3 rd = normalize(w.xyz/w.w-uCamPos);
  float lengthRay = min(data.z,90.0);
  if (uDiveDeep<0.5 && uDiveLight>0.03) {
    float jitter = 0.5;
    vec3 sun = normalize(vec3(uSunDir.x*0.6,max(0.45,uSunDir.y),uSunDir.z*0.6));
    float shaft = 0.0;
    float stepSize = lengthRay/float(uShaftSteps);
    for (int i=0;i<uShaftSteps;i++) {
      float d=(float(i)+jitter)*stepSize;
      vec3 p=uCamPos+rd*d;
      vec2 at=p.xz-sun.xz*p.y/sun.y;
      float beam=noise3(vec3(at*0.065,uTime*0.025));
      beam=pow(smoothstep(0.44,0.75,beam),4.0);
      beam*=0.55+caustic(vec3(at*0.34,0.0).xzy)*0.4;
      shaft+=beam*exp(-d*0.027)*exp(min(0.0,p.y)*0.018)*stepSize;
    }
    float facing=0.45+pow(max(dot(rd,sun),0.0),3.0)*0.9;
    col+=vec3(0.24,0.36,0.27)*shaft*0.080*uDiveLight*facing*(1.0-uDiveNight);
  }
  // The lens briefly fills with water as the swimmer crosses the surface.
  float crossing=1.0-smoothstep(0.0,0.65,abs(uCamPos.y));
  col=mix(col,vec3(0.03,0.23,0.27),crossing*0.55);
  outColor=vec4(col,1.0);outVelocity=data;
}
`;

const PARTICLE_VERT = /* glsl */ `
attribute float aSeed;
attribute float aSize;
uniform float uTime;
uniform float uCurrent;
uniform vec3 uCamPos;
uniform float uSmoke;
uniform float uPixelHeight;
varying float vAlpha;
varying float vDist;
varying vec3 vPos;
void main() {
  vec3 p=position;
  if (uSmoke>0.5) {
    float age=fract(aSeed+uTime*(0.025+aSeed*0.008));
    p.y+=age*25.0;
    p.x+=sin(age*8.0+aSeed*30.0)*age*4.0+age*age*uCurrent*10.0;
    p.z+=cos(age*9.0+aSeed*12.0)*age*3.0;
    vAlpha=sin(age*3.14159)*0.14;
  } else {
    p.x+=uTime*uCurrent*0.17;
    p.y-=uTime*0.036;
    p.z+=sin(uTime*0.06+aSeed*40.0)*0.55;
    p=mod(p-uCamPos+vec3(60.0,35.0,60.0),vec3(120.0,70.0,120.0))-vec3(60.0,35.0,60.0)+uCamPos;
    vAlpha=0.23;
  }
  vec4 v=viewMatrix*vec4(p,1.0);vDist=length(v.xyz);vPos=p;
  gl_Position=projectionMatrix*v;
  gl_PointSize=clamp(aSize*uPixelHeight/max(2.0,-v.z),1.0,uSmoke>0.5?90.0:6.0);
  if(p.y>0.0)gl_PointSize=0.0;
  vAlpha*=smoothstep(1.0,3.0,vDist)*(1.0-smoothstep(40.0,65.0,vDist));
}
`;
const PARTICLE_FRAG = /* glsl */ `
${WATER_GLSL}
uniform float uSmoke;
varying float vAlpha;
varying float vDist;
varying vec3 vPos;
layout(location=0) out vec4 outColor;
layout(location=1) out vec4 outVelocity;
void main(){
  vec2 p=gl_PointCoord*2.0-1.0;float r=dot(p,p);if(r>1.0)discard;
  float a=pow(1.0-r,uSmoke>0.5?2.5:1.5)*vAlpha;
  vec3 col=uSmoke>0.5?vec3(0.09,0.17,0.19):vec3(0.27,0.49,0.44)*(0.2+uDiveLight*0.8);
  if(uDiveDeep>0.5&&uSmoke<0.5)col=vec3(0.08,0.47,0.51)*(0.7+sin(vPos.x*14.0)*0.3);
  if(uSmoke>0.5)a*=0.5+noise3(vec3(p*4.0,uTime*0.2))*0.5;
  outColor=vec4(col,a);outVelocity=vec4(0.0,0.0,vDist,a);
}
`;

function disposeTree(root) {
  const geometries=new Set(), materials=new Set();
  root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
}

export class UnderwaterWorld {
  constructor(app) {
    this.app=app;this.scene=new THREE.Scene();this.generation=0;
    this.shadowTarget=new THREE.WebGLRenderTarget(1536,1536,{depthBuffer:true,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
    this.shadowTarget.depthTexture=new THREE.DepthTexture(1536,1536,THREE.UnsignedIntType);
    this.shadowCamera=new THREE.OrthographicCamera(-86,86,86,-86,1,260);
    this.shadowMaterial=new THREE.MeshDepthMaterial();
    this.shadowDirection=new THREE.Vector3(9,9,9);
    this.background=new FullScreenPass(BACKGROUND_FRAG,app.ocean.bind({...U}),{name:'submerged-sky'});
    this.volume=new FullScreenPass(VOLUME_FRAG,{...U,uScene:{value:null},uDepth:{value:null},uShaftSteps:{value:12}},{name:'underwater-light-shafts'});
    const p=app.params;
    this.settings=normalizeGenerator(Object.fromEntries(p.entries()));
    this.generate(p.get('site')||'reef',parseSeed(p.get('seed'),habitatFor(p.get('site')).seed),this.settings);
  }

  generate(id, seed, input = this.settings) {
    const settings=normalizeGenerator(input), base=habitatFor(id);
    const habitat={...base,...settings,seed:parseSeed(seed,base.seed)};
    const next=createHabitatGeometry(habitat);
    const life=new MarineLife(habitat);
    next.group.add(life.group);
    const snow=this.makeParticles(habitat,next.ventPositions,false);next.group.add(snow);
    if(next.ventPositions.length)next.group.add(this.makeParticles(habitat,next.ventPositions,true));
    if(this.root){this.scene.remove(this.root);disposeTree(this.root);}
    this.root=next.group;this.scene.add(this.root);this.life=life;this.snow=snow;
    this.shadowDirty=true;
    this.settings=settings;this.habitat=habitat;this.generation++;
    this.bornAt=this.app.time;
    U.uWaterTint.value.fromArray(habitat.tint);U.uExtinction.value.fromArray(habitat.extinction);
    U.uDiveDeep.value=id==='deep'?1:0;
    this.app.post && (this.app.post.reset=true);
    this.update(this.app.time,this.app.camera);
    this.stats={fish:life.fishCount,animals:life.animals.length,vertices:0,seed:habitat.seed,generation:this.generation};
    this.root.traverse(o=>{if(o.geometry)this.stats.vertices+=o.geometry.attributes.position.count;});
  }

  makeParticles(habitat, vents, smoke) {
    const rng=seeded(habitat.seed+71), count=smoke?vents.length*55:1800;
    const pos=new Float32Array(count*3),seeds=new Float32Array(count),sizes=new Float32Array(count);
    for(let i=0;i<count;i++) {
      const v=smoke?vents[i%vents.length]:[(rng()-0.5)*120,(rng()-0.5)*70,(rng()-0.5)*120];
      pos.set(v,i*3);seeds[i]=rng();sizes[i]=smoke?(0.3+rng()*0.65):0.012+rng()*0.035;
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('aSeed',new THREE.BufferAttribute(seeds,1));g.setAttribute('aSize',new THREE.BufferAttribute(sizes,1));
    const m=new THREE.ShaderMaterial({name:smoke?'vent-plumes':'marine-snow',glslVersion:THREE.GLSL3,vertexShader:PARTICLE_VERT,fragmentShader:PARTICLE_FRAG,
      uniforms:{...U,uSmoke:{value:smoke?1:0},uPixelHeight:{value:this.app.renderHeight||720}},transparent:true,depthWrite:false});
    const points=new THREE.Points(g,m);points.frustumCulled=false;points.renderOrder=smoke?8:10;return points;
  }

  update(time,camera) {
    if(!camera)return;
    const w=this.app.weather?.state;
    const el=w?.sunElevation??0.66,cover=w?.cloudCoverage??0.12,storm=w?.storm??0;
    U.uDiveNight.value=1-THREE.MathUtils.smoothstep(el,-0.13,0.07);
    U.uDiveLight.value=(0.22+Math.sqrt(Math.max(0,Math.sin(el)))*0.9)*(1-cover*0.60)*(1-storm*0.35)*(1-U.uDiveNight.value*0.95);
    U.uCurrent.value=currentAt(time,Math.max(0,-camera.position.y),w?.windSpeed??5,storm)*this.settings.current;
    U.uClarity.value=this.settings.clarity;
    U.uBioStrength.value=this.settings.glow;
    camera.getWorldDirection(U.uDiveForward.value);
    this.life.update(time-this.bornAt,camera.position);
    this.root.traverse(o=>{if(o.material?.uniforms?.uPixelHeight)o.material.uniforms.uPixelHeight.value=this.app.renderHeight;});
  }

  render(camera,target) {
    const r=this.app.renderer;
    if(this.shadowDirty||this.shadowDirection.distanceToSquared(U.uSunDir.value)>0.0004)this.renderShadow();
    if(!this.composite||this.composite.width!==target.width||this.composite.height!==target.height){
      this.composite?.dispose();this.composite=makeRT(target.width,target.height,{count:2,name:'underwater-volume'});
    }
    r.setRenderTarget(target);r.setClearColor(0x001018,1);r.clear(true,true,false);
    this.background.render(r,target);r.render(this.scene,camera);
    this.volume.set('uScene',target.textures[0]).set('uDepth',target.textures[1]);
    this.volume.set('uShaftSteps',['potato','low'].includes(this.app.quality.presetName)?8:18);
    this.volume.render(r,this.composite);r.setRenderTarget(null);return this.composite;
  }

  renderShadow() {
    const r=this.app.renderer,cam=this.shadowCamera;
    const center=new THREE.Vector3(0,-this.habitat.depth+12,-5);
    const sun=U.uSunDir.value.clone();sun.y=Math.max(0.45,sun.y);sun.normalize();
    cam.position.copy(center).addScaledVector(sun,120);cam.lookAt(center);cam.updateMatrixWorld();
    U.uReefShadowMatrix.value.multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse);
    const hidden=[];
    this.root.traverse(o=>{if(o.isPoints||o===this.life.group){hidden.push([o,o.visible]);o.visible=false;}});
    this.scene.overrideMaterial=this.shadowMaterial;
    r.setRenderTarget(this.shadowTarget);r.setClearColor(0xffffff,1);r.clear();r.render(this.scene,cam);
    this.scene.overrideMaterial=null;hidden.forEach(([o,v])=>o.visible=v);
    U.uReefShadow.value=this.shadowTarget.depthTexture;
    this.shadowDirection.copy(U.uSunDir.value);this.shadowDirty=false;r.setRenderTarget(null);
  }
}
