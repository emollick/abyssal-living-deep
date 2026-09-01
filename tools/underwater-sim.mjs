import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { HABITATS, seeded, parseSeed, normalizeGenerator, floorHeight, currentAt, cameraPose, constrainSwimmer } from '../src/underwater/WorldMath.js';
import { createHabitatGeometry, highestSurfaceAt, Batch, SCENERY_BATCH_VERTICES, seagrassGeometry } from '../src/underwater/ReefGeometry.js';
import { MarineLife } from '../src/underwater/MarineLife.js';

let checks=0;
const check=(condition,message)=>{assert.ok(condition,message);checks++;};
const digest=group=>{const hash=createHash('sha256');group.traverse(o=>{if(o.geometry)for(const a of Object.values(o.geometry.attributes))hash.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));});return hash.digest('hex');};
const dispose=group=>group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});

const anchorSurface=new THREE.BufferGeometry();
anchorSurface.setAttribute('position',new THREE.Float32BufferAttribute([0,-3,0,2,-1,0,0,-3,2,0,2,0,2,4,0,0,2,2],3));
check(Math.abs(highestSurfaceAt(anchorSurface,1,.5,-10)-3)<1e-6,'Coral anchors must use the upper rock surface, including a sloping ledge.');
check(highestSurfaceAt(anchorSurface,4,4,-8)===-8,'Outside a rock, colonies must fall back to the seabed.');
anchorSurface.setIndex([2,1,0]);
check(Math.abs(highestSurfaceAt(anchorSurface,1,.5,-10)+2)<1e-6,'Indexed, reversed triangles below sea level must still give a correct attachment height.');
anchorSurface.dispose();

const blade=seagrassGeometry(.6,.025,.3,1.2),bladeP=blade.attributes.position;
check(bladeP.getY(0)===0&&bladeP.getY(1)===0,'Seagrass blades must start at their attached base.');
check(bladeP.array.every(Number.isFinite)&&blade.attributes.normal.array.every(Number.isFinite),'Curved seagrass geometry must be finite.');
check(bladeP.getY(bladeP.count-1)>.4&&bladeP.getY(bladeP.count-1)<.6,'Seagrass blades should arch instead of forming rigid vertical strips.');
blade.dispose();

// Dense scenery must retain its exact vertices and triangle winding while
// keeping each temporary merge and its indices within a small memory budget.
const batch=new Batch(new THREE.MeshBasicMaterial()),originals=[];
for(let i=0;i<12;i++){
  const g=i===0?new THREE.BoxGeometry().toNonIndexed():new THREE.PlaneGeometry(7,5,128,64);
  g.translate(i*8,i*.3,-i*2);batch.add(g,'#92aa71',seeded(i),(_x,y)=>y*.2);originals.push(g);
}
const batched=new THREE.Group();batch.finish(batched,'Dense scenery');
check(batched.children.length>1,'Dense scenery must be split into bounded meshes.');
check(batch.parts.length===0&&batch.chunks.length===0,'Finishing scenery must release temporary mesh references.');
for(const mesh of batched.children){
  check(mesh.geometry.attributes.position.count<=SCENERY_BATCH_VERTICES,'Scenery merges must stay within the vertex budget.');
  check(mesh.geometry.index.array instanceof Uint16Array,'Bounded scenery should need only 16-bit indices.');
  check(mesh.geometry.index.array.every(i=>i<mesh.geometry.attributes.position.count),'Every triangle must reference a vertex in its own batch.');
}
for(const name of Object.keys(originals[0].attributes)){
  const before=createHash('sha256'),after=createHash('sha256');
  originals.forEach(g=>before.update(Buffer.from(g.attributes[name].array.buffer)));
  batched.children.forEach(m=>after.update(Buffer.from(m.geometry.attributes[name].array.buffer)));
  check(before.digest('hex')===after.digest('hex'),`Batching must preserve every ${name} value without reducing detail.`);
}
const triangleHash=geometries=>{
  const hash=createHash('sha256');
  for(const g of geometries){
    const expanded=new Float32Array(g.index.count*3),p=g.attributes.position;
    for(let i=0;i<g.index.count;i++){const n=g.index.getX(i);expanded.set([p.getX(n),p.getY(n),p.getZ(n)],i*3);}
    hash.update(Buffer.from(expanded.buffer));
  }
  return hash.digest('hex');
};
check(triangleHash(originals)===triangleHash(batched.children.map(m=>m.geometry)),'Streaming batches must preserve triangle order and winding.');
dispose(batched);

