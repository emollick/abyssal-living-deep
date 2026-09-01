import * as THREE from 'three';
import { seeded, TAU, normalizeGenerator, parseSeed } from './WorldMath.js';
import { oceanFloor, transectPose, SITE_ORIGINS } from './OceanDomain.js';
import { creatureGeometry } from './FaunaGeometry.js';
import { waterMaterial } from './UnderwaterMaterial.js';
import { AnimalMotion } from './AnimalMotion.js';
import { excursionDepth } from './OceanEcology.js';

export const FAUNA = {
  butterflyfish:{name:'Butterflyfish',motion:5,behavior:'forage',size:.15,skin:0},
  parrotfish:{name:'Parrotfish',motion:5,behavior:'forage',size:.27,skin:0},
  reefshark:{name:'Reef sharks',motion:5,behavior:'cruise',size:.55,hunter:true,skin:4},
  tuna:{name:'Tuna',motion:5,behavior:'school',size:.49,hunter:true,skin:0},
  sunfish:{name:'Ocean sunfish',motion:13,behavior:'hover',size:.60,skin:4},
  dolphin:{name:'Dolphins',motion:10,behavior:'cruise',size:.68,skin:4},
  seal:{name:'Seals',motion:15,behavior:'cruise',size:.50,skin:4},
  lanternfish:{name:'Lanternfish',motion:5,behavior:'school',size:.105,skin:0},
  hatchetfish:{name:'Hatchetfish',motion:5,behavior:'school',size:.09,skin:0},
  dragonfish:{name:'Dragonfish',motion:8,behavior:'hover',size:.22,hunter:true,skin:5},
  anglerfish:{name:'Anglerfish',motion:5,behavior:'hover',size:.29,hunter:true,skin:5},
  gulpereel:{name:'Gulper eels',motion:8,behavior:'hover',size:.20,hunter:true,skin:5},
  squid:{name:'Squid',motion:6,behavior:'jet',size:.24,skin:1},
  vampire:{name:'Vampire squid',motion:7,behavior:'hover',size:.23,skin:1},
  flapjack:{name:'Flapjack octopuses',motion:7,behavior:'hover',size:.22,skin:1},
  octopus:{name:'Octopuses',motion:7,behavior:'crawl',size:.36,benthic:true,skin:1},
  crab:{name:'Crabs',motion:9,behavior:'crawl',size:.17,benthic:true,skin:2},
  shrimp:{name:'Midwater shrimp',motion:12,behavior:'jet',size:.066,skin:2},
  ventshrimp:{name:'Vent shrimp',motion:12,behavior:'crawl',size:.038,benthic:true,skin:2},
  starfish:{name:'Sea stars',motion:11,behavior:'settled',size:.16,benthic:true,skin:3},
  brittlestar:{name:'Brittle stars',motion:11,behavior:'settled',size:.13,benthic:true,skin:3},
  urchin:{name:'Sea urchins',motion:0,behavior:'settled',size:.13,benthic:true,skin:3},
  isopod:{name:'Giant isopods',motion:9,behavior:'crawl',size:.19,benthic:true,skin:2},
  cucumber:{name:'Sea cucumbers',motion:9,behavior:'crawl',size:.26,benthic:true,skin:3},
  seapen:{name:'Sea pens',motion:11,behavior:'settled',size:.46,benthic:true,skin:3},
};

// Exploration-scale swimming speeds and rhythms, not a measured animal model.
export const RHYTHMS={
  butterflyfish:[.30,2.8],parrotfish:[.45,1.8],reefshark:[1.15,.85],tuna:[1.35,1.7],
  sunfish:[.24,.55],dolphin:[1.55,.75],seal:[.90,.85],lanternfish:[.18,3.2],hatchetfish:[.13,3],
  dragonfish:[.12,.65],anglerfish:[.065,.50],gulpereel:[.16,.65],squid:[.62,.6],
  vampire:[.07,.28],flapjack:[.085,.4],octopus:[.05,.4],crab:[.085,.5],shrimp:[.13,1.5],
  ventshrimp:[.026,.5],isopod:[.022,.35],cucumber:[.004,.1],
};
// Separation includes fins and the spread of webbed arms. Rock/floor clearance
// still uses the smaller body radius, so a grazer can reach its feeding patch.
export const PERSONAL_SPACE={butterflyfish:1,parrotfish:1.05,reefshark:1.5,tuna:1.3,sunfish:1.55,dolphin:1.5,seal:1.4,
  vampire:1.8,flapjack:1.9,octopus:1.7,crab:1.2};

