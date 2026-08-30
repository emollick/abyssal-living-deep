import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { creatureGeometry, CREATURE_TYPES } from '../src/underwater/FaunaGeometry.js';
import { OceanFauna, FAUNA, makeFaunaPopulation, faunaPose, communityAt } from '../src/underwater/OceanFauna.js';
import { oceanFloor, transectPose } from '../src/underwater/OceanDomain.js';
import { createPelagicLife } from '../src/underwater/OceanTerrain.js';
import { GENERATOR_DEFAULTS } from '../src/underwater/WorldMath.js';

let checks=0;
const check=(ok,message)=>{assert.ok(ok,message);checks++;};
const geometryHash=g=>{
  const hash=createHash('sha256');
  for(const key of ['position','normal','color','aGlow'])hash.update(Buffer.from(g.attributes[key].array.buffer));
  return hash.digest('hex');
};
const shapes=new Set();
for(const type of CREATURE_TYPES){
  const a=creatureGeometry(type,713),b=creatureGeometry(type,713),c=creatureGeometry(type,1948);
  check(FAUNA[type]?.name,'Every creature needs a reader-facing identity.');
  for(const [name,attr] of Object.entries(a.attributes)){
    check(attr.array.every(Number.isFinite),type+': '+name+' must remain finite.');
    check(attr.count===a.attributes.position.count,type+': all attributes must cover every vertex.');
  }
  check(a.index.array.every(n=>n>=0&&n<a.attributes.position.count),type+': triangles reference actual vertices.');
  check(geometryHash(a)===geometryHash(b),type+': the same seed must reproduce anatomy and markings.');
  check(geometryHash(a)!==geometryHash(c),type+': a different seed must change actual geometry or markings.');
  shapes.add(createHash('sha256').update(Buffer.from(a.attributes.position.array.buffer)).digest('hex'));
  if(type==='anglerfish'){
    const glowing=Array.from(a.attributes.aGlow.array).filter(v=>v>.5).length/a.attributes.position.count;
    check(glowing>0&&glowing<.15,'The angler lure should glow without illuminating the entire fish.');
  }
  a.dispose();b.dispose();c.dispose();
}
check(shapes.size>=23,'The population needs structurally different creatures, not only recolored copies.');

const recipe={...GENERATOR_DEFAULTS,seed:713},population=makeFaunaPopulation(recipe);
check(new Set(population.map(a=>a.type)).size===CREATURE_TYPES.length,'The default world must contain every authored animal form.');
assert.deepEqual(population,makeFaunaPopulation(recipe));checks++;
check(JSON.stringify(population)!==JSON.stringify(makeFaunaPopulation({...recipe,seed:714})),'Seed changes must alter the population itself.');
check(makeFaunaPopulation({...recipe,shoal:0}).length===0,'Zero animal abundance must remove swimmers and bottom dwellers.');
const noHunters=makeFaunaPopulation({...recipe,predators:0}),noBottom=makeFaunaPopulation({...recipe,benthos:0});
check(noHunters.every(a=>!a.hunter)&&noHunters.some(a=>a.benthic),'The hunters dial must leave bottom dwellers available.');
check(noBottom.every(a=>!a.benthic)&&noBottom.some(a=>a.hunter),'The bottom-dweller dial must leave swimming hunters available.');
check(makeFaunaPopulation({...recipe,shoal:2}).length>population.length*1.95,'Animal abundance must actually scale populations.');
check(makeFaunaPopulation({...recipe,shoal:Infinity,predators:NaN,benthos:-9}).every(a=>Number.isFinite(a.scale)),'Invalid recipe values must be bounded.');
check(!communityAt(200).types.includes('anglerfish')&&communityAt(1000).types.includes('anglerfish'),'Depth communities must have different casts.');
check(communityAt(600).types.includes('vampire')&&!communityAt(200).types.includes('vampire'),'The lower twilight needs a distinct community.');

for(const seed of [0,713,1934512951,4294967295])for(const relief of [.2,1,2.2]){
  const r={...recipe,seed,relief},animals=makeFaunaPopulation(r);
  for(const depth of [200,600,1000]){
    const pose=transectPose(depth,r),camera=new THREE.PerspectiveCamera(56,16/9,.1,18);
    camera.position.fromArray(pose.eye);camera.lookAt(...pose.look);camera.updateMatrixWorld();
    const view=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    for(const time of [0,17,120]){
      const inView=new Set();
      for(const animal of animals){const p=faunaPose(animal,time,r);if(view.containsPoint(new THREE.Vector3(p.x,p.y,p.z)))inView.add(animal.type);}
      check(inView.size>=3,'At '+depth+' m, naturally sized animals must lie in the actual starting view, not merely nearby.');
      if(depth===600)check(inView.has('vampire'),'The lower-twilight stop must frame its vampire squid at the correct depth.');
    }
  }
  for(const time of [0,17,120,10000]){
    let finite=true,clear=true,stable=true;
    for(const animal of animals){
      const p=faunaPose(animal,time,r),next=faunaPose(animal,time+.01,r);
      finite&&=Object.values(p).every(Number.isFinite);
      clear&&=p.y>=oceanFloor(p.x,p.z,r)+(animal.benthic?.011:.31)&&p.y<=-2.49;
      stable&&=Math.hypot(next.x-p.x,next.y-p.y,next.z-p.z)<.25;
    }
    check(finite,'Fauna poses stay finite across seeds and long-running clocks.');
    check(clear,'Animals stay above the seeded floor and below the air.');
    check(stable,'Swimming and crawling must remain continuous.');
  }
}

const fauna=new OceanFauna(recipe);
for(const depth of [200,600,1000,1419]){
  const pose=transectPose(depth,recipe);
  fauna.update(10,new THREE.Vector3(...pose.eye));
  check(fauna.nearbySpecies.length>=3,'At '+depth+' m, multiple distinct forms must actually be close to the route.');
  check(fauna.pools.every(p=>p.mesh.instanceMatrix.array.every(Number.isFinite)),'Visible instancing matrices must be finite.');
}
fauna.update(37,new THREE.Vector3(0,-600,-724));
const held=JSON.stringify(fauna.poses);
fauna.update(37,new THREE.Vector3(400,-30,120));
check(JSON.stringify(fauna.poses)===held,'The same clock gives the same world regardless of camera position.');
fauna.update(37,new THREE.Vector3(400,-30,120));
check(JSON.stringify(fauna.poses)===held,'A paused simulation must not move animals.');
const pelagic=createPelagicLife(recipe),emptyGel=createPelagicLife({...recipe,jellies:0});
const denseGel=createPelagicLife({...recipe,jellies:2});
check(pelagic.count<fauna.count*.05,'Default gelatinous life must be a small fraction of the new animal population.');
check(emptyGel.count===0&&emptyGel.group.children.length===1,'Zero jellies removes both bells and siphonophore chains.');
check(denseGel.chainCount>pelagic.chainCount&&denseGel.jellyCount>pelagic.jellyCount,'The drifter dial must scale both chains and jellyfish.');
check(pelagic.count>pelagic.jellyCount,'The displayed population must include siphonophore colonies.');
for(const root of [fauna.group,pelagic.group,emptyGel.group,denseGel.group])root.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
console.log(checks+' fauna checks passed: anatomy, seeded populations, depth communities, controls, clearance, continuity and pause.');
