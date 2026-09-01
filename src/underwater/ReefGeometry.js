import * as THREE from 'three';
import { seeded, floorHeight, TAU } from './WorldMath.js';
import { waterMaterial } from './UnderwaterMaterial.js';

const up = new THREE.Vector3(0, 1, 0);
const dummy = new THREE.Object3D();

export function paintGeometry(geometry, color = '#ffffff', rng = () => 0.5, flex = null) {
  const pos = geometry.attributes.position;
  const base = color instanceof THREE.Color ? color : new THREE.Color(color);
  const colors = new Float32Array(pos.count * 3);
  const bends = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const v = 0.92 + rng() * 0.16;
    colors[i * 3] = base.r * v; colors[i * 3 + 1] = base.g * v; colors[i * 3 + 2] = base.b * v;
    bends[i] = flex ? flex(pos.getX(i), pos.getY(i), pos.getZ(i)) : 0;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aFlex', new THREE.BufferAttribute(bends, 1));
  if (!geometry.attributes.uv) geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  return geometry;
}

// Stream scenery into small indexed meshes. A single reef-wide merge used a
// large temporary JavaScript index array as well as two copies of every vertex,
// which could exhaust a browser's memory on a second generation.
export const SCENERY_BATCH_VERTICES = 65535;

function mergeParts(parts) {
  if (parts.length === 1) return parts[0];
  const vertexCount=parts.reduce((n,g)=>n+g.attributes.position.count,0);
  const indexCount=parts.reduce((n,g)=>n+g.index.count,0);
  const merged=new THREE.BufferGeometry();
  for(const [name,source] of Object.entries(parts[0].attributes)) {
    const array=new source.array.constructor(vertexCount*source.itemSize);
    let offset=0;
    for(const part of parts){const a=part.attributes[name].array;array.set(a,offset);offset+=a.length;}
    const attribute=new THREE.BufferAttribute(array,source.itemSize,source.normalized);
    attribute.gpuType=source.gpuType;merged.setAttribute(name,attribute);
  }
  const indices=vertexCount<=SCENERY_BATCH_VERTICES?new Uint16Array(indexCount):new Uint32Array(indexCount);
  let cursor=0,base=0;
  for(const part of parts){
    for(const index of part.index.array)indices[cursor++]=index+base;
    base+=part.attributes.position.count;part.dispose();
  }
  merged.setIndex(new THREE.BufferAttribute(indices,1));
  return merged;
}

export class Batch {
  constructor(material,colliders=null) { this.material = material; this.parts = []; this.chunks=[]; this.vertices=0;this.colliders=colliders; }
  add(g, color, rng, flex = null) {
    if(this.colliders){
      g.computeBoundingBox();const b=g.boundingBox,x=(b.min.x+b.max.x)/2,y=(b.min.y+b.max.y)/2,z=(b.min.z+b.max.z)/2;
      const rx=(b.max.x-b.min.x)/2,ry=(b.max.y-b.min.y)/2,rz=(b.max.z-b.min.z)/2;
      if(Math.max(rx,rz)>.6){
        const feedingPoints=[[0,0],[.30,.15],[-.30,-.15]].map(([dx,dz])=>{const px=x+dx*rx,pz=z+dz*rz;return {x:px,y:highestSurfaceAt(g,px,pz,b.min.y),z:pz};});
        this.colliders.push({x,y,z,rx:Math.max(.1,rx),ry:Math.max(.1,ry),rz:Math.max(.1,rz),feedingPoints});
      }
    }
    const count=g.attributes.position.count;
    if(this.vertices&&this.vertices+count>SCENERY_BATCH_VERTICES)this.flush();
    paintGeometry(g, color, rng, flex);
    // Preserve shared vertices: dense coral used three times the GPU memory
    // when every branch was expanded into independent triangles.
    if(!g.index){
      const indices=count<=SCENERY_BATCH_VERTICES?new Uint16Array(count):new Uint32Array(count);
      for(let i=0;i<count;i++)indices[i]=i;
      g.setIndex(new THREE.BufferAttribute(indices,1));
    }
    this.parts.push(g);this.vertices+=count;
  }
  flush() {
    if(!this.parts.length)return;
    this.chunks.push(mergeParts(this.parts));this.parts=[];this.vertices=0;
  }
  finish(group, name) {
    this.flush();let first=null;
    for(const [i,geometry] of this.chunks.entries()){
      geometry.computeBoundingSphere();
      const mesh=new THREE.Mesh(geometry,this.material);mesh.name=i?`${name} ${i+1}`:name;
      group.add(mesh);first??=mesh;
    }
    this.chunks=[];return first;
  }
}

