import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AnimalMotion, RockField, MOTION_STEP } from '../src/underwater/AnimalMotion.js';
import { makeFaunaPopulation, faunaPose } from '../src/underwater/OceanFauna.js';
import { oceanFloor } from '../src/underwater/OceanDomain.js';
import { GENERATOR_DEFAULTS, HABITATS } from '../src/underwater/WorldMath.js';
import { MarineLife } from '../src/underwater/MarineLife.js';
import { excursionDepth, surfaceExcursion, soundscapeMix } from '../src/underwater/OceanEcology.js';
import { projectWildlife, sightlineClear, readJournal, recordObservation, wildlifeState } from '../src/underwater/FieldNotes.js';

let checks=0;
const check=(ok,message)=>{assert.ok(ok,message);checks++;};
const angle=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const finite=states=>states.every(s=>Object.values(s).every(Number.isFinite));
const fish=(id=0,extra={})=>({id,behavior:'school',school:0,x:0,y:-5,z:0,scale:.2,radius:.1,maxSpeed:.6,beat:3,phase:id*.7,turnRate:1.5,...extra});
const still=(a,t,out)=>Object.assign(out,{x:a.x,y:a.y,z:a.z,vx:0,vy:0,vz:0,heading:0,activity:0,stroke:0,feeding:0});
const flat=()=>-12;
const run=(motion,seconds,fps=30,environment={})=>{
  for(let i=1;i<=Math.round(seconds*fps);i++)motion.advance(i/fps,typeof environment==='function'?environment(i/fps):environment);
  return motion;
};

// Cadence must not change the fish, their orientation or their fin phase.
const recipe={...GENERATOR_DEFAULTS,seed:694111};
const population=makeFaunaPopulation(recipe);
const cast=[...new Set(population.map(a=>a.type))].map(type=>population.find(a=>a.type===type));
const makeCast=()=>new AnimalMotion(cast,(a,t,out)=>faunaPose(a,t,recipe,out),{floor:(x,z)=>oceanFloor(x,z,recipe)});
const flow={flow:(p,t)=>({x:Math.sin(t*.4)*.08,y:0,z:.03})};
const thirty=run(makeCast(),12,30,flow);
for(const fps of [60,144]){
  const other=run(makeCast(),12,fps,flow);
  for(let i=0;i<cast.length;i++)for(const key of ['x','y','z','heading','stroke','effort']){
    check(Math.abs(thirty.poses[i][key]-other.poses[i][key])<1e-10,`${fps} Hz changed ${cast[i].type} ${key}.`);
  }
}
const paused=JSON.stringify(thirty.poses);
for(let i=0;i<8;i++)thirty.advance(12,{diver:{x:i,y:-5,z:0}});
check(JSON.stringify(thirty.poses)===paused,'Pause must hold both movement and appendage phases.');
thirty.advance(10000,flow);
check(finite(thirty.poses),'A long background-tab gap must recover without invalid poses.');
thirty.advance(4,flow);
check(finite(thirty.poses),'Rewinding must reset the procedural route safely.');

// Coincident spawn points are possible at very high abundance.
const pair=new AnimalMotion([fish(0),fish(1)],still,{floor:flat});
run(pair,3);
check(distance(...pair.poses)>.22,'Overlapping swimmers must separate, even when their positions start identical.');
const octopusPair=new AnimalMotion([fish(0,{behavior:'hover',scale:.22,radius:.11,personalSpace:.42,maxSpeed:.085}),fish(1,{behavior:'hover',scale:.22,radius:.11,personalSpace:.42,maxSpeed:.085})],still,{floor:flat});
run(octopusPair,35);
check(distance(...octopusPair.poses)>.7,'Broad, slow animals must leave room for webbed arms, not only their small body centers.');
const nearVentOctopuses=population.filter(a=>a.type==='flapjack'&&Math.abs(a.z+724)<22&&Math.abs(a.x)<20);
check(nearVentOctopuses.length<=3,'Overlapping water-column bands must not stack bottom-hugging octopuses on one patch.');

