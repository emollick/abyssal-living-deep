import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paintGeometry, segment } from './ReefGeometry.js';
import { waterMaterial } from './UnderwaterMaterial.js';
import { seeded, TAU, floorHeight } from './WorldMath.js';

const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, -1);
const dummy = new THREE.Object3D(), direction = new THREE.Vector3();

function merge(parts) {
  const pp = parts.map(g => g.index ? g.toNonIndexed() : g);
  const out = mergeGeometries(pp, false);
  new Set([...pp, ...parts]).forEach(g => g.dispose());
  return out;
}

function solid(g, c) { return paintGeometry(g, c); }
function ellipsoid(pos, scale, color, width = 18, height = 12) {
  const g = new THREE.SphereGeometry(1, width, height); g.scale(...scale); g.translate(...pos); return solid(g, color);
}
function fin(points, color) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  g.computeVertexNormals(); return solid(g, color);
}

function foil(points,color,thickness=.055) {
  const outline=points.map(p=>new THREE.Vector3(...p)),curve=new THREE.CatmullRomCurve3(outline,true,'centripetal');
  const center=outline.reduce((v,p)=>v.add(p),new THREE.Vector3()).multiplyScalar(1/outline.length);
  const normal=new THREE.Vector3().crossVectors(outline[1].clone().sub(outline[0]),outline.at(-1).clone().sub(outline[0])).normalize();
  const p=[],uv=[],idx=[],rows=8,sides=64,stride=(rows+1)*(sides+1);
  for(let layer=0;layer<2;layer++)for(let j=0;j<=rows;j++)for(let i=0;i<=sides;i++){
    const t=j/rows,v=center.clone().lerp(curve.getPoint(i/sides),t).addScaledVector(normal,(layer?1:-1)*thickness*Math.sqrt(1-t*t));
    p.push(v.x,v.y,v.z);uv.push(i/sides,t);
    if(j<rows&&i<sides){const n=layer*stride+j*(sides+1)+i;if(layer)idx.push(n,n+1,n+sides+1,n+1,n+sides+2,n+sides+1);else idx.push(n,n+sides+1,n+1,n+1,n+sides+1,n+sides+2);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return solid(g,color);
}

function appendage(start,mid,end,width,thickness,color) {
  const path=new THREE.CatmullRomCurve3([new THREE.Vector3(...start),new THREE.Vector3(...mid),new THREE.Vector3(...end)]);
  const p=[],uv=[],idx=[],rows=22,sides=12;
  for(let j=0;j<=rows;j++) {
    const t=j/rows,c=path.getPoint(t);
    const w=Math.pow(Math.sin(Math.PI*t),0.65)*width+0.015;
    for(let i=0;i<=sides;i++) {
      const a=i/sides*TAU;
      p.push(c.x+Math.cos(a)*w,c.y+Math.sin(a)*w*thickness,c.z);
      uv.push(t,i/sides);
      if(j<rows&&i<sides){const n=j*(sides+1)+i;idx.push(n,n+1,n+sides+1,n+1,n+sides+2,n+sides+1);}
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return solid(g,color);
}

function fishGeometry() {
  const body = new THREE.SphereGeometry(1, 18, 10);
  const pos = body.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    pos.setXYZ(i, x * 0.69, y * 0.25 * (0.85 + x * 0.15), z * 0.14);
  }
  body.computeVertexNormals(); solid(body, '#eaf0da');
  const c = body.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    const dark = pos.getY(i) > 0 ? 0.69 : 1.0;
    c.setXYZ(i, c.getX(i) * dark, c.getY(i) * dark, c.getZ(i) * dark);
  }
  const parts = [body,
    fin([[-0.57,0,0],[-1.06,0.32,0],[-0.93,0,0],[-0.57,0,0],[-0.93,0,0],[-1.06,-0.32,0]], '#b2c6ac'),
    fin([[-0.35,0.18,0],[-0.43,0.43,0],[0.35,0.2,0]], '#bacaae'),
    fin([[0.17,-0.05,0.12],[-0.09,-0.18,0.39],[-0.2,-0.06,0.08]], '#d6dabd'),
    fin([[0.17,-0.05,-0.12],[-0.2,-0.06,-0.08],[-0.09,-0.18,-0.39]], '#d6dabd'),
  ];
  for (const z of [-0.118,0.118]) {
    parts.push(ellipsoid([0.43,0.062,z],[0.062,0.062,0.018],'#e6dba1',9,6));
    parts.push(ellipsoid([0.445,0.062,z*1.15],[0.034,0.04,0.012],'#070e15',8,6));
  }
  return merge(parts);
}

function mantaGeometry() {
  const p = [], uv = [], idx = [], colors = [], nx = 52, nz = 14;
  const top = new THREE.Color('#254c5b');
  for (let i = 0; i <= nx; i++) {
    const u = i/nx*2-1, x = u*5.4, a = Math.abs(u);
    const width = (1-a**1.15)*1.5+0.055;
    const sweep = a**1.6*1.9;
    for (let j = 0; j <= nz; j++) {
      const v = j/nz*2-1;
      p.push(x, (1-a)*0.18 - v*v*0.1, sweep + v*width);
      uv.push(i/nx,j/nz); colors.push(top.r,top.g,top.b);
      if (i < nx && j < nz) { const n = i*(nz+1)+j; idx.push(n,n+1,n+nz+1,n+1,n+nz+2,n+nz+1); }
    }
  }
  const wing = new THREE.BufferGeometry(); wing.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  wing.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); wing.setIndex(idx); wing.computeVertexNormals(); solid(wing,'#323b3c');
  const parts = [wing,ellipsoid([0,0.03,0],[0.82,0.3,1.8],'#39423f'),ellipsoid([0,-0.16,-0.1],[0.68,0.13,1.3],'#c9c8b9')];
  parts.push(solid(segment(new THREE.Vector3(0,0,1.3),new THREE.Vector3(0,-0.25,7.5),0.10,0.008,7),'#294e59'));
  for (const x of [-0.65,0.65]) {
    parts.push(ellipsoid([x,0.1,-1.0],[0.11,0.08,0.13],'#101f2b',9,6));
    parts.push(ellipsoid([x*0.75,-0.05,-1.63],[0.15,0.14,0.38],'#476d74',10,6));
  }
  return merge(parts);
}

function turtleGeometry() {
  const shell = ellipsoid([0,0.1,0],[1.4,0.65,1.0],'#7a8a64',32,18);
  const p = shell.attributes.position, c = shell.attributes.color;
  for (let i=0;i<p.count;i++) {
    const line = Math.abs(Math.sin(p.getX(i)*4.2 + Math.cos(p.getZ(i)*5.0))) < 0.13 ? 0.5 : 1;
    c.setXYZ(i,c.getX(i)*line,c.getY(i)*line,c.getZ(i)*line);
  }
  const parts=[shell,ellipsoid([0,-0.22,0],[1.27,0.24,0.9],'#d1c69b'),ellipsoid([1.6,0,0],[0.62,0.3,0.37],'#9ca885')];
  for (const side of [-1,1]) {
    parts.push(foil([[.9,-.1,side*.65],[.65,-.30,side*1.65],[.03,-.51,side*2.42],[-.28,-.48,side*2.30],[-.59,-.24,side*1.62],[-.2,-.1,side*.75]],'#899375'));
    parts.push(foil([[-.7,-.2,side*.5],[-1.20,-.29,side*1.17],[-1.63,-.28,side*1.38],[-1.53,-.20,side*.63],[-1.25,-.16,side*.45]],'#7e8b6d',.045));
    parts.push(ellipsoid([1.91,0.1,side*0.23],[0.057,0.062,0.04],'#111c1b',8,6));
  }
  return merge(parts);
}

function whaleGeometry() {
  const profile = [0.06,0.26,0.4,0.62,1.06,1.6,2.16,2.6,2.72,2.65,2.5,2.30,2.14,1.92,1.57,0.04];
  const p=[],uv=[],idx=[],col=[],nx=96,nr=36;
  const slate = new THREE.Color('#303a3e'), belly = new THREE.Color('#adb5af');
  for(let i=0;i<=nx;i++) {
    const u=i/nx, x=-12+u*20, f=u*(profile.length-1), k=Math.floor(f);
    let r=THREE.MathUtils.lerp(profile[k],profile[Math.min(k+1,profile.length-1)],f-k);
    if(u>0.90)r=1.9*Math.sqrt(Math.max(0,1-((u-0.9)/0.1)**2));
    for(let j=0;j<=nr;j++) {
      const a=j/nr*TAU, yy=Math.cos(a), zz=Math.sin(a);
      p.push(x,yy*r*0.76,zz*r);
      uv.push(u,j/nr);
      const under=THREE.MathUtils.smoothstep(-yy,0.1,0.8)*THREE.MathUtils.smoothstep(x,-7,1);
      const patch=.75+.25*Math.sin(x*1.2+zz*7)*Math.sin(a*9+x*.4);
      const c=slate.clone().lerp(belly,under*patch);
      c.multiplyScalar(.89+Math.sin(x*4.1+a*12)*Math.cos(x*1.4-a*21)*.07);
      if (yy<0 && x>-5) c.multiplyScalar(0.86+Math.sin(a*38.0)*0.12);
      col.push(c.r,c.g,c.b);
      if(i<nx && j<nr) { const n=i*(nr+1)+j; idx.push(n,n+nr+1,n+1,n+1,n+nr+1,n+nr+2); }
    }
  }
  const body=new THREE.BufferGeometry();body.setAttribute('position',new THREE.Float32BufferAttribute(p,3));body.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));body.setIndex(idx);body.computeVertexNormals();
  body.setAttribute('color',new THREE.Float32BufferAttribute(col,3));body.setAttribute('aFlex',new THREE.Float32BufferAttribute(new Float32Array(p.length/3),1));
  const parts=[body];
  for(const side of [-1,1]) {
    parts.push(foil([[-10.55,0,0],[-10.9,.06,side*1.6],[-11.7,.17,side*3.4],[-12.5,.16,side*2.95],[-12.85,.10,side*1.8],[-12.1,0,0]],'#3b4446',.075));
    const flipper=appendage([3,-.6,side*1.9],[1.1,-2.6,side*4.1],[-1,-4.6,side*6.3],.72,.17,'#a3ada7');
    const fc=flipper.attributes.color,fn=flipper.attributes.normal;
    for(let j=0;j<fc.count;j++){const shade=fn.getY(j)>.2?.57:1;fc.setXYZ(j,fc.getX(j)*shade,fc.getY(j)*shade,fc.getZ(j)*shade);}
    parts.push(flipper);
    parts.push(ellipsoid([5.8,-0.25,side*1.88],[0.13,0.11,0.08],'#041720',10,7));
    for(let j=0;j<7;j++) {
      const x=4.5+j*0.43,u=(x+12)/20,f=u*(profile.length-1),k=Math.floor(f);
      let r=THREE.MathUtils.lerp(profile[k],profile[Math.min(k+1,profile.length-1)],f-k);
      if(u>0.9)r=1.9*Math.sqrt(Math.max(0,1-((u-0.9)/0.1)**2));
      parts.push(ellipsoid([x,r*0.66+0.05,side*r*0.5],[0.11,0.11,0.15],'#58615d',12,8));
    }
  }
  const jaw=new THREE.CatmullRomCurve3([[3.5,-0.83,2.1],[6,-0.64,1.8],[7.65,-0.5,0.6],[7.97,-0.43,0],[7.65,-0.5,-0.6],[6,-0.64,-1.8],[3.5,-0.83,-2.1]].map(v=>new THREE.Vector3(...v)));
  parts.push(solid(new THREE.TubeGeometry(jaw,56,0.048,5,false),'#244753'));
  parts.push(foil([[-5.8,.95,0],[-5.4,1.50,0],[-5.4,2.10,0],[-4.6,1.88,0],[-3.7,1.33,0],[-2.5,1.23,0]],'#354044',.075));
  return merge(parts);
}