function transform(g, position, scale = [1, 1, 1], rotation = [0, 0, 0]) {
  dummy.position.set(...position); dummy.scale.set(...scale); dummy.rotation.set(...rotation); dummy.updateMatrix();
  return g.applyMatrix4(dummy.matrix);
}

export function segment(a, b, radiusA, radiusB, sides = 6) {
  const delta = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(radiusB, radiusA, delta.length(), sides, 1, false);
  const q = new THREE.Quaternion().setFromUnitVectors(up, delta.clone().normalize());
  g.applyQuaternion(q); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

export function rockGeometry(seed = 1) {
  const g = new THREE.SphereGeometry(1, 22, 14);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const f = 1 + Math.sin(x * 3.9 + seed) * Math.sin(y * 3.1 + 3.0) * Math.cos(z * 4.2) * .18
      + Math.sin(x * 12.3 + z * 8.1 + seed) * Math.sin(y * 10.7) * .075
      + Math.sin(x * 27.1 + y * 18.4) * Math.cos(z * 23.7 + seed) * .022;
    p.setXYZ(i, x * f, y * f, z * f);
  }
  g.computeVertexNormals(); return g;
}

// Anchor colonies to the deformed rock, not to its idealized ellipsoid. The
// latter leaves small corals hovering over depressions or buried in ridges.
export function highestSurfaceAt(geometry,x,z,fallback=0) {
  const p=geometry.attributes.position,index=geometry.index;
  const count=index?index.count:p.count;let highest=-Infinity;
  for(let i=0;i<count;i+=3){
    const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1,c=index?index.getX(i+2):i+2;
    const ax=p.getX(a),az=p.getZ(a),bx=p.getX(b)-ax,bz=p.getZ(b)-az,cx=p.getX(c)-ax,cz=p.getZ(c)-az;
    const det=bx*cz-cx*bz;if(Math.abs(det)<1e-9)continue;
    const dx=x-ax,dz=z-az,u=(dx*cz-cx*dz)/det,v=(bx*dz-dx*bz)/det;
    if(u<-.00001||v<-.00001||u+v>1.00001)continue;
    const ay=p.getY(a);highest=Math.max(highest,ay+u*(p.getY(b)-ay)+v*(p.getY(c)-ay));
  }
  return Number.isFinite(highest)?Math.max(fallback,highest):fallback;
}

function addTerrain(group, habitat, rng) {
  const g = new THREE.PlaneGeometry(360, 360, 168, 168); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  const sand = new THREE.Color(habitat.id === 'deep' ? '#283d43' : habitat.id === 'blue' ? '#516d73' : '#d7cca1');
  const moss = new THREE.Color(habitat.id === 'deep' ? '#172830' : '#628777');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, floorHeight(x, z, habitat));
    const patch = Math.max(0, Math.sin(x * 0.17) * Math.cos(z * 0.13 + 1.2)) * 0.28;
    const c = sand.clone().lerp(moss, patch).multiplyScalar(0.93 + rng() * 0.08);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.computeVertexNormals();
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aFlex', new THREE.BufferAttribute(new Float32Array(p.count), 1));
  const mesh = new THREE.Mesh(g, waterMaterial(0, { name: 'rippled-seabed' })); mesh.name = 'Rippled seabed'; group.add(mesh);
}

// Reuse a small set of procedurally grown skeletons. A recipe still chooses
// every colony's form, proportions, orientation and color, without rebuilding
// thousands of tiny tube paths whenever a population dial is released.
const coralForms = new Map();
function branchCoral(batch,x,y,z,size,color,rng,fan=false) {
  const variant=Math.floor(rng()*12),key=(fan?'fan:':'bush:')+variant;
  if(!coralForms.has(key)){
    const draft=new Batch(null);
    growBranchCoral(draft,0,0,0,1,'#ffffff',seeded(18031+variant*571+(fan?9311:0)),fan);
    draft.flush();const form=mergeParts(draft.chunks);
    coralForms.set(key,form);
  }
  const form=coralForms.get(key),g=form.clone(),width=size*(.86+rng()*.28);
  transform(g,[x,y,z],[width,size,width*(.87+rng()*.23)],[0,rng()*TAU,0]);
  batch.add(g,color,rng);
  const tint=g.attributes.color,detail=form.attributes.color;
  for(let i=0;i<tint.count;i++)tint.setXYZ(i,tint.getX(i)*detail.getX(i),tint.getY(i)*detail.getY(i),tint.getZ(i)*detail.getZ(i));
}