// A school opens around a nearby hunter, then reforms after it leaves.
const school=Array.from({length:8},(_,i)=>fish(i,{x:(i%2)*.45,z:Math.floor(i/2)*.38}));
const calm=new AnimalMotion(school,still,{floor:flat}),startled=new AnimalMotion(school,still,{floor:flat});
run(calm,2);run(startled,2,30,{hunters:[{x:-.5,y:-5,z:.5}]});
const centroid=poses=>poses.reduce((s,p)=>s+p.x,0)/poses.length;
const escaped=centroid(startled.poses)-centroid(calm.poses);
check(escaped>.15,'Small fish must move away from a nearby swimming hunter.');
check(startled.poses.some(s=>s.alarm>.1),'Nearby fish should share a short-lived alarm.');
for(let n=61;n<=360;n++){calm.advance(n/30);startled.advance(n/30);}
check(Math.abs(centroid(startled.poses)-centroid(calm.poses))<escaped*.5,'A school should regroup after the hunter has passed.');
check(startled.poses.every(s=>s.alarm<.01),'A past encounter must not leave fish permanently frightened.');
const diver=new AnimalMotion([fish()],still,{floor:flat});
run(diver,2,30,{diver:{x:-.35,y:-5,z:0}});
check(diver.poses[0].x>.2,'An explicitly swimming diver should displace a nearby fish.');
const coincidence=new AnimalMotion([fish()],still,{floor:flat});
run(coincidence,1,30,{diver:{x:0,y:-5,z:0}});
check(distance(coincidence.poses[0],{x:0,y:-5,z:0})>.04,'A fish exactly on the diver must still find an escape direction.');

// Steering must actually pass a rock, rather than stopping against its front.
const rock={x:0,y:-5,z:0,rx:1,ry:1.5,rz:1.4};
const traveler=fish(2,{x:-5,maxSpeed:.8,radius:.16});
const path=(a,t,out)=>Object.assign(out,{x:-5+t*.6,y:-5,z:0,vx:.6,vy:0,vz:0,heading:0,activity:.6,stroke:0,feeding:0});
const obstacle=new AnimalMotion([traveler],path,{floor:flat,rocks:[rock]});
let clear=true,continuous=true,facesTravel=true,last={...obstacle.poses[0]},detour=0;
for(let n=1;n<=1200;n++){
  obstacle.advance(n/30);const p=obstacle.poses[0],s=obstacle.states[0];
  const ellipsoid=((p.x-rock.x)/(rock.rx+traveler.radius))**2+((p.y-rock.y)/(rock.ry+traveler.radius))**2+((p.z-rock.z)/(rock.rz+traveler.radius))**2;
  clear&&=ellipsoid>.98;
  continuous&&=distance(p,last)<.055;
  if(Math.hypot(s.vx,s.vz)>.03)facesTravel&&=Math.abs(angle(s.heading,-Math.atan2(s.vz,s.vx)))<.02;
  detour=Math.max(detour,Math.abs(p.z));last={...p};
}
check(clear,'The rendered body must remain outside the rock collider.');
check(continuous,'Rock avoidance must not teleport the animal.');
check(facesTravel,'A swimming fish must point in the direction it is swimming.');
check(detour>1&&obstacle.poses[0].x>4,'The fish must turn around the rock and resume its route.');
const embedded={x:0,y:-5,z:0};new RockField([rock]).project(embedded,.1);
check(Object.values(embedded).every(Number.isFinite)&&distance(embedded,rock)>1,'A center-of-rock spawn must project to a finite surface point.');

// Flow is integrated by the body, so vertices no longer slide independently.
const station=new AnimalMotion([fish(0,{behavior:'hover'})],still,{floor:flat});
run(station,15,60,{flow:()=>({x:.35,y:0,z:.1})});
check(distance(station.poses[0],{x:0,y:-5,z:0})<.8,'A hovering swimmer should compensate for a moderate steady current.');
check(station.poses[0].effort>.15,'Holding position against a current requires fin movement.');

// Foraging is a visible approach, pause and departure at a real surface point.
const x=-140,z=155,bed=oceanFloor(x,z,recipe);
const feedingRock={x,y:bed+1,z,rx:1.8,ry:1,rz:1.4};
const grazer={...population.find(a=>a.type==='parrotfish'),x:x-1.4,y:bed+2.3,z,phase:0,speed:1,heading:0,
  feedingPoint:{x,y:bed+2,z,rock:feedingRock}};
const grazing=new AnimalMotion([grazer],(a,t,out)=>faunaPose(a,t,recipe,out),{floor:(xx,zz)=>oceanFloor(xx,zz,recipe),rocks:[feedingRock]});
let fed=false,left=false,feedingMax=0;
for(let n=1;n<=1200;n++){
  grazing.advance(n/30);const s=grazing.poses[0];feedingMax=Math.max(feedingMax,s.feeding);
  if(s.feeding>.6&&s.pitch<-.25&&s.speed<.12)fed=true;
  if(n>1050&&s.feeding<.1&&distance(s,grazer.feedingPoint)>.45)left=true;
}
check(feedingMax>.6&&fed,'Parrotfish must reach a grazing patch, lower the head and slow down.');
check(left,'A grazer must leave the patch after feeding.');