export function jellyGeometry(rng,detail=1) {
  const parts=[];
  const bell=new THREE.SphereGeometry(1,Math.round(32*detail),Math.round(20*detail),0,TAU,0,Math.PI*0.59);
  bell.scale(1.15,0.8,1.15); solid(bell,'#8ae9e3'); parts.push(bell);
  for(let j=0;j<18;j++) {
    const a=j/18*TAU, len=2.4+rng()*3.7;
    const pts=Array.from({length:22},(_,k)=>{const t=k/21;return new THREE.Vector3(Math.cos(a)*(0.99-t*0.45)+Math.sin(t*10+a)*t*0.27,-0.23-t*len,Math.sin(a)*(0.99-t*0.45)+Math.cos(t*9+a)*t*0.22);});
    const g=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),Math.round(32*detail),j%3===0?0.027:0.012,4,false);
    paintGeometry(g,j%3===0?'#cbb8e8':'#78dacf',rng,(x,y)=>Math.max(0,-y)*0.2); parts.push(g);
  }
  for(let j=0;j<4;j++) {
    const a=j/4*TAU;
    const pts=Array.from({length:18},(_,k)=>{const t=k/17;return new THREE.Vector3(Math.cos(a+t*10)*0.22*(1+t),0.2-t*2.5,Math.sin(a+t*10)*0.22*(1+t));});
    const g=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),24,0.075,5,false); paintGeometry(g,'#d2bceb');parts.push(g);
  }
  return merge(parts);
}

