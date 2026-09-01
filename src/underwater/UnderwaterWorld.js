import * as THREE from 'three';
import { U } from '../core/SharedUniforms.js';
import { FullScreenPass, makeRT } from '../gfx/FullScreenPass.js';
import { createHabitatGeometry } from './ReefGeometry.js';
import { MarineLife } from './MarineLife.js';
import { BACKGROUND_FRAG, WATER_GLSL } from './UnderwaterMaterial.js';
import { HABITATS, habitatFor, seeded, currentAt, normalizeGenerator, parseSeed } from './WorldMath.js';
import { connectedHabitat, oceanFloor, smooth } from './OceanDomain.js';
import { OceanDynamics, DEEP_SOURCE, flowAt } from './OceanDynamics.js';
import { createOceanTerrain, createPelagicLife } from './OceanTerrain.js';
import { OceanFauna } from './OceanFauna.js';
import { OCEAN_COUPLING_GLSL } from '../ocean/OceanCouplingGLSL.js';

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
  float lampBeam=pow(max(dot(rd,uDiveForward),0.0),25.0)*uLamp;
  col+=vec3(.016,.023,.026)*lampBeam*(1.0-exp(-lengthRay*.021))*uDiveDeep;
  outColor=vec4(col,1.0);outVelocity=data;
}
`;

const PARTICLE_VERT = /* glsl */ `
${OCEAN_COUPLING_GLSL}
attribute float aSeed;
attribute float aSize;
uniform float uTime;
uniform float uCurrent;
uniform vec3 uCamPos;
uniform float uSmoke;
uniform float uPixelHeight;
uniform float uSediment;
varying float vAlpha;
varying float vDist;
varying vec3 vPos;
void main() {
  vec3 p=position;
  if (uSmoke>0.5) {
    float activity=uUpwelling*(1.0+uSediment);
    float age=fract(aSeed+uTime*(0.016+aSeed*0.008)*activity);
    p.y+=age*(22.0+activity*14.0);
    p.x+=sin(age*8.0+aSeed*30.0)*age*4.0+age*age*activity*5.0;
    p.z+=cos(age*9.0+aSeed*12.0)*age*3.0;
    vAlpha=sin(age*3.14159)*0.16*min(activity,2.0);
  } else {
    vec3 flow=oceanFlow(uCamPos,uTime);
    p.x+=uTime*flow.x;
    p.y+=uTime*(flow.y-0.05-uSurfaceMixing*0.06);
    p.z+=sin(uTime*0.06+aSeed*40.0)*0.55;
    p=mod(p-uCamPos+vec3(60.0,35.0,60.0),vec3(120.0,70.0,120.0))-vec3(60.0,35.0,60.0)+uCamPos;
    vAlpha=0.17+uSurfaceMixing*exp(min(0.0,uCamPos.y)/80.0)*0.16+uSediment*exp(-abs(uCamPos.y+1420.0)*.012)*.12;
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
  if(uDiveDeep>0.5&&uSmoke<0.5){
    float beam=pow(max(dot(normalize(vPos-uCamPos),uDiveForward),0.0),6.0)*uLamp;
    col=vec3(.59,.63,.63)*(.012+beam*1.5/(1.0+vDist*vDist*.018));
    a*=.25+beam*.75;
  }
  if(uSmoke>0.5)a*=0.5+noise3(vec3(p*4.0,uTime*0.2))*0.5;
  outColor=vec4(col,a);outVelocity=vec4(0.0,0.0,vDist,a);
}
`;

function disposeTree(root) {
  const geometries=new Set(), materials=new Set();
  root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);if(o.isInstancedMesh)o.dispose();});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
}

export class UnderwaterWorld {
  constructor(app) {
    this.app=app;this.scene=new THREE.Scene();this.generation=0;
    this.dynamics=new OceanDynamics();this.localCamera=new THREE.Vector3();
    this.shadowTarget=new THREE.WebGLRenderTarget(1536,1536,{depthBuffer:true,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
    this.shadowTarget.depthTexture=new THREE.DepthTexture(1536,1536,THREE.UnsignedIntType);
    this.shadowCamera=new THREE.OrthographicCamera(-86,86,86,-86,1,260);
    this.diveShadowCamera=new THREE.PerspectiveCamera(78,1,.20,140);
    this.shadowMaterial=new THREE.MeshDepthMaterial({side:THREE.DoubleSide});
    this.shadowFrame=0;
    this.shadowDirection=new THREE.Vector3(9,9,9);
    this.shadowCenter=new THREE.Vector3(1e6,1e6,1e6);
    this.background=new FullScreenPass(BACKGROUND_FRAG,app.ocean.bind({...U}),{name:'submerged-sky'});
    this.volume=new FullScreenPass(VOLUME_FRAG,{...U,uScene:{value:null},uDepth:{value:null},uShaftSteps:{value:12}},{name:'underwater-light-shafts'});
    const p=app.params;
    U.uCausticSlope.value=app.ocean.cascades[1].derivatives;
    U.uCausticSpan.value=app.ocean.lengthScales[1];
    this.settings=normalizeGenerator(Object.fromEntries(p.entries()));
    this.generate(p.get('site')||'reef',parseSeed(p.get('seed'),713),this.settings);
  }

  generate(id, seed, input = this.settings) {
    const settings=normalizeGenerator(input);seed=parseSeed(seed,713);
    const recipe={...settings,seed,worldSeed:seed},sites=new Map(),worldRocks=[];
    // Population controls do not change the rocks or plants. Keep their meshes
    // and only replace animal populations when the terrain recipe is unchanged.
    const reuseScenery=this.root&&seed===this.seed&&['relief','life','height'].every(key=>settings[key]===this.recipe[key]);
    const root=reuseScenery?this.root:new THREE.Group(),staged=[];
    let snow,pelagic,fauna;
    try {
      if(!reuseScenery){root.name='One connected ocean';root.add(createOceanTerrain(recipe));}
      for(const base of HABITATS) {
        const habitat=connectedHabitat(base,seed,settings);
        const next=reuseScenery?{group:this.sites.get(base.id).group,ventPositions:[],rocks:this.sites.get(base.id).localRocks}:createHabitatGeometry(habitat);
        if(!reuseScenery){next.group.position.set(habitat.origin[0],0,habitat.origin[1]);root.add(next.group);}
        const rocks=(next.rocks||[]).map(r=>({...r,x:r.x+habitat.origin[0],z:r.z+habitat.origin[1],feedingPoints:r.feedingPoints.map(p=>({...p,x:p.x+habitat.origin[0],z:p.z+habitat.origin[1]}))}));
        worldRocks.push(...rocks);
        const life=new MarineLife(habitat,rocks);
        if(reuseScenery)staged.push(life.group);else next.group.add(life.group);
        if(next.ventPositions.length){
          const vents=next.ventPositions.map(v=>[v[0]+habitat.origin[0],v[1],v[2]+habitat.origin[1]]);
          root.add(this.makeParticles(habitat,vents,true));
        }
        sites.set(base.id,{habitat,group:next.group,life,localRocks:next.rocks||[]});
      }
      snow=reuseScenery?this.snow:this.makeParticles(recipe,[],false);
      if(!reuseScenery)root.add(snow);
      pelagic=createPelagicLife(recipe);staged.push(pelagic.group);
      fauna=new OceanFauna(recipe,worldRocks);staged.push(fauna.group);
    } catch(error) {
      staged.forEach(disposeTree);if(!reuseScenery)disposeTree(root);
      throw error;
    }
    if(reuseScenery){
      for(const [siteId,site] of sites){const old=this.sites.get(siteId).life.group;site.group.remove(old);disposeTree(old);site.group.add(site.life.group);}
      for(const old of [this.pelagic.group,this.fauna.group]){root.remove(old);disposeTree(old);}
    }else if(this.root){
      this.scene.remove(this.root);disposeTree(this.root);
    }
    root.add(pelagic.group,fauna.group);
    this.app.renderer.renderLists.dispose();
    this.root=root;this.scene.add(root);this.sites=sites;this.snow=snow;this.pelagic=pelagic;this.fauna=fauna;
    this.shadowDirty=true;
    this.settings=settings;this.seed=seed;this.recipe=recipe;this.habitat=sites.get(id)?.habitat||sites.get('reef').habitat;this.generation++;
    this.life=sites.get(this.habitat.id).life;
    this.bornAt=this.app.time;
    this.app.post && (this.app.post.reset=true);
    this.update(this.app.time,this.app.camera);
    this.stats={fish:0,animals:pelagic.count+fauna.count,forms:fauna.typeCount,vertices:0,seed,generation:this.generation};
    const legacyForms=new Set();
    for(const site of sites.values()){this.stats.fish+=site.life.fishCount;this.stats.animals+=site.life.animals.length;}
    for(const site of sites.values()){if(site.life.fishCount)legacyForms.add('shoal');for(const a of site.life.animals)legacyForms.add(a.type);}
    if(pelagic.jellyCount)legacyForms.add('jelly');
    if(pelagic.chainCount)legacyForms.add('siphonophore');
    this.stats.forms+=legacyForms.size;
    this.root.traverse(o=>{if(o.geometry)this.stats.vertices+=o.geometry.attributes.position.count;});
  }

  select(id) { const site=this.sites.get(id);if(site){this.habitat=site.habitat;this.life=site.life;}return this.habitat; }
  floor(x,z) { return oceanFloor(x,z,{...this.settings,seed:this.seed}); }
  flow(position) { return flowAt(position,this.app.time,this.app.weather?.state,this.settings,{mixing:this.dynamics.mixing,
    vortices:[U.uVortex0.value,U.uVortex1.value,U.uVortex2.value,U.uVortex3.value],
    solitons:[[U.uSoliton0.value,U.uSoliton0b.value],[U.uSoliton1.value,U.uSoliton1b.value]]}); }
  tremor() { this.dynamics.tremor();if(this.app.camera.position.y<-900)this.app.cine.impulse(0.75); }
  tick(dt) {
    const w=this.app.weather?.state||{};
    this.dynamics.update(dt,w,this.settings);
    U.uDeepPulse.value.set(DEEP_SOURCE.x,DEEP_SOURCE.z,this.dynamics.pulseAge,this.dynamics.pulseStrength);
    U.uUpwelling.value=this.settings.upwelling;U.uNutrientBloom.value=this.dynamics.nutrients;
    U.uSurfaceMixing.value=this.dynamics.mixing;U.uSediment.value=this.dynamics.sediment;
    U.uCurrentScale.value=this.settings.current;
    U.uFlowForcing.value.set(Math.cos(w.windAngle??0),Math.sin(w.windAngle??0),.16+(w.windSpeed??5)*.018+(w.storm??0)*.75,w.swellHs??1);
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
    const depth=Math.max(0,-camera.position.y),deep=smooth(100,900,depth);
    const kelp=Math.exp(-((camera.position.x-150)**2+(camera.position.z-110)**2)/18000)*(1-smooth(40,110,depth));
    const reef=Math.exp(-((camera.position.x+140)**2+(camera.position.z-140)**2)/23000)*(1-smooth(40,110,depth));
    U.uWaterTint.value.set(.004+kelp*.021+reef*.002,.060+kelp*.025+reef*.045,.13-kelp*.065+reef*.015).lerp(new THREE.Vector3(.00007,.00015,.00024),deep);
    U.uWaterTint.value.multiplyScalar(Math.exp(-Math.max(0,depth-85)*.012));
    U.uExtinction.value.set(.027+kelp*.005,.012+kelp*.009+reef*.004,.009+kelp*.019+reef*.002).lerp(new THREE.Vector3(.031,.019,.015),deep);
    U.uDiveDeep.value=deep;
    U.uDiveNight.value=1-THREE.MathUtils.smoothstep(el,-0.13,0.07);
    U.uDiveLight.value=(0.22+Math.sqrt(Math.max(0,Math.sin(el)))*0.9)*(1-cover*0.60)*(1-storm*0.35)*(1-U.uDiveNight.value*0.95);
    U.uCurrent.value=currentAt(time,Math.max(0,-camera.position.y),w?.windSpeed??5,storm)*this.settings.current;
    U.uClarity.value=this.settings.clarity;
    U.uBioStrength.value=this.settings.glow;
    camera.getWorldDirection(U.uDiveForward.value);
    const flowState={mixing:this.dynamics.mixing,vortices:[U.uVortex0.value,U.uVortex1.value,U.uVortex2.value,U.uVortex3.value],solitons:[[U.uSoliton0.value,U.uSoliton0b.value],[U.uSoliton1.value,U.uSoliton1b.value]]};
    const environment={diver:this.app.cine?.free?camera.position:null,flow:(p,t)=>flowAt(p,t+this.bornAt,w,this.settings,flowState)};
    this.fauna.update(time-this.bornAt,camera.position,environment);
    environment.hunters=this.fauna.hunters;
    for(const site of this.sites.values()){
      const [x,z]=site.habitat.origin;
      this.localCamera.set(camera.position.x-x,camera.position.y,camera.position.z-z);
      site.group.visible=Math.hypot(camera.position.x-x,camera.position.z-z)<530&&Math.abs(camera.position.y-site.habitat.eye[1])<330;
      environment.visible=site.group.visible;
      site.life.update(time-this.bornAt,this.localCamera,environment);
    }
    this.pelagic.update(time-this.bornAt,camera.position);
    this.root.traverse(o=>{if(o.material?.uniforms?.uPixelHeight)o.material.uniforms.uPixelHeight.value=this.app.renderHeight;});
  }

  render(camera,target,volume=true) {
    const r=this.app.renderer;
    const lampShadows=U.uLamp.value>.05&&(camera.position.y<-160||U.uDiveNight.value>.7);
    this.shadowFrame++;
    const shadowMoved=this.shadowCenter.distanceToSquared(camera.position)>(lampShadows?.10:1600);
    if((camera.position.y>-220||lampShadows)&&(this.shadowDirty||Number(lampShadows)!==U.uUnderwaterShadowMode.value||shadowMoved||this.shadowDirection.distanceToSquared(U.uSunDir.value)>.0004||this.shadowFrame%(lampShadows?4:18)===0))this.renderShadow(camera,lampShadows);
    if(!this.composite||this.composite.width!==target.width||this.composite.height!==target.height){
      this.composite?.dispose();this.composite=makeRT(target.width,target.height,{count:2,name:'underwater-volume'});
    }
    r.setRenderTarget(target);r.setClearColor(0x001018,1);r.clear(true,true,false);
    this.background.render(r,target);r.render(this.scene,camera);
    if(!volume){r.setRenderTarget(null);return target;}
    this.volume.set('uScene',target.textures[0]).set('uDepth',target.textures[1]);
    this.volume.set('uShaftSteps',['potato','low'].includes(this.app.quality.presetName)?8:18);
    this.volume.render(r,this.composite);r.setRenderTarget(null);return this.composite;
  }

  renderShadow(camera,lamp=false) {
    const r=this.app.renderer,cam=lamp?this.diveShadowCamera:this.shadowCamera;
    const center=new THREE.Vector3(camera.position.x,this.floor(camera.position.x,camera.position.z)+12,camera.position.z-18);
    const sun=U.uSunDir.value.clone();sun.y=Math.max(0.45,sun.y);sun.normalize();
    if(lamp){
      const right=new THREE.Vector3().crossVectors(U.uDiveForward.value,new THREE.Vector3(.0001,1,0)).normalize();
      cam.position.copy(camera.position).addScaledVector(right,.75);cam.position.y+=.18;
      cam.lookAt(center.copy(camera.position).addScaledVector(U.uDiveForward.value,30));
    }else{
      const extent=this.app.expedition?.watch?.following?36:86;
      cam.left=cam.bottom=-extent;cam.right=cam.top=extent;cam.updateProjectionMatrix();
      cam.position.copy(center).addScaledVector(sun,120);cam.lookAt(center);
    }
    cam.updateMatrixWorld();U.uUnderwaterShadowMode.value=lamp?1:0;
    U.uReefShadowMatrix.value.multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse);
    const hidden=[];
    this.root.traverse(o=>{if(o.isPoints||o.name==='Marine life'||o===this.pelagic.group){hidden.push([o,o.visible]);o.visible=false;}});
    this.scene.overrideMaterial=this.shadowMaterial;
    r.setRenderTarget(this.shadowTarget);r.setClearColor(0xffffff,1);r.clear();r.render(this.scene,cam);
    this.scene.overrideMaterial=null;hidden.forEach(([o,v])=>o.visible=v);
    U.uReefShadow.value=this.shadowTarget.depthTexture;
    this.shadowDirection.copy(U.uSunDir.value);this.shadowCenter.copy(camera.position);this.shadowDirty=false;r.setRenderTarget(null);
  }
}
