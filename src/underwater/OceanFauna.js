import * as THREE from 'three';
import { seeded, TAU, normalizeGenerator, parseSeed } from './WorldMath.js';
import { oceanFloor, transectPose, SITE_ORIGINS } from './OceanDomain.js';
import { creatureGeometry } from './FaunaGeometry.js';
import { waterMaterial } from './UnderwaterMaterial.js';

export const FAUNA = {
  butterflyfish:{name:'Butterflyfish',motion:5,behavior:'school',size:.62},
  parrotfish:{name:'Parrotfish',motion:5,behavior:'school',size:.75},
  reefshark:{name:'Reef sharks',motion:5,behavior:'cruise',size:1.10,hunter:true},
  tuna:{name:'Tuna',motion:5,behavior:'school',size:1.02,hunter:true},
  sunfish:{name:'Ocean sunfish',motion:5,behavior:'hover',size:1.35},
  dolphin:{name:'Dolphins',motion:10,behavior:'cruise',size:1.22},
  seal:{name:'Seals',motion:10,behavior:'cruise',size:1.10},
  lanternfish:{name:'Lanternfish',motion:5,behavior:'school',size:.66},
  hatchetfish:{name:'Hatchetfish',motion:5,behavior:'school',size:.70},
  dragonfish:{name:'Dragonfish',motion:8,behavior:'hover',size:1.05,hunter:true},
  anglerfish:{name:'Anglerfish',motion:5,behavior:'hover',size:.93,hunter:true},
  gulpereel:{name:'Gulper eels',motion:8,behavior:'hover',size:.74,hunter:true},
  squid:{name:'Squid',motion:6,behavior:'jet',size:.88},
  vampire:{name:'Vampire squid',motion:7,behavior:'hover',size:1.13},
  flapjack:{name:'Flapjack octopuses',motion:7,behavior:'hover',size:.89},
  octopus:{name:'Octopuses',motion:7,behavior:'crawl',size:.86,benthic:true},
  crab:{name:'Crabs',motion:9,behavior:'crawl',size:.73,benthic:true},
  shrimp:{name:'Midwater shrimp',motion:12,behavior:'jet',size:.66},
  ventshrimp:{name:'Vent shrimp',motion:12,behavior:'crawl',size:.48,benthic:true},
  starfish:{name:'Sea stars',motion:11,behavior:'settled',size:.55,benthic:true},
  brittlestar:{name:'Brittle stars',motion:11,behavior:'settled',size:.67,benthic:true},
  urchin:{name:'Sea urchins',motion:0,behavior:'settled',size:.70,benthic:true},
  isopod:{name:'Giant isopods',motion:9,behavior:'crawl',size:.81,benthic:true},
  cucumber:{name:'Sea cucumbers',motion:9,behavior:'crawl',size:.74,benthic:true},
  seapen:{name:'Sea pens',motion:11,behavior:'settled',size:1.06,benthic:true},
};