function growBranchCoral(batch, x, y, z, size, color, rng, fan = false, levels = 4) {
  const origin = new THREE.Vector3(x, y, z);
  const angle = rng() * TAU;
  const recurse = (start, dir, length, radius, level) => {
    const end = start.clone().addScaledVector(dir, length);
    const mid=start.clone().lerp(end,.52).add(new THREE.Vector3((rng()-.5)*length*.10,0,(rng()-.5)*length*.10));
    const curve=new THREE.CatmullRomCurve3([start,mid,end]);
    const sides=radius>.013?7:5,steps=radius>.02?4:3;
    const branch=new THREE.TubeGeometry(curve,steps,radius,sides,false),bp=branch.attributes.position;
    for(let i=0;i<bp.count;i++){
      const row=Math.floor(i/(sides+1)),t=row/steps,c=curve.getPointAt(t),taper=1-t*.48;
      bp.setXYZ(i,c.x+(bp.getX(i)-c.x)*taper,c.y+(bp.getY(i)-c.y)*taper,c.z+(bp.getZ(i)-c.z)*taper);
    }
    branch.computeVertexNormals();batch.add(branch,color,rng);
    if (level <= 0) {
      const tip = end.clone().addScaledVector(dir, length * 0.12);
      batch.add(segment(end, tip, radius * 0.54, radius * 0.18, 7), '#c2bba2', rng);
      return;
    }
    const forks = level > 1 ? 3 : 2;
    for (let j = 0; j < forks; j++) {
      let nd;
      if (fan) {
        const a = (rng() - 0.5) * 1.8;
        nd = new THREE.Vector3(Math.sin(angle) * a, 0.5 + rng() * 0.6, Math.cos(angle) * a);
      } else nd = new THREE.Vector3((rng() - 0.5) * 1.5, 0.5 + rng() * 0.7, (rng() - 0.5) * 1.5);
      nd.addScaledVector(dir, 0.5).normalize();
      recurse(end, nd, length * (0.63 + rng() * 0.1), radius * (fan?.60:.69), level - 1);
    }
  };
  const crown=origin.clone().add(new THREE.Vector3(0,size*0.12,0));
  batch.add(segment(origin,crown,size*0.07,size*0.05,7),color,rng);
  const trunks=fan?3:size>1.8?4:3;
  for(let j=0;j<trunks;j++) {
    const a=angle+j/trunks*TAU;
    const dir=fan?new THREE.Vector3(Math.sin(angle)*(j-1)*0.8,1,Math.cos(angle)*(j-1)*0.8):new THREE.Vector3(Math.cos(a)*0.55,0.7+rng()*0.35,Math.sin(a)*0.55);
    recurse(crown,dir.normalize(),size*(fan?.28:.27),size*(fan?.025:.041),levels);
  }
}