for(const type of ['crab','isopod','cucumber','ventshrimp','octopus']){
  const a={...population.find(a=>a.type===type),phase:0,speed:1};
  const crawler=new AnimalMotion([a],(a,t,out)=>faunaPose(a,t,recipe,out),{floor:(x,z)=>oceanFloor(x,z,recipe)});
  let resting=0,moving=0,grounded=true,sideways=true;
  for(let n=1;n<=1800;n++){
    crawler.advance(n/30);const s=crawler.poses[0];
    if(s.speed<a.maxSpeed*.025)resting++;
    if(s.speed>a.maxSpeed*.12)moving++;
    grounded&&=Math.abs(s.y-oceanFloor(s.x,s.z,recipe)-.012)<.003;
    if(type==='crab'&&s.speed>.006)sideways&&=Math.abs(angle(s.heading,-Math.atan2(s.vz,s.vx)+Math.PI/2))<.1;
  }
  check(resting>120&&moving>120,`${type} should pause between crawling bouts.`);
  check(grounded,`${type} must follow the seeded bottom.`);
  check(sideways,'Crabs should walk sideways, not swim nose-first.');
}

// Finite, bounded movement across multiple generated communities and currents.
for(const seed of [0,713,4294967295]){
  const r={...recipe,seed,relief:2.2},all=makeFaunaPopulation(r);
  const members=[...new Set(all.map(a=>a.type))].flatMap(type=>all.filter(a=>a.type===type).slice(0,2));
  const motion=new AnimalMotion(members,(a,t,out)=>faunaPose(a,t,r,out),{floor:(x,z)=>oceanFloor(x,z,r)});
  let bounded=true,ground=true,normalMotion=true,jetAligned=true;
  for(let n=1;n<=600;n++){
    motion.advance(n/30,{flow:(p,t)=>({x:Math.sin(t)*.12,y:.03,z:.08})});
    normalMotion&&=finite(motion.poses);
    for(let i=0;i<members.length;i++){
      const a=members[i],s=motion.states[i];
      bounded&&=s.speed<=(a.maxSpeed||0)*2.81+1e-8;
      ground&&=s.y>=oceanFloor(s.x,s.z,r)+.011&&s.y<=-.449;
      if(a.behavior==='jet'&&Math.hypot(s.vx,s.vz)>.03)jetAligned&&=Math.abs(angle(s.heading,-Math.atan2(s.vz,s.vx)+Math.PI))<.02;
    }
  }
  check(normalMotion,`Seed ${seed}: every position and animation attribute must stay finite.`);
  check(bounded,`Seed ${seed}: accelerations may not create runaway swimming speeds.`);
  check(ground,`Seed ${seed}: animals must remain above terrain and under the surface.`);
  check(jetAligned,`Seed ${seed}: jetting animals must travel mantle/tail first.`);
}
check(MOTION_STEP<=1/20,'Steering needs enough temporal resolution for small swimming animals.');
for(const id of ['blue','kelp']){
  const life=new MarineLife({...HABITATS.find(h=>h.id===id),shoal:.01,jellies:0});
  let upright=true;
  for(const time of [0,30,90,150,180,240,300,360,500,650]){
    life.update(time,new THREE.Vector3(0,0,100));
    // Surface excursions pitch along the dive, but may never turn the body
    // upside down as the horizontal circuit reverses its heading.
    for(const animal of life.animals)upright&&=new THREE.Vector3(0,1,0).applyQuaternion(animal.mesh.quaternion).y>.20;
  }
  check(upright,`${id}: large swimmers must not roll upside-down when their routes reverse heading.`);
  life.group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();if(o.isInstancedMesh)o.dispose();});
}

for(const type of ['dolphin','seal','turtle','whale']){
  let deepest=0,shallowest=-100,last=excursionDepth(type,0,1.4,-24),continuous=true;
  for(let i=1;i<=12000;i++){
    const y=excursionDepth(type,i/20,1.4,-24);
    deepest=Math.min(deepest,y);shallowest=Math.max(shallowest,y);continuous&&=Number.isFinite(y)&&Math.abs(y-last)<.18;last=y;
  }
  check(deepest<-23&&shallowest>-1.2,`${type}: surface excursions must leave cruising depth and approach the surface.`);
  check(continuous,`${type}: the complete dive cycle must remain continuous, including the loop seam.`);
  check(surfaceExcursion(type,60,1)!==surfaceExcursion(type,60,5),`${type}: individual phases should stagger the surface trips.`);
}
check(surfaceExcursion('reefshark',100)===0,'Fish should not inherit air-breathing surface cycles.');