// Broad, overlapping depth communities rather than a hard scene switch.
// Sizes approximate natural body lengths; abundance is composed for exploration,
// not intended to estimate the density or geography of a real ecosystem.
export const MIDWATER_COMMUNITIES = [
  {min:70,max:200,types:['tuna','squid','shrimp']},
  {min:200,max:530,types:['lanternfish','hatchetfish','squid','shrimp']},
  {min:530,max:930,types:['vampire','dragonfish','lanternfish','hatchetfish','shrimp']},
  {min:930,max:1450,types:['anglerfish','gulpereel','dragonfish','flapjack','shrimp']},
];

export function communityAt(depth) {
  return MIDWATER_COMMUNITIES.find(c=>depth>=c.min&&depth<c.max)||MIDWATER_COMMUNITIES[0];
}

export function makeFaunaPopulation(input={}) {
  const recipe={...input,...normalizeGenerator(input),seed:parseSeed(input.seed,713)},seed=recipe.seed;
  const population=[],rng=seeded(seed+90217);
  let serial=0,schoolSerial=0;
  function add(type,amount,center,zone,spread=8,heading=0,cohort=0) {
    const spec=FAUNA[type];
    const factor=recipe.shoal*(spec.benthic?recipe.benthos:(spec.hunter?recipe.predators:1));
    const count=Math.round(amount*factor);
    const school=schoolSerial++,schoolPhase=cohort||rng()*TAU;
    for(let i=0;i<count;i++){
      const first=i===0,angle=rng()*TAU,r=first?0:Math.sqrt(rng())*spread;
      let x=center[0]+Math.cos(angle)*r;
      const z=center[2]+Math.sin(angle)*r;
      const scale=spec.size*(.78+rng()*.43);
      const y=spec.benthic?oceanFloor(x,z,recipe):center[1]+(first?0:(rng()-.5)*spread*.52);
      if(!spec.benthic&&y<-100){
        // Keep the entire swimming path in the canyon's open water. Merely
        // lifting misplaced animals onto a shoulder would change their depth.
        for(let attempt=0;attempt<18;attempt++){
          const clearance=Math.max(oceanFloor(x-6,z,recipe),oceanFloor(x+6,z,recipe),oceanFloor(x,z+4,recipe));
          if(y>clearance+3)break;
          x*=.75;
        }
      }
      population.push({
        id:serial++,type,zone,benthic:!!spec.benthic,hunter:!!spec.hunter,
        x,y,z,
        phase:first?0:rng()*TAU,cohort:schoolPhase,school,
        anchorX:center[0],anchorY:center[1],anchorZ:center[2],behavior:spec.behavior,
        maxSpeed:RHYTHMS[type]?.[0]??0,beat:RHYTHMS[type]?.[1]??0,
        pursuer:type==='reefshark'||type==='tuna',reverse:spec.behavior==='jet',sideways:type==='crab',
        radius:scale*(type==='sunfish'?.85:spec.benthic?.45:.50),turnRate:spec.behavior==='cruise'?.85:1.4,
        personalSpace:scale*(PERSONAL_SPACE[type]??.7),
        scale,variant:i%2,heading:heading+(rng()-.5)*.5,
        speed:(.72+rng()*.55)*(spec.behavior==='cruise'?1.4:1),
        orbit:spec.behavior==='school'?1.2:spec.behavior==='cruise'?7.0:.45,
      });
    }
  }
  function local(id,type,count,x,y,z,spread=9,heading=0) {
    const origin=SITE_ORIGINS[id];
    add(type,count,[origin[0]+x,y,origin[1]+z],id,spread,heading);
  }
  local('reef','butterflyfish',30,-4,-27,19,7);
  local('reef','parrotfish',18,6,-27,16,7,Math.PI);
  local('reef','reefshark',3,-9,-16,-2,15);
  local('reef','octopus',5,-7,0,17,13);
  local('reef','crab',12,7,0,22,17);
  local('reef','starfish',24,-3,0,21,26);
  local('reef','urchin',21,12,0,9,23);
  local('kelp','seal',4,-5,-21,15,17);
  local('kelp','crab',18,3,0,20,21);
  local('kelp','octopus',5,-7,0,12,20);
  local('kelp','starfish',26,-6,0,18,24);
  local('kelp','urchin',35,9,0,16,27);
  local('blue','sunfish',3,10,-43,21,15,Math.PI);
  local('blue','tuna',18,-12,-47,12,15);
  local('blue','dolphin',5,-10,-24,1,19);
  local('blue','squid',9,6,-53,13,17,Math.PI);
  local('blue','reefshark',2,-15,-56,-12,18);

  const bandDepths=[105,200,315,445,600,750,890,1000,1120,1250,1360];
  for(const depth of bandDepths)for(const column of [false,true]){
    const pose=column?{eye:[0,-depth,-724],look:[0,-depth-6,-764]}:transectPose(depth,recipe);
    const dx=pose.look[0]-pose.eye[0],dz=pose.look[2]-pose.eye[2],n=Math.hypot(dx,dz);
    const forward=[dx/n,dz/n],right=[-forward[1],forward[0]];
    const types=communityAt(depth).types,zone=depth<200?'slope':depth<530?'upper-twilight':depth<930?'lower-twilight':'midnight';
    for(let k=0;k<types.length;k++){
      const type=types[k],spec=FAUNA[type],side=(k-(types.length-1)/2)*1.8,distance=5.5+(k%2)*4.5;
      // Column bands share a horizontal position. Repeating a bottom-hugging
      // species in every band stacked all of them on the same seabed patch.
      // The vent habitat and slope transect already place these octopuses.
      if(column&&type==='flapjack')continue;
      const x=pose.eye[0]+forward[0]*distance+right[0]*side;
      const z=pose.eye[2]+forward[1]*distance+right[1]*side;
      const y=type==='flapjack'?oceanFloor(x,z,recipe)+1.0:-depth-.9+(k%3-1)*1.05;
      const number=spec.behavior==='school'?17:type==='shrimp'?7:1;
      add(type,number,[x,y,z],zone,2.4,k%2?Math.PI:0,depth*.01+k);
    }
    if(!column&&depth>180){
      const y=oceanFloor(pose.eye[0]+9,pose.eye[2]-5,recipe);
      add('seapen',7,[pose.eye[0]+9,y,pose.eye[2]-5],zone,10);
      add('brittlestar',5,[pose.eye[0]+6,y,pose.eye[2]-6],zone,9);
    }
  }
  const deepY=(x,z)=>oceanFloor(x,z+SITE_ORIGINS.deep[1],recipe);
  local('deep','anglerfish',1,2,deepY(2,26)+3.6,26,5,Math.PI);
  local('deep','gulpereel',1,7,deepY(7,18)+4.0,18,7);
  local('deep','flapjack',2,-2,deepY(-2,28)+.8,28,5);
  local('deep','isopod',5,-1,0,28,9);
  local('deep','crab',8,4,0,24,15);
  local('deep','ventshrimp',52,-8,0,14,8);
  local('deep','ventshrimp',35,11,0,-9,7);
  local('deep','brittlestar',27,-5,0,22,19);
  local('deep','cucumber',12,5,0,24,15);
  local('deep','seapen',17,-10,0,6,21);
  return population;
}

