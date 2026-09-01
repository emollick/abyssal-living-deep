import * as THREE from 'three';
import { oceanFloor, transectPose } from './OceanDomain.js';
import { seeded, TAU } from './WorldMath.js';
import { Batch, rockGeometry, paintGeometry, segment } from './ReefGeometry.js';
import { jellyGeometry } from './MarineLife.js';
import { waterMaterial } from './UnderwaterMaterial.js';
import { BIOME_CELL } from './BiomeLayout.js';

export function floorTile(x,z,size,segments,recipe) {
  const stride=segments+1,count=stride*stride;
  const pos=new Float32Array(count*3),normal=new Float32Array(count*3),colors=new Float32Array(count*3),uv=new Float32Array(count*2);
  const indices=count>65535?new Uint32Array(segments*segments*6):new Uint16Array(segments*segments*6);
  const sand=new THREE.Color('#b9b29a'),basalt=new THREE.Color('#85857a'),c=new THREE.Color(),n=new THREE.Vector3();
  let cursor=0;
  for(let j=0;j<=segments;j++)for(let i=0;i<=segments;i++){
    const k=j*stride+i,px=x+i/segments*size,pz=z+j/segments*size,y=oceanFloor(px,pz,recipe);
    pos.set([px,y,pz],k*3);uv.set([px*.01,pz*.01],k*2);
    n.set(oceanFloor(px-.4,pz,recipe)-oceanFloor(px+.4,pz,recipe),.8,oceanFloor(px,pz-.4,recipe)-oceanFloor(px,pz+.4,recipe)).normalize();normal.set(n.toArray(),k*3);
    c.copy(sand).lerp(basalt,THREE.MathUtils.smoothstep(-y,70,420)).multiplyScalar(.93+Math.sin(px*.11)*Math.cos(pz*.12)*.045);colors.set([c.r,c.g,c.b],k*3);
    if(i<segments&&j<segments){indices.set([k,k+stride,k+1,k+1,k+stride,k+stride+1],cursor);cursor+=6;}
  }
  const g=new THREE.BufferGeometry();
  for(const [key,array,itemSize] of [['position',pos,3],['normal',normal,3],['color',colors,3],['uv',uv,2],['aFlex',new Float32Array(count),1]])g.setAttribute(key,new THREE.BufferAttribute(array,itemSize));
  g.setIndex(new THREE.BufferAttribute(indices,1));g.computeBoundingSphere();return g;
}

export class OceanFloorDetail {
  constructor(group,recipe,window) {
    this.group=group;this.recipe=recipe;this.window=window;this.tiles=new Map();this.key=null;
    this.material=waterMaterial(0,{name:'local-bathymetry'});
  }
  update(position) {
    const x=Math.floor(position.x/BIOME_CELL),z=Math.floor(position.z/BIOME_CELL),key=`${x},${z}`;
    if(key===this.key)return false;
    const wanted=new Set();
    // A complete square masks the coarse distant bed. Shared coordinates and
    // analytic normals make the detailed tile edges coincide exactly.
    for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++){
      const tx=x+dx,tz=z+dz,k=`${tx},${tz}`;wanted.add(k);
      if(this.tiles.has(k))continue;
      const mesh=new THREE.Mesh(floorTile(tx*BIOME_CELL,tz*BIOME_CELL,BIOME_CELL,32,this.recipe),this.material);
      mesh.name=`Detailed seabed ${k}`;this.tiles.set(k,mesh);this.group.add(mesh);
    }
    for(const [k,mesh] of this.tiles)if(!wanted.has(k)){this.group.remove(mesh);mesh.geometry.dispose();this.tiles.delete(k);}
    this.window.value.set((x-3)*BIOME_CELL,(z-3)*BIOME_CELL,(x+4)*BIOME_CELL,(z+4)*BIOME_CELL);this.key=key;
    return true;
  }
}

