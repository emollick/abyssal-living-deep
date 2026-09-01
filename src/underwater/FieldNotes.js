import { clamp } from './OceanDomain.js';

// These descriptions identify the generated forms. They deliberately avoid
// assigning an exact species to a model assembled from a broad animal group.
export const FIELD_NOTES = {
  butterflyfish: ['Butterflyfish','Reef fish','Look for the dark eye band and tall, thin body. Watch the fish approach a rock, pause, and turn away.'],
  parrotfish: ['Parrotfish','Reef fish','A blunt beak and broad tail distinguish this grazer. The head tilts down when it reaches a feeding patch.','https://oceanservice.noaa.gov/facts/sand.html'],
  reefshark: ['Reef shark','Shark','Follow the sweep of the tail and the small banking turns. Nearby shoals open around this hunter.'],
  tuna: ['Tuna','Open-water fish','A narrow tail base and crescent tail give this swimmer its silhouette. Individuals keep space while travelling together.'],
  sunfish: ['Ocean sunfish','Open-water fish','Look for the tall dorsal and anal fins. They paddle while the short, deep body holds nearly still.'],
  dolphin: ['Dolphin','Marine mammal','The horizontal flukes beat up and down. This pod makes gradual excursions toward the surface between deeper circuits.'],
  seal: ['Seal','Marine mammal','The hindquarters sweep from side to side. Look for the rounded head, whiskers, and small foreflippers.'],
  lanternfish: ['Lanternfish','Midwater fish','Tiny light organs outline the underside. Each fish turns with its neighbours while keeping a little space.'],
  hatchetfish: ['Hatchetfish','Midwater fish','Turn toward its side to see the deep chest and narrow tail. From the front, the body is almost a sliver.'],
  dragonfish: ['Dragonfish','Deep-water fish','An elongated dark body, fine teeth, and luminous organs distinguish this slow-moving hunter.'],
  anglerfish: ['Anglerfish','Deep-water fish','A luminous lure hangs in front of the mouth. Small fin movements hold the body in place.','https://www.mbari.org/animal/deep-sea-anglerfish/'],
  gulpereel: ['Gulper eel','Deep-water fish','The mouth is much larger than the slender body behind it. Follow the long tail as its bend travels backward.','https://www.mbari.org/animal/whiptail-gulper-eel/'],
  squid: ['Squid','Cephalopod','The mantle contracts as it jets backward; the fins steady it between pulses. Arms trail from the head.'],
  vampire: ['Vampire squid','Cephalopod','The fins move above a skirt of webbed arms. Real vampire squid collect sinking marine snow with thin feeding filaments.','https://www.mbari.org/news/dream-team-of-scientists-and-aquarists-gives-public-first-view-of-a-live-vampire-squid-and-other-deep-sea-cephalopods/'],
  flapjack: ['Flapjack octopus','Cephalopod','Watch the small fins above the webbed arms. Flapjack octopuses live on and near the deep seafloor.','https://www.mbari.org/animal/flapjack-octopus/'],
  octopus: ['Octopus','Cephalopod','Eight soft arms spread across the bottom. In this world, crawling comes in short bouts with quiet pauses.'],
  crab: ['Crab','Crustacean','A broad shell, paired claws, and jointed legs. Watch the body travel sideways while the legs settle between steps.'],
  shrimp: ['Midwater shrimp','Crustacean','The curved abdomen and long antennae make a delicate silhouette. Brief jets alternate with slower movement.'],
  ventshrimp: ['Vent shrimp','Crustacean','Small pale bodies gather around the mineral chimneys. Use the dive light and move closer to see the antennae.'],
  starfish: ['Sea star','Seafloor invertebrate','Five broad arms lie against the bottom. Its very slow pace is represented here by a settled pose.'],
  brittlestar: ['Brittle star','Seafloor invertebrate','Long, narrow arms extend from a small central disc. Look for the fine spines along the arms.'],
  urchin: ['Sea urchin','Seafloor invertebrate','A low rounded body sits beneath a coat of tapering spines. These animals stay attached to the bottom here.'],
  isopod: ['Giant isopod','Crustacean','Overlapping plates cover a low body. The legs carry it slowly across the sediment in short walking bouts.'],
  cucumber: ['Sea cucumber','Seafloor invertebrate','A soft, elongated body rests on short tube feet. Its slow movement is easiest to see against a fixed rock.'],
  seapen: ['Sea pen','Seafloor colony','A feather-shaped colony rises from the sediment. Its base stays rooted as the upper branches move.'],
  manta: ['Manta ray','Ray','Broad pectoral fins travel in a wave from their roots to the tips. Stronger strokes give way to longer glides.'],
  turtle: ['Sea turtle','Marine reptile','The shell stays rigid while the front flippers paddle. Follow a gradual surface excursion and the return to deeper water.','https://www.fisheries.noaa.gov/national/outreach-and-education/fun-facts-about-terrific-sea-turtles'],
  whale: ['Humpback whale','Marine mammal','Long pale flippers and a broad horizontal fluke distinguish this whale. Its route includes a slow rise toward the surface.','https://www.fisheries.noaa.gov/species/humpback-whale'],
  jelly: ['Jellyfish','Gelatinous drifter','A translucent bell contracts above trailing tentacles. Look toward the light to see the outline.'],
  siphonophore: ['Siphonophore','Drifting colony','Repeated bells and a long fine stem form this colony. In the dark, its luminous parts reveal the chain.'],
  shoal: ['Schooling fish','Fish shoal','Each small fish steers independently. Watch the group split around a hunter or rock and gather together again.'],
};

