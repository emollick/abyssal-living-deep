import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HABITATS, floorHeight } from '../src/underwater/WorldMath.js';
import { connectedHabitat, oceanFloor, constrainToOcean, transectPose, routeBetween, travelSpeed, initialView, floatEyeHeight, SURFACE_EYE_HEIGHT, depthZone } from '../src/underwater/OceanDomain.js';
import { OceanDynamics, DEEP_SOURCE, flowAt, pulseHeight } from '../src/underwater/OceanDynamics.js';
import { createOceanTerrain, createPelagicLife } from '../src/underwater/OceanTerrain.js';

let checks=0;
function check(value,label){assert.ok(value,label);checks++;}
function dispose(group){group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}

for(const [query,kind] of [['','surface'],['seed=82017','surface'],['light=storm','surface'],['site=reef','habitat'],['site=deep','habitat'],['site=deep&surface=1','surface'],['surface=waterline','surface'],['surface=0','habitat'],['depth=0','surface'],['depth=600','depth'],['depth=NaN','surface'],['depth=','surface'],['depth=600&surface=1','surface']]){
  check(initialView(new URLSearchParams(query)).kind===kind,'The initial view must honor a fresh surface visit and explicit dive links: '+query);
}
check(initialView(new URLSearchParams('surface=waterline')).clearance<.1,'A shared waterline view must retain the boundary camera.');
check(initialView(new URLSearchParams()).clearance===SURFACE_EYE_HEIGHT&&SURFACE_EYE_HEIGHT<2,'Fresh visits begin at human eye height above the water.');
check(depthZone(-SURFACE_EYE_HEIGHT).id==='surface','A near-water surface view must not be labeled as an underwater zone.');
check(floatEyeHeight(1.5,4,SURFACE_EYE_HEIGHT,0)===1.5,'Pause must freeze the floating camera.');
for(const fps of [15,30,60,120]){
  let y=SURFACE_EYE_HEIGHT,clear=true;
  for(let i=0;i<fps*20;i++){const height=Math.sin(i/fps*.8)*2.4;y=floatEyeHeight(y,height,SURFACE_EYE_HEIGHT,1/fps);clear&&=Number.isFinite(y)&&y>height+.6;}
  check(clear,'The surface camera must stay in air while following moving waves at '+fps+' FPS.');
  for(let i=0;i<fps*3;i++)y=floatEyeHeight(y,0,SURFACE_EYE_HEIGHT,1/fps);
  check(Math.abs(y-SURFACE_EYE_HEIGHT)<.02,'The floating camera settles at the requested eye height.');
}

for(const seed of [0,713,1934512951,4294967295])for(const relief of [.2,1,2.2]) {
  const recipe={seed,relief};
  const sites=HABITATS.map(h=>connectedHabitat(h,seed,recipe));
  for(const h of sites){
    check(Math.abs(floorHeight(0,0,h)-oceanFloor(...h.origin,recipe))<1e-9,'Habitat placement and global collision terrain must agree.');
    const above={x:h.eye[0],y:20,z:h.eye[2]};constrainToOcean(above,recipe);
    check(above.y===20,'Every habitat must allow swimming into the air.');
  }
  for(const depth of [50,200,500,800,1100,1390,1419]) {
    const pose=transectPose(depth,recipe);
    const p={x:pose.eye[0],y:pose.eye[1],z:pose.eye[2]};constrainToOcean(p,recipe);
    check(p.y>=oceanFloor(p.x,p.z,recipe)+1.599,'Every depth stop must stay above its actual seeded floor.');
    check(Math.abs(p.z)>125||depth<100,'Deep travel must escape the old 125 metre habitat cage.');
  }
  for(const from of sites)for(const to of sites){
    const route=routeBetween(new THREE.Vector3(...from.eye),to,recipe);
    check(Math.hypot(...route.at(-1).map((v,i)=>v-to.eye[i]))<.001,'A journey must finish at the requested viewing position, including close to the seabed.');
    let finite=true,clear=true,continuous=true;
    for(let i=1;i<route.length;i++) {
      const a=route[i-1],b=route[i];
      finite&&=b.every(Number.isFinite);continuous&&=Math.hypot(...b.map((v,j)=>v-a[j]))<120;
      for(let n=1;n<=8;n++){
        const t=n/8,p=b.map((v,j)=>a[j]+(v-a[j])*t);
        clear&&=p[1]>=oceanFloor(p[0],p[2],recipe)+1.4;
      }
    }
    check(finite&&continuous,`${seed}/${relief}: a journey must be continuous and finite.`);
    check(clear,`${seed}/${relief}: ${from.id} to ${to.id} must not travel through the seafloor.`);
  }
}

