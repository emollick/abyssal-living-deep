import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GENERATOR_DEFAULTS, normalizeGenerator } from '../src/underwater/WorldMath.js';
import { oceanFloor, routeBetween, constrainToOcean, initialView } from '../src/underwater/OceanDomain.js';
import { biomeAt, explorationStops, nearbyCells, BIOME_CELL } from '../src/underwater/BiomeLayout.js';
import { BiomeScenery, growBiomeCell } from '../src/underwater/BiomeScenery.js';
import { BiomeWildlife, regionalPopulation } from '../src/underwater/BiomeWildlife.js';
import { floorTile, OceanFloorDetail } from '../src/underwater/OceanTerrain.js';
import { RockField, clearRockRoute } from '../src/underwater/AnimalMotion.js';

let checks=0;
const check=(v,label)=>{assert.ok(v,label);checks++;};
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function dispose(group){const g=new Set(),m=new Set();group.traverse(o=>{if(o.geometry)g.add(o.geometry);if(o.material)m.add(o.material);if(o.isInstancedMesh)o.dispose();});g.forEach(x=>x.dispose());m.forEach(x=>x.dispose());}

check(initialView(new URLSearchParams('place=kelp-outer')).kind==='habitat','An explicit exploration link opens that place.');
check(initialView(new URLSearchParams('place=kelp-outer&surface=1')).kind==='surface','An explicit sea-level override still wins.');
check(initialView(new URLSearchParams('seed=713&habitatScale=2')).kind==='surface','A new world recipe still begins at sea level.');
check(normalizeGenerator({habitatScale:99}).habitatScale===2&&normalizeGenerator({habitatScale:-3}).habitatScale===.5,'Habitat scale is bounded like the other generator dials.');
const rockField=new RockField([{x:4,y:0,z:0,rx:2,ry:8,rz:3},{x:14,y:0,z:0,rx:5,ry:5,rz:4}]);
const rockRoute=[-8,0,8,16,24].map(x=>new THREE.Vector3(x,2,0));clearRockRoute(rockRoute,1,4,rockField);
for(let i=1;i<rockRoute.length;i++){
  const a=rockRoute[i-1],b=rockRoute[i];let clear=true;
  for(let t=0;t<=1;t+=.02){const x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;clear&&=y>=rockField.roof(x,0,.5);}
  check(clear,'Guided travel clears narrow and tall boulders between waypoints.');
}

for(const seed of [0,713,694111,4294967295])for(const relief of [.2,1,2.2])for(const habitatScale of [.5,2]){
  const recipe={...GENERATOR_DEFAULTS,seed,relief,habitatScale},stops=explorationStops(recipe);
  for(const stop of stops){
    const p=new THREE.Vector3(...stop.eye),before=p.clone();constrainToOcean(p,recipe);
    check(p.distanceTo(before)<1e-8,'Every exploration arrival stays above its seeded terrain.');
    check(Math.hypot(p.x,p.z)>240,'Exploration destinations must extend well beyond the original arrival patches.');
    const b=biomeAt(stop.x,stop.z,recipe);
    check(b.id===stop.biome,'Chart destinations agree with their actual biome: '+stop.id);
    if(['coral','canopy','meadow','vents'].includes(stop.kind))check(b[stop.kind]>.28,'The selected feature actually occurs at '+stop.id);
  }
  // Long crossings and climbs are checked between every pair, including direct
  // off-axis paths that the old four arrival points never exercised.
  for(const from of stops)for(const to of stops){
    const route=routeBetween(new THREE.Vector3(...from.eye),to,recipe);let clear=true,continuous=true;
    for(let i=1;i<route.length;i++){
      const a=route[i-1],b=route[i];continuous&&=Math.hypot(...b.map((v,k)=>v-a[k]))<90;
      for(const t of [.2,.4,.6,.8]){
        const p=b.map((v,k)=>a[k]+(v-a[k])*t);clear&&=p.every(Number.isFinite)&&p[1]>oceanFloor(p[0],p[2],recipe)+1.4;
      }
    }
    check(clear&&continuous,`${seed}/${relief}/${habitatScale}: ${from.id} to ${to.id} must remain continuous and above the seafloor.`);
    check(Math.hypot(...route.at(-1).map((v,i)=>v-to.eye[i]))<.001,'A long crossing reaches the actual requested position.');
  }
}

const recipe={...GENERATOR_DEFAULTS,seed:713},scenery=new BiomeScenery(recipe),forms=(t,v)=>scenery.form(t,v);
// Sample broad cross-sections, not just the chart's especially attractive stops.
for(const [name,start,end] of [['reef',[-280,260],[-1300,1200]],['kelp',[300,250],[1300,1100]],['deep',[-650,-800],[900,-1550]]]){
  let covered=0,total=0,animals=0,first=null,last=null;
  for(let i=0;i<=24;i++){
    const t=i/24,x=start[0]+(end[0]-start[0])*t,z=start[1]+(end[1]-start[1])*t,cx=Math.floor(x/64),cz=Math.floor(z/64);
    const cell=growBiomeCell(cx,cz,recipe,forms),living=cell.instances.filter(o=>!['rock','chimney'].includes(o.type));
    const residents=regionalPopulation(cx,cz,recipe).length;
    // An abyssal plain should support sparse bottom communities, not acquire
    // reef-like plant density simply to satisfy a scenery-count assertion.
    if(living.length+(name==='deep'?residents:0)>8)covered++;total++;
    animals+=residents;first??=hash(cell.instances);last=hash(cell.instances);
    check(cell.instances.every(o=>[o.x,o.y,o.z,o.sx,o.sy,o.sz].every(Number.isFinite)),'Every generated placement must be finite throughout '+name);
    check(cell.instances.every(o=>!['kelp','grass','algae'].includes(o.type)||oceanFloor(o.x,o.z,recipe)>-90),'Sunlit plants cannot spread onto the dark seafloor.');
  }
  check(covered/total>.9,`${name} must remain a living biome across a kilometre-long cross-section (${covered}/${total}).`);
  check(animals>100,'Animals must continue across '+name+', not only at its entrance.');
  check(first!==last,'Different areas must not repeat the same tile arrangement.');
}