export function createOceanTerrain(recipe) {
  const group=new THREE.Group();group.name='Continuous continental shelf and trench';
  const material=waterMaterial(0,{name:'continental-bathymetry',farSeabed:true});
  const window={value:new THREE.Vector4(1,1,0,0)};material.uniforms.uFloorWindow=window;
  const terrain=new THREE.Mesh(floorTile(-2624,-2624,5248,328,recipe),material);
  terrain.name='Unbroken seabed';group.add(terrain);
  group.floorDetail=new OceanFloorDetail(group,recipe,window);

  const rng=seeded(recipe.seed+918);
  const stone=new Batch(waterMaterial(1,{name:'basalt-escarpment'}));
  const polyps=new Batch(waterMaterial(2,{name:'cold-water-colonies'}));
  const rock=rockGeometry(recipe.seed);
  for(let i=0;i<160;i++) {
    const z=-210-rng()*435,x=(rng()-.5)*260;
    const y=oceanFloor(x,z,recipe),height=(4+rng()**2*32)*(.6+(recipe.relief??1)*.4);
    const g=rock.clone();g.scale(3+rng()*7,height,3+rng()*6);g.rotateY(rng()*TAU);g.translate(x,y+height*.35,z);
    stone.add(g,'#53686d',rng);
    if(i%3===0)for(let k=0;k<Math.round(7*(recipe.life??1));k++) {
      const a=rng()*TAU,px=x+Math.cos(a)*4,pz=z+Math.sin(a)*4;
      const bottom=new THREE.Vector3(px,y+height*.8,pz);
      const top=bottom.clone().add(new THREE.Vector3((rng()-.5)*2,2+rng()*3,(rng()-.5)*2));
      polyps.add(segment(bottom,top,.06,.025,5),i%2?'#95b8b8':'#e4c79f',rng);
      const bud=new THREE.SphereGeometry(.14,6,4);bud.translate(top.x,top.y,top.z);polyps.add(bud,'#d6e9d5',rng);
    }
  }
  for(let depth=135;depth<1320;depth+=48)for(let colony=0;colony<Math.round(4*(recipe.life??1));colony++){
    const pose=transectPose(depth,recipe),z=pose.eye[2]-12+(rng()-.5)*22;
    let lo=14,hi=90;
    for(let k=0;k<20;k++){const x=(lo+hi)/2;if(oceanFloor(x,z,recipe)<-depth)lo=x;else hi=x;}
    const x=(lo+hi)/2,y=oceanFloor(x,z,recipe),size=.9+rng()*1.4;
    const root=new THREE.Vector3(x-.1,y+.15,z),stem=root.clone().add(new THREE.Vector3(-size*1.6,size*.5,0));
    polyps.add(segment(root,stem,.1,.045,6),depth<350?'#cdbfb0':'#759f9e',rng);
    for(let k=0;k<6;k++){
      const angle=(k/5-.5)*2.3,tip=stem.clone().add(new THREE.Vector3(-Math.cos(angle)*size,Math.sin(angle)*size*.5,Math.sin(angle)*size));
      polyps.add(segment(stem,tip,.04,.012,5),depth<350?'#e5c3b1':'#9bcebf',rng);
      const bud=new THREE.SphereGeometry(.10,7,5);bud.translate(tip.x,tip.y,tip.z);polyps.add(bud,'#c9dcca',rng);
    }
  }
  rock.dispose();stone.finish(group,'Weathered canyon walls');polyps.finish(group,'Cold-water polyps');
  return group;
}

