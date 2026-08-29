import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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

export class Batch {
  constructor(material) { this.material = material; this.parts = []; }
  add(g, color, rng, flex = null) {
    paintGeometry(g, color, rng, flex);
    // Preserve shared vertices: dense coral used three times the GPU memory
    // when every branch was expanded into independent triangles.
    if(!g.index)g.setIndex(Array.from({length:g.attributes.position.count},(_,i)=>i));
    this.parts.push(g);
  }
  finish(group, name) {
    if (!this.parts.length) return null;
    const geometry = mergeGeometries(this.parts, false);
    this.parts.forEach(g => g.dispose()); this.parts = [];
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, this.material); mesh.name = name;
    group.add(mesh); return mesh;
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

function rockGeometry(seed = 1) {
  const g = new THREE.SphereGeometry(1, 22, 14);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const f = 1 + Math.sin(x * 5.9 + seed) * Math.sin(y * 4.1 + 3.0) * Math.cos(z * 5.2) * 0.13
      + Math.sin(x * 12.3 + z * 8.1 + seed) * Math.sin(y * 10.7) * 0.035;
    p.setXYZ(i, x * f, y * f, z * f);
  }
  g.computeVertexNormals(); return g;
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

function addArch(batch, habitat, rng, cx = 5, cz = -20, radius = 14, height = 17, thickness = 2.3) {
  const y = floorHeight(cx, cz, habitat) - 0.7;
  const points = Array.from({ length: 21 }, (_, i) => {
    const t = i / 20 * Math.PI;
    return new THREE.Vector3(cx + Math.cos(t) * radius, y + Math.sin(t) * height, cz + Math.sin(t * 2.0) * 1.4);
  });
  const path = new THREE.CatmullRomCurve3(points);
  const g = new THREE.TubeGeometry(path, 90, thickness, 16, false);
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const noise = Math.sin(p.getX(i) * 0.59 + p.getY(i) * 0.81) * 0.48 + Math.sin(p.getY(i) * 2.1 + p.getZ(i) * 2.3) * 0.14;
    p.setXYZ(i, p.getX(i) + n.getX(i) * noise, p.getY(i) + n.getY(i) * noise, p.getZ(i) + n.getZ(i) * noise);
  }
  g.computeVertexNormals(); batch.add(g, '#819783', rng);
}

function branchCoral(batch, x, y, z, size, color, rng, fan = false) {
  const origin = new THREE.Vector3(x, y, z);
  const angle = rng() * TAU;
  const recurse = (start, dir, length, radius, level) => {
    const end = start.clone().addScaledVector(dir, length);
    batch.add(segment(start, end, radius, radius * 0.54, 6), color, rng);
    if (level <= 0) {
      const tip = end.clone().addScaledVector(dir, length * 0.12);
      batch.add(segment(end, tip, radius * 0.58, radius * 0.24, 5), '#eee5c2', rng);
      return;
    }
    const forks = level > 2 ? 3 : 2;
    for (let j = 0; j < forks; j++) {
      let nd;
      if (fan) {
        const a = (rng() - 0.5) * 1.8;
        nd = new THREE.Vector3(Math.sin(angle) * a, 0.5 + rng() * 0.6, Math.cos(angle) * a);
      } else nd = new THREE.Vector3((rng() - 0.5) * 1.5, 0.5 + rng() * 0.7, (rng() - 0.5) * 1.5);
      nd.addScaledVector(dir, 0.5).normalize();
      recurse(end, nd, length * (0.63 + rng() * 0.1), radius * 0.58, level - 1);
    }
  };
  const crown=origin.clone().add(new THREE.Vector3(0,size*0.12,0));
  batch.add(segment(origin,crown,size*0.07,size*0.05,7),color,rng);
  const trunks=fan?3:size>1.8?4:3;
  for(let j=0;j<trunks;j++) {
    const a=angle+j/trunks*TAU;
    const dir=fan?new THREE.Vector3(Math.sin(angle)*(j-1)*0.8,1,Math.cos(angle)*(j-1)*0.8):new THREE.Vector3(Math.cos(a)*0.55,0.7+rng()*0.35,Math.sin(a)*0.55);
    recurse(crown,dir.normalize(),size*(fan?0.32:0.33),size*0.027,fan?5:size>2.4?4:3);
  }
}