// Broad, overlapping depth communities rather than a hard scene switch.
// Some small animals are enlarged; abundance is composed for exploration,
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
  let serial=0;
  function add(type,amount,center,zone,spread=8,heading=0,cohort=0) {
    const spec=FAUNA[type];
    const factor=recipe.shoal*(spec.benthic?recipe.benthos:(spec.hunter?recipe.predators:1));
    const count=Math.round(amount*factor);
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
        phase:first?0:rng()*TAU,cohort:cohort||rng()*TAU,
        scale,variant:i%2,heading:heading+(rng()-.5)*.5,
        speed:(.72+rng()*.55)*(spec.behavior==='cruise'?1.4:1),
        orbit:spec.behavior==='school'?3.0:spec.behavior==='cruise'?7.0:1.25,
      });
    }
  }
  function local(id,type,count,x,y,z,spread=9,heading=0) {
    const origin=SITE_ORIGINS[id];
    add(type,count,[origin[0]+x,y,origin[1]+z],id,spread,heading);
  }
  local('reef','butterflyfish',30,-7,-20,15,9);
  local('reef','parrotfish',18,9,-22,10,9,Math.PI);
  local('reef','reefshark',3,-9,-16,-2,15);
  local('reef','octopus',5,-7,0,17,13);
  local('reef','crab',12,7,0,22,17);
  local('reef','starfish',24,-3,0,21,26);
  local('reef','urchin',21,12,0,9,23);
  local('kelp','seal',4,-5,-12,15,17);
  local('kelp','crab',18,3,0,20,21);
  local('kelp','octopus',5,-7,0,12,20);
  local('kelp','starfish',26,-6,0,18,24);
  local('kelp','urchin',35,9,0,16,27);
  local('blue','sunfish',3,10,-43,21,15,Math.PI);
  local('blue','tuna',18,-12,-47,12,15);
  local('blue','dolphin',5,-10,-24,1,19);
  local('blue','squid',9,6,-53,13,17,Math.PI);
  local('blue','reefshark',2,-15,-56,-12,18);

  const bandDepths=[105,200,315,445,595,750,890,1000,1120,1250,1360];
  for(const depth of bandDepths)for(const column of [false,true]){
    const pose=column?{eye:[0,-depth,-724],look:[0,-depth-6,-764]}:transectPose(depth,recipe);
    const dx=pose.look[0]-pose.eye[0],dz=pose.look[2]-pose.eye[2],n=Math.hypot(dx,dz);
    const forward=[dx/n,dz/n],right=[-forward[1],forward[0]];
    const types=communityAt(depth).types,zone=depth<200?'slope':depth<530?'upper-twilight':depth<930?'lower-twilight':'midnight';
    for(let k=0;k<types.length;k++){
      const type=types[k],spec=FAUNA[type],side=(k-(types.length-1)/2)*6.2,distance=14+(k%2)*8;
      const x=pose.eye[0]+forward[0]*distance+right[0]*side;
      const z=pose.eye[2]+forward[1]*distance+right[1]*side;
      const y=-depth-3+(k%3-1)*4.3;
      const number=spec.behavior==='school'?11:type==='shrimp'?5:2;
      add(type,number,[x,y,z],zone,5.5,k%2?Math.PI:0,depth*.01+k);
    }
    if(!column&&depth>180){
      const y=oceanFloor(pose.eye[0]+9,pose.eye[2]-5,recipe);
      add('seapen',7,[pose.eye[0]+9,y,pose.eye[2]-5],zone,10);
      add('brittlestar',5,[pose.eye[0]+6,y,pose.eye[2]-6],zone,9);
    }
  }
  local('deep','anglerfish',3,7,-1421,16,10,Math.PI);
  local('deep','gulpereel',3,-11,-1422,7,14);
  local('deep','flapjack',4,-6,-1423,21,10);
  local('deep','isopod',16,-4,0,21,22);
  local('deep','crab',12,9,0,21,24);
  local('deep','ventshrimp',42,0,0,14,30);
  local('deep','brittlestar',23,-9,0,18,27);
  local('deep','cucumber',16,5,0,20,22);
  local('deep','seapen',19,-10,0,10,28);
  return population;
}

export function faunaPose(animal,time,recipe,out={}) {
  const spec=FAUNA[animal.type],phase=animal.phase,t=time*animal.speed;
  let x=animal.x,y=animal.y,z=animal.z,heading=animal.heading,roll=0,pitch=0;
  if(spec.behavior==='cruise'){
    const a=t*.105+phase;
    x+=Math.sin(a)*animal.orbit;z+=(Math.cos(a)-1)*animal.orbit*.46;
    y+=Math.sin(t*.17+phase)*1.15;
    heading=-Math.atan2(-Math.sin(a)*.46,Math.cos(a));
    roll=Math.sin(a)*.09;
  }else if(spec.behavior==='school'){
    const a=t*.14+animal.cohort;
    x+=Math.sin(a)*3;z+=Math.cos(a)*2;
    y+=Math.sin(t*.51+phase)*.25;
    heading=-Math.atan2(-Math.sin(a)*2,Math.cos(a)*3);
  }else if(spec.behavior==='jet'){
    const cycle=t*.36+phase;
    const burst=Math.sin(cycle)+Math.sin(cycle*2)*.18;
    x+=Math.cos(heading)*burst*3.2;z-=Math.sin(heading)*burst*3.2;
    y+=Math.sin(cycle*.7)*.72;roll=Math.sin(cycle)*.10;
  }else if(spec.behavior==='hover'){
    x+=Math.sin(t*.22+phase)*1.05;z+=Math.cos(t*.19+phase)*.8;
    y+=Math.sin(t*.31+phase)*.55;heading+=Math.sin(t*.11+phase)*.22;
    roll=Math.sin(t*.24+phase)*.05;
  }else if(spec.behavior==='crawl'){
    x+=Math.sin(t*.047+phase)*.75;z+=Math.cos(t*.033+phase)*.55;
    heading+=Math.sin(t*.05+phase)*.18;
  }
  const floor=oceanFloor(x,z,recipe);
  if(animal.benthic){
    const step=.55;
    const sx=(oceanFloor(x+step,z,recipe)-oceanFloor(x-step,z,recipe))/(step*2);
    const sz=(oceanFloor(x,z+step,recipe)-oceanFloor(x,z-step,recipe))/(step*2);
    // Ground-bound animals follow the same terrain as the swimmer.
    roll=Math.max(-.5,Math.min(.5,Math.atan(sx)));
    pitch=Math.max(-.5,Math.min(.5,-Math.atan(sz)));
    y=floor+.15;
  }else{
    y=Math.max(y,floor+Math.max(1.8,animal.scale*1.7));
    y=Math.min(-2.5,y);
  }
  Object.assign(out,{x,y,z,heading,roll,pitch});
  return out;
}

