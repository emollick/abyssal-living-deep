import * as THREE from 'three';
import { seeded, TAU } from './WorldMath.js';
import { oceanFloor } from './OceanDomain.js';
import { biomeAt, cellSeed, nearbyCells, BIOME_CELL } from './BiomeLayout.js';
import { FAUNA, RHYTHMS, PERSONAL_SPACE, faunaPose, communityAt } from './OceanFauna.js';
import { AnimalMotion } from './AnimalMotion.js';
import { creatureGeometry } from './FaunaGeometry.js';
import { fishGeometry } from './MarineLife.js';
import { waterMaterial } from './UnderwaterMaterial.js';

const SHOAL={name:'Schooling fish',motion:1,behavior:'school',size:.15,skin:0};
const specification=type=>type==='shoal'?SHOAL:FAUNA[type];

export function regionalPopulation(cx,cz,recipe,layer=null) {
  const key=layer===null?`bed:${cx},${cz}`:`water:${cx},${layer},${cz}`;
  const size=layer===null?BIOME_CELL:128,rng=seeded(cellSeed(cx,cz,recipe.seed,52037+(layer??-17)*7919));
  const x=(cx+.22+rng()*.56)*size,z=(cz+.22+rng()*.56)*size,b=biomeAt(x,z,recipe),animals=[];
  if(!b.inside||!(recipe.shoal>0))return animals;
  const add=(type,number,y,spread=9)=>{
    const spec=specification(type),factor=recipe.shoal*(spec.benthic?recipe.benthos:spec.hunter?recipe.predators:1)*(layer===null?b.outer:1);
    const total=number*factor,count=Math.floor(total)+(rng()<total%1?1:0),cohort=rng()*TAU;
    for(let i=0;i<count;i++){
      const angle=rng()*TAU,r=Math.sqrt(rng())*spread,px=x+Math.cos(angle)*r,pz=z+Math.sin(angle)*r;
      const floor=oceanFloor(px,pz,recipe),scale=spec.size*(.8+rng()*.4);
      const py=spec.benthic?floor:y+(rng()-.5)*Math.min(5,spread*.4);
      if(!spec.benthic&&(py<floor+.5||py>-.5))continue;
      const id=animals.length;
      animals.push({id,uid:`${key}:${id}`,type,zone:b.id,benthic:!!spec.benthic,hunter:!!spec.hunter,
        x:px,y:py,z:pz,anchorX:x,anchorY:y,anchorZ:z,phase:rng()*TAU,cohort,school:cohort,behavior:spec.behavior,
        maxSpeed:type==='shoal'?.66:RHYTHMS[type]?.[0]??0,beat:type==='shoal'?3.8:RHYTHMS[type]?.[1]??0,
        pursuer:type==='reefshark'||type==='tuna',reverse:spec.behavior==='jet',sideways:type==='crab',
        radius:scale*(type==='sunfish'?.85:spec.benthic?.45:.5),personalSpace:scale*(PERSONAL_SPACE[type]??.7),turnRate:spec.behavior==='cruise'?.85:1.4,
        scale,variant:Math.floor(rng()*2),heading:rng()*TAU,speed:.72+rng()*.55,orbit:spec.behavior==='school'?1.2:spec.behavior==='cruise'?7:.45});
    }
  };
  if(layer!==null){
    const depth=layer===0?36:(layer+.5)*128,y=-depth;
    if(depth>b.depth-18||rng()<.34)return animals;
    const types=communityAt(depth).types,type=depth<80&&rng()<.6?'shoal':types[Math.floor(rng()*types.length)];
    if(type==='flapjack')return animals;
    add(type,specification(type).behavior==='school'?18:type==='shrimp'?4:1.2,y,6);
    if(depth<180&&rng()<.25)add('dolphin',2,-18,12);
    return animals;
  }
  if(b.id==='reef'){
    add('shoal',19,b.y+5.5,10);add('butterflyfish',5,b.y+2.8,12);add('parrotfish',3,b.y+2.5,11);
    add('reefshark',.22,b.y+10,15);add('octopus',.65,0,13);add('crab',2.5,0,19);add('starfish',3,0,18);add('urchin',3,0,16);
  }else if(b.id==='kelp'){
    add('shoal',23,b.y+7,11);add('seal',.20,b.y+14,14);add('octopus',.50,0,14);
    add('crab',3,0,17);add('starfish',3,0,19);add('urchin',4,0,18);
  }else if(b.id==='deep'){
    add('anglerfish',.35,b.y+3.5,11);add('flapjack',.32,b.y+1.5,10);add('isopod',1.3,0,16);
    add('crab',1.8,0,16);add('brittlestar',2.6,0,21);add('cucumber',2,0,18);add('seapen',3,0,20);
    if(b.vents>.08)add('ventshrimp',12*b.vents+2,0,10);
  }else{
    if(b.depth<180){add('shoal',16,b.y+10,12);add('tuna',2,b.y+20,16);add('sunfish',.2,b.y+14,10);}
    else{
      const types=communityAt(b.depth-12).types,type=types[Math.floor(rng()*types.length)];
      add(type,FAUNA[type].behavior==='school'?8:type==='shrimp'?3:.6,b.y+10,8);
    }
    add('seapen',3.5,0,17);add('brittlestar',2.5,0,18);add('crab',1.4,0,16);
  }
  return animals;
}