function faunaPosition(animal,time,recipe,out={}) {
  const spec=FAUNA[animal.type],phase=animal.phase,t=time*animal.speed;
  let x=animal.x,y=animal.y,z=animal.z,feeding=0,activity=.5,stroke=t*2+phase;
  if(spec.behavior==='cruise'){
    const a=t*.037+phase,r=animal.orbit*1.6;
    x+=Math.sin(a)*r+Math.sin(a*.63)*1.3;z+=(Math.cos(a)-1)*r*.7;
    y+=Math.sin(t*.065+phase)*(animal.type==='reefshark'?3.2:1.8);
  }else if(spec.behavior==='school'){
    const a=time*.052+animal.cohort,r=animal.type==='tuna'?5:1.7;
    x+=(Math.sin(a)-Math.sin(animal.cohort))*r;
    z+=(Math.cos(a*.81)-Math.cos(animal.cohort*.81))*r*.65;
    y+=Math.sin(time*.18+animal.cohort)*.14+Math.sin(t*.37+phase)*.07;
  }else if(spec.behavior==='forage'){
    const cycle=(t*.025+phase/TAU)%1;
    const ease=v=>{v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);};
    feeding=ease((cycle-.20)/.18)*(1-ease((cycle-.65)/.18));
    const patch=animal.feedingPoint||{x:animal.x+Math.cos(animal.heading)*1.2,z:animal.z-Math.sin(animal.heading)*1.2};
    const bed=patch.y??oceanFloor(patch.x,patch.z,recipe);
    x+=(patch.x-animal.x)*feeding+Math.sin(t*.15+phase)*.7*(1-feeding);
    z+=(patch.z-animal.z)*feeding+Math.cos(t*.11+phase)*.45*(1-feeding);
    y+=(bed+Math.max(.16,animal.scale*.6)-y)*feeding;
    activity=1-feeding*.85;
  }else if(spec.behavior==='jet'){
    const cycle=t*(animal.type==='shrimp'?2.4:1.7)+phase;
    const a=(cycle-.8*Math.sin(cycle))*.07,range=Math.min(2.5,animal.scale*5);
    x+=Math.sin(a)*range;z+=(Math.cos(a)-1)*range*.65;
    y+=Math.sin(a*.7)*animal.scale*.4;stroke=cycle;activity=.2+.8*(1-Math.cos(cycle))*.5;
  }else if(spec.behavior==='hover'){
    x+=Math.sin(t*.16+phase)*animal.orbit;z+=Math.cos(t*.14+phase)*animal.orbit*.6;
    y+=Math.sin(t*.21+phase)*animal.scale*.35;activity=.15;
  }else if(spec.behavior==='crawl'){
    const cycle=(t+phase*3)/22,whole=Math.floor(cycle),u=Math.max(0,Math.min(1,((cycle-whole)-.22)/.52));
    const progress=whole+u*u*(3-2*u),a=progress*.48+phase;
    const reach=Math.min(.75,animal.maxSpeed*6);
    x+=(Math.sin(a)-Math.sin(phase))*reach;z+=(Math.cos(a)-Math.cos(phase))*reach*.73;
    activity=u>0&&u<1?6*u*(1-u):0;
  }
  if(animal.type==='dolphin'||animal.type==='seal')y=excursionDepth(animal.type,time,phase,y);
  const floor=oceanFloor(x,z,recipe);
  if(animal.benthic)y=floor+.012;
  else{
    y=Math.max(y,floor+Math.max(.32,animal.scale*1.2));
    y=Math.min(animal.type==='dolphin'||animal.type==='seal'?-.35:-2.5,y);
  }
  Object.assign(out,{x,y,z,feeding,activity,stroke});
  return out;
}