const calm={windSpeed:4,windAngle:.4,storm:0,swellHs:1};
const deepStop=connectedHabitat(HABITATS[3],713);
const vertical=routeBetween(new THREE.Vector3(deepStop.eye[0],9,deepStop.eye[2]),deepStop,{seed:713});
check(vertical.every(p=>Math.abs(p[0]-deepStop.eye[0])<.001&&Math.abs(p[2]-deepStop.eye[2])<.001),'Descending over the deep must not detour back to the continental shelf.');
const storm={windSpeed:38,windAngle:.4,storm:1,swellHs:12};
const here={x:0,y:-15,z:-300},far={...here,y:-1200};
const speed=f=>Math.hypot(f.x,f.y,f.z);
check(speed(flowAt(here,12,storm))>speed(flowAt(here,12,calm))*2,'Storm momentum must alter the upper ocean.');
const delta=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
check(delta(flowAt(far,12,storm),flowAt(far,12,calm))<delta(flowAt(here,12,storm),flowAt(here,12,calm))*.05,'Surface weather influence must attenuate in the abyss.');
check(speed(flowAt(here,12,storm,{current:0}))===0,'The current dial at zero must remove advection.');
const vortex={x:0,y:-300,z:58,w:25};
const spinning=flowAt({...here,x:12},12,calm,{}, {vortices:[vortex]});
check(spinning.y<flowAt({...here,x:12},12,calm).y-.3,'A surface whirlpool must pull the nearby submerged water down.');
check(Math.abs(flowAt({...far,x:12},12,calm,{}, {vortices:[vortex]}).y-flowAt({...far,x:12},12,calm).y)<.001,'A shallow vortex must not spin the entire abyss equally.');
const soliton=[{x:1,y:0,z:0,w:30},{x:160}];
check(flowAt(here,12,calm,{}, {solitons:[soliton]}).x>flowAt(here,12,calm).x+1,'A passing long wave must transfer momentum below the surface.');
const source={x:DEEP_SOURCE.x,y:-900,z:DEEP_SOURCE.z};
check(flowAt(source,12,calm,{upwelling:3}).y>flowAt(source,12,calm,{upwelling:0}).y+.5,'Deep upwelling must carry water upward.');
const nourished=new OceanDynamics(),quiet=new OceanDynamics();
for(let i=0;i<3600;i++){nourished.update(1/60,calm,{upwelling:3});quiet.update(1/60,calm,{upwelling:0});}
check(nourished.nutrients>quiet.nutrients+.8,'The deep source must change the surface bloom over time.');
nourished.tremor();const before=JSON.stringify(nourished);nourished.update(0,storm,{upwelling:0});
check(JSON.stringify(nourished)===before,'Pausing must freeze cross-ocean events and transport.');
check(pulseHeight(DEEP_SOURCE.x,DEEP_SOURCE.z,1,1)===0,'The surface cannot respond before the seabed signal arrives.');
for(const age of [5,15,40,75]){
  const x=DEEP_SOURCE.x+(age-1.4)*22;
  check(pulseHeight(x,DEEP_SOURCE.z,age,1)>.5,'A seabed pulse must produce a travelling surface wave.');
  check(pulseHeight(x,DEEP_SOURCE.z,age,0)===0,'Clearing a disturbance must remove its wave.');
}
check(travelSpeed(900)>travelSpeed(15)*4,'Long deep journeys need a usable exploration speed.');

const recipe={seed:713,relief:1,life:.2,shoal:.2};
const terrain=createOceanTerrain(recipe),bed=terrain.getObjectByName('Unbroken seabed').geometry.attributes.position;
let aligned=true;
for(let i=0;i<bed.count;i+=31)aligned&&=Math.abs(bed.getY(i)-oceanFloor(bed.getX(i),bed.getZ(i),recipe))<.001;
check(aligned,'The rendered continuous seabed must be the same terrain the swimmer collides with.');
const pelagic=createPelagicLife(recipe);pelagic.update(10000);
check(pelagic.count>0&&pelagic.group.children.length>1,'The middle water column needs actual life and geometry.');
check(pelagic.group.children[0].instanceMatrix.array.every(Number.isFinite),'Midwater life must stay finite on a long-running clock.');
dispose(terrain);dispose(pelagic.group);
console.log(`${checks} connected-ocean checks passed: all habitat routes, 12 seed/relief combinations, terrain agreement, depth-dependent flow, and deep-to-surface transport.`);