export class MarineLife {
  constructor(habitat) {
    this.habitat=habitat; this.group=new THREE.Group();this.group.name='Marine life';
    this.rng=seeded(habitat.seed+407);this.animals=[];
    const rng=this.rng, multiplier=habitat.shoal??1;
    const deep=habitat.id==='deep',blue=habitat.id==='blue',kelp=habitat.id==='kelp';
    this.fishCount=Math.round((deep?0:blue?1050:kelp?520:610)*multiplier);
    this.fish=new THREE.InstancedMesh(fishGeometry(),waterMaterial(4,{name:'schooling-fish',motion:1,glow:deep?0.12:0}),Math.max(1,this.fishCount));
    this.fish.count=this.fishCount;this.fish.frustumCulled=false;this.fish.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.fish);this.fishData=[];
    for(let i=0;i<this.fishCount;i++) {
      const school=i%5;
      this.fishData.push({school,phase:rng()*0.7,ox:(rng()+rng()+rng()-1.5)*7,oy:(rng()+rng()-1)*3.1,oz:(rng()+rng()-1)*5,scale:(0.10+rng()*0.14)*(blue?1.15:1),speed:0.025+rng()*0.012});
      const color=new THREE.Color();
      if(deep)color.set('#75cddd');
      else if(blue||kelp)color.setHSL(0.51+rng()*0.04,0.10+rng()*0.16,0.68+rng()*0.22);
      else if(school<2)color.setHSL(0.065+rng()*0.045,0.8,0.57+rng()*0.15);
      else if(school===2)color.setHSL(0.44+rng()*0.10,0.45,0.63);
      else color.setHSL(0.105+rng()*0.025,0.48,0.70);
      this.fish.setColorAt(i,color);
    }
    if(multiplier>0) {
      if(!deep&&!kelp)for(let i=0;i<2;i++)this.addAnimal('manta',mantaGeometry(),waterMaterial(4,{motion:2}),i);
      if(kelp)for(let i=0;i<3;i++)this.addAnimal('turtle',turtleGeometry(),waterMaterial(4,{motion:1}),i);
      if(blue)this.addAnimal('whale',whaleGeometry(),waterMaterial(4,{motion:4}),0);
      if(deep||blue)for(let i=0;i<Math.round((deep?5:2)*Math.min(1.5,multiplier)*(habitat.jellies??.65));i++) {
        const mat=waterMaterial(5,{motion:3,glow:deep?1.1:0.6,opacity:0.8,transparent:true,depthWrite:false});
        this.addAnimal('jelly',jellyGeometry(rng),mat,i);
      }
    }
    this.update(0,new THREE.Vector3(0,0,100));
  }

  addAnimal(type,geometry,material,index) {
    const mesh=new THREE.Mesh(geometry,material);mesh.name=type;this.group.add(mesh);
    const rng=this.rng;
    this.animals.push({mesh,type,index,phase:rng()*TAU,x:(rng()-0.5)*75,z:(rng()-0.5)*80-8,y:0.2+rng()*0.8,scale:type==='jelly'?.12+rng()*.20:1});
  }

  update(time,cameraPosition) {
    const h=this.habitat, deep=h.id==='deep',blue=h.id==='blue',kelp=h.id==='kelp';
    for(let i=0;i<this.fishCount;i++) {
      const f=this.fishData[i],g=f.school;
      const a=time*(0.07+g*0.008)+g*1.256+f.phase;
      const radius=12+g*3.3;
      let x=Math.sin(a)*radius+f.ox;
      let z=Math.cos(a)*radius+f.oz-8-g*4;
      const y=Math.max(floorHeight(x,z,h)+.5,(deep?-h.depth+11:blue?-42:kelp?-24:-24)-g*(blue?1.4:.45)+f.oy+Math.sin(time*.7+f.phase*6+f.ox)*.14);
      const dx=x-cameraPosition.x,dz=z-cameraPosition.z,dy=y-cameraPosition.y;
      const dist=Math.hypot(dx,dy,dz);
      if(dist<5&&dist>0.01){x+=dx/dist*(5-dist)*0.7;z+=dz/dist*(5-dist)*0.7;}
      dummy.position.set(x,y,z);
      direction.set(Math.cos(a),Math.cos(time*0.7+f.phase*6+f.ox)*0.025,-Math.sin(a)).normalize();
      dummy.rotation.set(0,-Math.atan2(direction.z,direction.x),Math.asin(direction.y));dummy.scale.setScalar(f.scale);dummy.updateMatrix();
      this.fish.setMatrixAt(i,dummy.matrix);
    }
    this.fish.instanceMatrix.needsUpdate=true;
    for(const a of this.animals) {
      const {mesh,type,index}=a;
      if(type==='manta') {
        const t=time*0.032+index*2.7;
        mesh.position.set(Math.sin(t)*24+7,blue?-33:-8-index*3,Math.cos(t)*17-13);
        direction.set(Math.cos(t)*24,Math.cos(t*2)*0.25,-Math.sin(t)*17).normalize();
        mesh.rotation.set(0,Math.atan2(-direction.x,-direction.z),0);mesh.scale.setScalar(index===0?0.58:0.40);
      } else if(type==='turtle') {
        const t=time*0.04+index*2.3;
        mesh.position.set(Math.sin(t)*16, -15-index*3+Math.sin(t*2)*1.4,Math.cos(t)*19-4);
        direction.set(Math.cos(t),Math.cos(t*2)*0.05,-Math.sin(t)).normalize();mesh.rotation.set(0,-Math.atan2(direction.z,direction.x),Math.asin(direction.y));
        mesh.scale.setScalar(0.35+index*0.055);
      } else if(type==='whale') {
        const t=time*0.022;
        mesh.position.set(Math.sin(t)*25,-35+Math.sin(t*1.3)*2.5,-11+Math.cos(t)*4);
        direction.set(Math.cos(t)*31,Math.cos(t*1.3)*2.5,-Math.sin(t)*4).normalize();
        mesh.rotation.set(0.24+Math.sin(time*0.19)*0.10,-Math.atan2(direction.z,direction.x),Math.asin(direction.y));
        mesh.scale.setScalar(.74);
      } else if(type==='jelly') {
        mesh.position.set(a.x+Math.sin(time*0.07+a.phase)*2.5, -h.depth+5+a.y*23+Math.sin(time*0.23+a.phase)*1.3,a.z);
        mesh.scale.setScalar(a.scale);mesh.rotation.y=a.phase+time*0.018;
      }
    }
  }
}