const nextPose={};
export function faunaPose(animal,time,recipe,out={}) {
  faunaPosition(animal,time,recipe,out);faunaPosition(animal,time+.04,recipe,nextPose);
  const vx=(nextPose.x-out.x)/.04,vy=(nextPose.y-out.y)/.04,vz=(nextPose.z-out.z)/.04,horizontal=Math.hypot(vx,vz);
  const heading=horizontal>.0001?-Math.atan2(vz,vx)+(animal.reverse?Math.PI:0)+(animal.sideways?Math.PI/2:0):animal.heading;
  Object.assign(out,{vx,vy,vz,heading,pitch:Math.atan2(vy,Math.max(.025,horizontal))*.6-out.feeding*.55,roll:0});
  return out;
}

export class OceanFauna {
  constructor(recipe,rocks=[]) {
    this.recipe={...recipe,...normalizeGenerator(recipe),seed:parseSeed(recipe.seed,713)};this.group=new THREE.Group();this.group.name='Depth communities';
    this.population=makeFaunaPopulation(this.recipe);this.pools=[];
    const feedingPoints=rocks.flatMap(rock=>(rock.feedingPoints||[]).map(p=>({...p,rock}))).filter(p=>p.y>oceanFloor(p.x,p.z,this.recipe)+.12);
    for(const animal of this.population)if(animal.behavior==='forage'){
      let nearest=null,distance=144;
      for(const p of feedingPoints){const d=(p.x-animal.x)**2+(p.z-animal.z)**2;if(d<distance){distance=d;nearest=p;}}
      if(nearest)animal.feedingPoint=nearest;
    }
    this.motion=new AnimalMotion(this.population,(a,t,out)=>faunaPose(a,t,this.recipe,out),{floor:(x,z)=>oceanFloor(x,z,this.recipe),rocks,perception:4});
    this.poses=this.motion.poses;
    this.nearbySpecies=[];this.hunters=[];this.visibleCount=0;
    const types=[...new Set(this.population.map(a=>a.type))];
    for(const type of types)for(const variant of [0,1]){
      const members=this.population.filter(a=>a.type===type&&a.variant===variant);
      if(!members.length)continue;
      const spec=FAUNA[type],geometry=creatureGeometry(type,this.recipe.seed+type.length*7919+variant*313);
      const bounds=geometry.boundingBox,size=bounds.getSize(new THREE.Vector3());
      for(const animal of members){animal.span=Math.max(size.x,size.y,size.z)*animal.scale;animal.centerY=(bounds.min.y+bounds.max.y)*.5*animal.scale;}
      const motion=new THREE.InstancedBufferAttribute(new Float32Array(members.length*4),4);motion.setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('aAnimalMotion',motion);
      const material=waterMaterial(4,{name:type,fauna:true,animalMotion:true,motion:spec.motion,skin:spec.skin,anchored:!!spec.benthic});
      const mesh=new THREE.InstancedMesh(geometry,material,members.length);
      mesh.name=spec.name;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;
      this.group.add(mesh);this.pools.push({mesh,members,spec,motion});
    }
    this.dummy=new THREE.Object3D();this.count=this.population.length;this.typeCount=types.length;
  }