const JOURNAL_KEY='abyssal-field-journal-v1';
export function followFraming(aspect,span){
  return {distance:clamp((span||1)*3/Math.min(1,Math.max(.25,aspect)),3.8,44),pitch:aspect<.9?-Math.atan(Math.tan(Math.PI/8)*.48):0};
}
export function readJournal(storage) {
  try {
    const data=JSON.parse(storage?.getItem(JOURNAL_KEY)||'[]');
    if(!Array.isArray(data))return [];
    const seen=new Set();
    return data.filter(n=>n&&Object.hasOwn(FIELD_NOTES,n.type)&&!seen.has(n.type)&&seen.add(n.type))
      .map(n=>({type:n.type,seed:Number(n.seed)>>>0,depth:Math.round(clamp(Number(n.depth)||0,0,5000))}));
  }catch{return [];}
}
export function recordObservation(entries,observation,seed,depth,storage) {
  if(!Object.hasOwn(FIELD_NOTES,observation.type)||entries.some(n=>n.type===observation.type))return false;
  entries.push({type:observation.type,seed:Number(seed)>>>0,depth:Math.round(clamp(depth,0,5000))});
  try{storage?.setItem(JOURNAL_KEY,JSON.stringify(entries));}catch{ /* journal remains usable for this visit */ }
  return true;
}

export function wildlifeState(sample) {
  const p=sample.pose||{};
  if(p.alarm>.15)return 'Keeping its distance';
  if(p.feeding>.5)return 'Grazing';
  if(['whale','dolphin','seal','turtle'].includes(sample.type)&&Math.abs(p.vy||0)>.12)return p.vy>0?'Rising toward the surface':'Returning to depth';
  if(sample.benthic)return p.speed>.006?'Moving along the bottom':'Resting on the bottom';
  if(sample.type==='jelly'||sample.type==='siphonophore')return 'Drifting';
  if(sample.behavior==='school'||sample.type==='shoal')return p.alarm>.03?'Regrouping':'Schooling';
  if(sample.behavior==='jet')return 'Jetting and gliding';
  if(sample.behavior==='hover')return 'Holding position';
  return (p.effort??.5)<.35?'Gliding':'Cruising';
}

export function sightlineClear(from,to,floor,rocks=[]) {
  const dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z,length=Math.hypot(dx,dy,dz);
  if(length<.01)return true;
  // Stop short of the animal so a bottom dweller is not hidden by its own
  // contact point. The terrain check also covers the large canyon walls.
  if(floor)for(let i=1;i<16;i++){
    const t=i/16;
    if(from.y+dy*t<floor(from.x+dx*t,from.z+dz*t)+.025)return false;
  }
  for(const r of rocks){
    const x=(from.x-r.x)/r.rx,y=(from.y-r.y)/r.ry,z=(from.z-r.z)/r.rz;
    const vx=dx/r.rx,vy=dy/r.ry,vz=dz/r.rz,a=vx*vx+vy*vy+vz*vz;
    const b=x*vx+y*vy+z*vz,c=x*x+y*y+z*z-1,disc=b*b-a*c;
    if(disc<=0||a<1e-10)continue;
    const enter=(-b-Math.sqrt(disc))/a,leave=(-b+Math.sqrt(disc))/a;
    if(enter<.94&&leave>.02&&enter>.01)return false;
  }
  return true;
}

// Projection is pure so the same visibility rules serve desktop, touch, and
// automated checks. Being nearby alone never counts as seeing an animal.
export function projectWildlife(sample,view,aim={x:0,y:0}) {
  const dx=sample.x-view.x,dy=sample.y-view.y,dz=sample.z-view.z;
  const distance=Math.hypot(dx,dy,dz),forward=dx*view.fx+dy*view.fy+dz*view.fz;
  const luminous=['lanternfish','hatchetfish','dragonfish','anglerfish','gulpereel','vampire','jelly','siphonophore'].includes(sample.type);
  const dark=view.daylight!==undefined&&view.daylight<.08;
  const range=dark?Math.min(view.range,view.lamp>.1?30:luminous&&view.glow>.1?8:0):view.range;
  if(forward<.2||distance>range||sample.y>0&&view.y<-.4||sample.y<-.4&&view.y>.4)return null;
  const x=(dx*view.rx+dy*view.ry+dz*view.rz)/(forward*view.tan*view.aspect);
  const y=(dx*view.ux+dy*view.uy+dz*view.uz)/(forward*view.tan);
  const apparent=(sample.span||.4)/(distance*view.tan);
  if(Math.abs(x)>.92||Math.abs(y)>.88||apparent<.012)return null;
  return {sample,x,y,distance,apparent,score:Math.hypot(x-aim.x,y-aim.y)+distance*.002-Math.min(.25,apparent*.18)};
}