function plateGeometry(radius, wobble = 0) {
  const p = [], uv = [], idx = []; const rings = 12, sides = 72;
  for (let j = 0; j <= rings; j++) for (let i = 0; i <= sides; i++) {
    const a = i / sides * TAU, r = j / rings;
    const rr = radius * r * (1.0 + Math.sin(a * 5 + wobble) * r * .15 + Math.sin(a*11+wobble)*r*.045);
    p.push(Math.cos(a) * rr, r*r*radius*.10+Math.sin(a*5+wobble)*radius*r*.05+Math.sin(r*14+a*3)*r*.014,Math.sin(a)*rr);
    uv.push(r, a / TAU);
    if (j < rings && i < sides) { const n = j * (sides + 1) + i; idx.push(n, n + sides + 1, n + 1, n + 1, n + sides + 1, n + sides + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

function leafGeometry(start, end, width, twist, bend = 0.25) {
  const p = [], uv = [], idx = [], dir = new THREE.Vector3().subVectors(end, start);
  const side = new THREE.Vector3(Math.cos(twist), 0.1, Math.sin(twist));
  const rows = 16, cols = 6;
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
    const t = j / rows, s = i / cols * 2 - 1;
    const w = Math.pow(Math.sin(t * Math.PI), 0.65) * width;
    const v = start.clone().addScaledVector(dir, t).addScaledVector(side, s * w);
    v.y += Math.sin(t * Math.PI) * bend + Math.abs(s) * w * 0.2 + Math.sin(t * 18 + s * 2) * w * 0.13;
    p.push(v.x, v.y, v.z); uv.push(i / cols, t);
    if (i < cols && j < rows) { const n = j * (cols + 1) + i; idx.push(n, n + 1, n + cols + 1, n + 1, n + cols + 2, n + cols + 1); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

function addKelp(batch, x, y, z, height, rng, small = false) {
  const phase = rng() * TAU;
  const at=t=>new THREE.Vector3(x+Math.sin(t*4+phase)*t*.9+Math.sin(phase)*t*t*t*height*.24,y+t*height,z+Math.cos(t*3+phase)*t*.9+Math.cos(phase)*t*t*t*height*.19);
  const path = new THREE.CatmullRomCurve3(Array.from({ length: 20 }, (_, i) => at(i / 19)));
  const flex = (px, py) => Math.pow(Math.max(0, py - y) / height, 1.4) * (small ? .22 : 1.10);
  batch.add(new THREE.TubeGeometry(path, 36, small ? .012 : .030, 7, false), '#53533a', rng, flex);
  const count=small?9:Math.floor(height*1.9);
  for (let j = 1; j < count; j++) {
    const t=(j+Math.sin(j*2.3)*.22)/count,a=j*2.39996+phase+(rng()-.5)*.28;
    const start = at(t), length = (small ? .25 : .65) + rng() * (small ? .50 : 1.05);
    const end = start.clone().add(new THREE.Vector3(Math.cos(a) * length, -length * 0.7 + rng() * 0.55, Math.sin(a) * length));
    const color = new THREE.Color().setHSL(.125+rng()*.03,.30+rng()*.19,.19+rng()*.095);
    batch.add(leafGeometry(start, end, length * 0.095, a + Math.PI / 2, length * 0.38), color, rng, flex);
    if(!small){const bladder=new THREE.SphereGeometry(.050+rng()*.015,9,7);bladder.scale(1,1.4,1);bladder.translate(start.x,start.y,start.z);batch.add(bladder,'#71633d',rng,flex);}
  }
}

// Short rooted blades grow in irregular sandy patches, with the channel left
// open. Their flex is zero at the rhizome; current only moves the upper blade.
export function seagrassGeometry(height, width, lean, angle) {
  const p=[],uv=[],indices=[],rows=8;
  for(let j=0;j<=rows;j++){
    const t=j/rows,bend=lean*t*t,side=width*(1-.85*t*t),y=height*(t-.19*t*t*t);
    for(const s of [-1,1]){
      p.push(Math.cos(angle)*bend-Math.sin(angle)*side*s,y,Math.sin(angle)*bend+Math.cos(angle)*side*s);
      uv.push((s+1)/2,t);
    }
    if(j<rows){const n=j*2;indices.push(n,n+1,n+2,n+1,n+3,n+2);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}

function growSeagrass(group,habitat,rocks){
  const rng=seeded(habitat.seed+16381),density=habitat.life??1;
  const meadow=new Batch(waterMaterial(3,{name:'seagrass'}));
  const patches=[[-4,27,3.5],[6,27,4],[-5,13,3],[6,1,4],[-11,-9,4],[15,32,5],[-19,37,6],[24,-18,6]];
  for(const [cx,cz,spread] of patches)for(let i=0;i<Math.round(65*density);i++){
    const angle=rng()*TAU,r=Math.sqrt(rng())*spread,x=cx+Math.cos(angle)*r,z=cz+Math.sin(angle)*r;
    if(Math.abs(x-Math.sin(z*.055)*5)<2.5)continue;
    const y=floorHeight(x,z,habitat);
    if(rocks.some(rock=>((x-rock.x)/(rock.rx+.2))**2+((y+.25-rock.y)/(rock.ry+.2))**2+((z-rock.z)/(rock.rz+.2))**2<1.12))continue;
    const shoot=.26+rng()*.45,leanAngle=rng()*TAU;
    for(let blade=0;blade<5+Math.floor(rng()*4);blade++){
      const h=shoot*(.60+rng()*.65),g=seagrassGeometry(h,.013+rng()*.018,h*(.20+rng()*.60),leanAngle+(rng()-.5)*1.6);
      g.translate(x+(rng()-.5)*.035,y-.014,z+(rng()-.5)*.035);
      meadow.add(g,new THREE.Color().setHSL(.19+rng()*.035,.25+rng()*.13,.20+rng()*.12),rng,(_x,py)=>Math.max(0,(py-y)/h)**2*.10);
    }
  }
  meadow.finish(group,'Seagrass meadows');
}

export function createHabitatGeometry(habitat) {
  const rng = seeded(habitat.seed), group = new THREE.Group(); group.name = habitat.name;
  const density = habitat.life ?? 1, relief = habitat.relief ?? 1;
  const rockColliders=[],rocks = new Batch(waterMaterial(1, { name: 'reef-limestone' }),rockColliders);
  const corals = new Batch(waterMaterial(2, { name: 'coral' }));
  const plants = new Batch(waterMaterial(3, { name: 'kelp' }));
  const brains = new Batch(waterMaterial(2, { name: 'brain-coral', pattern: 1 }));
  const luminous = new Batch(waterMaterial(2, { name: 'benthic-invertebrates' }));
  const chimneys = new Batch(waterMaterial(1, { name: 'mineral-chimneys', pattern: 2 }));
  if (!habitat.connected) addTerrain(group, habitat, rng);
  const isDeep = habitat.id === 'deep', isBlue = habitat.id === 'blue', isKelp = habitat.id === 'kelp';
  const palette = ['#b7996b','#cab79b','#ba8f76','#97889e','#8b9571','#ac897e'];
  const rockCount = isBlue ? 95 : 200;
  const baseRock = rockGeometry(4);
  for (let i = 0; i < rockCount; i++) {
    let x = (rng() - 0.5) * 170, z = (rng() - 0.5) * 160;
    if (Math.abs(x - Math.sin(z * 0.055) * 5) < 6 && z > -35 && z < 45) x += 13 * (x < 0 ? -1 : 1);
    let s = (0.6 + rng() ** 2 * 5.6) * (0.5 + relief * 0.5);
    if (i < 18) s *= 1.7;
    if(isDeep)s*=.48;
    const y = floorHeight(x, z, habitat) - s * 0.4;
    rocks.add(transform(baseRock.clone(),[x,y,z],[s*1.4,s*(isDeep?.48:.65),s],[rng(),rng()*TAU,rng()*.4]),isDeep?'#6f7069':'#9e9b87',rng);
  }
  baseRock.dispose();
  if (habitat.id === 'reef') {
    for(let i=0;i<12;i++){
      const x=(i%2?1:-1)*(16+rng()*8),z=-9-Math.floor(i/2)*11,s=6+rng()*5,high=2.5+rng()*3.8;
      const shelf=transform(rockGeometry(habitat.seed+i*97),[x,floorHeight(x,z,habitat)-high*.30,z],[s,high,s*.7],[0,rng()*TAU,.1]);
      rocks.add(shelf,'#949580',rng);
      for(let j=0;j<Math.round(9*density);j++){
        const a=rng()*TAU,r=Math.sqrt(rng())*.70,px=x+Math.cos(a)*r*s,pz=z+Math.sin(a)*r*s*.7;
        const py=highestSurfaceAt(shelf,px,pz,floorHeight(px,pz,habitat))-.012;
        const size=.6+rng()*1.3;
        if(j%5===0)brains.add(transform(rockGeometry(j+i),[px,py+size*.23,pz],[size,size*.5,size*.88]),'#b9b18a',rng);
        else branchCoral(corals,px,py,pz,size,palette[j%palette.length],rng,j%4===0);
      }
    }
    // Large shelf forms make the small coral legible as an ecosystem on a reef.
    for (const [x, z, s] of [[-22, 3, 8], [20, 7, 7], [-17, -29, 7], [28, -29, 9]]) {
      const y = floorHeight(x, z, habitat);
      rocks.add(transform(rockGeometry(x), [x, y - 1.4, z], [s, s * 0.42, s * 0.65]), '#829c89', rng);
    }
    for(const [cx,cz,s] of [[-10,8,4.7],[13,6,5.7],[-18,-12,4.0],[20,-10,5],[-7,19,2.6],[9,20,2.8]]) {
      const y=floorHeight(cx,cz,habitat)+0.15;
      const shelf=transform(rockGeometry(cx+cz),[cx,y,cz],[s,s*.44,s*.80]);rocks.add(shelf,'#9ca489',rng);
      for(let j=0;j<Math.round(18*density);j++) {
        const a=rng()*TAU,r=Math.sqrt(rng())*0.88;
        const x=cx+Math.cos(a)*r*s,z=cz+Math.sin(a)*r*s*0.8;
        const base=highestSurfaceAt(shelf,x,z,floorHeight(x,z,habitat))-.012;
        const color=palette[j%palette.length];
        if(j%4===0) {
          const size=.35+rng()*.80;
          brains.add(transform(rockGeometry(j),[x,base+size*.30,z],[size,size*.65,size*.88]),'#b9b18a',rng);
        }else if(j%4===1) {
          const size=.30+rng()*.85;
          corals.add(segment(new THREE.Vector3(x,base,z),new THREE.Vector3(x,base+.25,z),size*.10,size*.05,7),color,rng);
          for(let k=0;k<2;k++){const g=plateGeometry(size*(1-k*.21),rng()*5);g.rotateZ((rng()-.5)*.25);g.translate(x,base+.08+k*.15,z);corals.add(g,color,rng);}
        }else branchCoral(corals,x,base,z,1.1+rng()*1.8,color,rng,j%7===0);
      }
    }
  }
  if (isBlue) {
    for (const [x, z, h] of [[-34, -9, 38], [-55, -35, 31], [55, -65, 43]]) {
      const y = floorHeight(x, z, habitat);
      rocks.add(transform(rockGeometry(h), [x, y + h * 0.25, z], [9, h * 0.65, 8]), '#5e797d', rng);
    }
  }
  if (!isBlue && !isKelp && !isDeep) {
    const count = Math.floor((isDeep ? 88 : 200) * density);
    for (let i = 0; i < count; i++) {
      let x = (rng() - 0.5) * 112, z = (rng() - 0.5) * 114 - 5;
      if (Math.abs(x - Math.sin(z * 0.055) * 5) < 7 && z > -34) x += x < 0 ? -8 : 8;
      const y = floorHeight(x, z, habitat), size = .45 + rng() ** 1.4 * 1.8;
      const color = palette[Math.floor(rng() * palette.length)], style = rng();
      const batch = isDeep ? luminous : corals;
      if (style < 0.46) branchCoral(batch, x, y, z, size, color, rng, style < 0.12);
      else if (style < 0.70) {
        const layers = 2 + Math.floor(rng() * 3);
        for (let j = 0; j < layers; j++) {
          batch.add(segment(new THREE.Vector3(x,y,z),new THREE.Vector3(x+j*.2,y+.4+j*size*.3,z),size*.10,size*.045,7),color,rng);
          const g = plateGeometry(size * (1 - j * 0.15), rng() * 5);
          g.translate(x + j * 0.2, y + 0.4 + j * size * 0.3, z);
          batch.add(g, color, rng);
        }
      } else {
        const profile = [new THREE.Vector2(0.3, 0), new THREE.Vector2(0.48, 0.3), new THREE.Vector2(0.64, 1.3), new THREE.Vector2(0.60, 1.65), new THREE.Vector2(0.44, 1.7), new THREE.Vector2(0.39, 1.36), new THREE.Vector2(0.27, 0.28)];
        const g = new THREE.LatheGeometry(profile, 38);
        const gp=g.attributes.position;
        for(let n=0;n<gp.count;n++){
          const py=gp.getY(n),a=Math.atan2(gp.getZ(n),gp.getX(n));
          const r=1+Math.sin(a*6+py*2)*.08+Math.cos(a*11-py*4)*.035+Math.sin(a*2-py)*.13;
          gp.setX(n,gp.getX(n)*r+Math.sin(py*1.6)*py*.10);gp.setZ(n,gp.getZ(n)*r+Math.cos(py*1.2)*py*.06);
          gp.setY(n,py+Math.max(0,(py-.9)/.8)*(Math.sin(a*3+py)*.10+Math.cos(a*7)*.035));
        }
        g.computeVertexNormals();
        batch.add(transform(g,[x,y,z],[size*.8,size*.58,size*.8],[rng()*.14,rng(),rng()*.12]),color,rng);
      }
    }
  }
  if (isKelp) {
    for (let i = 0; i < Math.floor(76 * density); i++) {
      let x = (rng() - 0.5) * 120, z = (rng() - 0.5) * 130 - 12;
      if (Math.abs(x) < 5 && z > -20) x += x < 0 ? -10 : 10;
      const y = floorHeight(x, z, habitat);
      const fronds=2+Math.floor(rng()*3);
      for(let j=0;j<fronds;j++)addKelp(plants,x+(rng()-.5)*.35,y,z+(rng()-.5)*.35,Math.min(-y-1.7,(18+rng()*15)*(habitat.height??1)),rng);
      for(let j=0;j<8;j++){
        const a=j/8*TAU,root=new THREE.Vector3(x+Math.cos(a)*(.35+rng()*.3),y+.04,z+Math.sin(a)*(.35+rng()*.3));
        const curve=new THREE.CatmullRomCurve3([root,new THREE.Vector3(x+Math.cos(a)*.18,y+.24,z+Math.sin(a)*.18),new THREE.Vector3(x,y+.45,z)]);
        plants.add(new THREE.TubeGeometry(curve,6,.027,5,false),'#5b5034',rng);
      }
    }
  }
  if (!isDeep && !isBlue) {
    for (let i = 0; i < Math.floor((isKelp ? 240 : 160) * density); i++) {
      const x = (rng() - 0.5) * 110, z = (rng() - 0.5) * 115;
      if (Math.abs(x) < 5) continue;
      const y = floorHeight(x, z, habitat);
      addKelp(plants, x, y, z, 1.0 + rng() * 2.3, rng, true);
    }
  }
  const ventPositions = [];
  if (isDeep) {
    for (const [cx, cz, scale] of [[-8,14,.85],[11,-9,1.1],[-23,-38,.8],[19,21,.55],[1,-55,1.4]]) {
      const y = floorHeight(cx, cz, habitat);
      for (let j = 0; j < 4; j++) {
        const a = rng() * TAU, r = rng() * 3.7 * scale;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, height = (2.5 + rng() * 5.0) * scale;
        const bottom=floorHeight(x,z,habitat)-.1;
        const profile = Array.from({ length: 32 }, (_, n) => {
          const t=n/31;
          return new THREE.Vector2((.85*Math.pow(1-t,.7)+.13+Math.sin(t*27+j)*.095+Math.sin(t*53+j)*.036)*scale,t*height);
        });
        const g=new THREE.LatheGeometry(profile,36),gp=g.attributes.position;
        for(let k=0;k<gp.count;k++){const py=gp.getY(k),a=Math.atan2(gp.getZ(k),gp.getX(k)),f=1+Math.sin(a*7+py*3.2)*.12+Math.cos(a*13-py*7.2)*.07;gp.setX(k,gp.getX(k)*f+Math.sin(py*.8+j)*py*.025);gp.setZ(k,gp.getZ(k)*f);}
        g.computeVertexNormals();g.translate(x,bottom,z);chimneys.add(g,'#777260',rng);
        ventPositions.push([x,bottom+height,z]);
        for (let k = 0; k < Math.floor(20 * density); k++) {
          const angle = rng() * TAU, rad = (2 + rng() * 3) * scale;
          const px=x+Math.cos(angle)*rad,pz=z+Math.sin(angle)*rad,b=new THREE.Vector3(px,floorHeight(px,pz,habitat),pz);
          const top=b.clone().add(new THREE.Vector3((rng()-.5)*.18,.30+rng()*.80,(rng()-.5)*.18));
          corals.add(segment(b,top,.021,.015,8),'#b4afa0',rng);
          luminous.add(transform(new THREE.SphereGeometry(.041,12,9),top.toArray(),[1,1.9,1]),'#894a3b',rng);
        }
      }
      for(let k=0;k<Math.round(11*density);k++){
        const a=rng()*TAU,r=.8+rng()*4.4,px=cx+Math.cos(a)*r,pz=cz+Math.sin(a)*r,g=plateGeometry(.22+rng()*.75,rng()*9),p=g.attributes.position;
        for(let i=0;i<p.count;i++){const x=p.getX(i)+px,z=p.getZ(i)+pz;p.setXYZ(i,x,floorHeight(x,z,habitat)+.012,z);}
        g.computeVertexNormals();corals.add(g,'#b0b1a1',rng);
      }
    }
    for(let i=0;i<Math.round(17*density);i++){
      const x=(rng()-.5)*90,z=(rng()-.5)*92,y=floorHeight(x,z,habitat);
      if(i%3===0)branchCoral(corals,x,y,z,.65+rng()*.7,'#c0b8a5',rng,true);
    }
  }
  const rubbleCount=isBlue?240:isDeep?980:800;
  const rubbleGeometry=paintGeometry(rockGeometry(habitat.seed+27),isDeep?'#939184':'#aba48e');
  const rubble=new THREE.InstancedMesh(rubbleGeometry,rocks.material,rubbleCount);rubble.name='Shell grit and rock fragments';
  for(let i=0;i<rubbleCount;i++){
    const x=(rng()-.5)*125,z=(rng()-.5)*130,size=.025+Math.pow(rng(),2.8)*.29;
    dummy.position.set(x,floorHeight(x,z,habitat)+size*.08,z);dummy.scale.set(size*(.7+rng()),size*.35,size*(.6+rng()));dummy.rotation.set(rng(),rng()*TAU,rng());dummy.updateMatrix();rubble.setMatrixAt(i,dummy.matrix);
  }
  rubble.computeBoundingSphere();group.add(rubble);
  if(!isDeep&&!isBlue)growSeagrass(group,habitat,rockColliders);
  rocks.finish(group, 'Eroded limestone'); corals.finish(group, 'Coral colonies');
  brains.finish(group, 'Brain coral gardens');
  plants.finish(group,'Swaying forest');luminous.finish(group,'Tube-worm crowns');chimneys.finish(group,'Sulfide chimneys');
  return { group, ventPositions, rocks:rockColliders };
}

// Shared, fully procedural forms for the wider biomes. Each local stand chooses
// its own proportions, orientation and tint; the expensive anatomy is reused.
export function createBiomeForm(type,variant=0) {
  const rng=seeded(76031+variant*977+type.length*513),batch=new Batch(null);
  let kind=2,pattern=0;
  if(type==='rock'||type==='brain'){
    const g=rockGeometry(21+variant*79);paintGeometry(g,'#ffffff',rng);
    return {geometry:g,kind:type==='rock'?1:2,pattern:type==='brain'?1:0};
  }
  if(type==='coral'||type==='fan')growBranchCoral(batch,0,0,0,1,'#ffffff',rng,type==='fan',3);
  if(type==='plate'){
    for(let i=0;i<3;i++){
      const y=.18+i*.22;batch.add(segment(new THREE.Vector3(0,0,0),new THREE.Vector3(i*.10,y,0),.09,.04,7),'#ded7c4',rng);
      const g=plateGeometry(1-i*.16,rng()*6);g.translate(i*.10,y,0);batch.add(g,'#ffffff',rng);
    }
  }
  if(type==='kelp'){
    kind=3;
    for(let i=0;i<2;i++)addKelp(batch,(rng()-.5)*.25,0,(rng()-.5)*.25,24*(.86+rng()*.14),rng);
    for(let i=0;i<7;i++){
      const a=i/7*TAU;batch.add(segment(new THREE.Vector3(Math.cos(a)*.5,.02,Math.sin(a)*.5),new THREE.Vector3(0,.35,0),.03,.02,5),'#655438',rng);
    }
  }
  if(type==='algae'){kind=3;addKelp(batch,0,0,0,1.6,rng,true);}
  if(type==='grass'){
    kind=3;
    for(let shoot=0;shoot<7;shoot++){
      const a=rng()*TAU,r=rng()*.27,cx=Math.cos(a)*r,cz=Math.sin(a)*r;
      for(let j=0;j<5;j++){
        const height=.3+rng()*.32,g=seagrassGeometry(height,.018+rng()*.009,height*(.3+rng()*.5),a+(rng()-.5));g.translate(cx,0,cz);
        batch.add(g,new THREE.Color().setHSL(.20+rng()*.03,.28,.26+rng()*.07),rng,(_x,y)=>Math.max(0,y/height)**2*.11);
      }
    }
  }
  if(type==='chimney'){
    kind=1;pattern=2;
    const profile=Array.from({length:24},(_,i)=>{const t=i/23;return new THREE.Vector2(.12+(1-t)**.8*.8+Math.sin(t*29+variant)*.07,t*5);});
    const g=new THREE.LatheGeometry(profile,24),p=g.attributes.position;
    for(let i=0;i<p.count;i++){
      const y=p.getY(i),a=Math.atan2(p.getZ(i),p.getX(i)),k=1+Math.sin(a*7+y*3.2)*.13+Math.cos(a*11-y*5)*.06;
      p.setXYZ(i,p.getX(i)*k+Math.sin(y*.8+variant)*y*.03,y,p.getZ(i)*k);
    }
    g.computeVertexNormals();batch.add(g,'#b4aa8e',rng);
  }
  if(type==='worms'){
    for(let i=0;i<18;i++){
      const a=rng()*TAU,r=Math.sqrt(rng())*.55,b=new THREE.Vector3(Math.cos(a)*r,0,Math.sin(a)*r),t=b.clone().add(new THREE.Vector3((rng()-.5)*.16,.3+rng()*.7,(rng()-.5)*.16));
      batch.add(segment(b,t,.025,.016,6),'#bcb6a7',rng);
      const crown=new THREE.SphereGeometry(.045,8,6);crown.scale(1,1.8,1);crown.translate(t.x,t.y,t.z);batch.add(crown,'#854836',rng);
    }
  }
  batch.flush();
  const geometry=mergeParts(batch.chunks);geometry.computeBoundingSphere();geometry.computeBoundingBox();
  return {geometry,kind,pattern};
}