const cell=growBiomeCell(-8,7,recipe,forms);
check(hash(cell)===hash(growBiomeCell(-8,7,recipe,forms)),'Revisiting a cell must reproduce its seeded scenery exactly.');
check(hash(cell.instances)!==hash(growBiomeCell(-8,7,{...recipe,seed:714},forms).instances),'A different world seed changes the actual wider habitat.');
const bare=growBiomeCell(-8,7,{...recipe,life:0},forms);
check(bare.instances.every(i=>['rock','chimney'].includes(i.type)),'Zero living cover removes extended plants and coral, leaving geology.');
check(regionalPopulation(-8,7,{...recipe,shoal:0}).length===0,'Zero abundance removes regional animals.');
check(regionalPopulation(-8,7,{...recipe,benthos:0}).every(a=>!a.benthic),'The bottom-dweller dial applies away from arrival points.');
check(regionalPopulation(-8,7,{...recipe,predators:0}).every(a=>!a.hunter),'The hunter dial applies away from arrival points.');
check(hash(growBiomeCell(-8,7,{...recipe,habitatScale:.5},forms).instances)!==hash(growBiomeCell(-8,7,{...recipe,habitatScale:2},forms).instances),'Habitat scale changes the actual distribution and terrain.');

for(const [x,z] of [[-384,320],[576,704],[128,-448],[-512,-1152]]){
  const a=floorTile(x,z,64,32,recipe),b=floorTile(x+64,z,64,32,recipe);
  const ap=a.attributes.position,bp=b.attributes.position,an=a.attributes.normal,bn=b.attributes.normal;
  let aligned=true,smooth=true;
  for(let row=0;row<=32;row++)for(let axis=0;axis<3;axis++){
    aligned&&=Math.abs(ap.array[(row*33+32)*3+axis]-bp.array[row*33*3+axis])<.00001;
    smooth&&=Math.abs(an.array[(row*33+32)*3+axis]-bn.array[row*33*3+axis])<.00001;
  }
  check(aligned&&smooth,'Adjacent floor tiles must share positions and normals without visible seams.');
  a.dispose();b.dispose();
}

const group=new THREE.Group(),window={value:new THREE.Vector4()},detail=new OceanFloorDetail(group,recipe,window),wildlife=new BiomeWildlife(recipe);
const stops=explorationStops(recipe);let signature;
for(const [index,stop] of [...stops,...stops.slice(0,1)].entries()){
  const p=new THREE.Vector3(...stop.eye);scenery.update(p);detail.update(p);
  const rockField=new RockField(scenery.rocks);wildlife.update(100+index,p,{},rockField);
  check(scenery.cells.size<=49&&detail.tiles.size===49&&wildlife.cells.size<100,'Travel must keep scenery, detailed terrain, and wildlife caches bounded.');
  check(wildlife.visibleCount>0,'Each remote exploration stop has visible-range wildlife.');
  check(scenery.visibleInstances>100,'Each remote exploration stop has substantial surrounding scenery.');
  check(window.value.x<p.x-150&&window.value.z>p.x+150&&window.value.y<p.z-150&&window.value.w>p.z+150,'Detailed terrain must cover the visible neighbourhood on all sides.');
  const here=hash([...scenery.cells.values()].map(c=>[c.key,c.instances]).sort());
  if(index===0)signature=here;if(index===stops.length)check(here===signature,'A complete journey back restores the same environment instead of rolling a new one.');
  for(const pool of wildlife.pools.values())check(pool.mesh.instanceMatrix.array.every(Number.isFinite),'Regional animal transforms remain finite during travel.');
}
const p=new THREE.Vector3(...stops[0].eye),field=new RockField(scenery.rocks);
wildlife.update(300,p,{},field);const paused=hash(wildlife.population.map(a=>a.pose));wildlife.update(300,p,{},field);
check(paused===hash(wildlife.population.map(a=>a.pose)),'Pausing also freezes the streamed wildlife.');
wildlife.update(10000,p,{},field);check(wildlife.population.every(a=>[a.pose.x,a.pose.y,a.pose.z].every(Number.isFinite)),'Regional animals survive long-running clocks.');
check(nearbyCells({x:-.1,z:-.1}).some(c=>c.key==='-1,-1'),'Negative world coordinates must map to the correct tiles.');
dispose(group);dispose(scenery.group);dispose(wildlife.group);
console.log(`${checks} biome checks passed: kilometre-long habitat coverage, independent wildlife, detailed-floor seams, bounded streaming, reproducible revisits, all chart journeys, and procedural controls.`);