export class OceanFauna {
  constructor(recipe) {
    this.recipe={...recipe,...normalizeGenerator(recipe),seed:parseSeed(recipe.seed,713)};this.group=new THREE.Group();this.group.name='Depth communities';
    this.population=makeFaunaPopulation(this.recipe);this.pools=[];this.poses=this.population.map(()=>({}));
    this.nearbySpecies=[];this.hunters=[];this.visibleCount=0;
    const types=[...new Set(this.population.map(a=>a.type))];
    for(const type of types)for(const variant of [0,1]){
      const members=this.population.filter(a=>a.type===type&&a.variant===variant);
      if(!members.length)continue;
      const spec=FAUNA[type],geometry=creatureGeometry(type,this.recipe.seed+type.length*7919+variant*313);
      const material=waterMaterial(4,{name:type,fauna:true,motion:spec.motion,anchored:!!spec.benthic});
      const mesh=new THREE.InstancedMesh(geometry,material,members.length);
      mesh.name=spec.name;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;
      this.group.add(mesh);this.pools.push({mesh,members,spec});
    }
    this.dummy=new THREE.Object3D();this.count=this.population.length;this.typeCount=types.length;
  }

  update(time,cameraPosition) {
    this.hunters.length=0;
    for(const animal of this.population){
      const p=faunaPose(animal,time,this.recipe,this.poses[animal.id]);
      if(animal.hunter)this.hunters.push(p);
    }
    // Avoidance is part of the world, not an effect switched on by the camera.
    for(const animal of this.population){
      if(animal.hunter||FAUNA[animal.type].behavior!=='school')continue;
      const p=this.poses[animal.id];
      for(const hunter of this.hunters){
        const dx=p.x-hunter.x,dy=p.y-hunter.y,dz=p.z-hunter.z,d2=dx*dx+dy*dy+dz*dz;
        if(d2<49&&d2>.01){const amount=(7-Math.sqrt(d2))*.24/Math.sqrt(d2);p.x+=dx*amount;p.z+=dz*amount;}
      }
      p.y=Math.max(p.y,oceanFloor(p.x,p.z,this.recipe)+animal.scale*1.7);
    }
    const nearest=new Map();this.visibleCount=0;
    for(const pool of this.pools){
      let visible=0;
      for(const animal of pool.members){
        const p=this.poses[animal.id],distance=cameraPosition?Math.hypot(p.x-cameraPosition.x,p.y-cameraPosition.y,p.z-cameraPosition.z):0;
        if(distance>135)continue;
        const d=this.dummy;d.position.set(p.x,p.y,p.z);
        d.rotation.set(p.pitch,p.heading,p.roll);d.scale.setScalar(animal.scale);d.updateMatrix();
        pool.mesh.setMatrixAt(visible++,d.matrix);
        if(distance<65)nearest.set(animal.type,Math.min(nearest.get(animal.type)??Infinity,distance));
      }
      pool.mesh.count=visible;pool.mesh.instanceMatrix.needsUpdate=true;this.visibleCount+=visible;
    }
    this.nearbySpecies=[...nearest].sort((a,b)=>a[1]-b[1]).slice(0,4).map(([type])=>FAUNA[type].name);
  }
}
