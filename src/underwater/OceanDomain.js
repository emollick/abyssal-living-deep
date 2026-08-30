// The shelf and trench are a single height field. Navigation and geometry use
// this function together, so travelling to a new depth cannot swap the floor.
export const SITE_ORIGINS = {
  reef: [-140, 140], kelp: [150, 110], blue: [0, -170], deep: [0, -760],
};
export const MAX_DEPTH = 1419;
export const DOMAIN_RADIUS = 2200;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function oceanFloor(x, z, recipe = {}) {
  const seed = recipe.worldSeed ?? recipe.seed ?? 713;
  const phase = (seed % 997) * 0.003;
  const relief = recipe.relief ?? 1;
  const along = -z;
  const shelf = 28 + smooth(-240, 220, x) * 6;
  const shelfBreak = smooth(20, 190, along);
  const trench = smooth(190, 670, along);
  const depth = shelf * (1 - shelfBreak) + 90 * shelfBreak + 1344 * trench;
  const xx = x + 140, zz = z - 140;
  const broad = Math.sin(xx * 0.039 + phase) * Math.cos(zz * 0.036 + phase * 0.5) * 2;
  const dunes = Math.sin(xx * 0.105 + Math.sin(zz * 0.075 + phase) * 1.3) * 0.72;
  const channel = Math.exp(-(((xx - Math.sin(zz * 0.055) * 5) / 10) ** 2));
  const escarpment = Math.sin(x * 0.043 + Math.sin(z * 0.026) * 2.7 + phase)
    * Math.sin(z * 0.062 + phase) * 11 * Math.sin(trench * Math.PI);
  const shoulder=smooth(19,77,Math.abs(x-Math.sin(z*.006)*7))*Math.sin(trench*Math.PI)*340;
  return -depth + shoulder + (broad * (1 + trench * 0.5) + dunes + escarpment - channel * 1.5 * (1 - trench)) * relief;
}

export function connectedHabitat(base, seed, settings = {}) {
  const origin = SITE_ORIGINS[base.id];
  const eye=[base.eye[0]+origin[0],base.eye[1],base.eye[2]+origin[1]];
  const look=[base.look[0]+origin[0],base.look[1],base.look[2]+origin[1]];
  if(base.id==='reef'||base.id==='kelp'){
    eye[1]=oceanFloor(eye[0],eye[2],{...settings,seed})+(base.id==='reef'?4.3:6.5);
    look[1]=oceanFloor(look[0],look[2],{...settings,seed})+(base.id==='reef'?4.0:10.0);
  }
  if(base.id==='deep'){
    eye[1]=oceanFloor(eye[0],eye[2],{...settings,seed})+3.2;
    look[2]=origin[1]+10;
    look[1]=oceanFloor(look[0],look[2],{...settings,seed})+1.0;
  }
  return { ...base, ...settings, seed: (seed + ({reef:0, kelp:5106, blue:278, deep:81304}[base.id])) >>> 0,
    worldSeed: seed, connected: true, origin,
    eye,look,
  };
}

export function constrainToOcean(position, recipe = {}, clearance = 1.6) {
  const r = Math.hypot(position.x, position.z);
  if (r > DOMAIN_RADIUS) { position.x *= DOMAIN_RADIUS / r; position.z *= DOMAIN_RADIUS / r; }
  position.y = clamp(position.y, oceanFloor(position.x, position.z, recipe) + clearance, 3600);
  return position;
}

// A depth stop follows the escarpment, within sight of its terraces. Arbitrary
// free swimming remains possible everywhere above the same seabed.
export function transectPose(depth, recipe = {}) {
  depth = clamp(depth, 0, MAX_DEPTH);
  if (depth > 1390) return {eye:[0,-depth,-724], look:[0,-1425,-771]};
  if (depth < 2) return {eye:[0,9,-690], look:[0,2,-1100]};
  let lo = -690, hi = 60;
  const x = Math.sin(depth * 0.008) * 12;
  const floorDepth = depth + (depth < 70 ? 28 : 42);
  for (let i = 0; i < 28; i++) {
    const z = (lo + hi) / 2;
    if (-oceanFloor(x, z, recipe) > floorDepth) lo = z; else hi = z;
  }
  const z = (lo + hi) / 2;
  return {eye:[x,-depth,z],look:[x + (depth>120?24:7),-depth - (depth>120?14:9),z - (depth>120?38:48)]};
}

export function depthZone(depth) {
  if (depth < -0.4) return {id:'surface',name:'The breathing sea',label:'AIR / OCEAN',subtitle:'One ocean. From the sky to the abyss.'};
  if (depth < 80) return {id:'sunlight',name:'The sunlit sea',label:'SUNLIGHT / 0–200 M',subtitle:'Light, waves and life, sharing the same water.'};
  if (depth < 200) return {id:'blue',name:'The edge of daylight',label:'THE CONTINENTAL SLOPE',subtitle:'The shelf falls away. The blue grows deeper.'};
  if (depth < 1000) return {id:'twilight',name:'The long twilight',label:'TWILIGHT / 200–1,000 M',subtitle:'The last blue light. A slow rain from the world above.'};
  if (depth < 1320) return {id:'midnight',name:'The midnight sea',label:'INTO THE MIDNIGHT ZONE',subtitle:'Small lives write their own light in the dark.'};
  return {id:'deep',name:'The midnight garden',label:'THE ABYSS / 1,400 M',subtitle:'The deep is part of everything above it.'};
}

export function travelSpeed(depth, remaining = Infinity) {
  const cruise = 9 + smooth(15, 180, depth) * 58;
  return Math.min(cruise, 2.5 + Math.sqrt(Math.max(0, remaining)) * 4);
}

export function routeBetween(from, destination, recipe = {}) {
  const points = [[from.x, from.y, from.z]];
  const to = destination.eye;
  const down = -to[1] > -from.y;
  const levels = [45, 100, 200, 360, 620, 940, 1250, 1390];
  if (!down) levels.reverse();
  for (const depth of Math.hypot(from.x-to[0],from.z-to[2])<60?[]:levels) {
    if (down ? depth > -from.y + 20 && depth < -to[1] - 15 : depth < -from.y - 20 && depth > -to[1] + 15) {
      points.push(transectPose(depth, recipe).eye);
    }
  }
  points.push([...to]);
  // Sample the segments against the actual seeded terrain. Lifting a waypoint
  // before travel, rather than snapping the camera during it, avoids cliff cuts.
  const safe = [points[0]];
  const arrivalClearance=clamp(to[1]-oceanFloor(to[0],to[2],recipe),1.6,5);
  for (let i = 1; i < points.length; i++) {
    const a = points[i-1], b = points[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(...b.map((v,j)=>v-a[j])) / 22));
    for (let n = 1; n <= steps; n++) {
      const t=n/steps, p=b.map((v,j)=>a[j]+(v-a[j])*t);
      const remaining=Math.hypot(p[0]-to[0],p[1]-to[1],p[2]-to[2]);
      const clearance=arrivalClearance+(5-arrivalClearance)*smooth(0,65,remaining);
      p[1]=Math.max(p[1],oceanFloor(p[0],p[2],recipe)+clearance);
      safe.push(p);
    }
  }
  return safe;
}