// A field journal must record visible encounters, not animals behind the lens,
// under a rock, beyond visible range, or through the water surface.
const view={x:0,y:-5,z:0,fx:0,fy:0,fz:-1,rx:1,ry:0,rz:0,ux:0,uy:1,uz:0,tan:.53,aspect:16/9,range:50};
const visible={id:'test',type:'parrotfish',x:0,y:-5,z:-8,span:.8};
check(projectWildlife(visible,view)?.distance===8,'A visible animal should be offered for observation.');
check(projectWildlife({...visible,z:8},view)===null,'Animals behind the camera must not be observed.');
check(projectWildlife({...visible,x:40},view)===null,'Animals outside the frame must not be observed.');
check(projectWildlife({...visible,z:-60},view)===null,'Animals beyond water visibility must not be observed.');
check(projectWildlife({...visible,span:.001},view)===null,'Unresolvable specks must not count as a sighting.');
check(projectWildlife(visible,{...view,y:2})===null,'The waterline must not identify submerged animals from above.');
check(projectWildlife(visible,{...view,daylight:0,lamp:0,glow:0})===null,'An unlit animal in darkness must not be identified.');
check(projectWildlife(visible,{...view,daylight:0,lamp:1,glow:0})!==null,'A nearby animal illuminated by the dive light can be identified.');
check(sightlineClear(view,visible,()=>-12),'An open line of sight should remain observable.');
check(!sightlineClear(view,visible,()=>-12,[{x:0,y:-5,z:-4,rx:1,ry:1,rz:1}]),'A rock between lens and animal must hide it.');
check(!sightlineClear(view,visible,(_x,z)=>z<-3&&z>-5?-3:-12),'A canyon ridge must block observation.');
check(sightlineClear(view,visible,()=>-12,[{x:0,y:-5,z:-14,rx:1,ry:1,rz:1}]),'A rock behind the animal must not hide it.');
const store={value:'bad json',getItem(){return this.value;},setItem(_key,value){this.value=value;}};
check(readJournal(store).length===0,'A damaged journal must not break the ocean.');
const entries=[];
check(recordObservation(entries,visible,713,24.4,store),'The first observation must be saved.');
check(!recordObservation(entries,visible,9,800,store),'Seeing the same animal group twice must not overwrite its first sighting.');
check(readJournal(store)[0]?.depth===24&&readJournal(store)[0]?.seed===713,'Sightings must survive a new journal instance.');
store.value='[{"type":"__proto__"},{"type":"parrotfish","seed":1,"depth":-5},{"type":"parrotfish","depth":9}]';
check(readJournal(store).length===1&&readJournal(store)[0].depth===0,'Stored data must be bounded, deduplicated, and limited to known animals.');
check(recordObservation(entries,{type:'crab'},713,32,{setItem(){throw new Error('disabled');}}),'Storage disabled must still allow observations during the visit.');
check(wildlifeState({type:'parrotfish',pose:{feeding:.8}})==='Grazing','Observation should describe actual feeding state.');
check(wildlifeState({type:'crab',benthic:true,pose:{speed:0}})==='Resting on the bottom','Still bottom dwellers must not be described as swimming.');

const surfaceMix=soundscapeMix({depth:-2,wind:20}),deepMix=soundscapeMix({depth:1400,reef:1});
check(surfaceMix.surf>deepMix.surf*10&&surfaceMix.cutoff>deepMix.cutoff,'Surface surf must become quieter and muffled with depth.');
check(deepMix.reef<.0001,'Reef crackle must not follow the listener into the abyss.');
check(soundscapeMix({paused:true}).master===0&&soundscapeMix({hidden:true}).master===0,'Pause and hidden tabs must silence the soundscape.');
check(soundscapeMix({volume:0}).master===0,'Zero volume must silence every layer.');
check(Object.values(soundscapeMix({depth:5000,wind:60,storm:1,reef:3,whale:8,volume:3})).every(Number.isFinite),'Sound mixes must stay finite at the dial extremes.');
console.log(`${checks} animal behavior and observation checks passed: motion, surface excursions, sightlines, journal persistence, and depth-aware sound.`);