  update(time,cameraPosition,environment={}) {
    this.motion.advance(time,environment);
    this.hunters.length=0;
    for(const animal of this.population){
      const p=this.poses[animal.id];
      if(animal.hunter)this.hunters.push(p);
    }
    const nearest=new Map();this.visibleCount=0;
    for(const pool of this.pools){
      let visible=0;
      for(const animal of pool.members){
        const p=this.poses[animal.id],distance=cameraPosition?Math.hypot(p.x-cameraPosition.x,p.y-cameraPosition.y,p.z-cameraPosition.z):0;
        if(distance>135)continue;
        const d=this.dummy;d.position.set(p.x,p.y,p.z);
        d.rotation.set(0,p.heading,0);d.rotateZ(p.pitch);d.rotateX(p.roll);d.scale.setScalar(animal.scale);d.updateMatrix();
        pool.motion.setXYZW(visible,p.stroke,p.effort,p.turn,p.feeding);pool.mesh.setMatrixAt(visible++,d.matrix);
        if(distance<65)nearest.set(animal.type,Math.min(nearest.get(animal.type)??Infinity,distance));
      }
      pool.mesh.count=visible;pool.mesh.instanceMatrix.needsUpdate=true;pool.motion.needsUpdate=true;this.visibleCount+=visible;
    }
    this.nearbySpecies=[...nearest].sort((a,b)=>a[1]-b[1]).slice(0,4).map(([type])=>FAUNA[type].name);
  }
}