export function createPelagicLife(recipe) {
  const group=new THREE.Group();group.name='Life between the surface and the abyss';
  const observables=[];
  const rng=seeded(recipe.seed+611),gel=(recipe.shoal??1)*(recipe.jellies??.65),canyonCount=Math.round(14*gel),columnCount=Math.round(18*gel),count=canyonCount+columnCount;
  const g=jellyGeometry(rng,.65),m=waterMaterial(5,{name:'twilight-jellies',motion:3,glow:.85,opacity:.8,transparent:true});
  const jellies=new THREE.InstancedMesh(g,m,Math.max(1,count));jellies.count=count;
  const dummy=new THREE.Object3D(),data=[];
  for(let i=0;i<count;i++){
    const column=i>=canyonCount;
    const depth=column?85+(i-canyonCount)/Math.max(1,columnCount-1)*1255+(rng()-.5)*5:100+rng()*1240;
    const pose=column?{eye:[0,-depth,-738]}:transectPose(depth,recipe);
    const a=rng()*TAU,r=8+rng()*22;
    const x=column?(rng()-.5)*24:pose.eye[0]+Math.cos(a)*r+8,z=column?-749+(rng()-.5)*15:pose.eye[2]+Math.sin(a)*r-12;
    data.push({x,y:Math.max(-depth,oceanFloor(x,z,recipe)+5),z,phase:rng()*TAU,size:.14+rng()*.24});
    observables.push({id:`pelagic-jelly-${i}`,type:'jelly',x,y:data[i].y,z,span:data[i].size*3.5,visible:false});
  }
  group.add(jellies);jellies.frustumCulled=false;
  const chain=new Batch(waterMaterial(5,{name:'siphonophores',glow:.9,opacity:.7,transparent:true}));
  const bells=new Batch(waterMaterial(2,{name:'siphonophore-bells',glow:.8}));
  const chainCount=Math.round(4*gel),chainStops=[[330,0],[740,0],[1140,1]];
  for(let c=0;c<chainCount;c++) {
    const [depth,column]=chainStops[c]||[180+(c*137)%1100,c%2];
    const pose=column?{eye:[0,-depth,-738]}:transectPose(depth,recipe),points=[];
    const offset=14+rng()*8;
    for(let i=0;i<65;i++) {
      const t=i/64,p=new THREE.Vector3(pose.eye[0]+offset+Math.sin(t*5.7)*4, -depth+8-t*17,pose.eye[2]-16+Math.cos(t*5.7)*3);
      for(let k=0;k<30&&p.y<oceanFloor(p.x,p.z,recipe)+2;k++)p.x-=.7;
      points.push(p);
      if(i%2===0){const b=new THREE.SphereGeometry(.18+Math.sin(t*Math.PI)*.16,9,7);b.scale(1,1.7,1);b.translate(p.x,p.y,p.z);bells.add(b,i%4?'#9edbd7':'#ebc3a5',rng);}
    }
    const tube=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),96,.055,5,false);chain.add(tube,'#90cfd4',rng);
    observables.push({id:`siphonophore-${c}`,type:'siphonophore',x:points[32].x,y:points[32].y,z:points[32].z,span:17,visible:true});
  }
  chain.finish(group,'Drifting siphonophore ribbons');bells.finish(group,'Living lantern chains');
  return {group,count:count+chainCount,jellyCount:count,chainCount,observables,update(time,cameraPosition){
    let visible=0;
    for(let i=0;i<count;i++){
      const d=data[i];
      observables[i].visible=false;
      if(cameraPosition&&(Math.abs(d.y-cameraPosition.y)>150||Math.hypot(d.x-cameraPosition.x,d.z-cameraPosition.z)>145))continue;
      dummy.position.set(d.x+Math.sin(time*.08+d.phase)*1.6,d.y+Math.sin(time*.21+d.phase)*1.2,d.z);
      Object.assign(observables[i],{x:dummy.position.x,y:dummy.position.y,z:dummy.position.z,visible:true});
      dummy.rotation.set(.05*Math.sin(time*.2+d.phase),d.phase+time*.01,0);dummy.scale.setScalar(d.size);dummy.updateMatrix();jellies.setMatrixAt(visible++,dummy.matrix);
    }
    jellies.count=visible;
    jellies.instanceMatrix.needsUpdate=true;
  }};
}