function regionalPose(a,time,recipe,out) {
  if(a.type!=='shoal')return faunaPose(a,time,recipe,out);
  const phase=time*.048+a.cohort,dx=(Math.sin(phase)-Math.sin(a.cohort))*5,dz=(Math.cos(phase)-Math.cos(a.cohort))*4;
  const x=a.x+dx,z=a.z+dz,y=Math.max(oceanFloor(x,z,recipe)+.65,a.y+Math.sin(time*.3+a.phase)*.16);
  return Object.assign(out,{x,y,z,vx:Math.cos(phase)*.24,vy:0,vz:-Math.sin(phase)*.192,heading:phase,activity:.55,stroke:time*a.beat*TAU+a.phase});
}

export class BiomeWildlife {
  constructor(recipe) {
    this.recipe=recipe;this.group=new THREE.Group();this.group.name='Wildlife across the biomes';
    this.cells=new Map();this.pools=new Map();this.focus=null;this.rockField=null;this.population=[];this.observables=[];this.hunters=[];
    this.nearbySpecies=[];this.visibleCount=0;this.dummy=new THREE.Object3D();this.color=new THREE.Color();
  }
  updateCells(position,time,rocks) {
    const key=`${Math.floor(position.x/64)},${Math.floor(position.y/64)},${Math.floor(position.z/64)}`;
    if(key===this.focus&&rocks===this.rockField)return;
    const wanted=new Map();
    for(const cell of nearbyCells(position,3)){
      const x=(cell.x+.5)*64,z=(cell.z+.5)*64,y=oceanFloor(x,z,this.recipe);
      if(Math.hypot(x-position.x,z-position.z)<190&&position.y-y>-18&&position.y-y<105)wanted.set(`bed:${cell.key}`,{x:cell.x,z:cell.z,layer:null});
    }
    const layer=Math.floor(-position.y/128);
    if(position.y<30)for(const cell of nearbyCells(position,2,128))for(let ly=Math.max(0,layer-1);ly<=layer+1;ly++){
      const y=ly===0?-36:-(ly+.5)*128,x=(cell.x+.5)*128,z=(cell.z+.5)*128;
      if(Math.hypot(x-position.x,y-position.y,z-position.z)<200)wanted.set(`water:${cell.x},${ly},${cell.z}`,{x:cell.x,z:cell.z,layer:ly});
    }
    for(const [id,cell] of this.cells)if(!wanted.has(id))this.cells.delete(id);
    for(const [id,at] of wanted){
      let cell=this.cells.get(id);
      if(!cell){
        const animals=regionalPopulation(at.x,at.z,this.recipe,at.layer);
        for(const a of animals)if(a.behavior==='forage'){
          let distance=225;
          for(const rock of rocks.near(a.x,a.z))for(const p of rock.feedingPoints||[]){
            const d=(a.x-p.x)**2+(a.z-p.z)**2;
            if(d<distance){distance=d;a.feedingPoint={...p,rock};}
          }
        }
        const motion=new AnimalMotion(animals,(a,t,out)=>regionalPose(a,t,this.recipe,out),{floor:(x,z)=>oceanFloor(x,z,this.recipe),rocks,perception:2.5});motion.reset(time);
        cell={animals,motion};this.cells.set(id,cell);
        for(const a of animals)a.pose=motion.poses[a.id];
      }
      cell.motion.rocks=rocks;
    }
    this.population=[...this.cells.values()].flatMap(c=>c.animals);this.focus=key;this.rockField=rocks;
  }
  pool(type,variant,required) {
    const key=`${type}:${variant}`;let pool=this.pools.get(key);
    if(pool&&pool.capacity>=required)return pool;
    const spec=specification(type),capacity=2**Math.ceil(Math.log2(Math.max(32,required)));
    const geometry=pool?.mesh.geometry||(type==='shoal'?fishGeometry():creatureGeometry(type,this.recipe.seed+type.length*7919+variant*313));
    geometry.computeBoundingBox();const box=geometry.boundingBox,size=box.getSize(new THREE.Vector3());
    const material=pool?.mesh.material||waterMaterial(4,{name:`regional-${type}`,fauna:type!=='shoal',animalMotion:true,motion:spec.motion,skin:spec.skin,anchored:!!spec.benthic});
    const motion=new THREE.InstancedBufferAttribute(new Float32Array(capacity*4),4);motion.setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('aAnimalMotion',motion);
    if(pool){this.group.remove(pool.mesh);pool.mesh.dispose();}
    const mesh=new THREE.InstancedMesh(geometry,material,capacity);mesh.name=`Regional ${spec.name}`;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    pool={mesh,motion,capacity,span:Math.max(size.x,size.y,size.z),centerY:(box.min.y+box.max.y)*.5};this.pools.set(key,pool);this.group.add(mesh);return pool;
  }
  update(time,position,environment,rocks) {
    this.updateCells(position,time,rocks);
    this.hunters.length=0;this.observables.length=0;this.visibleCount=0;
    const groups=new Map(),nearest=new Map();
    for(const cell of this.cells.values()){
      cell.motion.advance(time,environment);
      for(const a of cell.animals){
        const p=a.pose,distance=Math.hypot(p.x-position.x,p.y-position.y,p.z-position.z);
        if(distance>150)continue;
        const key=`${a.type}:${a.variant}`;let list=groups.get(key);if(!list)groups.set(key,list=[]);list.push(a);
        if(a.hunter)this.hunters.push(p);
        if(distance<65)nearest.set(a.type,Math.min(nearest.get(a.type)??Infinity,distance));
      }
    }
    for(const [key,pool] of this.pools)if(!groups.has(key))pool.mesh.count=0;
    for(const list of groups.values()){
      const pool=this.pool(list[0].type,list[0].variant,list.length);let count=0;
      for(const a of list){
        const p=a.pose;this.dummy.position.set(p.x,p.y,p.z);this.dummy.rotation.set(0,p.heading,0);this.dummy.rotateZ(p.pitch);this.dummy.rotateX(p.roll);this.dummy.scale.setScalar(a.scale);this.dummy.updateMatrix();
        pool.mesh.setMatrixAt(count,this.dummy.matrix);pool.motion.setXYZW(count,p.stroke,p.effort,p.turn,p.feeding);
        this.color.set(a.type==='shoal'?(a.zone==='reef'?(a.variant?'#bdc9bd':'#d9a56d'):'#9db1b5'):'#ffffff');pool.mesh.setColorAt(count,this.color);
        a.span=pool.span*a.scale;a.centerY=pool.centerY*a.scale;
        if(a.type!=='shoal'||count%8===0)this.observables.push(a);
        count++;
      }
      pool.mesh.count=count;pool.mesh.instanceMatrix.needsUpdate=true;pool.mesh.instanceColor.needsUpdate=true;pool.motion.needsUpdate=true;this.visibleCount+=count;
    }
    this.nearbySpecies=[...nearest].sort((a,b)=>a[1]-b[1]).slice(0,4).map(([type])=>specification(type).name);
  }
}