const r1=seeded(713),r2=seeded(713),r3=seeded(714);
const stream=Array.from({length:500},()=>r1());
assert.deepEqual(stream,Array.from({length:500},()=>r2()));checks++;
check(stream.every(v=>v>=0&&v<1),'Seed stream must stay in [0,1).');
check(stream.some(v=>v!==r3()),'Different seeds must change the generator.');
check(parseSeed('coral')===parseSeed('coral'),'Text seeds must be reproducible.');
check(parseSeed('4294967295')===4294967295,'Full uint32 seeds must survive sharing.');
assert.deepEqual(normalizeGenerator({relief:'NaN',life:-20,shoal:200,clarity:0}),{relief:1,life:0,height:1,shoal:2,clarity:.35,current:1,glow:1,upwelling:.65,predators:1,benthos:1,jellies:.65,habitatScale:1});checks++;

const a=createHabitatGeometry({...HABITATS[0],life:0.2});
const hash=digest(a.group);dispose(a.group);
const b=createHabitatGeometry({...HABITATS[0],life:0.2});
check(digest(b.group)===hash,'Same seed and recipe must reproduce every position, normal, UV and color.');dispose(b.group);
const c=createHabitatGeometry({...HABITATS[0],seed:174,life:0.2});
check(digest(c.group)!==hash,'A new seed must produce a different actual mesh.');dispose(c.group);

for(const habitat of HABITATS) {
  const world=createHabitatGeometry(habitat);
  if(['reef','kelp'].includes(habitat.id))check(world.group.getObjectByName('Seagrass meadows')?.geometry.attributes.position.count>1000,'Shallow sandy margins should have generated seagrass cover.');
  else check(!world.group.getObjectByName('Seagrass meadows'),'Seagrass must not grow in the deep, dark habitats.');
  if(habitat.id==='reef')check(world.group.getObjectByName('Coral colonies')?.geometry.attributes.position.count>10000,'The reef must grow actual coral geometry.');
  if(habitat.id==='kelp')check(world.group.getObjectByName('Swaying forest')?.geometry.attributes.position.count>10000,'The kelp forest must contain kelp, not just a seabed.');
  if(habitat.id==='deep'){
    check(world.group.getObjectByName('Tube-worm crowns')?.geometry.attributes.position.count>10000&&world.ventPositions.length>10,'The vent field must contain substantial attached life and mineral chimneys.');
    let emits=false;world.group.traverse(o=>{if(o.material?.uniforms?.uGlow?.value>0)emits=true;});
    check(!emits,'The seabed, rocks, corals and tube worms must reflect light instead of emitting it.');
  }
  let vertices=0;
  world.group.traverse(o=>{
    if(!o.geometry)return;
    const g=o.geometry;
    vertices+=g.attributes.position.count;
    for(const [name,attr] of Object.entries(g.attributes))check(attr.array.every(Number.isFinite),`${habitat.id}: ${name} must be finite.`);
    check(g.attributes.color.count===g.attributes.position.count,`${habitat.id}: all vertices need a color.`);
    check(g.attributes.aFlex.count===g.attributes.position.count,`${habitat.id}: all vertices need a current response.`);
  });
  check(vertices>20000,`${habitat.id}: world must contain generated detail.`);
  const life=new MarineLife({...habitat,shoal:0.2});
  for(const t of [0,1,400,10000]){
    life.update(t,new THREE.Vector3(...habitat.eye));
    check(life.fish.instanceMatrix.array.every(Number.isFinite),`${habitat.id}: fish transforms must remain finite.`);
    check(life.animals.every(a=>a.mesh.position.toArray().every(Number.isFinite)),`${habitat.id}: animal transforms must remain finite.`);
    const pose=cameraPose(habitat,t);
    check(pose.eye[1]>floorHeight(pose.eye[0],pose.eye[2],habitat)+1.6,`${habitat.id}: drift must not go below the seafloor.`);
  }
  const empty=new MarineLife({...habitat,shoal:0});
  check(empty.fishCount===0&&empty.animals.length===0,`${habitat.id}: zero abundance must remove animals.`);
  const swimmer=constrainSwimmer({x:1e5,y:-1e5,z:1e5},habitat);
  check(Math.hypot(swimmer.x,swimmer.z)<=125.000001,`${habitat.id}: swimmer stays in the generated site.`);
  check(swimmer.y>=floorHeight(swimmer.x,swimmer.z,habitat)+1.59,`${habitat.id}: swimmer cannot go below the floor.`);
  console.log(`${habitat.name}: ${vertices.toLocaleString()} vertices; finite geometry, reproducible generation, swimming clearance checked.`);
  dispose(world.group);dispose(life.group);dispose(empty.group);
}

check(currentAt(0,12,30,1)>currentAt(0,900,30,1),'Storm-driven currents must attenuate with depth.');
check(currentAt(0,12,30,1)>currentAt(0,12,5,0),'Storms must strengthen shallow currents.');
check(floorHeight(17,24,{...HABITATS[0],seed:1})!==floorHeight(17,24,{...HABITATS[0],seed:713}),'Seed must change the terrain, not just decoration.');
check(floorHeight(17,24,{...HABITATS[0],relief:0.2})!==floorHeight(17,24,{...HABITATS[0],relief:2.2}),'Relief dial must alter the seafloor.');
console.log(`${checks} underwater checks passed.`);