function plateGeometry(radius, wobble = 0) {
  const p = [], uv = [], idx = []; const rings = 6, sides = 38;
  for (let j = 0; j <= rings; j++) for (let i = 0; i <= sides; i++) {
    const a = i / sides * TAU, r = j / rings;
    const rr = radius * r * (1.0 + Math.sin(a * 7 + wobble) * r * 0.09);
    p.push(Math.cos(a) * rr, r * r * radius * 0.11 + Math.sin(a * 5 + wobble) * radius * r * 0.06, Math.sin(a) * rr);
    uv.push(r, a / TAU);
    if (j < rings && i < sides) { const n = j * (sides + 1) + i; idx.push(n, n + sides + 1, n + 1, n + 1, n + sides + 1, n + sides + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

function leafGeometry(start, end, width, twist, bend = 0.25) {
  const p = [], uv = [], idx = [], dir = new THREE.Vector3().subVectors(end, start);
  const side = new THREE.Vector3(Math.cos(twist), 0.1, Math.sin(twist));
  const rows = 9, cols = 4;
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
  const at = t => new THREE.Vector3(x + Math.sin(t * 5 + phase) * t * 1.2, y + t * height, z + Math.cos(t * 4 + phase) * t * 1.3);
  const path = new THREE.CatmullRomCurve3(Array.from({ length: 20 }, (_, i) => at(i / 19)));
  const flex = (px, py) => Math.pow(Math.max(0, py - y) / height, 1.4) * (small ? 0.6 : 2.3);
  batch.add(new THREE.TubeGeometry(path, 28, small ? 0.025 : 0.075, 5, false), '#67672b', rng, flex);
  const count = small ? 9 : Math.floor(height * 2.3);
  for (let j = 1; j < count; j++) {
    const t = j / count, a = j * 2.39996 + phase;
    const start = at(t), length = (small ? 0.45 : 1.1) + rng() * (small ? 0.7 : 2.0);
    const end = start.clone().add(new THREE.Vector3(Math.cos(a) * length, -length * 0.7 + rng() * 0.55, Math.sin(a) * length));
    const color = new THREE.Color().setHSL(0.15 + rng() * 0.035, 0.5 + rng() * 0.22, 0.22 + rng() * 0.12);
    batch.add(leafGeometry(start, end, length * 0.095, a + Math.PI / 2, length * 0.38), color, rng, flex);
  }
}

export function createHabitatGeometry(habitat) {
  const rng = seeded(habitat.seed), group = new THREE.Group(); group.name = habitat.name;
  const density = habitat.life ?? 1, relief = habitat.relief ?? 1;
  const rocks = new Batch(waterMaterial(1, { name: 'reef-limestone' }));
  const corals = new Batch(waterMaterial(2, { name: 'coral', glow: 0.022 }));
  const plants = new Batch(waterMaterial(3, { name: 'kelp' }));
  const brains = new Batch(waterMaterial(2, { name: 'brain-coral', pattern: 1 }));
  const luminous = new Batch(waterMaterial(2, { name: 'living-lights', glow: habitat.id === 'deep' ? 0.75 : 0.13 }));
  addTerrain(group, habitat, rng);
  const isDeep = habitat.id === 'deep', isBlue = habitat.id === 'blue', isKelp = habitat.id === 'kelp';
  const palette = isDeep ? ['#83cbb8', '#57d9d2', '#b49fe3', '#dbb994'] : ['#e4a382', '#d7859a', '#bd8ec1', '#d6c17b', '#d09b58', '#aeccba'];
  const rockCount = isBlue ? 95 : 200;
  const baseRock = rockGeometry(4);
  for (let i = 0; i < rockCount; i++) {
    let x = (rng() - 0.5) * 170, z = (rng() - 0.5) * 160;
    if (Math.abs(x - Math.sin(z * 0.055) * 5) < 6 && z > -35 && z < 45) x += 13 * (x < 0 ? -1 : 1);
    let s = (0.6 + rng() ** 2 * 5.6) * (0.5 + relief * 0.5);
    if (i < 18) s *= 1.7;
    const y = floorHeight(x, z, habitat) - s * 0.4;
    rocks.add(transform(baseRock.clone(), [x, y, z], [s * 1.4, s * (isDeep ? 1.0 : 0.8), s], [rng(), rng() * TAU, rng() * 0.4]), isDeep ? '#354650' : '#95a18a', rng);
  }
  baseRock.dispose();
  if (habitat.id === 'reef') {
    addArch(rocks, habitat, rng, 5, -20, 13 + rng() * 3, 15 + relief * 2, 1.8 + relief * 0.5);
    addArch(rocks, habitat, rng, -32, -56, 10, 20, 3.6);
    // Large shelf forms make the small coral legible as an ecosystem on a reef.
    for (const [x, z, s] of [[-22, 3, 8], [20, 7, 7], [-17, -29, 7], [28, -29, 9]]) {
      const y = floorHeight(x, z, habitat);
      rocks.add(transform(rockGeometry(x), [x, y - 1.4, z], [s, s * 0.42, s * 0.65]), '#829c89', rng);
    }
    for(const [cx,cz,s] of [[-10,8,4.7],[13,6,5.7],[-18,-12,4.0],[20,-10,5],[-7,19,2.6],[9,20,2.8]]) {
      const y=floorHeight(cx,cz,habitat)+0.15;
      rocks.add(transform(rockGeometry(cx+cz),[cx,y,cz],[s,s*0.44,s*0.80]),'#9ca489',rng);
      for(let j=0;j<Math.round(18*density);j++) {
        const a=rng()*TAU,r=Math.sqrt(rng())*0.88;
        const x=cx+Math.cos(a)*r*s,z=cz+Math.sin(a)*r*s*0.8;
        const base=y+s*0.44*Math.sqrt(1-r*r)-0.12;
        const color=['#ee876f','#e4aacf','#e8c078','#c999dd','#e9b18e','#da7769'][j%6];
        if(j%4===0) {
          const size=0.6+rng()*1.1;
          brains.add(transform(rockGeometry(j),[x,base+size*0.4,z],[size,size*0.7,size]),'#c6c28c',rng);
        }else if(j%4===1) {
          const size=0.7+rng()*1.5;
          for(let k=0;k<3;k++){const g=plateGeometry(size*(1-k*0.16),rng()*5);g.translate(x,base+0.2+k*0.45,z);corals.add(g,color,rng);}
        }else branchCoral(corals,x,base,z,2.7+rng()*3.1,color,rng,j%7===0);
      }
    }
    // Encrusting colonies soften the mathematical arch into a living formation.
    for(let j=0;j<Math.round(30*density);j++) {
      const a=0.15+rng()*(Math.PI-0.3),x=5+Math.cos(a)*15;
      const y=floorHeight(5,-20,habitat)-0.7+Math.sin(a)*19.0;
      const z=-20+Math.sin(a*2)*1.4+(rng()-0.5)*2;
      branchCoral(corals,x,y,z,0.7+rng()*1.9,palette[j%palette.length],rng);
    }
  }
  if (isBlue) {
    for (const [x, z, h] of [[-34, -9, 38], [-55, -35, 31], [55, -65, 43]]) {
      const y = floorHeight(x, z, habitat);
      rocks.add(transform(rockGeometry(h), [x, y + h * 0.25, z], [9, h * 0.65, 8]), '#5e797d', rng);
    }
  }
  if (!isBlue && !isKelp) {
    const count = Math.floor((isDeep ? 88 : 200) * density);
    for (let i = 0; i < count; i++) {
      let x = (rng() - 0.5) * 112, z = (rng() - 0.5) * 114 - 5;
      if (Math.abs(x - Math.sin(z * 0.055) * 5) < 7 && z > -34) x += x < 0 ? -8 : 8;
      const y = floorHeight(x, z, habitat), size = 0.9 + rng() ** 1.4 * 3.3;
      const color = palette[Math.floor(rng() * palette.length)], style = rng();
      const batch = isDeep ? luminous : corals;
      if (style < 0.46) branchCoral(batch, x, y, z, size, color, rng, style < 0.12);
      else if (style < 0.70) {
        const layers = 2 + Math.floor(rng() * 3);
        for (let j = 0; j < layers; j++) {
          const g = plateGeometry(size * (1 - j * 0.15), rng() * 5);
          g.translate(x + j * 0.2, y + 0.4 + j * size * 0.3, z);
          batch.add(g, color, rng);
        }
      } else {
        const profile = [new THREE.Vector2(0.3, 0), new THREE.Vector2(0.48, 0.3), new THREE.Vector2(0.64, 1.3), new THREE.Vector2(0.60, 1.65), new THREE.Vector2(0.44, 1.7), new THREE.Vector2(0.39, 1.36), new THREE.Vector2(0.27, 0.28)];
        const g = new THREE.LatheGeometry(profile, 17);
        batch.add(transform(g, [x, y, z], [size * 0.6, size, size * 0.6], [rng() * 0.18, rng(), rng() * 0.16]), color, rng);
      }
    }
  }
  if (isKelp) {
    for (let i = 0; i < Math.floor(92 * density); i++) {
      let x = (rng() - 0.5) * 120, z = (rng() - 0.5) * 130 - 12;
      if (Math.abs(x) < 5 && z > -20) x += x < 0 ? -10 : 10;
      const y = floorHeight(x, z, habitat);
      addKelp(plants, x, y, z, Math.min(-y - 2.5, (19 + rng() * 15) * (habitat.height ?? 1)), rng);
    }
  }
  if (!isDeep && !isBlue) {
    for (let i = 0; i < Math.floor((isKelp ? 95 : 135) * density); i++) {
      const x = (rng() - 0.5) * 110, z = (rng() - 0.5) * 115;
      if (Math.abs(x) < 5) continue;
      const y = floorHeight(x, z, habitat);
      addKelp(plants, x, y, z, 1.0 + rng() * 2.3, rng, true);
    }
  }
  const ventPositions = [];
  if (isDeep) {
    for (const [cx, cz, scale] of [[-11, -11, 1.1], [16, -30, 1.5], [-30, -47, 1.8], [29, 6, 0.7], [1, -60, 1.1]]) {
      const y = floorHeight(cx, cz, habitat);
      for (let j = 0; j < 5; j++) {
        const a = rng() * TAU, r = rng() * 3.7 * scale;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, height = (5 + rng() * 8) * scale;
        const profile = Array.from({ length: 16 }, (_, n) => {
          const t = n / 15;
          return new THREE.Vector2((1.6 - t * 1.0 + Math.sin(t * 18 + j) * 0.17) * scale, t * height);
        });
        const g = new THREE.LatheGeometry(profile, 15); g.translate(x, y, z); rocks.add(g, '#394b54', rng);
        ventPositions.push([x, y + height, z]);
        for (let k = 0; k < Math.floor(11 * density); k++) {
          const angle = rng() * TAU, rad = (2 + rng() * 3) * scale;
          const b = new THREE.Vector3(x + Math.cos(angle) * rad, y, z + Math.sin(angle) * rad);
          const top = b.clone().add(new THREE.Vector3(rng() * 0.25, 0.7 + rng() * 1.3, rng() * 0.25));
          corals.add(segment(b, top, 0.085, 0.04, 5), '#a0ada1', rng);
          luminous.add(transform(new THREE.SphereGeometry(0.16, 7, 5), top.toArray(), [0.8, 1.6, 0.8]), '#eabda1', rng);
        }
      }
    }
  }
  rocks.finish(group, 'Eroded limestone'); corals.finish(group, 'Coral colonies');
  brains.finish(group, 'Brain coral gardens');
  plants.finish(group, 'Swaying forest'); luminous.finish(group, 'Bioluminescent colonies');
  return { group, ventPositions };
}
